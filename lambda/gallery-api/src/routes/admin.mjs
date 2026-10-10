// Admin routes: authentication, gallery CRUD, uploads, processing and sharing.

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { freezeOriginals, originalsState, purgeDerivatives, thawOriginals } from "../lib/archive.mjs";
import { clearAdminSession, issueAdminSession, issueSignedCookies, penalise, requireAdmin, SIGNED_COOKIE_TTL_SECONDS } from "../lib/auth.mjs";
import { signedUrl } from "../lib/cfsign.mjs";
import { markDownloadsSeen, readDownloadLog } from "../lib/downloads.mjs";
import { badRequest, conflict, json, noContent, notFound, publicOrigin } from "../lib/http.mjs";
import { galleryId, photoId, setId as newSetId, SLUG_PATTERN, slugify } from "../lib/ids.mjs";
import { emailButton, emailLayout, emailNote, emailParagraph, emailQuote, emailValue, escapeHtml, sendEmail } from "../lib/mailer.mjs";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";
import { invokeProcessor } from "../lib/processor.mjs";
import { getSecrets } from "../lib/secrets.mjs";
import { deleteKeys, deletePrefix, getJson, listKeys, mapWithLimit, objectExists, putJson, s3, updateJson } from "../lib/store.mjs";
import { bool, email, isoDate, oneOf, str, stringArray } from "../lib/validate.mjs";
import {
	adminProjection,
	archivedPhoto,
	coverImageKey,
	emptyIndex,
	GALLERY_STATUSES,
	galleryKey,
	hdKey,
	INDEX_KEY,
	MAX_SETS,
	mediaPrefix,
	newGallery,
	newSet,
	originalKey,
	originalPrefix,
	pendingPhoto,
	photoWatermark,
	PREVIEW_QUALITY_MODES,
	previewQualityFor,
	readyCover,
	selectionKey,
	selectionVisitors,
	setOf,
	sharePreviewKey,
	sidecarKey,
	sidecarPrefix,
	thumbKey,
	ungroupedSettings,
	upsertIndex,
	WATERMARK_MODES,
	watermarkFor,
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
 * A bucket's watermark override, read from its patch body: one of the modes, or null
 * for "whatever the gallery says".
 *
 * `undefined` — the field was not sent — is a third answer, and the only one that must
 * leave the record alone, so oneOf()'s own null is not enough to distinguish them. The
 * empty string is accepted as null because that is what an unset <select> submits.
 */
function watermarkOverride(body, field) {
	if (body?.watermark === undefined) {
		return undefined;
	}

	return body.watermark === null || body.watermark === "" ? null : oneOf(body.watermark, field, WATERMARK_MODES);
}

/**
 * The derivatives that exist only for whichever photo is currently the cover: its
 * unmarked copy, and the JPEG a link preview is drawn from.
 *
 * Resolved through readyCover() so they name the same objects the client and preview
 * routes derive and serve — including the fallback to the first photo when no cover
 * was ever chosen.
 */
function coverDerivatives(gallery) {
	const cover = readyCover(gallery);

	return cover ? [coverImageKey(gallery.id, cover.pid, cover.rev), sharePreviewKey(gallery.id, cover.pid, cover.rev)] : [];
}

/**
 * Derives whichever of the two the current cover is missing.
 *
 * Called whenever a save can have moved the cover, and again when the editor opens,
 * rather than left to the first client read: that read builds its manifest from what
 * exists *now*, so the job it queues lands too late for it and the visitor who opens
 * the link first — usually the client, right after the photographer sent it — is the
 * one served the watermarked hero. Picking a new cover and switching the watermark on
 * both leave the gallery in that state, and nothing else derives afterwards.
 *
 * The link itself usually leaves through the copy button, which never reaches the API
 * at all, so these are also the last moments that reliably precede a share.
 *
 * Purely opportunistic: the save has already gone through by the time this runs, and
 * every caller has a marked preview to fall back on, so nothing here may throw.
 */
async function warmCoverDerivatives(gallery) {
	const cover = readyCover(gallery);

	if (!cover) {
		return;
	}

	// Nothing marked in the tab the cover happens to sit in means its ordinary web
	// preview is already the clean image — clientProjection says as much by withholding
	// coverImage — so that copy would be waste. The card's JPEG is wanted either way:
	// the crawlers it exists for cannot read the WebP the preview is.
	const wanted = [
		...(photoWatermark(gallery, cover) === "none" ? [] : [["cover", coverImageKey(gallery.id, cover.pid, cover.rev)]]),
		["share", sharePreviewKey(gallery.id, cover.pid, cover.rev)]
	];

	for (const [variant, key] of wanted) {
		try {
			if (!(await objectExists(key))) {
				await invokeProcessor({ gid: gallery.id, pid: cover.pid, extension: cover.extension, rev: cover.rev, variant });
			}
		} catch (error) {
			console.warn("Cover derivative not queued", { gid: gallery.id, pid: cover.pid, variant, error: error.message });
		}
	}
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

/**
 * The gallery index, each row carrying a signed URL for its cover thumbnail.
 *
 * Signed URLs rather than signed cookies, which is what every other view of a
 * thumbnail uses: a viewing cookie's policy covers exactly one gallery's v/ prefix,
 * and this page shows a cover from every gallery at once. Minting a cookie set per
 * row would mean three cookies per gallery in a browser that caps them per domain —
 * and leaving them out is what had the whole list render broken images until each
 * gallery had been opened once, which is the only thing that issued its cookie.
 *
 * They outlive the page load because the thumbnails are lazy: one loads whenever the
 * photographer scrolls to it, which can be well after the list arrived.
 */
async function listGalleries({ request }) {
	await requireAdmin(request);
	const index = (await getJson(INDEX_KEY))?.data ?? emptyIndex();
	const { cfPrivateKey } = await getSecrets();
	const origin = publicOrigin(request);
	const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_COOKIE_TTL_SECONDS;

	return json(200, {
		galleries: index.galleries.map(row => ({
			...row,
			cover:
				row.coverPid ?
					signedUrl({
						url: `${origin}/${thumbKey(row.id, row.coverPid, row.coverRev)}`,
						expiresAt,
						keyPairId: process.env.CF_KEY_PAIR_ID,
						privateKey: cfPrivateKey
					})
				:	null
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

	// Opening the editor is the last thing that reliably happens before a link is
	// shared, so it is where the cover's own images get built — and the safety net
	// for a cover whose derive was queued from a save that then failed.
	await warmCoverDerivatives(data);

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
	const wasArchived = gallery.status === "archived";

	const assignments = {
		title: str(body.title, "titre", { max: 160, allowEmpty: false }),
		clientName: str(body.clientName, "nom du client", { max: 160 }),
		clientEmail: email(body.clientEmail, "email du client"),
		status: oneOf(body.status, "statut", GALLERY_STATUSES),
		watermark: oneOf(body.watermark, "filigrane", WATERMARK_MODES),
		previewQuality: oneOf(body.previewQuality, "qualité des aperçus", PREVIEW_QUALITY_MODES),
		// Not an instruction to the processor, unlike the two above: both preview files
		// exist whatever this says, so it reaches every photo the moment it is saved.
		fullResTiles: bool(body.fullResTiles, "vignettes pleine résolution"),
		// The master switch alone. The photos in no set have their own pair below, and
		// each set carries one too; see the set routes.
		downloadsEnabled: bool(body.downloadsEnabled, "téléchargements")
	};

	for (const [field, value] of Object.entries(assignments)) {
		if (value !== null) {
			gallery[field] = value;
		}
	}

	// The remainder's own settings, patched like a set's: the panel sends one field at a
	// time, so the others keep whatever they had. Writing it also retires the top-level
	// `hdEnabled` it supersedes, or ungroupedSettings() would keep a second, now stale
	// answer for the same question.
	if (body.ungrouped !== undefined) {
		const current = ungroupedSettings(gallery);
		const downloads = bool(body.ungrouped?.downloadsEnabled, "téléchargements hors catégorie");
		const hd = bool(body.ungrouped?.hdEnabled, "haute définition hors catégorie");
		const watermark = watermarkOverride(body.ungrouped, "filigrane hors catégorie");

		gallery.ungrouped = {
			downloadsEnabled: downloads ?? current.downloadsEnabled,
			hdEnabled: hd ?? current.hdEnabled,
			watermark: watermark === undefined ? current.watermark : watermark
		};

		delete gallery.hdEnabled;
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

		// The outgoing cover's own derivatives have no reason to exist any more, and
		// leaving them behind would slowly turn "one clean preview per gallery" into
		// one per photo that was ever the cover. The incoming cover's are queued after
		// the save, by warmCoverDerivatives().
		const outgoing = coverDerivatives(gallery);

		gallery.coverPid = body.coverPid;

		const incoming = new Set(coverDerivatives(gallery));
		const stale = outgoing.filter(key => !incoming.has(key));

		if (stale.length > 0) {
			await deleteKeys(stale);
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

	const isArchived = gallery.status === "archived";

	if (isArchived) {
		// Marked before the files go, so nothing is left advertising a derivative that
		// is about to be deleted: "archived" drops the photo from client manifests and
		// stops adminProjection emitting preview URLs for it. Everything else on the
		// entry — pid, rev, extension, original filename, caption, order — is exactly
		// what a rebuild needs, so none of it is cleared.
		for (const photo of gallery.photos) {
			photo.status = "archived";
		}
	}

	await saveGallery(gallery, etag);

	if (isArchived) {
		// Record first: it now says "archived", so every client route answers 410 and
		// no one can ask for a file while it is being deleted. Both calls are
		// unconditional rather than only-on-transition, which is what makes them
		// idempotent — a run cut short by a timeout is finished by the next save,
		// instead of leaving orphaned derivatives to bill in silence.
		await purgeDerivatives(gallery.id);
		await freezeOriginals(gallery.id);
	} else if (wasArchived) {
		// Leaving archive cannot restore the gallery by itself: the derivatives are
		// gone, and the originals need up to 48 hours to become readable again. This
		// starts that clock; Régénérer les aperçus does the rebuild once it is done.
		await thawOriginals(gallery.id);
	} else {
		// Neither of the other two branches wants this: one has just deleted every
		// derivative the gallery had, and the other cannot read an original yet.
		await warmCoverDerivatives(gallery);
	}

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

	// Uploading into an archived gallery skips the whole transition dance: S3 accepts
	// a storage class on the POST itself, so the object lands in DEEP_ARCHIVE instead
	// of sitting in STANDARD until the daily lifecycle pass — no transition request to
	// pay for, and no window where a supposedly archived gallery is billed at full
	// rate. createPresignedPost turns every Field into an exact-match condition, so a
	// browser that drops the field gets a 403 rather than a silently expensive upload.
	const storageClass = gallery.status === "archived" ? { "x-amz-storage-class": "DEEP_ARCHIVE" } : {};

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
				Fields: {
					"Content-Type": file?.type && String(file.type).startsWith("image/") ? file.type : "image/jpeg",
					...storageClass
				}
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
 * Records the uploaded photos as pending, then queues a processor for each.
 *
 * Called by the uploader once an object is actually in S3. Triggering from the browser
 * rather than an S3 event keeps the infrastructure simpler — no notification wiring, no
 * circular stack dependency — and it is what lets the batch carry the watermark mode of
 * the tab it was dropped into. If a tab dies mid-batch, `reconcile` finds and re-queues
 * whatever never got processed.
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
	// Which tab the batch lands in. Absent or null means the ungrouped remainder,
	// which is where every upload went before sets existed.
	const target = str(request.body?.setId, "catégorie", { max: 40 });
	const targetSet = target ? (gallery.sets ?? []).find(set => set.id === target) : null;

	if (target && !targetSet) {
		throw badRequest("Cette catégorie n'existe pas.");
	}

	const known = new Set(gallery.photos.map(photo => photo.pid));
	// Deriving into an archived gallery would write the exact files archiving just
	// deleted, into a gallery that answers 410 — and against an original the uploader
	// has deliberately put in DEEP_ARCHIVE, so the read would fail anyway. The photo
	// is still recorded, so it is listed, ordered and captioned like the rest and gets
	// derived along with them whenever the gallery comes back.
	const isArchived = gallery.status === "archived";

	for (const item of queued) {
		// A retried batch must not double the row it already added.
		if (!known.has(item.pid)) {
			const entry = { ...item, setId: target };

			gallery.photos.push(isArchived ? archivedPhoto(entry, gallery.photos.length) : pendingPhoto(entry, gallery.photos.length));
		}
	}

	await saveGallery(gallery, etag);

	if (!isArchived) {
		// The mark is burnt in here and nowhere else, so it is the target tab's mode that
		// decides — a category set to "aucun filigrane" is how a batch is uploaded clean
		// without touching the rest of the gallery.
		const watermark = watermarkFor(gallery, targetSet);

		await Promise.all(queued.map(item => invokeProcessor({ gid: gallery.id, ...item, watermark, previewQuality: previewQualityFor(gallery), rev: 1 })));
	}

	return json(202, { queued: isArchived ? 0 : queued.length, archived: isArchived ? queued.length : 0 });
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

	// Editorial fields live on the record, not the sidecar, so they must survive —
	// the set a photo was uploaded into among them, or every reconcile would empty
	// the tabs while a batch was still processing.
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
			caption: previous?.caption ?? sidecar.caption ?? null,
			setId: previous?.setId ?? null
		};
	});

	// Photos with no sidecar of their own have to be carried over rather than rebuilt.
	// For "processing" that is about the grid: rebuilding purely from sidecars would
	// make a batch disappear until the last one landed, which is the opposite of what
	// a progress view is for. For "archived" it is about not losing the record — every
	// sidecar in an archived gallery has been deleted on purpose, so a rebuild from
	// sidecars alone would empty the photo list and strand the originals with nothing
	// left describing them, which is the one thing a rebuild cannot recreate.
	const carried = gallery.photos.filter(photo => !arrived.has(photo.pid) && (photo.status === "processing" || photo.status === "archived"));
	const all = [...merged, ...carried];

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
	// In an archived gallery there is nothing to repair: no photo is "processing", so
	// the stale branch never fires, and an unrecorded original is adopted as archived
	// instead of queued. Deriving here would rebuild what archiving deleted from an
	// original that is no longer readable — a gallery's worth of failed invocations
	// that would then overwrite the record with failed sidecars.
	const isArchived = gallery.status === "archived";

	for (const item of originals) {
		const photo = inRecord.get(item.pid);

		if (photo && photo.status !== "processing") {
			continue;
		}

		if (!photo) {
			// Uploaded but never queued — the tab closed between the two calls. The
			// original filename is only known to the browser that uploaded it, so it
			// is lost here; the processor falls back to the pid.
			if (isArchived) {
				gallery.photos.push(archivedPhoto(item, gallery.photos.length));
				continue;
			}

			gallery.photos.push(pendingPhoto(item, gallery.photos.length));
			// Adopted ungrouped, so that is the mode it is derived with — the tab it was
			// really uploaded into died with the browser that knew.
			requeue.push({ ...item, originalName: "", rev: 1, watermark: watermarkFor(gallery, null), previewQuality: previewQualityFor(gallery) });
			continue;
		}

		const queuedAt = Date.parse(photo.queuedAt ?? "");

		if (Number.isFinite(queuedAt) && queuedAt >= cutoff) {
			continue;
		}

		// Stamping it again is what keeps this idempotent: the editor polls every
		// few seconds, and without it every poll would queue the photo once more.
		photo.queuedAt = new Date().toISOString();
		requeue.push({
			pid: photo.pid,
			extension: photo.extension ?? item.extension,
			originalName: photo.originalName ?? "",
			rev: photo.rev ?? 1,
			watermark: photoWatermark(gallery, photo),
			previewQuality: previewQualityFor(gallery)
		});
	}

	if (gallery.coverPid && !gallery.photos.some(photo => photo.pid === gallery.coverPid)) {
		gallery.coverPid = null;
	}

	await saveGallery(gallery, etag);

	// Each item carries its own mode: which tab a photo sits in is what decides it, and
	// a reconcile can be repairing photos from several at once.
	await Promise.all(requeue.map(item => invokeProcessor({ gid: gallery.id, ...item })));

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

/**
 * The photos whose burnt-in watermark no longer matches the tab they are in.
 *
 * A tab's mode is baked into the derivatives, so a photo moved between tabs still carries
 * the mark of the one it came from — which shows, and in one direction loses the
 * protection the destination asked for. `before` holds the modes read *before* the move,
 * keyed by pid; anything absent from it has not moved and is left alone, as is any photo
 * whose mode did not actually change, most moves being a re-filing inside one mode.
 *
 * Bumps the revs, so it must run before saveGallery() — and flushRestamp() after it, no
 * rev being advertised before it is stored.
 */
function planRestamp(gallery, before) {
	// "ready" only: an archived photo's original is in cold storage and would fail to
	// derive, and one still processing is already in flight. Both come back with the right
	// mark through the reconcile that thaws them, or through ⟳.
	const photos = gallery.photos.filter(photo => photo.status === "ready" && before.has(photo.pid) && photoWatermark(gallery, photo) !== before.get(photo.pid));

	const stale = photos.flatMap(photo => [
		thumbKey(gallery.id, photo.pid, photo.rev),
		webKey(gallery.id, photo.pid, photo.rev),
		coverImageKey(gallery.id, photo.pid, photo.rev),
		sharePreviewKey(gallery.id, photo.pid, photo.rev),
		hdKey(gallery.id, photo.pid, photo.rev)
	]);

	for (const photo of photos) {
		photo.rev += 1;
		photo.status = "processing";
		// Dates the new attempt, so a reconcile landing while these are in flight does not
		// read them as abandoned and queue them twice.
		photo.queuedAt = new Date().toISOString();
	}

	return { photos, stale };
}

/** Queues the plan and drops what it replaces. Resolves to the number requeued. */
async function flushRestamp(gallery, { photos, stale }) {
	if (photos.length === 0) {
		return 0;
	}

	await Promise.all(
		photos.map(photo =>
			invokeProcessor({
				gid: gallery.id,
				pid: photo.pid,
				extension: photo.extension,
				originalName: photo.originalName,
				watermark: photoWatermark(gallery, photo),
				previewQuality: previewQualityFor(gallery),
				rev: photo.rev
			})
		)
	);

	// Old derivatives go only after the new revs are queued, so a failure mid-way leaves
	// the photos viewable rather than blank.
	await deleteKeys(stale);
	// ZIPs are keyed by photo revs, so any cached archive holding one of these is stale.
	await deletePrefix(zipPrefix(gallery.id));
	await deletePrefix(zipMarkerPrefix(gallery.id));

	return photos.length;
}

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

	// { [pid]: setId | null } — null moves the photo out of every set, back to the
	// settings of the ungrouped remainder.
	const moved = new Map();

	if (body.sets !== undefined) {
		if (typeof body.sets !== "object" || body.sets === null) {
			throw badRequest("Les catégories doivent être fournies sous forme d'objet.");
		}

		const known = new Set((gallery.sets ?? []).map(set => set.id));

		for (const [pid, sid] of Object.entries(body.sets)) {
			const target = str(sid, "catégorie", { max: 40 });

			if (target && !known.has(target)) {
				throw badRequest("Cette catégorie n'existe pas.");
			}

			const photo = gallery.photos.find(candidate => candidate.pid === pid);

			if (photo) {
				// Read before the move, while the photo still resolves to the tab its
				// derivatives were made for.
				moved.set(pid, photoWatermark(gallery, photo));
				photo.setId = target;
			}
		}
	}

	const restamp = planRestamp(gallery, moved);

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery), requeued: await flushRestamp(gallery, restamp) });
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
		// These two only exist if this photo was the cover, and deleting a key that is
		// not there costs nothing.
		coverImageKey(gallery.id, photo.pid, photo.rev),
		sharePreviewKey(gallery.id, photo.pid, photo.rev),
		hdKey(gallery.id, photo.pid, photo.rev),
		originalKey(gallery.id, photo.pid, photo.extension),
		sidecarKey(gallery.id, photo.pid)
	]);

	gallery.photos = gallery.photos.filter(candidate => candidate.pid !== params.pid).map((candidate, index) => ({ ...candidate, sortIndex: index }));

	if (gallery.coverPid === params.pid) {
		gallery.coverPid = null;
	}

	await saveGallery(gallery, etag);

	// With no cover chosen, the first photo is standing in — so deleting any photo can
	// hand the role to a different one, which needs the two derivatives the outgoing
	// cover had. An explicit cover that survived this delete keeps its own.
	if (!gallery.coverPid) {
		await warmCoverDerivatives(gallery);
	}

	return json(200, { gallery: adminProjection(gallery) });
}

// --- sets ------------------------------------------------------------------

/** The set by id, or a 404 — every route below needs exactly this. */
function findSet(gallery, sid) {
	const set = (gallery.sets ?? []).find(candidate => candidate.id === sid);

	if (!set) {
		throw notFound("Catégorie introuvable.");
	}

	return set;
}

/**
 * Creates an empty set.
 *
 * Nothing is moved into it, which is what makes creating one harmless: the tab
 * appears in the editor, the client sees nothing change until photos are put in it
 * — from the uploader's target select, or one photo at a time in the grid.
 */
async function createSet({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const title = str(request.body?.title, "titre de la catégorie", { max: 120, required: true, allowEmpty: false });

	gallery.sets = gallery.sets ?? [];

	if (gallery.sets.length >= MAX_SETS) {
		throw badRequest(`${MAX_SETS} catégories maximum par galerie.`);
	}

	gallery.sets.push(newSet({ id: newSetId(), title, hdEnabled: ungroupedSettings(gallery).hdEnabled }));

	await saveGallery(gallery, etag);

	return json(201, { gallery: adminProjection(gallery) });
}

async function updateSet({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const set = findSet(gallery, params.sid);

	const assignments = {
		title: str(request.body?.title, "titre de la catégorie", { max: 120, allowEmpty: false }),
		downloadsEnabled: bool(request.body?.downloadsEnabled, "téléchargements de la catégorie"),
		hdEnabled: bool(request.body?.hdEnabled, "haute définition de la catégorie")
	};

	for (const [field, value] of Object.entries(assignments)) {
		if (value !== null) {
			set[field] = value;
		}
	}

	// Out of the loop above, which reads null as "not sent": null is a value here, the
	// one that hands the decision back to the gallery. Nothing is re-derived here — the
	// mode only reaches photos derived after it, and whether the ones already in the set
	// are re-derived is the photographer's call: the admin offers a scoped reprocess as
	// soon as this returns. Unlike a move, where the photo's mode changes under it without
	// anyone choosing a new one.
	const watermark = watermarkOverride(request.body, "filigrane de la catégorie");

	if (watermark !== undefined) {
		set.watermark = watermark;
	}

	// Cached archives are keyed by the variant they were built from, so flipping HD
	// here cannot serve the wrong quality from cache — the next request simply
	// misses and builds the other one.
	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery) });
}

