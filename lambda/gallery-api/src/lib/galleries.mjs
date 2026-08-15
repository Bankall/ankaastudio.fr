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
export const hdKey = (gid, pid, rev) => `media/g/${gid}/d/hd/${pid}_${rev}.jpg`;
export const zipPrefix = gid => `media/g/${gid}/d/zip/`;
export const zipKey = (gid, hash, suffix = "") => `media/g/${gid}/d/zip/${hash}${suffix}.zip`;

// Written by the zipper once an archive is complete: the parts list keyed by the
// content hash. A single GET answers "is this exact selection already built?"
// for both one-part and split archives.
export const zipMarkerKey = (gid, hash) => `db/zips/${gid}/${hash}.json`;
export const zipMarkerPrefix = gid => `db/zips/${gid}/`;

export const WATERMARK_KEY = "assets/watermark.png";
export const WATERMARK_MODES = ["preview", "all", "none"];
export const GALLERY_STATUSES = ["draft", "published", "archived"];

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
		downloadsEnabled: true,
		hdEnabled: true,
		zipEnabled: true,
		expiresAt: null,
		photos: [],
		createdAt: now,
		updatedAt: now
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
export function pendingPhoto({ pid, extension, originalName = "" }, sortIndex, rev = 1) {
	return {
		pid,
		rev,
		extension,
		originalName,
		status: "processing",
		queuedAt: new Date().toISOString(),
		caption: null,
		sortIndex
	};
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

/**
 * What a client sees. Built field by field on purpose — the stored record holds
 * a password hash, and spreading it even once would leak it.
 */
export function clientProjection(gallery, origin) {
	const downloads = {
		enabled: Boolean(gallery.downloadsEnabled),
		hd: Boolean(gallery.downloadsEnabled && gallery.hdEnabled),
		zip: Boolean(gallery.downloadsEnabled && gallery.zipEnabled)
	};

	return {
		slug: gallery.slug,
		title: gallery.title,
		clientName: gallery.clientName,
		shootDate: gallery.shootDate,
		expiresAt: gallery.expiresAt,
		downloads,
		photos: readyPhotos(gallery).map(photo => ({
			pid: photo.pid,
			w: photo.w,
			h: photo.h,
			lqip: photo.lqip ?? null,
			caption: photo.caption ?? null,
			thumb: `${origin}/${thumbKey(gallery.id, photo.pid, photo.rev)}`,
			web: `${origin}/${webKey(gallery.id, photo.pid, photo.rev)}`
		}))
	};
}

/** What the admin sees: everything except the hash itself. */
export function adminProjection(gallery, origin) {
	const { password, ...rest } = gallery;

	return {
		...rest,
		hasPassword: Boolean(password),
		photos: (gallery.photos ?? [])
			.slice()
			.sort((a, b) => a.sortIndex - b.sortIndex)
			.map(photo => ({
				...photo,
				thumb: photo.status === "ready" ? `${origin}/${thumbKey(gallery.id, photo.pid, photo.rev)}` : null,
				web: photo.status === "ready" ? `${origin}/${webKey(gallery.id, photo.pid, photo.rev)}` : null
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
		photoCount: (gallery.photos ?? []).filter(photo => photo.status === "ready").length,
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
