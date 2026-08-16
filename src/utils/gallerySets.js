// The client side of the gallery's sets.
//
// The API already groups photos for the client manifest, so only the admin needs
// this: the editor holds the raw record, where a photo carries a `setId` and
// nothing has been distributed yet.

// What the ungrouped remainder is called. Must match DEFAULT_SET_TITLE in the
// API's lib/galleries.mjs, or a photographer and their client would see two
// different names for the same tab.
export const DEFAULT_SET_TITLE = "Galerie";

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
