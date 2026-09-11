// Thin client for the gallery API.
//
// Everything lives behind /api on the same origin as the site, so there is no
// base URL to configure and no CORS preflight — and the session cookies the API
// sets are automatically same-origin. Deliberately so: the function URL behind
// /api is AWS_IAM, so only CloudFront can call it, and the Vite dev server
// proxies the path rather than the client switching to absolute URLs.

const encoder = new TextEncoder();

/**
 * Hex SHA-256 of the request body.
 *
 * CloudFront reaches the API through an origin access control, which signs each
 * origin request with SigV4 — and Lambda function URLs reject unsigned payloads.
 * CloudFront cannot hash a body it is streaming, so for anything with a body the
 * *viewer* has to supply the hash in x-amz-content-sha256 or the signature the
 * origin computes will not match ours.
 */
async function payloadHash(text) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));

	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export class ApiError extends Error {
	constructor(status, message, payload) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.payload = payload;
	}
}

/**
 * One request, one place where errors become ApiError.
 *
 * `redirect: "manual"` is deliberate on download routes: the API answers 302 to
 * a signed URL and we want the URL, not the bytes.
 */
export async function request(path, { method = "GET", body, signal, redirect } = {}) {
	const bodyText = body === undefined ? "" : JSON.stringify(body);
	// Sent on every request, not just the ones with a body: the hash of an empty
	// body is still the hash the origin will check against.
	const headers = { "x-amz-content-sha256": await payloadHash(bodyText) };

	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}

	const response = await fetch(path, {
		method,
		signal,
		redirect,
		headers,
		body: body === undefined ? undefined : bodyText
	});

	if (response.status === 204) {
		return null;
	}

	const text = await response.text();
	let payload = null;

	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = { error: text };
		}
	}

	if (!response.ok) {
		throw new ApiError(response.status, payload?.error ?? `Erreur ${response.status}`, payload);
	}

	return payload;
}

// --- client gallery --------------------------------------------------------

export const galleryApi = {
	/** Manifest, or a 401 carrying `passwordRequired` when the gate is up. */
	read: slug => request(`/api/g/${encodeURIComponent(slug)}`),
	unlock: (slug, password) => request(`/api/g/${encodeURIComponent(slug)}/auth`, { method: "POST", body: { password } }),
	// Re-signs the viewing cookies before the current policy lapses.
	refresh: slug => request(`/api/g/${encodeURIComponent(slug)}/refresh`, { method: "POST" }),
	// Favourites belong to a person, not to the link: a gallery is shared between
	// everyone who was photographed, so the visitor's email is what tells one
	// selection from another. Without an address there is nothing to read.
	readSelection: (slug, email) => request(`/api/g/${encodeURIComponent(slug)}/selection?email=${encodeURIComponent(email)}`),
	saveSelection: (slug, email, pids) => request(`/api/g/${encodeURIComponent(slug)}/selection`, { method: "PUT", body: { email, pids } }),
	// The email is what the archive link is sent to, and what names the download in
	// the photographer's feed. `setId` scopes the archive to one tab — null being the
	// ungrouped one, so it is sent only when it is actually meant, never as a default.
	requestZip: (slug, pids, email, setId) =>
		request(`/api/g/${encodeURIComponent(slug)}/zip`, {
			method: "POST",
			body: { pids, email, ...(setId === undefined ? {} : { setId }) }
		}),
	// Single-photo downloads happen in the browser; this is only the notification.
	logDownload: (slug, pid, email) => request(`/api/g/${encodeURIComponent(slug)}/downloads`, { method: "POST", body: { pid, email } }),
	readJob: jobId => request(`/api/jobs/${encodeURIComponent(jobId)}`),
	// Behind the emailed link: no gallery session needed, the token is the key.
	readArchive: token => request(`/api/archives/${encodeURIComponent(token)}`),
	downloadUrl: (slug, pid) => `/api/g/${encodeURIComponent(slug)}/download/${encodeURIComponent(pid)}`
};

// --- admin -----------------------------------------------------------------

