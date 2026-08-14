// Sessions for the two audiences.
//
// Admin  : one password (scrypt hash in SSM) → short JWT cookie.
// Client : per-gallery password → long JWT cookie + CloudFront signed cookies.
//
// The JWT is what lets us re-mint 12h signed cookies without re-prompting; the
// signed cookies are what CloudFront actually enforces.

import { clearedCookies, signedCookies } from "./cfsign.mjs";
import { forbidden, unauthorized } from "./http.mjs";
import { signJwt, verifyJwt } from "./jwt.mjs";
import { getSecrets } from "./secrets.mjs";
import { viewPrefix } from "./galleries.mjs";

export const ADMIN_COOKIE = "ankaa_admin";
export const ADMIN_TTL_SECONDS = 8 * 60 * 60;

// Clients should not be re-typing a password every visit; CloudFront cookies are
// refreshed off this session as needed.
export const GALLERY_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SIGNED_COOKIE_TTL_SECONDS = 12 * 60 * 60;

// Both cookies are only ever read by the API, so they never need to travel with
// static asset or media requests.
const API_PATH = "/api";

export const galleryCookieName = gid => `ankaa_g_${gid}`;

function cookie(name, value, { path, maxAge, sameSite = "Lax" }) {
	return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=${sameSite}`;
}

// --- admin -----------------------------------------------------------------

export async function issueAdminSession() {
	const { adminJwtSecret } = await getSecrets();
	const token = signJwt({ sub: "admin" }, adminJwtSecret, ADMIN_TTL_SECONDS);

	return [cookie(ADMIN_COOKIE, token, { path: API_PATH, maxAge: ADMIN_TTL_SECONDS, sameSite: "Strict" })];
}

export function clearAdminSession() {
	return [cookie(ADMIN_COOKIE, "", { path: API_PATH, maxAge: 0, sameSite: "Strict" })];
}

/** Non-throwing admin check — lets client routes offer a "preview as client" path. */
export async function isAdmin(request) {
	const { adminJwtSecret } = await getSecrets();

	return verifyJwt(request.cookies.get(ADMIN_COOKIE), adminJwtSecret)?.sub === "admin";
}

export async function requireAdmin(request) {
	const { adminJwtSecret } = await getSecrets();
	const payload = verifyJwt(request.cookies.get(ADMIN_COOKIE), adminJwtSecret);

	if (payload?.sub !== "admin") {
		throw unauthorized("Session administrateur expirée.");
	}

	return payload;
}

/**
 * Constant-ish cost on failure. There is no WAF in front of this (a $5/month
 * floor would cost more than the entire rest of the system), so the defence is
 * a slow hash, a deliberate delay, and reserved concurrency on the function.
 */
export async function penalise() {
	await new Promise(resolve => setTimeout(resolve, 500));
}

// --- client gallery --------------------------------------------------------

/**
 * Grants viewing access: a gallery session JWT plus CloudFront signed cookies
 * scoped to this gallery's v/ prefix only. d/ is deliberately excluded — full
 * resolution files are handed out one signed URL at a time, or not at all.
 */
export async function issueGallerySession(gid, origin) {
	const { galleryJwtSecret } = await getSecrets();
	const token = signJwt({ sub: gid }, galleryJwtSecret, GALLERY_TTL_SECONDS);

	return [
		cookie(galleryCookieName(gid), token, { path: API_PATH, maxAge: GALLERY_TTL_SECONDS }),
		...(await issueSignedCookies(gid, origin))
	];
}

export async function issueSignedCookies(gid, origin) {
	const { cfPrivateKey } = await getSecrets();
	const path = `/${viewPrefix(gid)}`;

	return signedCookies({
		resource: `${origin}${path}*`,
		expiresAt: Math.floor(Date.now() / 1000) + SIGNED_COOKIE_TTL_SECONDS,
		keyPairId: process.env.CF_KEY_PAIR_ID,
		privateKey: cfPrivateKey,
		path
	});
}

export function clearGallerySession(gid) {
	return [cookie(galleryCookieName(gid), "", { path: API_PATH, maxAge: 0 }), ...clearedCookies(`/${viewPrefix(gid)}`)];
}

/** True when the caller already holds a valid session for this gallery. */
export async function hasGallerySession(request, gid) {
	const { galleryJwtSecret } = await getSecrets();
	const payload = verifyJwt(request.cookies.get(galleryCookieName(gid)), galleryJwtSecret);

	return payload?.sub === gid;
}

/**
 * Gate for every client-facing gallery route.
 *
 * A gallery with no password is open to anyone holding the link; one with a
 * password needs a session. An admin session opens everything, which is what
 * makes "preview as client" work.
 */
export async function requireGalleryAccess(request, gallery) {
	if (!gallery.password) {
		return { via: "public" };
	}

	if (await hasGallerySession(request, gallery.id)) {
		return { via: "session" };
	}

	if (await isAdmin(request)) {
		return { via: "admin" };
	}

	throw forbidden("Mot de passe requis.");
}
