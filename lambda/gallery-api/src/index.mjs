// Ankaa gallery API.
//
// One Lambda behind a Function URL, reached through the /api/* behaviour of the
// CloudFront distribution that also serves the site and the media — and through
// /gallery/*, which is a page rather than an API call and is here for the one
// reason given in routes/preview.mjs. Being same-origin means there is no CORS
// layer here at all.

import { ConflictError } from "./lib/store.mjs";
import { createRouter, HttpError, json, parseRequest } from "./lib/http.mjs";
import { adminRoutes } from "./routes/admin.mjs";
import { clientRoutes } from "./routes/client.mjs";
import { previewRoutes } from "./routes/preview.mjs";

const route = createRouter([...adminRoutes, ...clientRoutes, ...previewRoutes]);

export const handler = async event => {
	let request;

	try {
		request = parseRequest(event);
	} catch (error) {
		return json(error.status ?? 400, { error: error.message });
	}

	try {
		return await route(request);
	} catch (error) {
		if (error instanceof HttpError) {
			// 4xx is a caller problem: log at info so real faults stay visible.
			if (error.status >= 500) {
				console.error("Request failed", { path: request.path, error });
			} else {
				console.info("Request rejected", { path: request.path, status: error.status, message: error.message });
			}

			return json(error.status, { error: error.message, ...(error.detail ? { detail: error.detail } : {}) });
		}

		if (error instanceof ConflictError) {
			return json(409, { error: "Modification concurrente, réessayez." });
		}

		console.error("Unhandled error", { path: request.path, method: request.method, error });

		return json(500, { error: "Une erreur interne est survenue." });
	}
};
