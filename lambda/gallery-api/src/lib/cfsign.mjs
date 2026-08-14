// CloudFront signed cookies and signed URLs.
//
// Two zones, one key group:
//   media/g/<gid>/v/*  → signed COOKIES, scoped by Path so a client can hold
//                        sessions for several galleries at once
//   media/g/<gid>/d/*  → signed URLS, minted per request, short-lived
//
// Download blocking falls out of this: the viewing cookie's policy simply does
// not cover d/*, so there is no client-side route to a full-resolution file.
//
// CloudFront's signature is RSA-SHA1 over the policy document, base64'd with a
// bespoke URL-safe alphabet. Implemented here rather than pulled in from
// @aws-sdk/cloudfront-signer to keep the bundle small — it is ~20 lines.

import { createSign } from "node:crypto";

// CloudFront's own variant of base64url: + - / = become - ~ _ respectively.
function cloudFrontBase64(input) {
	return Buffer.from(input).toString("base64").replaceAll("+", "-").replaceAll("=", "_").replaceAll("/", "~");
}

function policyFor(resource, expiresAt) {
	return JSON.stringify({
		Statement: [
			{
				Resource: resource,
				Condition: { DateLessThan: { "AWS:EpochTime": expiresAt } }
			}
		]
	});
}

function signPolicy(policy, privateKey) {
	const signer = createSign("RSA-SHA1");
	signer.update(policy);

	return cloudFrontBase64(signer.sign(privateKey));
}

/**
 * Signed cookies for a whole prefix (wildcard resource).
 * Returns Set-Cookie strings ready for a Function URL `cookies` array.
 */
export function signedCookies({ resource, expiresAt, keyPairId, privateKey, path }) {
	const policy = policyFor(resource, expiresAt);
	const attributes = `Path=${path}; Secure; HttpOnly; SameSite=Lax`;

	// Expires deliberately mirrors the policy: a cookie that outlives its policy
	// only produces confusing 403s.
	const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
	const suffix = `${attributes}; Max-Age=${maxAge}`;

	return [
		`CloudFront-Policy=${cloudFrontBase64(policy)}; ${suffix}`,
		`CloudFront-Signature=${signPolicy(policy, privateKey)}; ${suffix}`,
		`CloudFront-Key-Pair-Id=${keyPairId}; ${suffix}`
	];
}

/** Expired counterparts, used on logout. */
export function clearedCookies(path) {
	const attributes = `Path=${path}; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

	return ["CloudFront-Policy", "CloudFront-Signature", "CloudFront-Key-Pair-Id"].map(name => `${name}=; ${attributes}`);
}

/**
 * Signed URL for a single object, using a canned policy (shorter query string:
 * Expires instead of a full base64 policy).
 */
export function signedUrl({ url, expiresAt, keyPairId, privateKey }) {
	const policy = policyFor(url, expiresAt);
	const signature = signPolicy(policy, privateKey);
	const separator = url.includes("?") ? "&" : "?";

	return `${url}${separator}Expires=${expiresAt}&Signature=${signature}&Key-Pair-Id=${keyPairId}`;
}
