// Request/response plumbing for a Lambda Function URL (payload format 2.0)
// sitting behind CloudFront.
//
// No CORS anywhere: the API is served from /api/* on the same distribution as
// the site, so every call is same-origin by construction.

export class HttpError extends Error {
	constructor(status, message, detail) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.detail = detail;
	}
}

export const badRequest = (message, detail) => new HttpError(400, message, detail);
export const unauthorized = (message = "Authentification requise.") => new HttpError(401, message);
export const forbidden = (message = "Accès refusé.") => new HttpError(403, message);
export const notFound = (message = "Introuvable.") => new HttpError(404, message);
export const conflict = (message = "Modification concurrente, réessayez.") => new HttpError(409, message);
export const tooLarge = (message = "Fichier trop volumineux.") => new HttpError(413, message);

export function parseRequest(event) {
	const method = event?.requestContext?.http?.method ?? "GET";
	const path = event?.rawPath ?? "/";
	const headers = event?.headers ?? {};

	const cookies = new Map();
	for (const pair of event?.cookies ?? []) {
		const index = pair.indexOf("=");

		if (index > 0) {
			cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1));
		}
	}

	let body = null;
	if (event?.body) {
		const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

		try {
			body = raw ? JSON.parse(raw) : null;
		} catch {
			throw badRequest("Corps de requête invalide.");
		}
	}

	return {
		method,
		path,
		headers,
		cookies,
		body,
		query: new URLSearchParams(event?.rawQueryString ?? ""),
		ip: event?.requestContext?.http?.sourceIp ?? "",
		userAgent: headers["user-agent"] ?? ""
	};
}

/**
 * The public origin this request arrived on.
 *
 * The edge function copies the viewer Host into x-ankaa-host, because the
 * origin request policy has to strip the real Host header (a Function URL
 * insists on its own). PUBLIC_ORIGIN is the fallback for direct invokes and for
 * the window before a custom domain is attached.
 */
export function publicOrigin(request) {
	const host = request.headers["x-ankaa-host"];

	if (host) {
		return `https://${host}`;
	}

	if (process.env.PUBLIC_ORIGIN) {
		return process.env.PUBLIC_ORIGIN;
	}

	throw new HttpError(500, "Origine publique inconnue.");
}

export function json(status, body, { cookies } = {}) {
	return {
		statusCode: status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			// Nothing this API returns is cacheable, and some of it is per-client.
			"cache-control": "no-store, private",
			"x-content-type-options": "nosniff"
		},
		...(cookies?.length ? { cookies } : {}),
		body: JSON.stringify(body ?? {})
	};
}

/**
 * An HTML document. One route answers with one: the gallery shell, in preview.mjs.
 *
 * Cacheable, unlike everything else here. The shell is identical for every visitor
 * to a gallery, and letting CloudFront hold it is what keeps this Lambda off the
 * page-load path. `max-age=0` still sends browsers back to the edge, so a redeploy
 * — which changes the hashed asset names inside the document — reaches them as soon
 * as the invalidation lands.
 */
export function html(status, body, { sMaxAge = 0 } = {}) {
	return {
		statusCode: status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": sMaxAge > 0 ? `public, max-age=0, s-maxage=${sMaxAge}, must-revalidate` : "no-store, private",
			"x-content-type-options": "nosniff"
		},
		body
	};
}

export function noContent({ cookies } = {}) {
	return {
		statusCode: 204,
		headers: { "cache-control": "no-store, private" },
		...(cookies?.length ? { cookies } : {}),
		body: ""
	};
}

/** 302 to a signed URL, so the link the client sees stays clean. */
export function redirect(url) {
	return {
		statusCode: 302,
		headers: {
			location: url,
			"cache-control": "no-store, private"
		},
		body: ""
	};
}

// --- tiny router -----------------------------------------------------------

/**
 * Routes are declared as `["POST", "/api/g/:slug/auth", handler]`.
 * Matching is exact on segment count; `:name` segments land in `params`.
 */
export function createRouter(routes) {
	const compiled = routes.map(([method, pattern, handler]) => ({
		method,
		segments: pattern.split("/").filter(Boolean),
		handler,
		pattern
	}));

	return async function route(request, context) {
		const segments = request.path.split("/").filter(Boolean);
		let methodMismatch = false;

		for (const candidate of compiled) {
			if (candidate.segments.length !== segments.length) {
				continue;
			}

			const params = {};
			let matched = true;

			for (let index = 0; index < segments.length; index += 1) {
				const expected = candidate.segments[index];

				if (expected.startsWith(":")) {
					params[expected.slice(1)] = decodeURIComponent(segments[index]);
				} else if (expected !== segments[index]) {
					matched = false;
					break;
				}
			}

			if (!matched) {
				continue;
			}

			if (candidate.method !== request.method) {
				methodMismatch = true;
				continue;
			}

			return candidate.handler({ ...context, request, params });
		}

		throw methodMismatch ? new HttpError(405, "Méthode non autorisée.") : notFound("Route inconnue.");
	};
}
