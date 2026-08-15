// Admin routes: authentication, gallery CRUD, uploads, processing and sharing.

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { clearAdminSession, issueAdminSession, issueSignedCookies, penalise, requireAdmin } from "../lib/auth.mjs";
import { markDownloadsSeen, readDownloadLog } from "../lib/downloads.mjs";
import { badRequest, conflict, json, noContent, notFound, publicOrigin } from "../lib/http.mjs";
import { galleryId, photoId, SLUG_PATTERN, slugify } from "../lib/ids.mjs";
import { emailButton, emailLayout, emailNote, emailParagraph, emailQuote, emailValue, escapeHtml, sendEmail } from "../lib/mailer.mjs";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";
import { invokeProcessor } from "../lib/processor.mjs";
import { getSecrets } from "../lib/secrets.mjs";
import { deleteKeys, deletePrefix, getJson, listKeys, putJson, s3, updateJson } from "../lib/store.mjs";
import { bool, email, isoDate, oneOf, str, stringArray } from "../lib/validate.mjs";
import {
	adminProjection,
	coverImageKey,
	emptyIndex,
	GALLERY_STATUSES,
	galleryKey,
	hdKey,
	INDEX_KEY,
	mediaPrefix,
	newGallery,
	originalKey,
	originalPrefix,
	pendingPhoto,
	readyCover,
	selectionKey,
	sidecarKey,
	sidecarPrefix,
	thumbKey,
	upsertIndex,
	WATERMARK_MODES,
	webKey,
	zipMarkerPrefix,
	zipPrefix
} from "../lib/galleries.mjs";

// Big enough for an uncompressed TIFF straight off a body; small enough that a
// mis-picked video file is rejected before it costs any transfer.
const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

// How long a photo may sit marked "processing" before reconcile treats it as
// lost and queues it again. The processor's own timeout is 60 s, so anything
// past this is not slow — but a throttled invocation can wait in the async queue
// for minutes before it starts, and re-queueing one of those wastes a derive.
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif"]);

// --- helpers ---------------------------------------------------------------

async function loadGallery(gid) {
	const record = await getJson(galleryKey(gid));

	if (!record) {
		throw notFound("Galerie introuvable.");
	}

	return record;
}

/** Persists a gallery and mirrors its summary row into db/index.json. */
async function saveGallery(gallery, etag) {
	gallery.updatedAt = new Date().toISOString();

	try {
		await putJson(galleryKey(gallery.id), gallery, { etag });
	} catch (error) {
		if (error.name === "ConflictError") {
			throw conflict("La galerie a été modifiée ailleurs. Rechargez la page.");
		}

		throw error;
	}

	await updateJson(INDEX_KEY, index => upsertIndex(index, gallery), { fallback: emptyIndex });

	return gallery;
}

async function uniqueSlug(desired, selfId) {
	const index = (await getJson(INDEX_KEY))?.data ?? emptyIndex();
	const taken = new Set(index.galleries.filter(row => row.id !== selfId).map(row => row.slug));

	if (!taken.has(desired)) {
		return desired;
	}

	for (let suffix = 2; suffix < 100; suffix += 1) {
		const candidate = `${desired}-${suffix}`;

		if (!taken.has(candidate)) {
			return candidate;
		}
	}

	throw conflict("Impossible de générer un identifiant d'URL unique.");
}

/**
 * The gallery's unmarked cover derivative, if it has a cover to have one for.
 *
 * Resolved through readyCover() so it names the same object the client route
 * derives and serves — including the fallback to the first photo when no cover
 * was ever chosen.
 */
function coverImageOf(gallery) {
	const cover = readyCover(gallery);

	return cover ? coverImageKey(gallery.id, cover.pid, cover.rev) : null;
}

async function mapWithLimit(items, limit, mapper) {
	const results = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

	return results;
}

// --- authentication --------------------------------------------------------

async function login({ request }) {
	const password = str(request.body?.password, "mot de passe", { max: 200, required: true });
	const { adminPassword } = await getSecrets();

	if (!(await verifyPassword(password, adminPassword))) {
		await penalise();
		console.warn("Admin login rejected", { ip: request.ip });

		return json(401, { error: "Mot de passe incorrect." });
	}

	return json(200, { ok: true }, { cookies: await issueAdminSession() });
}

async function logout() {
	return json(200, { ok: true }, { cookies: clearAdminSession() });
}

