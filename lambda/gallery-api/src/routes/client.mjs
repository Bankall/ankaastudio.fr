// Client-facing gallery routes: password gate, manifest, downloads, favourites.

import { createHash } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { hasGallerySession, isAdmin, issueGallerySession, issueSignedCookies, penalise, requireGalleryAccess, SIGNED_COOKIE_TTL_SECONDS } from "../lib/auth.mjs";
import { badRequest, forbidden, HttpError, json, notFound, publicOrigin, redirect } from "../lib/http.mjs";
import { jobId as newJobId } from "../lib/ids.mjs";
import { verifyPassword } from "../lib/passwords.mjs";
import { invokeProcessor } from "../lib/processor.mjs";
import { getSecrets } from "../lib/secrets.mjs";
import { getJson, objectExists, putJson, updateJson } from "../lib/store.mjs";
import { signedUrl } from "../lib/cfsign.mjs";
import { str, stringArray } from "../lib/validate.mjs";
import { clientProjection, coverImageKey, emptyIndex, galleryKey, hdKey, INDEX_KEY, isExpired, jobKey, readyCover, selectionKey, zipMarkerKey } from "../lib/galleries.mjs";

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

	if (gallery.status === "archived") {
		throw new HttpError(410, "Cette galerie a été archivée.");
	}

	if (isExpired(gallery)) {
		throw new HttpError(410, "Cette galerie a expiré.");
	}

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

/** Throws unless this gallery currently permits the requested download kind. */
function assertDownloadable(gallery, kind) {
	if (!gallery.downloadsEnabled) {
		throw forbidden("Les téléchargements sont désactivés pour cette galerie.");
	}

	if (kind === "hd" && !gallery.hdEnabled) {
		throw forbidden("Le téléchargement haute définition est désactivé.");
	}

	if (kind === "zip" && !gallery.zipEnabled) {
		throw forbidden("Le téléchargement groupé est désactivé.");
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
	assertDownloadable(gallery, "hd");

	const photo = gallery.photos.find(candidate => candidate.pid === params.pid && candidate.status === "ready");
	if (!photo) {
		throw notFound("Photo introuvable.");
	}

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

/**
 * Batch download.
 *
 * The archive is content-addressed by the exact set of photo revisions it
 * contains, so the same request twice costs one build, and a selection gets its
 * own cache entry for free.
 */
async function downloadZip({ request, params }) {
	const gallery = await resolveGallery(request, params.slug);
	await requireGalleryAccess(request, gallery);
	assertDownloadable(gallery, "zip");

	const requested = stringArray(request.body?.pids, "photos", { max: MAX_ZIP_PHOTOS });
	const ready = gallery.photos.filter(photo => photo.status === "ready");
	const chosen = requested?.length ? ready.filter(photo => requested.includes(photo.pid)) : ready;

	if (chosen.length === 0) {
		throw badRequest("Aucune photo à télécharger.");
	}

	const ordered = chosen.slice().sort((a, b) => a.sortIndex - b.sortIndex);
	const hash = createHash("sha1")
		.update(ordered.map(photo => `${photo.pid}_${photo.rev}`).join(","))
		.digest("hex")
		.slice(0, 16);

	const { cfPrivateKey } = await getSecrets();
	const origin = publicOrigin(request);

	const signFor = objectKey =>
		signedUrl({
			url: `${origin}/${objectKey}`,
			expiresAt: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
			keyPairId: process.env.CF_KEY_PAIR_ID,
			privateKey: cfPrivateKey
		});

	const cached = await cachedParts(gallery.id, hash);

	if (cached) {
		return json(200, {
			status: "done",
			parts: cached.map(part => ({ name: part.name, bytes: part.bytes, url: signFor(part.key) }))
		});
	}

	const jid = newJobId();
	const job = {
		jobId: jid,
		gid: gallery.id,
		slug: gallery.slug,
		hash,
		status: "pending",
		total: ordered.length,
		done: 0,
		parts: [],
		error: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};

	await putJson(jobKey(jid), job);

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
					photos: ordered.map(photo => ({
						pid: photo.pid,
						rev: photo.rev,
						originalName: photo.originalName,
						bytes: photo.bytes ?? 0
					}))
				})
			)
		})
	);

	return json(202, { status: "pending", jobId: jid, total: ordered.length });
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

	// A job id is unguessable, but it must not become a way around the gate.
	await requireGalleryAccess(request, gallery.data);

	const response = {
		status: job.status,
		total: job.total,
		done: job.done,
		error: job.error
	};

	if (job.status === "done") {
		const { cfPrivateKey } = await getSecrets();
		const origin = publicOrigin(request);

		response.parts = job.parts.map(part => ({
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

	return json(200, response);
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
	["POST", "/api/g/:slug/zip", downloadZip],
	["GET", "/api/g/:slug/selection", readSelection],
	["PUT", "/api/g/:slug/selection", saveSelection],
	["GET", "/api/jobs/:jobId", readJob]
];
