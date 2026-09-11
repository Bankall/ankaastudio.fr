// Gallery domain model: key layout, defaults, and the projections that decide
// what each audience is allowed to see.

export const INDEX_KEY = "db/index.json";

export const galleryKey = gid => `db/galleries/${gid}.json`;
export const sidecarPrefix = gid => `db/galleries/${gid}/photos/`;
export const sidecarKey = (gid, pid) => `db/galleries/${gid}/photos/${pid}.json`;
export const jobKey = jid => `db/jobs/${jid}.json`;
export const selectionKey = gid => `db/selections/${gid}.json`;

export const originalPrefix = gid => `originals/${gid}/`;
export const originalKey = (gid, pid, extension) => `originals/${gid}/${pid}.${extension}`;

// Two zones under media/: v/ is covered by the viewing cookie, d/ never is.
export const viewPrefix = gid => `media/g/${gid}/v/`;
export const mediaPrefix = gid => `media/g/${gid}/`;
export const thumbKey = (gid, pid, rev) => `media/g/${gid}/v/t/${pid}_${rev}.webp`;
export const webKey = (gid, pid, rev) => `media/g/${gid}/v/w/${pid}_${rev}.webp`;
// The unmarked cover. Derived only for the photo that is currently the cover, so
// a gallery never holds more than one clean preview of one photo.
export const coverImageKey = (gid, pid, rev) => `media/g/${gid}/v/c/${pid}_${rev}.webp`;
// The cover again, for the card a messaging app draws when the gallery link is
// pasted into a conversation: JPEG rather than WebP, and small, because it is
// fetched by a crawler that will not wait and may not read WebP. Derived for the
// current cover only, exactly like the clean copy above.
export const sharePreviewKey = (gid, pid, rev) => `media/g/${gid}/v/s/${pid}_${rev}.jpg`;
export const hdKey = (gid, pid, rev) => `media/g/${gid}/d/hd/${pid}_${rev}.jpg`;
export const zipPrefix = gid => `media/g/${gid}/d/zip/`;
export const zipKey = (gid, hash, suffix = "") => `media/g/${gid}/d/zip/${hash}${suffix}.zip`;

// Written by the zipper once an archive is complete: the parts list keyed by the
// content hash. A single GET answers "is this exact selection already built?"
// for both one-part and split archives.
export const zipMarkerKey = (gid, hash) => `db/zips/${gid}/${hash}.json`;
export const zipMarkerPrefix = gid => `db/zips/${gid}/`;

export const WATERMARK_KEY = "assets/watermark.png";
// The gallery's mode, and the override a set or the ungrouped remainder may carry
// instead — null there means "whatever the gallery says". Unlike the download
// switches this one is not a permission but an instruction to the processor: it is
// baked into the derivatives, so changing it only reaches photos that are derived
// afterwards. watermarkFor() resolves the two.
export const WATERMARK_MODES = ["preview", "all", "none"];
export const GALLERY_STATUSES = ["draft", "published", "archived"];

// Sets are named groups of photos inside a gallery, shown to the client as tabs,
// each with its own download switches. They are optional: a photo that belongs to no
// set is served under the gallery's `ungrouped` pair, which is a set's pair in all but
// name and starts out permitting what every photo got before sets existed — so nothing
// needs migrating.
//
// The title given to that ungrouped remainder, on the rare occasion it is shown
// next to real sets.
export const DEFAULT_SET_TITLE = "Galerie";
// Enough for any shoot that is worth splitting; low enough that the tab bar stays
// a tab bar rather than a menu.
export const MAX_SETS = 30;

// A photo's own state, which is not the gallery's:
//   processing — uploaded, derivatives not written yet
//   ready      — derivatives exist and may be served
//   failed     — the processor gave up on it
//   archived   — the original is kept, every derivative has been deleted
// Only "ready" is servable, which is why readyPhotos() gates on it rather than
// listing the states that are not.

export function newGallery({ id, slug, title, clientName = "", clientEmail = "", shootDate = null }) {
	const now = new Date().toISOString();

	return {
		id,
		slug,
		title,
		clientName,
		clientEmail,
		shootDate,
		status: "draft",
		coverPid: null,
		// null password = anyone holding the link gets in.
		password: null,
		watermark: "preview",
		// The master switch: nothing below it can offer a download it refuses.
		downloadsEnabled: true,
		// The settings the photos in no set get. Their own, not the master's; see
		// ungroupedSettings().
		ungrouped: { downloadsEnabled: true, hdEnabled: true, watermark: null },
		expiresAt: null,
		sets: [],
		photos: [],
		createdAt: now,
		updatedAt: now
	};
}