async function session({ request }) {
	await requireAdmin(request);

	return json(200, { ok: true });
}

// --- gallery CRUD ----------------------------------------------------------

async function listGalleries({ request }) {
	await requireAdmin(request);
	const index = (await getJson(INDEX_KEY))?.data ?? emptyIndex();

	return json(200, {
		galleries: index.galleries.map(row => ({
			...row,
			cover: row.coverPid ? `/${thumbKey(row.id, row.coverPid, row.coverRev)}` : null
		}))
	});
}

async function createGallery({ request }) {
	await requireAdmin(request);

	const title = str(request.body?.title, "titre", { max: 160, required: true, allowEmpty: false });
	const gallery = newGallery({
		id: galleryId(),
		slug: await uniqueSlug(slugify(request.body?.slug || title)),
		title,
		clientName: str(request.body?.clientName, "nom du client", { max: 160 }) ?? "",
		clientEmail: email(request.body?.clientEmail, "email du client") ?? "",
		shootDate: isoDate(request.body?.shootDate, "date de séance") ?? null
	});

	await saveGallery(gallery, null);

	return json(201, { gallery: adminProjection(gallery) });
}

async function readGallery({ request, params }) {
	await requireAdmin(request);
	const { data } = await loadGallery(params.gid);
	const origin = publicOrigin(request);

	// The admin grid renders the same previews from the same protected v/ prefix
	// the client sees, so it needs the same signed cookies — an admin session is
	// not one. Without this every tile 403s, except in the one case that hides
	// the bug: having opened the gallery's own client page in another tab, which
	// sets cookies for this exact path and only works once published.
	return json(200, { gallery: adminProjection(data) }, { cookies: await issueSignedCookies(params.gid, origin) });
}

async function updateGallery({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const body = request.body ?? {};

	const assignments = {
		title: str(body.title, "titre", { max: 160, allowEmpty: false }),
		clientName: str(body.clientName, "nom du client", { max: 160 }),
		clientEmail: email(body.clientEmail, "email du client"),
		status: oneOf(body.status, "statut", GALLERY_STATUSES),
		watermark: oneOf(body.watermark, "filigrane", WATERMARK_MODES),
		downloadsEnabled: bool(body.downloadsEnabled, "téléchargements"),
		hdEnabled: bool(body.hdEnabled, "haute définition"),
		zipEnabled: bool(body.zipEnabled, "archive ZIP")
	};

	for (const [field, value] of Object.entries(assignments)) {
		if (value !== null) {
			gallery[field] = value;
		}
	}

	// These three distinguish "absent" from "explicitly cleared", so they cannot
	// go through the loop above.
	if (body.shootDate !== undefined) {
		gallery.shootDate = isoDate(body.shootDate, "date de séance");
	}

	if (body.expiresAt !== undefined) {
		gallery.expiresAt = isoDate(body.expiresAt, "date d'expiration");
	}

	if (body.slug !== undefined) {
		const desired = slugify(body.slug);

		if (!SLUG_PATTERN.test(desired)) {
			throw badRequest("Identifiant d'URL invalide.");
		}

		gallery.slug = await uniqueSlug(desired, gallery.id);
	}

	if (body.coverPid !== undefined) {
		if (body.coverPid !== null && !gallery.photos.some(photo => photo.pid === body.coverPid)) {
			throw badRequest("La photo de couverture n'appartient pas à cette galerie.");
		}

		// The outgoing cover's unmarked copy has no reason to exist any more, and
		// leaving it behind would slowly turn "one clean preview per gallery" into
		// one per photo that was ever the cover. The new cover's is derived lazily,
		// on the first client read.
		const outgoing = coverImageOf(gallery);

		gallery.coverPid = body.coverPid;

		const incoming = coverImageOf(gallery);

		if (outgoing && outgoing !== incoming) {
			await deleteKeys([outgoing]);
		}
	}

	// "" clears the password, a string sets it, undefined leaves it alone.
	if (body.password !== undefined) {
		if (body.password === null || body.password === "") {
			gallery.password = null;
		} else {
			const password = str(body.password, "mot de passe", { max: 200, allowEmpty: false });

			if (password.length < 6) {
				throw badRequest("Le mot de passe doit faire au moins 6 caractères.");
			}

			gallery.password = await hashPassword(password);
		}
	}

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery) });
}