export const adminApi = {
	login: password => request("/api/admin/login", { method: "POST", body: { password } }),
	logout: () => request("/api/admin/logout", { method: "POST" }),
	session: () => request("/api/admin/session"),

	listGalleries: () => request("/api/admin/galleries"),
	createGallery: payload => request("/api/admin/galleries", { method: "POST", body: payload }),
	readGallery: gid => request(`/api/admin/galleries/${gid}`),
	// payload: any subset of the record's own fields. `downloadsEnabled` is the master
	// switch; `ungrouped: { downloadsEnabled?, hdEnabled? }` is the pair the photos in
	// no category are served under, merged field by field like a set's patch.
	updateGallery: (gid, payload) => request(`/api/admin/galleries/${gid}`, { method: "PATCH", body: payload }),
	deleteGallery: gid => request(`/api/admin/galleries/${gid}`, { method: "DELETE" }),

	requestUploads: (gid, files) => request(`/api/admin/galleries/${gid}/uploads`, { method: "POST", body: { files } }),
	// photos: [{ pid, extension, originalName }] — queues the derivative pipeline.
	// setId is the set the batch lands in; null is the gallery's ungrouped photos.
	processPhotos: (gid, photos, setId = null) => request(`/api/admin/galleries/${gid}/process`, { method: "POST", body: { photos, setId } }),
	pending: gid => request(`/api/admin/galleries/${gid}/pending`),
	reconcile: gid => request(`/api/admin/galleries/${gid}/reconcile`, { method: "POST" }),
	// Re-derives everything, or — when a scope is given — only one tab's photos:
	// `{ setId: null }` is the ungrouped remainder, `{ setId: "s_…" }` one category.
	// Omitting the body entirely is what means "the whole gallery".
	reprocess: (gid, scope) => request(`/api/admin/galleries/${gid}/reprocess`, { method: "POST", body: scope }),

	// patch: { order?: pid[], captions?: { [pid]: string }, sets?: { [pid]: setId | null } }
	updatePhotos: (gid, patch) => request(`/api/admin/galleries/${gid}/photos`, { method: "PATCH", body: patch }),
	deletePhoto: (gid, pid) => request(`/api/admin/galleries/${gid}/photos/${pid}`, { method: "DELETE" }),

	// Sets: the client-facing tabs, each with its own download switches. Every one of
	// these answers with the whole gallery, so the editor never has to merge.
	createSet: (gid, title) => request(`/api/admin/galleries/${gid}/sets`, { method: "POST", body: { title } }),
	// patch: { title?, downloadsEnabled?, hdEnabled? }
	updateSet: (gid, sid, patch) => request(`/api/admin/galleries/${gid}/sets/${sid}`, { method: "PATCH", body: patch }),
	reorderSets: (gid, order) => request(`/api/admin/galleries/${gid}/sets`, { method: "PATCH", body: { order } }),
	// The set goes, its photos do not: they fall back to the gallery's settings.
	deleteSet: (gid, sid) => request(`/api/admin/galleries/${gid}/sets/${sid}`, { method: "DELETE" }),

	share: (gid, payload) => request(`/api/admin/galleries/${gid}/share`, { method: "POST", body: payload }),
	selection: gid => request(`/api/admin/galleries/${gid}/selection`),

	// Download notifications. Pass a gid to narrow the feed to one gallery.
	downloads: gid => request(`/api/admin/downloads${gid ? `?gid=${encodeURIComponent(gid)}` : ""}`),
	markDownloadsSeen: () => request("/api/admin/downloads/seen", { method: "POST" })
};

/**
 * Uploads one file straight to S3 with a presigned POST.
 *
 * XMLHttpRequest rather than fetch purely for `upload.onprogress` — a 60 MB RAW
 * with no progress bar looks like a hung page.
 */
export function uploadToS3({ url, fields, file, onProgress, signal }) {
	return new Promise((resolve, reject) => {
		const form = new FormData();

		for (const [key, value] of Object.entries(fields)) {
			form.append(key, value);
		}

		// Must come last: S3 ignores any field that follows the file.
		form.append("file", file);

		const xhr = new XMLHttpRequest();
		xhr.open("POST", url);

		xhr.upload.addEventListener("progress", event => {
			if (event.lengthComputable && onProgress) {
				onProgress(event.loaded / event.total);
			}
		});

		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(new ApiError(xhr.status, `Échec de l’envoi (${xhr.status})`, xhr.responseText));
			}
		});

		xhr.addEventListener("error", () => reject(new ApiError(0, "Échec réseau pendant l’envoi.")));
		xhr.addEventListener("abort", () => reject(new ApiError(0, "Envoi annulé.")));

		if (signal) {
			signal.addEventListener("abort", () => xhr.abort(), { once: true });
		}

		xhr.send(form);
	});
}