/**
 * The settings the photos in no set get — a set's own fields, minus the identity.
 *
 * A pair of switches of its own rather than the gallery's, because the gallery's
 * `downloadsEnabled` is the master over every set as well: while the two were the
 * same field, closing downloads for the loose photos closed them for every category
 * too, and the panel had no way to say otherwise. That is also why the remainder's
 * row was read-only.
 *
 * Absent on records written before it existed, where an ungrouped photo was served
 * under the gallery's own pair — the master, and an `hdEnabled` that lived at the top
 * level. The fallback reproduces exactly that, so no gallery changes behaviour by
 * being read through here, and the first save of the remainder's settings replaces
 * both with this.
 */
export const ungroupedSettings = gallery =>
	gallery.ungrouped ?? { downloadsEnabled: true, hdEnabled: Boolean(gallery.hdEnabled), watermark: null };

/**
 * A named group of photos, with its own download switches and watermark.
 *
 * The array order is the tab order — there is no sortIndex, because a handful of
 * sets reorder by rewriting the array and a second source of truth for something
 * this small only invites the two to disagree.
 *
 * `downloadsEnabled` starts true and `hdEnabled` copies the ungrouped remainder's, so
 * a fresh set behaves like the loose photos it is about to be filled from until it is
 * told otherwise. The gallery's own `downloadsEnabled` remains the master: a set can
 * refuse what the gallery allows, never the other way round.
 *
 * `watermark` starts null — the gallery's mode — rather than copying it, because it is
 * the one setting whose change has to be followed by a re-derive: an override that
 * tracks the gallery keeps a set that was never given a mode of its own from quietly
 * needing one.
 */
export function newSet({ id, title, hdEnabled = true }) {
	return {
		id,
		title,
		downloadsEnabled: true,
		hdEnabled: Boolean(hdEnabled),
		watermark: null
	};
}

/**
 * The record entry for a photo that has been uploaded but not yet derived.
 *
 * The record has to know about a photo before its sidecar exists, or the admin
 * grid has nothing to show a "traitement…" tile for and no reason to keep
 * polling. `queuedAt` is what lets reconcile tell a photo that is still being
 * processed from one whose processor never came back.
 */
export function pendingPhoto({ pid, extension, originalName = "", setId = null }, sortIndex, rev = 1) {
	return {
		pid,
		rev,
		extension,
		originalName,
		status: "processing",
		queuedAt: new Date().toISOString(),
		caption: null,
		setId,
		sortIndex
	};
}

/**
 * The record entry for a photo uploaded straight into an archived gallery.
 *
 * Same shape as pendingPhoto minus the queue: nothing is derived, so there is no
 * processor to wait on and no sidecar will ever appear — which is why `queuedAt`
 * is null rather than a date reconcile would eventually read as abandoned.
 *
 * `rev` still starts at 1 so that bringing the gallery back treats these exactly
 * like every other photo: reprocess bumps them to 2 and writes the derivative
 * keys the record already expects.
 */
export function archivedPhoto({ pid, extension, originalName = "", setId = null }, sortIndex) {
	return {
		pid,
		rev: 1,
		extension,
		originalName,
		status: "archived",
		queuedAt: null,
		caption: null,
		setId,
		sortIndex
	};
}

// --- favourites ------------------------------------------------------------

// A selection belongs to an email address, and a gallery link is often shared
// between everyone who was photographed, so one document holds several lists. High
// enough that no real shoot reaches it; there only because anyone holding the link
// can add an address, and the document must not grow without bound.
export const MAX_SELECTION_VISITORS = 200;

/**
 * The selections a gallery holds, one per visitor.
 *
 * Documents written before favourites were attributed hold a single unnamed `pids`
 * list, which reads here as one visitor with no address: those picks were made in
 * good faith and the photographer's panel says where they came from rather than
 * dropping them.
 */
export function selectionVisitors(document) {
	if (Array.isArray(document?.visitors)) {
		return document.visitors;
	}

	const legacy = document?.pids ?? [];

	return legacy.length > 0 ? [{ email: "", pids: legacy, createdAt: null, updatedAt: document?.updatedAt ?? null }] : [];
}

/**
 * The address a selection is filed under.
 *
 * Case-folded: mail addresses are treated as case-insensitive by every provider
 * that matters, and a client who capitalises their own name on their phone must not
 * end up with a second, empty selection.
 */
export const selectionOwner = value => (value ?? "").trim().toLowerCase();

/**
 * One visitor's picks, or null when this address has never marked anything.
 *
 * An empty address matches nothing, not the unattributed legacy list: a visitor who
 * has given no address has no selection, and handing them someone else's would be
 * the one thing this whole change exists to prevent.
 */
export function selectionOf(document, email) {
	const owner = selectionOwner(email);

	if (!owner) {
		return null;
	}

	return selectionVisitors(document).find(visitor => selectionOwner(visitor.email) === owner) ?? null;
}