async function deleteGallery({ request, params }) {
	await requireAdmin(request);
	const { data: gallery } = await loadGallery(params.gid);

	// Media first: an orphaned record is recoverable, orphaned objects are just
	// a silent bill.
	await deletePrefix(mediaPrefix(gallery.id));
	await deletePrefix(originalPrefix(gallery.id));
	await deletePrefix(sidecarPrefix(gallery.id));
	await deletePrefix(zipMarkerPrefix(gallery.id));
	await deleteKeys([galleryKey(gallery.id), selectionKey(gallery.id)]);

	await updateJson(
		INDEX_KEY,
		index => ({
			galleries: (index.galleries ?? []).filter(row => row.id !== gallery.id)
		}),
		{ fallback: emptyIndex }
	);

	return noContent();
}

// --- uploads ---------------------------------------------------------------

/**
 * Hands the browser one presigned POST per file so bytes go straight to S3.
 *
 * POST rather than PUT: only a POST policy can enforce a size ceiling and a
 * content-type prefix, and doing that at the S3 edge means a bad upload never
 * reaches a Lambda.
 */
async function createUploads({ request, params }) {
	await requireAdmin(request);
	const { data: gallery } = await loadGallery(params.gid);

	const files = request.body?.files;
	if (!Array.isArray(files) || files.length === 0) {
		throw badRequest("Aucun fichier fourni.");
	}

	if (files.length > 200) {
		throw badRequest("200 fichiers maximum par lot.");
	}

	const uploads = await Promise.all(
		files.map(async file => {
			const name = str(file?.name, "nom de fichier", { max: 255, required: true, allowEmpty: false });
			const extension = name.split(".").pop()?.toLowerCase() ?? "";

			if (!ALLOWED_EXTENSIONS.has(extension)) {
				throw badRequest(`Format non pris en charge : ${name}`);
			}

			const size = Number(file?.size ?? 0);
			if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
				throw badRequest(`${name} dépasse la taille maximale de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo.`);
			}

			const pid = photoId();
			const key = originalKey(gallery.id, pid, extension);

			const presigned = await createPresignedPost(s3, {
				Bucket: process.env.MEDIA_BUCKET,
				Key: key,
				Expires: UPLOAD_URL_TTL_SECONDS,
				Conditions: [
					["content-length-range", 1, MAX_UPLOAD_BYTES],
					["starts-with", "$Content-Type", "image/"]
				],
				Fields: { "Content-Type": file?.type && String(file.type).startsWith("image/") ? file.type : "image/jpeg" }
			});

			return {
				pid,
				originalName: name,
				extension,
				url: presigned.url,
				fields: presigned.fields
			};
		})
	);

	return json(200, { uploads });
}

/**
 * Called by the uploader once an object is actually in S3.
 *
 * Triggering from the browser rather than an S3 event keeps the infrastructure
 * simpler (no notification wiring, no circular stack dependency) and lets us
 * pass the gallery's watermark mode straight through. If a tab dies mid-batch,
 * `reconcile` finds and re-queues whatever never got processed.
 */
/**
 * Records the uploaded photos as pending, then queues a processor for each.
 *
 * Writing them to the record first is what makes the grid live: a tile appears
 * immediately and the editor polls until it turns into an image, instead of the
 * batch staying invisible until someone presses Actualiser. It also stops
 * reconcile from mistaking a photo that is merely still in flight for one whose
 * processor never came back — which had it queueing every photo a second time.
 */
async function processPhotos({ request, params }) {
	await requireAdmin(request);

	const items = request.body?.photos;
	if (!Array.isArray(items) || items.length === 0) {
		throw badRequest("Aucune photo à traiter.");
	}

	const queued = items.map(item => ({
		pid: str(item?.pid, "pid", { required: true, max: 40 }),
		extension: str(item?.extension, "extension", { required: true, max: 8 }),
		originalName: str(item?.originalName, "nom de fichier", { max: 255 }) ?? ""
	}));

	const { data: gallery, etag } = await loadGallery(params.gid);
	const known = new Set(gallery.photos.map(photo => photo.pid));

	for (const item of queued) {
		// A retried batch must not double the row it already added.
		if (!known.has(item.pid)) {
			gallery.photos.push(pendingPhoto(item, gallery.photos.length));
		}
	}

	await saveGallery(gallery, etag);

	await Promise.all(queued.map(item => invokeProcessor({ gid: gallery.id, ...item, watermark: gallery.watermark, rev: 1 })));

	return json(202, { queued: queued.length });
}