/** Reorders the tabs. The array *is* the order, so this rewrites it. */
async function reorderSets({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const order = stringArray(request.body?.order, "ordre des catégories", { max: MAX_SETS });
	const position = new Map((order ?? []).map((sid, index) => [sid, index]));

	// Anything the caller left out keeps its relative place at the end rather than
	// disappearing: a set created in another tab must not be dropped by a stale order.
	gallery.sets = (gallery.sets ?? [])
		.slice()
		.sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery) });
}

/**
 * Removes a set, but never its photos: they go back to the settings of the ungrouped
 * remainder. Deleting a tab must not be a way to delete photographs.
 *
 * It is a move like any other, so its photos are re-derived if the remainder asks for a
 * different watermark than the set did — otherwise deleting a category is a way to leave
 * unmarked photos in a marked gallery.
 */
async function deleteSet({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	findSet(gallery, params.sid);

	const moved = new Map();

	// Before the set goes, while its own mode is still what these photos resolve to.
	for (const photo of gallery.photos) {
		if (photo.setId === params.sid) {
			moved.set(photo.pid, photoWatermark(gallery, photo));
			photo.setId = null;
		}
	}

	gallery.sets = gallery.sets.filter(candidate => candidate.id !== params.sid);

	const restamp = planRestamp(gallery, moved);

	await saveGallery(gallery, etag);

	return json(200, { gallery: adminProjection(gallery), requeued: await flushRestamp(gallery, restamp) });
}

/**
 * Re-derives photos, e.g. after flipping a watermark mode.
 *
 * Derivative keys carry a rev suffix, so a new rev is a new URL: the old edge
 * cache entries simply age out and no CloudFront invalidation is needed. This is
 * also how a gallery comes back from being archived, since by then the originals
 * are the only thing left.
 *
 * `setId` narrows it to one tab, which is what makes a per-category watermark usable
 * after the fact: taking the mark off a hundred photos should not mean re-deriving the
 * two thousand around them. Absent means the whole gallery — and null is neither, it
 * means the photos in no category, so the three cases are told apart by presence.
 */
async function reprocess({ request, params }) {
	await requireAdmin(request);
	const { data: gallery, etag } = await loadGallery(params.gid);
	const scoped = request.body?.setId !== undefined;
	const sid = scoped ? str(request.body.setId, "catégorie", { max: 40 }) : null;

	if (sid && !(gallery.sets ?? []).some(set => set.id === sid)) {
		throw badRequest("Cette catégorie n'existe pas.");
	}

	// Rebuilding into a gallery that still answers 410 derives files nobody can fetch
	// and that the next save would delete again. The status change is also what starts
	// the restore, so it has to come first either way.
	if (gallery.status === "archived") {
		throw conflict("Cette galerie est archivée. Repassez-la en brouillon ou en ligne pour lancer la restauration des originaux, puis régénérez les aperçus.");
	}

	// Every derive reads an original, and one in Deep Archive will not answer a GET.
	// Checking here costs a single listing and turns what would be a gallery's worth
	// of failed invocations into one sentence — and, when nothing has asked for the
	// restore yet, starts it, so the photographer never has to round-trip through
	// the status select to get unstuck.
	const originals = await originalsState(gallery.id);

	if (originals.frozen > 0) {
		await thawOriginals(gallery.id);

		throw conflict(`Restauration de ${originals.frozen} original(aux) lancée. Comptez jusqu'à 48 h, puis relancez la régénération.`);
	}

	if (originals.restoring > 0) {
		throw conflict(`Restauration en cours : ${originals.restoring} original(aux) encore indisponible(s). Réessayez plus tard — comptez jusqu'à 48 h au total.`);
	}

	// Resolved through setOf() so a photo whose set was deleted counts as ungrouped
	// here exactly as it does everywhere else — otherwise the one scope that can never
	// be selected by name would be the one holding it.
	const targets = scoped ? gallery.photos.filter(photo => (setOf(gallery, photo)?.id ?? null) === sid) : gallery.photos;

	const stale = [];
	for (const photo of targets) {
		stale.push(
			thumbKey(gallery.id, photo.pid, photo.rev),
			webKey(gallery.id, photo.pid, photo.rev),
			// The cover's clean copy and its preview JPEG are rev-suffixed like
			// everything else, so the new rev needs new ones; the client read and the
			// next editor open that follow queue them.
			coverImageKey(gallery.id, photo.pid, photo.rev),
			sharePreviewKey(gallery.id, photo.pid, photo.rev),
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
		targets.map(photo =>
			invokeProcessor({
				gid: gallery.id,
				pid: photo.pid,
				extension: photo.extension,
				originalName: photo.originalName,
				// Per photo, not per gallery: this is what applies a category's own mode to
				// the photos already in it, which is the only way a mark comes off — or
				// goes on — once it has been burnt into a derivative.
				watermark: photoWatermark(gallery, photo),
				// Gallery-wide, so every scope of this route agrees on it: re-deriving one
				// tab at a time must not leave the gallery holding two compressions.
				previewQuality: previewQualityFor(gallery),
				rev: photo.rev
			})
		)
	);

	// Old derivatives go only after the new revs are queued, so a failure mid-way
	// leaves the gallery viewable rather than blank.
	await deleteKeys(stale);
	// ZIPs are keyed by photo revs, so any cached archive holding one of these is now
	// stale. Dropping the lot rather than working out which: an archive is rebuilt on
	// demand, and a mixed selection makes "which" nearly every one of them anyway.
	await deletePrefix(zipPrefix(gallery.id));
	await deletePrefix(zipMarkerPrefix(gallery.id));

	return json(202, { queued: targets.length });
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

/**
 * What each visitor marked as favourite, one list per address.
 *
 * A gallery link goes to everyone who was photographed, so "the client's selection"
 * is usually several selections — and which photo belongs to whose list is the whole
 * reason the photographer asked. Newest first: the list someone is working on right
 * now is the one worth reading.
 */
async function readSelection({ request, params }) {
	await requireAdmin(request);
	const stored = await getJson(selectionKey(params.gid));
	const { data: gallery } = await loadGallery(params.gid);
	const byPid = new Map(gallery.photos.map(photo => [photo.pid, photo]));

	return json(200, {
		visitors: selectionVisitors(stored?.data)
			.map(visitor => ({
				// Empty for picks made before selections were attributed; the panel says so
				// rather than inventing an owner for them.
				email: visitor.email ?? "",
				updatedAt: visitor.updatedAt ?? null,
				photos: (visitor.pids ?? [])
					.map(pid => byPid.get(pid))
					.filter(Boolean)
					.sort((a, b) => a.sortIndex - b.sortIndex)
					.map(photo => ({ pid: photo.pid, originalName: photo.originalName }))
			}))
			// A list whose photos have all been deleted has nothing left to say.
			.filter(visitor => visitor.photos.length > 0)
			.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
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
	["POST", "/api/admin/galleries/:gid/sets", createSet],
	["PATCH", "/api/admin/galleries/:gid/sets", reorderSets],
	["PATCH", "/api/admin/galleries/:gid/sets/:sid", updateSet],
	["DELETE", "/api/admin/galleries/:gid/sets/:sid", deleteSet],
	["POST", "/api/admin/galleries/:gid/reprocess", reprocess],
	["POST", "/api/admin/galleries/:gid/share", share],
	["GET", "/api/admin/galleries/:gid/selection", readSelection],
	["GET", "/api/admin/downloads", listDownloads],
	["POST", "/api/admin/downloads/seen", seenDownloads]
];
