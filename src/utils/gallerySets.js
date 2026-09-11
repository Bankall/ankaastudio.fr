// The client side of the gallery's sets.
//
// The API already groups photos for the client manifest, so only the admin needs
// this: the editor holds the raw record, where a photo carries a `setId` and
// nothing has been distributed yet.

// What the ungrouped remainder is called. Must match DEFAULT_SET_TITLE in the
// API's lib/galleries.mjs, or a photographer and their client would see two
// different names for the same tab.
export const DEFAULT_SET_TITLE = "Galerie";

// The watermark modes, as the photographer reads them. Here rather than in the editor
// because the mode is set in two places: once for the gallery, and once per tab that
// wants a different one — and `""`, the empty option, is that override left unset.
export const WATERMARK_LABELS = {
	preview: "Aperçus uniquement (recommandé)",
	all: "Aperçus et fichiers HD",
	none: "Aucun filigrane"
};

export const INHERITED_WATERMARK_LABEL = "Filigrane de la galerie";

/**
 * The mode a photo dropped into this tab will be derived with — the same resolution the
 * API's own watermarkFor() does, so the uploader can say it before the upload starts.
 *
 * `setId` is the uploader's target: "" or null is the ungrouped remainder.
 */
export const watermarkFor = (gallery, setId) =>
	(setId ? (gallery.sets ?? []).find(set => set.id === setId) : gallery.ungrouped)?.watermark ?? gallery.watermark;

/**
 * The tab whose settings govern a photo: its set, or the ungrouped remainder — including
 * when its `setId` points at a set that has since been deleted, which is where the API
 * puts it too.
 *
 * Unresolved on purpose, unlike watermarkFor(): a caller counting the photos a change to
 * the gallery's default would reach needs to know which tabs have no mode of their own.
 */
export const tabOf = (gallery, photo) => (gallery.sets ?? []).find(set => set.id === photo.setId) ?? gallery.ungrouped ?? {};

/**
 * Photos distributed into their sets, in tab order — the same shape and the same
 * rules as the API's `groupBySet`.
 *
 * The ungrouped ones lead under a `null` set, and that group is dropped once it is
 * empty and real sets exist. A gallery with no sets at all always yields exactly
 * one group, so nothing downstream has to special-case "no sets".
 */
export function groupBySet(photos, sets, { keepEmpty = false } = {}) {
	const buckets = new Map((sets ?? []).map(set => [set.id, []]));
	const ungrouped = [];

	for (const photo of photos ?? []) {
		(buckets.get(photo.setId) ?? ungrouped).push(photo);
	}

	return [
		...(ungrouped.length > 0 || (sets ?? []).length === 0 ? [{ set: null, photos: ungrouped }] : []),
		...(sets ?? []).filter(set => keepEmpty || buckets.get(set.id).length > 0).map(set => ({ set, photos: buckets.get(set.id) }))
	];
}
