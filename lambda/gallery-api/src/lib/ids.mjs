import { randomBytes } from "node:crypto";

// Crockford base32 minus vowels: no accidental words, no 0/O or 1/l confusion
// when a slug or id is read aloud or retyped.
const ALPHABET = "0123456789bcdfghjkmnpqrstvwxz";

export function shortId(length = 10) {
	const bytes = randomBytes(length);
	let out = "";

	for (let index = 0; index < length; index += 1) {
		out += ALPHABET[bytes[index] % ALPHABET.length];
	}

	return out;
}

export const galleryId = () => `g_${shortId(10)}`;
export const photoId = () => `p_${shortId(12)}`;
export const jobId = () => `j_${shortId(12)}`;

// Slugs land in URLs and in the SPA fallback rule, which folds any path whose
// last segment has no dot onto index.html — so dots must not survive here.
export function slugify(input) {
	const base = String(input || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");

	return base || shortId(8);
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const ID_PATTERN = /^[gpj]_[0-9bcdfghjkmnpqrstvwxz]{6,16}$/;
