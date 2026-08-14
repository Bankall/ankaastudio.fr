// Thin client for the gallery API.
//
// Everything lives behind /api on the same origin as the site, so there is no
// base URL to configure and no CORS preflight — and the session cookies the API
// sets are automatically same-origin.

const JSON_HEADERS = { "Content-Type": "application/json" };

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
	const response = await fetch(path, {
		method,
		signal,
		redirect,
		headers: body === undefined ? undefined : JSON_HEADERS,
		body: body === undefined ? undefined : JSON.stringify(body)
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
	readSelection: slug => request(`/api/g/${encodeURIComponent(slug)}/selection`),
	saveSelection: (slug, pids) => request(`/api/g/${encodeURIComponent(slug)}/selection`, { method: "PUT", body: { pids } }),
	requestZip: (slug, pids) => request(`/api/g/${encodeURIComponent(slug)}/zip`, { method: "POST", body: { pids } }),
	readJob: jobId => request(`/api/jobs/${encodeURIComponent(jobId)}`),
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
	updateGallery: (gid, payload) => request(`/api/admin/galleries/${gid}`, { method: "PATCH", body: payload }),
	deleteGallery: gid => request(`/api/admin/galleries/${gid}`, { method: "DELETE" }),

	requestUploads: (gid, files) => request(`/api/admin/galleries/${gid}/uploads`, { method: "POST", body: { files } }),
	// photos: [{ pid, extension, originalName }] — queues the derivative pipeline.
	processPhotos: (gid, photos) => request(`/api/admin/galleries/${gid}/process`, { method: "POST", body: { photos } }),
	pending: gid => request(`/api/admin/galleries/${gid}/pending`),
	reconcile: gid => request(`/api/admin/galleries/${gid}/reconcile`, { method: "POST" }),
	reprocess: gid => request(`/api/admin/galleries/${gid}/reprocess`, { method: "POST" }),

	// patch: { order?: pid[], captions?: { [pid]: string } }
	updatePhotos: (gid, patch) => request(`/api/admin/galleries/${gid}/photos`, { method: "PATCH", body: patch }),
	deletePhoto: (gid, pid) => request(`/api/admin/galleries/${gid}/photos/${pid}`, { method: "DELETE" }),

	share: (gid, payload) => request(`/api/admin/galleries/${gid}/share`, { method: "POST", body: payload }),
	selection: gid => request(`/api/admin/galleries/${gid}/selection`)
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
