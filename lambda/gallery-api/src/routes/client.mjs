// Client-facing gallery routes: password gate, manifest, downloads, favourites.

import { createHash } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { hasGallerySession, isAdmin, issueGallerySession, issueSignedCookies, penalise, requireGalleryAccess, SIGNED_COOKIE_TTL_SECONDS } from "../lib/auth.mjs";
import { downloadEvent, recordDownload } from "../lib/downloads.mjs";
import { badRequest, forbidden, HttpError, json, noContent, notFound, publicOrigin, redirect } from "../lib/http.mjs";
import { jobId as newJobId } from "../lib/ids.mjs";
import { emailButton, emailLayout, emailNote, emailParagraph, escapeHtml, sendEmail } from "../lib/mailer.mjs";
import { verifyPassword } from "../lib/passwords.mjs";
import { invokeProcessor } from "../lib/processor.mjs";
import { getSecrets } from "../lib/secrets.mjs";
import { getJson, objectExists, putJson, updateJson } from "../lib/store.mjs";
import { signedUrl } from "../lib/cfsign.mjs";
import { email as emailField, str, stringArray } from "../lib/validate.mjs";
import {
	clientProjection,
	coverImageKey,
	downloadsFor,
	emptyIndex,
	galleryKey,
	hdKey,
	INDEX_KEY,
	isExpired,
	jobKey,
	photoDownloads,
	readyCover,
	selectionKey,
	setOf,
	zipMarkerKey
} from "../lib/galleries.mjs";

const lambda = new LambdaClient({});

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
// A gallery this large is worth splitting client-side rather than streaming as
// one archive; the zipper also parts it, but this keeps a single request sane.
const MAX_ZIP_PHOTOS = 2000;

// db/index.json is read on every anonymous gallery hit. A few seconds of memory
// caching turns a burst of page loads into one S3 GET without making slug edits
// feel broken.
const INDEX_CACHE_MS = 5000;
let indexCache = null;

async function readIndex() {
	if (indexCache && Date.now() - indexCache.at < INDEX_CACHE_MS) {
		return indexCache.data;
	}

	const data = (await getJson(INDEX_KEY))?.data ?? emptyIndex();
	indexCache = { at: Date.now(), data };

	return data;
}

/**
 * Archived and past-expiry galleries answer 410 rather than 404, so the client UI
 * can say something better than "not found" — and so a link that used to work
 * explains itself.
 */
function assertAvailable(gallery) {
	if (gallery.status === "archived") {
		throw new HttpError(410, "Cette galerie a été archivée.");
	}

	if (isExpired(gallery)) {
		throw new HttpError(410, "Cette galerie a expiré.");
	}
}

/**
 * Resolves a public slug to its stored record and enforces visibility.
 *
 * Draft galleries are admin-only; archived and past-expiry galleries answer 410
 * so the client UI can say something better than "not found".
 */
async function resolveGallery(request, slug) {
	const index = await readIndex();
	const entry = index.galleries.find(row => row.slug === slug);

	if (!entry) {
		throw notFound("Galerie introuvable.");
	}

	const record = await getJson(galleryKey(entry.id));
	if (!record) {
		throw notFound("Galerie introuvable.");
	}

	const gallery = record.data;

	assertAvailable(gallery);

	// A draft is invisible to the world but previewable by an admin session.
	if (gallery.status === "draft" && !(await isAdmin(request))) {
		throw notFound("Galerie introuvable.");
	}

	return gallery;
}

/**
 * Whether the cover can be shown unmarked, queueing that derivative if not.
 *
 * Checked here rather than tracked on the record because the cover is a moving
 * target — it changes with `coverPid`, with a reprocess that bumps revs, and with
 * the deletion of whichever photo was standing in as the fallback — and one HEAD
 * on the way to building a manifest is cheaper than keeping a flag honest across
 * all of those. Missing simply means this visitor sees the marked preview while
 * the derive it just triggered catches up.
 */
async function cleanCoverReady(gallery) {
	const cover = readyCover(gallery);

	// Nothing is marked in the first place, so the ordinary preview is already the
	// clean image and a second copy of it would be waste.
	if (!cover || gallery.watermark === "none") {
		return false;
	}

	try {
		if (await objectExists(coverImageKey(gallery.id, cover.pid, cover.rev))) {
			return true;
		}

		await invokeProcessor({
			gid: gallery.id,
			pid: cover.pid,
			extension: cover.extension,
			rev: cover.rev,
			variant: "cover"
		});
	} catch (error) {
		// Purely cosmetic, so nothing here may take the gallery down with it: it
		// still opens, it just opens marked.
		console.warn("Clean cover unavailable", { gid: gallery.id, pid: cover.pid, error: error.message });
	}

	return false;
}