export function isExpired(gallery, now = Date.now()) {
	return Boolean(gallery.expiresAt) && Date.parse(gallery.expiresAt) < now;
}

/** Cover falls back to the first photo so a gallery is never coverless. */
export function coverPhoto(gallery) {
	const photos = gallery.photos ?? [];

	return photos.find(photo => photo.pid === gallery.coverPid) ?? photos[0] ?? null;
}

const readyPhotos = gallery => (gallery.photos ?? []).filter(photo => photo.status === "ready").sort((a, b) => a.sortIndex - b.sortIndex);

// --- sets ------------------------------------------------------------------

/**
 * The set a photo belongs to, or null.
 *
 * Null covers three cases that all want the same answer — never grouped, grouped
 * into a set that has since been deleted, or uploaded before sets existed — so a
 * dangling `setId` degrades to the gallery's own settings instead of to nothing.
 */
export function setOf(gallery, photo) {
	if (!photo?.setId) {
		return null;
	}

	return (gallery.sets ?? []).find(set => set.id === photo.setId) ?? null;
}

/**
 * What a set permits. With no set, what the ungrouped remainder permits.
 *
 * Both are read the same way, which is the whole reason the remainder carries a
 * set-shaped pair: one switch of its own for downloads, one for HD, under the
 * gallery's master. That master is checked here rather than left to the caller — it is
 * what the admin list badge reports and what the infra guarantees, so nothing below it
 * may open a door it has shut.
 *
 * `zip` is not a switch of its own. A client who may save every photo one by one
 * gains nothing from being refused the single request that does it in one file, so
 * the archive simply follows `enabled`.
 */
export function downloadsFor(gallery, set) {
	const own = set ?? ungroupedSettings(gallery);
	const enabled = Boolean(gallery.downloadsEnabled) && Boolean(own.downloadsEnabled);

	return {
		enabled,
		hd: enabled && Boolean(own.hdEnabled),
		zip: enabled
	};
}

export const photoDownloads = (gallery, photo) => downloadsFor(gallery, setOf(gallery, photo));

/**
 * The mode the processor must be given for a photo landing in this set — the set's
 * own, or the gallery's where it has none.
 *
 * A permission can be answered per request; this cannot. It decides what is burnt into
 * a derivative, so it is read at derive time only, and the answer for a photo already
 * on disk is whatever its sidecar recorded rather than whatever this returns now. That
 * is the whole reason a per-set mode needs a per-set re-derive to go with it.
 */
export const watermarkFor = (gallery, set) => (set ?? ungroupedSettings(gallery)).watermark ?? gallery.watermark;

export const photoWatermark = (gallery, photo) => watermarkFor(gallery, setOf(gallery, photo));

/**
 * Photos distributed into their sets, in tab order.
 *
 * The ungrouped ones lead, under a synthetic `null` set: a gallery that predates
 * sets has all of its photos there, and so does one whose photographer has only
 * grouped part of it. That group is dropped once it is empty and real sets exist,
 * so a fully grouped gallery shows no leftover tab — but a gallery with no sets at
 * all always yields exactly one group, which is what lets every caller treat the
 * "no sets" case as "one set" and stop special-casing it.
 *
 * `keepEmpty` is the difference between the two audiences: the admin has to see a
 * set it has just created and not yet filled, the client has no use for a tab with
 * nothing behind it.
 */
export function groupBySet(gallery, photos, { keepEmpty = false } = {}) {
	const sets = gallery.sets ?? [];
	const buckets = new Map(sets.map(set => [set.id, []]));
	const ungrouped = [];

	for (const photo of photos) {
		(buckets.get(photo.setId) ?? ungrouped).push(photo);
	}

	return [
		...(ungrouped.length > 0 || sets.length === 0 ? [{ set: null, photos: ungrouped }] : []),
		...sets.filter(set => keepEmpty || buckets.get(set.id).length > 0).map(set => ({ set, photos: buckets.get(set.id) }))
	];
}

/**
 * The cover as the client will actually see it.
 *
 * It has to be one of the photos the client receives, so it is resolved against
 * the ready set rather than through coverPhoto() — which may still point at a
 * photo that is being derived — and falls back to the first, since an explicit
 * cover is optional.
 */
export function readyCover(gallery) {
	const photos = readyPhotos(gallery);

	return photos.find(photo => photo.pid === gallery.coverPid) ?? photos[0] ?? null;
}

/**
 * Preview paths are root-relative, never absolute.
 *
 * These files sit behind CloudFront signed cookies, so the browser has to fetch
 * them from the origin it holds those cookies for — its own. In production that
 * is the same host the API answered on, so a relative path resolves to exactly
 * what an absolute one would; in dev it is what lets the Vite proxy stand in for
 * CloudFront. Signed *URLs* (the d/ prefix) are the opposite case: their
 * signature covers the full URL, so those stay absolute.
 */