/** Progress for the uploader: which sidecars exist yet, and how they landed. */
async function pendingPhotos({ request, params }) {
	await requireAdmin(request);
	const sidecars = await listKeys(sidecarPrefix(params.gid));
	const originals = await listKeys(originalPrefix(params.gid));

	return json(200, {
		originals: originals.length,
		processed: sidecars.length
	});
}

/**
 * Rebuilds the gallery record from the per-photo sidecars.
 *
 * This is the only place photos enter the record, which is what makes the
 * single-writer rule hold: parallel processors only ever touch their own
 * sidecar, so they cannot race each other or this.
 *
 * Also the repair path — it re-queues any original that has no sidecar.
 */
async function reconcile({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);

	const sidecarKeys = await listKeys(sidecarPrefix(gallery.id));
	const sidecars = (await mapWithLimit(sidecarKeys, 10, item => getJson(item.key))).filter(Boolean).map(entry => entry.data);
	const arrived = new Set(sidecars.map(sidecar => sidecar.pid));

	const originals = (await listKeys(originalPrefix(gallery.id)))
		.map(item => {
			const filename = item.key.slice(item.key.lastIndexOf("/") + 1);
			const dot = filename.lastIndexOf(".");

			return { pid: filename.slice(0, dot), extension: filename.slice(dot + 1) };
		})
		.filter(item => item.pid);

	// Editorial fields live on the record, not the sidecar, so they must survive.
	const existing = new Map(gallery.photos.map(photo => [photo.pid, photo]));

	const merged = sidecars.map(sidecar => {
		const previous = existing.get(sidecar.pid);

		// A reprocess bumps the record's rev and deletes the old derivatives before
		// the new sidecar exists. Folding that older sidecar back in would point the
		// gallery at files that are already gone, so the record wins until the
		// processor catches up.
		if (previous && previous.rev > sidecar.rev) {
			return previous;
		}

		return {
			...sidecar,
			sortIndex: previous?.sortIndex ?? null,
			caption: previous?.caption ?? sidecar.caption ?? null
		};
	});

	// Photos queued but not yet derived stay in the record. Rebuilding purely from
	// sidecars would make a batch disappear from the grid until the last one
	// landed, which is the opposite of what a progress view is for.
	const awaiting = gallery.photos.filter(photo => photo.status === "processing" && !arrived.has(photo.pid));
	const all = [...merged, ...awaiting];

	// Anything without an explicit position goes to the end, ordered the way a
	// photographer's export numbering reads.
	const positioned = all.filter(photo => photo.sortIndex !== null).sort((a, b) => a.sortIndex - b.sortIndex);
	const fresh = all
		.filter(photo => photo.sortIndex === null)
		.sort((a, b) => String(a.originalName).localeCompare(String(b.originalName), "fr", { numeric: true }));

	gallery.photos = [...positioned, ...fresh].map((photo, index) => ({ ...photo, sortIndex: index }));

	// An original with no sidecar is either still being derived or genuinely lost,
	// and the two need opposite treatment: re-queueing the first is what had every
	// photo derived twice over, while leaving the second strands a permanent
	// "traitement…" tile. Only the age of the record entry tells them apart.
	const cutoff = Date.now() - STALE_PROCESSING_MS;
	const inRecord = new Map(gallery.photos.map(photo => [photo.pid, photo]));
	const requeue = [];

	for (const item of originals) {
		const photo = inRecord.get(item.pid);

		if (photo && photo.status !== "processing") {
			continue;
		}

		if (!photo) {
			// Uploaded but never queued — the tab closed between the two calls. The
			// original filename is only known to the browser that uploaded it, so it
			// is lost here; the processor falls back to the pid.
			gallery.photos.push(pendingPhoto(item, gallery.photos.length));
			requeue.push({ ...item, originalName: "", rev: 1 });
			continue;
		}

		const queuedAt = Date.parse(photo.queuedAt ?? "");

		if (Number.isFinite(queuedAt) && queuedAt >= cutoff) {
			continue;
		}

		// Stamping it again is what keeps this idempotent: the editor polls every
		// few seconds, and without it every poll would queue the photo once more.
		photo.queuedAt = new Date().toISOString();
		requeue.push({ pid: photo.pid, extension: photo.extension ?? item.extension, originalName: photo.originalName ?? "", rev: photo.rev ?? 1 });
	}

	if (gallery.coverPid && !gallery.photos.some(photo => photo.pid === gallery.coverPid)) {
		gallery.coverPid = null;
	}

	await saveGallery(gallery, etag);

	await Promise.all(requeue.map(item => invokeProcessor({ gid: gallery.id, ...item, watermark: gallery.watermark })));

	const origin = publicOrigin(request);

	// Refreshed on every poll, so a long editing session never watches its own
	// tiles turn into 403s when the 12-hour cookies lapse.
	return json(
		200,
		{ gallery: adminProjection(gallery), requeued: requeue.length },
		{ cookies: await issueSignedCookies(gallery.id, origin) }
	);
}