async function manifest(gallery) {
	return {
		gallery: clientProjection(gallery, { cleanCover: await cleanCoverReady(gallery) }),
		// Lets the client refresh signed cookies just before they lapse instead of
		// discovering the fact through a wall of broken images.
		signedUntil: Math.floor(Date.now() / 1000) + SIGNED_COOKIE_TTL_SECONDS
	};
}

// --- access ----------------------------------------------------------------

async function authenticate({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	const origin = publicOrigin(request);

	if (!gallery.password) {
		// Open gallery: still hand out signed cookies, or nothing would load.
		return json(200, await manifest(gallery), { cookies: await issueGallerySession(gallery.id, origin) });
	}

	const password = str(request.body?.password, "mot de passe", { max: 200, required: true });

	if (!(await verifyPassword(password, gallery.password))) {
		await penalise();

		return json(401, { error: "Mot de passe incorrect." });
	}

	return json(200, await manifest(gallery), { cookies: await issueGallerySession(gallery.id, origin) });
}

async function read({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	const origin = publicOrigin(request);

	if (gallery.password && !(await hasGallerySession(request, gallery.id)) && !(await isAdmin(request))) {
		// Enough to render the gate, and nothing more.
		return json(401, {
			passwordRequired: true,
			title: gallery.title,
			clientName: gallery.clientName
		});
	}

	// Refresh the signing cookies on every manifest read; they are cheap and it
	// keeps a returning visitor from ever hitting an expired policy.
	return json(200, await manifest(gallery), { cookies: await issueSignedCookies(gallery.id, origin) });
}

async function refresh({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	const origin = publicOrigin(request);

	return json(
		200,
		{ signedUntil: Math.floor(Date.now() / 1000) + SIGNED_COOKIE_TTL_SECONDS },
		{ cookies: await issueSignedCookies(gallery.id, origin) }
	);
}

// --- downloads -------------------------------------------------------------

/** The master switch: with this off nothing under `d/` is ever signed. */
function assertDownloadable(gallery) {
	if (!gallery.downloadsEnabled) {
		throw forbidden("Les téléchargements sont désactivés pour cette galerie.");
	}
}

/**
 * Throws unless this photo's set currently permits the requested download kind.
 *
 * The gallery's own switch is checked separately, and first, by every caller: a
 * request naming a photo that does not exist must not be distinguishable from one
 * to a gallery with downloads off.
 */
function assertPhotoDownloadable(gallery, photo, kind) {
	const downloads = photoDownloads(gallery, photo);

	if (!downloads.enabled) {
		throw forbidden("Les téléchargements sont désactivés pour cet ensemble.");
	}

	if (kind === "hd" && !downloads.hd) {
		throw forbidden("Le téléchargement haute définition est désactivé.");
	}
}

/**
 * Re-checks an archive's sets when it is picked up.
 *
 * A job records which sets it drew from, so turning downloads off — for the gallery
 * or for one of its sets — retracts every link ever sent. That is the promise that
 * lets the emailed link live outside the password gate. Jobs written before sets
 * existed carry no list, and the gallery-level check is the one they were built
 * under anyway.
 */
function assertJobDownloadable(gallery, job) {
	assertDownloadable(gallery);

	for (const sid of job.setIds ?? []) {
		const set = sid ? (gallery.sets ?? []).find(candidate => candidate.id === sid) : null;

		if (!downloadsFor(gallery, set).enabled) {
			throw forbidden("Les téléchargements sont désactivés pour cet ensemble.");
		}
	}
}

/**
 * 302 to a short-lived signed URL.
 *
 * The redirect is what keeps the shareable link clean — the client only ever
 * sees /api/g/<slug>/download/<pid>, never a signature.
 */
async function downloadPhoto({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	assertDownloadable(gallery);

	const photo = gallery.photos.find(candidate => candidate.pid === params.pid && candidate.status === "ready");
	if (!photo) {
		throw notFound("Photo introuvable.");
	}

	assertPhotoDownloadable(gallery, photo, "hd");

	const { cfPrivateKey } = await getSecrets();
	const origin = publicOrigin(request);

	return redirect(
		signedUrl({
			url: `${origin}/${hdKey(gallery.id, photo.pid, photo.rev)}`,
			expiresAt: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
			keyPairId: process.env.CF_KEY_PAIR_ID,
			privateKey: cfPrivateKey
		})
	);
}

/**
 * Parts of a previously built archive, or null if it must be rebuilt.
 *
 * The marker outlives the archive it describes — ZIPs are expired by lifecycle
 * after 30 days — so a hit is only a hit once every part is confirmed present.
 */
async function cachedParts(gid, hash) {
	const marker = await getJson(zipMarkerKey(gid, hash));
	const parts = marker?.data?.parts;

	if (!Array.isArray(parts) || parts.length === 0) {
		return null;
	}

	const present = await Promise.all(parts.map(part => objectExists(part.key)));

	return present.every(Boolean) ? parts : null;
}

/** Where a client picks their archive up. The job id is the whole credential. */
const archiveUrl = (origin, jid) => `${origin}/archive/${jid}`;

/**
 * Tells the client where their archive will be, by email.
 *
 * Sent when the build starts rather than when it finishes: an archive of a large
 * gallery takes minutes, the zipper has neither a signing key nor a sender
 * identity, and a link that is live a moment later reads no differently in an
 * inbox. The page behind it polls, so it is correct either way.
 */
async function mailArchiveLink({ gallery, recipient, link, origin, count, ready, setTitle = "" }) {
	// Named in the subject when it is one set: a client who downloads three tabs gets
	// three of these, and only the name tells them apart in an inbox.
	const subject = setTitle ? `Votre archive photo « ${gallery.title} » — ${setTitle}` : `Votre archive photo « ${gallery.title} »`;
	const wait = ready ? "Votre archive est prête." : "Votre archive est en préparation, cela peut prendre quelques minutes.";
	const scope = `${count} photo${count > 1 ? "s" : ""}`;
	const source = setTitle ? `l’ensemble « ${setTitle} » de la galerie « ${gallery.title} »` : `la galerie « ${gallery.title} »`;
	const sourceHtml =
		setTitle ?
			`l’ensemble <strong>${escapeHtml(setTitle)}</strong> de la galerie <strong>${escapeHtml(gallery.title)}</strong>`
		:	`la galerie <strong>${escapeHtml(gallery.title)}</strong>`;

	const lines = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		`${wait} Elle contient ${scope} de ${source}.`,
		"",
		link,
		"",
		"Ce lien reste valable 7 jours. Passé ce délai, votre galerie vous en prépare un nouveau.",
		"",
		"À très bientôt,",
		"Ankaa Studio"
	];

	await sendEmail({
		to: recipient,
		subject,
		text: lines.join("\n"),
		html: emailLayout({
			label: ready ? "Archive prête" : "Archive en préparation",
			heading: "Votre archive photo",
			preview: `${wait} Elle contient ${scope} de ${source}.`,
			origin,
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph(`${escapeHtml(wait)} Elle contient ${escapeHtml(scope)} de ${sourceHtml}.`),
				emailButton(link, "Télécharger l’archive"),
				emailNote("Ce lien reste valable 7 jours. Passé ce délai, votre galerie vous en prépare un nouveau.")
			].join("")
		})
	});
}

/**
 * Batch download.
 *
 * Three scopes, in order of precedence: an explicit `pids` selection, a `setId`
 * naming one tab (null for the ungrouped remainder), or the whole gallery when
 * neither is given.
 *
 * The archive is content-addressed by the exact photo revisions it contains and the
 * derivative each was taken from, so the same request twice costs one build, and a
 * selection gets its own cache entry for free.
 *
 * The email address is the price of admission: it is what the link is sent to and
 * what names the download in the photographer's feed. It is never verified — a
 * client who types nonsense still gets their photos through this very response.
 */
async function downloadZip({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	assertDownloadable(gallery);

	const requested = stringArray(request.body?.pids, "photos", { max: MAX_ZIP_PHOTOS });
	const recipient = emailField(request.body?.email, "email", { required: true });
	// Absent means the whole gallery; present-and-null means the ungrouped tab, which
	// is why this cannot collapse into a plain `?? null`.
	const scopedSet = request.body?.setId === undefined ? undefined : str(request.body.setId, "ensemble", { max: 40 });
	const ready = gallery.photos.filter(photo => photo.status === "ready");

	const scoped =
		requested?.length ? ready.filter(photo => requested.includes(photo.pid))
		: scopedSet !== undefined ? ready.filter(photo => (setOf(gallery, photo)?.id ?? null) === scopedSet)
		: ready;

	// A selection can span sets, and a set with downloads off must not be smuggled
	// out inside an archive of one that has them on. Dropping those photos rather
	// than refusing outright is what keeps the button meaning "all of it you are
	// allowed to have" instead of failing for a reason the client cannot see.
	const allowed = scoped.map(photo => ({ photo, downloads: photoDownloads(gallery, photo) })).filter(entry => entry.downloads.enabled);

	if (allowed.length === 0) {
		throw scoped.length === 0 ? badRequest("Aucune photo à télécharger.") : forbidden("Les téléchargements sont désactivés pour ces photos.");
	}

	// HD off does not mean no archive: those photos go in as the same web-sized
	// preview the tiles hand over, watermark and all. It is per photo because it is
	// per set — one archive can carry both.
	const ordered = allowed
		.slice()
		.sort((a, b) => a.photo.sortIndex - b.photo.sortIndex)
		.map(({ photo, downloads }) => ({
			pid: photo.pid,
			rev: photo.rev,
			originalName: photo.originalName,
			// `bytes` is the HD file's size, which is only an upper bound for a web
			// entry. That is the safe direction: the zipper splits on it, so it may
			// split earlier than needed but never produces an oversized part.
			bytes: photo.bytes ?? 0,
			variant: downloads.hd ? "hd" : "web"
		}));

	// The variant is part of what the archive *is*, so it belongs in the hash —
	// otherwise turning HD off for a set would keep serving its HD archive from
	// cache, and turning it back on would serve the watermarked one. "hd" contributes
	// nothing to the digest, so every all-HD archive built before this existed stays
	// a cache hit.
	const fingerprint = ordered.map(photo => `${photo.pid}_${photo.rev}${photo.variant === "hd" ? "" : `:${photo.variant}`}`).join(",");
	const hash = createHash("sha1").update(fingerprint).digest("hex").slice(0, 16);
	const variant = ordered.every(photo => photo.variant === "hd") ? "hd" : ordered.every(photo => photo.variant === "web") ? "web" : "mixed";
	// Recorded so pickup can re-check them: see assertJobDownloadable.
	const setIds = [...new Set(allowed.map(entry => setOf(gallery, entry.photo)?.id ?? null))];

	const origin = publicOrigin(request);
	const cached = await cachedParts(gallery.id, hash);
	const jid = newJobId();
	const now = new Date().toISOString();

	// Resolved now rather than at pickup: renaming a set later must not rewrite what
	// the client was told they were downloading, nor the photographer's feed.
	const scopeTitle = scopedSet === undefined ? "" : ((gallery.sets ?? []).find(set => set.id === scopedSet)?.title ?? "");

	// A cache hit gets a job document too, even though nothing will ever run for
	// it: the emailed link points at a job, and one shape for both paths is what
	// keeps the archive page from needing to know how it got there.
	const job = {
		jobId: jid,
		gid: gallery.id,
		slug: gallery.slug,
		hash,
		variant,
		setIds,
		email: recipient,
		kind:
			requested?.length ? "selection"
			: scopedSet !== undefined ? "set"
			: "all",
		setTitle: scopeTitle,
		status: cached ? "done" : "pending",
		total: ordered.length,
		done: cached ? ordered.length : 0,
		parts: cached ?? [],
		error: null,
		createdAt: now,
		updatedAt: now
	};

	await putJson(jobKey(jid), job);

	if (!cached) {
		await lambda.send(
			new InvokeCommand({
				FunctionName: process.env.ZIPPER_FUNCTION,
				InvocationType: "Event",
				Payload: Buffer.from(
					JSON.stringify({
						jobId: jid,
						gid: gallery.id,
						slug: gallery.slug,
						hash,
						// The per-photo variant is what the zipper reads; this one is only the
						// fallback for a photo that names none.
						variant: variant === "mixed" ? "hd" : variant,
						photos: ordered
					})
				)
			})
		);
	}

	const link = archiveUrl(origin, jid);
	let emailed = true;

	try {
		await mailArchiveLink({ gallery, recipient, link, origin, count: ordered.length, ready: Boolean(cached), setTitle: scopeTitle });
	} catch (error) {
		// The build is already running and this response carries the same link, so a
		// bounced or throttled send is worth reporting, not worth failing over.
		console.warn("Archive email not sent", { gid: gallery.id, jobId: jid, error: error.message });
		emailed = false;
	}

	await recordDownload(downloadEvent({ gallery, email: recipient, kind: job.kind, count: ordered.length, setTitle: scopeTitle }));

	return json(cached ? 200 : 202, {
		status: job.status,
		jobId: jid,
		total: ordered.length,
		archiveUrl: link,
		emailed,
		...(cached ? { parts: await signParts(job.parts, origin) } : {})
	});
}

/** Signs an archive's parts for immediate use. Short-lived by design. */
async function signParts(parts, origin) {
	const { cfPrivateKey } = await getSecrets();

	return (parts ?? []).map(part => ({
		name: part.name,
		bytes: part.bytes,
		url: signedUrl({
			url: `${origin}/${part.key}`,
			expiresAt: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
			keyPairId: process.env.CF_KEY_PAIR_ID,
			privateKey: cfPrivateKey
		})
	}));
}

/** Progress, plus signed part URLs once there is something to sign. */
async function jobProgress(job, request) {
	return {
		status: job.status,
		total: job.total,
		done: job.done,
		error: job.error,
		...(job.status === "done" ? { parts: await signParts(job.parts, publicOrigin(request)) } : {})
	};
}

/** Poll target while a ZIP builds. Signs part URLs only once the job is done. */
async function readJob({ request, params }) {
	const record = await getJson(jobKey(params.jobId));

	if (!record) {
		throw notFound("Tâche introuvable.");
	}

	const job = record.data;
	const gallery = await getJson(galleryKey(job.gid));

	if (!gallery) {
		throw notFound("Galerie introuvable.");
	}

	// A job id is unguessable, but it must not become a way around the gate — and
	// the gate is more than the password: once the job is done this hands back
	// freshly signed part URLs, so archiving the gallery or turning downloads off
	// has to retract it here too, exactly as it does for the emailed link below.
	await requireGalleryAccess(request, gallery.data);
	assertAvailable(gallery.data);
	assertJobDownloadable(gallery.data, job);

	return json(200, await jobProgress(job, request));
}

/**
 * The emailed archive link.
 *
 * Deliberately outside the password gate: the mail is usually opened on a device
 * that never saw the gallery, and the job id it carries is the credential — 95
 * bits of it, expiring with the job document after 7 days. The gallery's own
 * switches still apply, so turning downloads off retracts every link ever sent.
 */
async function readArchive({ request, params }) {
	const record = await getJson(jobKey(params.jobId));

	if (!record) {
		throw notFound("Cette archive n’existe plus. Demandez-en une nouvelle depuis votre galerie.");
	}

	const job = record.data;
	const gallery = (await getJson(galleryKey(job.gid)))?.data;

	if (!gallery) {
		throw notFound("Galerie introuvable.");
	}

	assertAvailable(gallery);
	assertJobDownloadable(gallery, job);

	return json(200, {
		title: gallery.title,
		slug: gallery.slug,
		// As it was named when the archive was asked for — several links for the same
		// gallery are otherwise identical pages.
		setTitle: job.setTitle ?? "",
		...(await jobProgress(job, request))
	});
}

/**
 * Records a single-photo download.
 *
 * The download itself does not come through here — the tile either follows the
 * signed redirect or saves the preview it already has — so this exists purely so
 * the photographer's feed knows about it.
 */
async function logDownload({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	assertDownloadable(gallery);

	const recipient = emailField(request.body?.email, "email", { required: true });
	const pid = str(request.body?.pid, "photo", { max: 40, required: true });
	const photo = gallery.photos.find(candidate => candidate.pid === pid && candidate.status === "ready");

	if (!photo) {
		throw notFound("Photo introuvable.");
	}

	assertPhotoDownloadable(gallery, photo);

	await recordDownload(
		downloadEvent({
			gallery,
			email: recipient,
			kind: "photo",
			count: 1,
			photoName: photo.originalName || photo.pid
		})
	);

	return noContent();
}

// --- favourites ------------------------------------------------------------

async function saveSelection({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);

	const pids = stringArray(request.body?.pids, "photos", { max: MAX_ZIP_PHOTOS }) ?? [];
	const valid = new Set(gallery.photos.map(photo => photo.pid));
	const filtered = pids.filter(pid => valid.has(pid));

	await updateJson(
		selectionKey(gallery.id),
		current => ({
			...current,
			gid: gallery.id,
			pids: filtered,
			updatedAt: new Date().toISOString()
		}),
		{ fallback: () => ({ gid: gallery.id, pids: [] }) }
	);

	return json(200, { pids: filtered });
}

async function readSelection({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	const stored = await getJson(selectionKey(gallery.id));

	return json(200, { pids: stored?.data?.pids ?? [] });
}

export const clientRoutes = [
	["GET", "/api/g/:slug", read],
	["POST", "/api/g/:slug/auth", authenticate],
	["POST", "/api/g/:slug/refresh", refresh],
	["GET", "/api/g/:slug/download/:pid", downloadPhoto],
	["POST", "/api/g/:slug/downloads", logDownload],
	["POST", "/api/g/:slug/zip", downloadZip],
	["GET", "/api/g/:slug/selection", readSelection],
	["PUT", "/api/g/:slug/selection", saveSelection],
	["GET", "/api/jobs/:jobId", readJob],
	["GET", "/api/archives/:jobId", readArchive]
];
