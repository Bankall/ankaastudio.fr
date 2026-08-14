// Minimal HS256 JWT. Sessions here are single-issuer and single-audience, so a
// full JOSE library would be several megabytes of cold start for no benefit.

import { createHmac, timingSafeEqual } from "node:crypto";

function base64UrlEncode(input) {
	return Buffer.from(input).toString("base64url");
}

function sign(data, secret) {
	return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signJwt(payload, secret, ttlSeconds) {
	const now = Math.floor(Date.now() / 1000);
	const body = { ...payload, iat: now, exp: now + ttlSeconds };
	const head = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const claims = base64UrlEncode(JSON.stringify(body));
	const data = `${head}.${claims}`;

	return `${data}.${sign(data, secret)}`;
}

// Returns the payload, or null for anything malformed, mis-signed or expired.
// Never throws — callers treat null as "not authenticated".
export function verifyJwt(token, secret) {
	if (typeof token !== "string") {
		return null;
	}

	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}

	const [head, claims, signature] = parts;
	const expected = sign(`${head}.${claims}`, secret);
	const given = Buffer.from(signature);
	const want = Buffer.from(expected);

	if (given.length !== want.length || !timingSafeEqual(given, want)) {
		return null;
	}

	let payload;
	try {
		payload = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
	} catch {
		return null;
	}

	if (typeof payload?.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
		return null;
	}

	return payload;
}