// --- photo edits -----------------------------------------------------------

async function patchPhotos({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const body = request.body ?? {};

	if (body.order !== undefined) {
		const order = stringArray(body.order, "ordre");
		const position = new Map(order.map((pid, index) => [pid, index]));

		gallery.photos.sort((a, b) => (position.get(a.pid) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.pid) ?? Number.MAX_SAFE_INTEGER));
		gallery.photos = gallery.photos.map((photo, index) => ({ ...photo, sortIndex: index }));
	}

	if (body.captions !== undefined) {
		if (typeof body.captions !== "object" || body.captions === null) {
			throw badRequest("Les légendes doivent être fournies sous forme d'objet.");
		}

		for (const [pid, caption] of Object.entries(body.captions)) {
			const photo = gallery.photos.find(candidate => candidate.pid === pid);

			if (photo) {
				photo.caption = str(caption, "légende", { max: 300 });
			}
		}
	}

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery) });
}

async function deletePhoto({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const photo = gallery.photos.find(candidate => candidate.pid === params.pid);

	if (!photo) {
		throw notFound("Photo introuvable.");
	}

	await deleteKeys([
		thumbKey(gallery.id, photo.pid, photo.rev),
		webKey(gallery.id, photo.pid, photo.rev),
		// Only exists if this photo was the cover, and deleting a key that is not
		// there costs nothing.
		coverImageKey(gallery.id, photo.pid, photo.rev),
		hdKey(gallery.id, photo.pid, photo.rev),
		originalKey(gallery.id, photo.pid, photo.extension),
		sidecarKey(gallery.id, photo.pid)
	]);

	gallery.photos = gallery.photos.filter(candidate => candidate.pid !== params.pid).map((candidate, index) => ({ ...candidate, sortIndex: index }));

	if (gallery.coverPid === params.pid) {
		gallery.coverPid = null;
	}

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery) });
}

/**
 * Re-derives every photo, e.g. after flipping the watermark mode.
 *
 * Derivative keys carry a rev suffix, so a new rev is a new URL: the old edge
 * cache entries simply age out and no CloudFront invalidation is needed.
 */
async function reprocess({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);

	const stale = [];
	for (const photo of gallery.photos) {
		stale.push(
			thumbKey(gallery.id, photo.pid, photo.rev),
			webKey(gallery.id, photo.pid, photo.rev),
			// The cover's clean copy is rev-suffixed like everything else, so the new
			// rev needs a new one; the client read that follows queues it.
			coverImageKey(gallery.id, photo.pid, photo.rev),
			hdKey(gallery.id, photo.pid, photo.rev)
		);
		photo.rev += 1;
		photo.status = "processing";
		// Dates the new attempt, so a reconcile that lands while these are in flight
		// does not read them as abandoned and queue every one of them twice.
		photo.queuedAt = new Date().toISOString();
	}

	await saveGallery(gallery, etag);

	await Promise.all(
		gallery.photos.map(photo =>
			invokeProcessor({
				gid: gallery.id,
				pid: photo.pid,
				extension: photo.extension,
				originalName: photo.originalName,
				watermark: gallery.watermark,
				rev: photo.rev
			})
		)
	);

	// Old derivatives go only after the new revs are queued, so a failure mid-way
	// leaves the gallery viewable rather than blank.
	await deleteKeys(stale);
	// ZIPs are keyed by photo revs, so every cached archive is now stale.
	await deletePrefix(zipPrefix(gallery.id));
	await deletePrefix(zipMarkerPrefix(gallery.id));

	return json(202, { queued: gallery.photos.length });
}

// --- sharing ---------------------------------------------------------------