const previewPaths = (gallery, photo) => ({
	thumb: `/${thumbKey(gallery.id, photo.pid, photo.rev)}`,
	web: `/${webKey(gallery.id, photo.pid, photo.rev)}`
});

/**
 * What a client sees. Built field by field on purpose — the stored record holds
 * a password hash, and spreading it even once would leak it.
 *
 * `cleanCover` says whether the unmarked cover derivative has actually been
 * written yet; only the caller can know, and only it may advertise the path,
 * because a client sent one that 403s would open on a broken hero image.
 */
export function clientProjection(gallery, { cleanCover = false } = {}) {
	const photos = readyPhotos(gallery);
	const cover = readyCover(gallery);
	const groups = groupBySet(gallery, photos);
	// Each photo is told the group it was actually placed in rather than the id the
	// record holds: a `setId` left behind by a deleted set resolves to the ungrouped
	// tab here, and a client taking the record at its word would file that photo
	// under a tab that is not in the list.
	const placement = new Map(groups.flatMap(group => group.photos.map(photo => [photo.pid, group.set?.id ?? null])));

	return {
		slug: gallery.slug,
		title: gallery.title,
		clientName: gallery.clientName,
		shootDate: gallery.shootDate,
		expiresAt: gallery.expiresAt,
		coverPid: cover?.pid ?? null,
		// Absent rather than null-and-guess: the client falls back to the marked
		// preview, which is always there.
		coverImage: cleanCover && cover ? `/${coverImageKey(gallery.id, cover.pid, cover.rev)}` : null,
		// The gallery's own answer: what an ungrouped photo is served under, and the
		// only one a gallery with no sets ever needs.
		downloads: downloadsFor(gallery, null),
		// Always at least one entry, so the client renders tabs when there are several
		// and nothing at all when there is one.
		sets: groups.map(group => ({
			id: group.set?.id ?? null,
			title: group.set?.title ?? DEFAULT_SET_TITLE,
			downloads: downloadsFor(gallery, group.set),
			photoCount: group.photos.length
		})),
		photos: photos.map(photo => ({
			pid: photo.pid,
			setId: placement.get(photo.pid) ?? null,
			w: photo.w,
			h: photo.h,
			lqip: photo.lqip ?? null,
			caption: photo.caption ?? null,
			...previewPaths(gallery, photo)
		}))
	};
}

/** What the admin sees: everything except the hash itself. */
export function adminProjection(gallery) {
	const { password, ...rest } = gallery;

	return {
		...rest,
		hasPassword: Boolean(password),
		// Resolved rather than passed through, so the editor renders one switch per
		// bucket without having to know that an older record keeps the remainder's HD
		// setting at the top level.
		ungrouped: ungroupedSettings(gallery),
		sets: gallery.sets ?? [],
		photos: (gallery.photos ?? [])
			.slice()
			.sort((a, b) => a.sortIndex - b.sortIndex)
			.map(photo => ({
				...photo,
				// Normalised the same way the client's is, so the grid groups a photo
				// under the tab the client will actually find it in.
				setId: setOf(gallery, photo)?.id ?? null,
				...(photo.status === "ready" ? previewPaths(gallery, photo) : { thumb: null, web: null })
			}))
	};
}

/** The row stored in db/index.json — enough to render the admin list. */
export function indexEntry(gallery) {
	const cover = coverPhoto(gallery);

	return {
		id: gallery.id,
		slug: gallery.slug,
		title: gallery.title,
		clientName: gallery.clientName,
		shootDate: gallery.shootDate,
		status: gallery.status,
		hasPassword: Boolean(gallery.password),
		downloadsEnabled: Boolean(gallery.downloadsEnabled),
		expiresAt: gallery.expiresAt,
		// Archived photos count: their originals are still there, and a gallery that
		// reported "0 photos" would invite deleting the one thing that cannot be
		// rebuilt.
		photoCount: (gallery.photos ?? []).filter(photo => photo.status === "ready" || photo.status === "archived").length,
		coverPid: cover?.pid ?? null,
		coverRev: cover?.rev ?? null,
		createdAt: gallery.createdAt,
		updatedAt: gallery.updatedAt
	};
}

export const emptyIndex = () => ({ galleries: [] });

/** Insert-or-replace by id, newest shoot first. */
export function upsertIndex(index, gallery) {
	const entry = indexEntry(gallery);
	const others = (index.galleries ?? []).filter(row => row.id !== entry.id);

	return {
		galleries: [...others, entry].sort((a, b) => {
			const left = a.shootDate ?? a.createdAt ?? "";
			const right = b.shootDate ?? b.createdAt ?? "";

			return right.localeCompare(left);
		})
	};
}