async function share({ request, params }) {
	await requireAdmin(request);
	const { data: gallery } = await loadGallery(params.gid);

	const recipient = email(request.body?.to ?? gallery.clientEmail, "destinataire", { required: true });
	const password = str(request.body?.password, "mot de passe", { max: 200 });
	const note = str(request.body?.note, "message", { max: 2000 });
	const origin = publicOrigin(request);
	const link = `${origin}/gallery/${gallery.slug}`;

	if (gallery.status !== "published") {
		throw badRequest("Publiez la galerie avant de l'envoyer au client.");
	}

	const lines = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		`Votre galerie « ${gallery.title} » est en ligne :`,
		link,
		...(password ? ["", `Mot de passe : ${password}`] : []),
		...(note ? ["", note] : []),
		...(gallery.expiresAt ? ["", `La galerie reste accessible jusqu'au ${new Date(gallery.expiresAt).toLocaleDateString("fr-FR")}.`] : []),
		"",
		"À très bientôt,",
		"Ankaa Studio"
	];

	await sendEmail({
		to: recipient,
		subject: `Votre galerie « ${gallery.title} » est en ligne`,
		text: lines.join("\n"),
		html: emailLayout({
			label: "Galerie en ligne",
			heading: "Votre galerie est en ligne",
			preview: `Vos photos vous attendent dans la galerie « ${gallery.title} ».`,
			origin,
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph(`Vos photos vous attendent dans la galerie <strong>${escapeHtml(gallery.title)}</strong>.`),
				note ? emailQuote(note) : "",
				password ? emailValue("Mot de passe", password) : "",
				emailButton(link, "Voir la galerie"),
				gallery.expiresAt ? emailNote(`Galerie accessible jusqu'au ${escapeHtml(new Date(gallery.expiresAt).toLocaleDateString("fr-FR"))}.`) : ""
			].join("")
		})
	});

	return json(200, { ok: true, sentTo: recipient });
}

// --- download notifications ------------------------------------------------

/**
 * The photographer's feed: who downloaded what, newest first.
 *
 * `seenAt` is the read marker the badge counts against, kept server-side so the
 * count is the same on a laptop and on a phone.
 */
async function listDownloads({ request }) {
	await requireAdmin(request);
	const log = await readDownloadLog();
	const gid = request.query.get("gid");

	return json(200, {
		events: gid ? (log.events ?? []).filter(event => event.gid === gid) : (log.events ?? []),
		seenAt: log.seenAt ?? null
	});
}

async function seenDownloads({ request }) {
	await requireAdmin(request);

	return json(200, { seenAt: await markDownloadsSeen() });
}

/** What the client marked as favourite. */
async function readSelection({ request, params }) {
	await requireAdmin(request);
	const stored = await getJson(selectionKey(params.gid));
	const { data: gallery } = await loadGallery(params.gid);
	const chosen = new Set(stored?.data?.pids ?? []);

	return json(200, {
		updatedAt: stored?.data?.updatedAt ?? null,
		photos: gallery.photos
			.filter(photo => chosen.has(photo.pid))
			.sort((a, b) => a.sortIndex - b.sortIndex)
			.map(photo => ({ pid: photo.pid, originalName: photo.originalName }))
	});
}

export const adminRoutes = [
	["POST", "/api/admin/login", login],
	["POST", "/api/admin/logout", logout],
	["GET", "/api/admin/session", session],
	["GET", "/api/admin/galleries", listGalleries],
	["POST", "/api/admin/galleries", createGallery],
	["GET", "/api/admin/galleries/:gid", readGallery],
	["PATCH", "/api/admin/galleries/:gid", updateGallery],
	["DELETE", "/api/admin/galleries/:gid", deleteGallery],
	["POST", "/api/admin/galleries/:gid/uploads", createUploads],
	["POST", "/api/admin/galleries/:gid/process", processPhotos],
	["GET", "/api/admin/galleries/:gid/pending", pendingPhotos],
	["POST", "/api/admin/galleries/:gid/reconcile", reconcile],
	["PATCH", "/api/admin/galleries/:gid/photos", patchPhotos],
	["DELETE", "/api/admin/galleries/:gid/photos/:pid", deletePhoto],
	["POST", "/api/admin/galleries/:gid/reprocess", reprocess],
	["POST", "/api/admin/galleries/:gid/share", share],
	["GET", "/api/admin/galleries/:gid/selection", readSelection],
	["GET", "/api/admin/downloads", listDownloads],
	["POST", "/api/admin/downloads/seen", seenDownloads]
];
