// Builds a downloadable ZIP for a gallery or a client's selection.
//
// The archive is streamed: S3 object in → archiver → S3 multipart upload out.
// Nothing is buffered to disk and only the multipart window lives in memory, so
// a 20 GB gallery runs in the same 1 GB function as a 200 MB one.
//
// Compression is deliberately OFF (store mode). JPEGs are already compressed —
// deflate would burn the entire time budget to save about 1%.
//
// Invoked asynchronously by the API. Progress lands in db/jobs/<jobId>.json,
// which the client polls.

import { PassThrough } from "node:stream";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import archiver from "archiver";

const s3 = new S3Client({});
const BUCKET = process.env.MEDIA_BUCKET;

// S3 caps a single object at 5 TiB, but a few GiB is where clients — and
// especially phones — stop coping with one file. Kept under 4 GiB with room for
// entry headers so no archive crosses the ZIP64 threshold, which some Windows
// and macOS built-in extractors still handle badly.
const MAX_PART_BYTES = 3.8 * 1024 * 1024 * 1024;
const UPLOAD_PART_SIZE = 16 * 1024 * 1024;
const UPLOAD_QUEUE_SIZE = 4;
// Fetch ahead so an S3 GET overlaps the previous entry's write instead of
// stalling the archive stream between photos.
const PREFETCH = 3;
const PROGRESS_INTERVAL_MS = 2000;

const jobKey = jid => `db/jobs/${jid}.json`;
const zipKey = (gid, hash, suffix) => `media/g/${gid}/d/zip/${hash}${suffix}.zip`;
const markerKey = (gid, hash) => `db/zips/${gid}/${hash}.json`;

/**
 * Which file each entry is built from.
 *
 * `original` is the normal one: a high-definition download is the upload itself, so
 * the archive carries those bytes untouched, under whatever extension they arrived
 * with. `hd` is the marked full-size JPEG, which exists only where the watermark had
 * to be burnt into the download. And a set with HD downloads switched off still allows
 * archives — the client just gets the same web-sized preview the tiles hand over,
 * watermark included.
 *
 * It is decided per photo because it is decided per set, and one archive can span sets
 * that disagree. The API says so on each entry; anything unrecognised (or a job queued
 * before this existed) falls back to the payload's own `variant`, and then to HD, which
 * is what every archive once was.
 */
const SOURCES = {
	original: { key: (gid, photo) => `originals/${gid}/${photo.pid}.${photo.extension}`, extension: photo => photo.extension || "jpg" },
	hd: { key: (gid, photo) => `media/g/${gid}/d/hd/${photo.pid}_${photo.rev}.jpg`, extension: () => "jpg" },
	web: { key: (gid, photo) => `media/g/${gid}/v/w/${photo.pid}_${photo.rev}.webp`, extension: () => "webp" }
};

async function putJson(key, data, extra = {}) {
	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: JSON.stringify(data),
			ContentType: "application/json",
			CacheControl: "no-store",
			...extra
		})
	);
}

async function readJob(jid) {
	const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: jobKey(jid) }));

	return JSON.parse(await result.Body.transformToString());
}

/**
 * Splits the photo list so no single archive exceeds MAX_PART_BYTES.
 *
 * Partitioning up front rather than mid-stream: the sidecars already record the size
 * of each photo's download, so the split points are known before a byte moves.
 */
function partition(photos, maxBytes) {
	const parts = [];
	let current = [];
	let currentBytes = 0;

	for (const photo of photos) {
		const size = Number(photo.bytes) || 0;

		if (current.length > 0 && currentBytes + size > maxBytes) {
			parts.push(current);
			current = [];
			currentBytes = 0;
		}

		current.push(photo);
		currentBytes += size;
	}

	if (current.length > 0) {
		parts.push(current);
	}

	return parts;
}

/** Distinct, ordered, filesystem-safe entry names inside the archive. */
function entryNames(photos) {
	const used = new Set();

	return photos.map((photo, index) => {
		const extension = photo.source.extension(photo);
		const stem = String(photo.originalName || photo.pid)
			.replace(/\.[^.]+$/, "")
			.replace(/[^\p{L}\p{N}._-]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80);

		let name = `${String(index + 1).padStart(3, "0")}-${stem || photo.pid}.${extension}`;

		// Two exports can share a stem; a ZIP with duplicate names unpacks badly.
		let suffix = 2;
		while (used.has(name.toLowerCase())) {
			name = `${String(index + 1).padStart(3, "0")}-${stem || photo.pid}-${suffix}.${extension}`;
			suffix += 1;
		}

		used.add(name.toLowerCase());

		return name;
	});
}

/**
 * Appends one entry and resolves when archiver has consumed it, which is what
 * keeps memory flat: we never queue more streams than we are writing.
 */
function appendEntry(archive, body, name) {
	return new Promise((resolve, reject) => {
		const onEntry = () => {
			cleanup();
			resolve();
		};
		const onError = error => {
			cleanup();
			reject(error);
		};
		const cleanup = () => {
			archive.removeListener("entry", onEntry);
			archive.removeListener("error", onError);
		};

		archive.once("entry", onEntry);
		archive.once("error", onError);
		archive.append(body, { name });
	});
}

async function buildPart({ gid, photos, key, filename, onProgress }) {
	const archive = archiver("zip", { store: true });
	const names = entryNames(photos);

	archive.on("warning", warning => console.warn("Archive warning", { code: warning.code, message: warning.message }));

	// archiver 7 is built on readable-stream v4, whose Readable is a *different*
	// class from node:stream's, so `archive instanceof Readable` is false and
	// lib-storage refuses the body outright ("Body Data is unsupported format").
	// A real PassThrough in between is the entire fix. pipe() does not forward
	// errors, hence the explicit destroy — without it a failed archive would
	// leave the upload waiting for an end that never comes.
	const body = new PassThrough();

	archive.on("error", error => body.destroy(error));
	archive.pipe(body);

	const upload = new Upload({
		client: s3,
		params: {
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: "application/zip",
			ContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
			CacheControl: "public, max-age=86400",
			// Drives the expire-zip-cache lifecycle rule: archives are a rebuildable
			// cache, so they should not accumulate storage cost forever.
			Tagging: "ankaa-kind=zip"
		},
		partSize: UPLOAD_PART_SIZE,
		queueSize: UPLOAD_QUEUE_SIZE
	});

	const uploadDone = upload.done();

	try {
		// Rolling prefetch window: request N+PREFETCH while writing N.
		const pending = new Map();

		const fetchAt = index => {
			if (index >= photos.length || pending.has(index)) {
				return;
			}

			const photo = photos[index];
			pending.set(index, s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: photo.source.key(gid, photo) })));
		};

		for (let index = 0; index < Math.min(PREFETCH, photos.length); index += 1) {
			fetchAt(index);
		}

		for (let index = 0; index < photos.length; index += 1) {
			fetchAt(index + PREFETCH);

			const result = await pending.get(index);
			pending.delete(index);

			await appendEntry(archive, result.Body, names[index]);
			await onProgress(index + 1);
		}

		await archive.finalize();
	} catch (error) {
		archive.abort();
		body.destroy(error);
		// Surface the original failure, not the abort's knock-on error.
		await uploadDone.catch(() => {});

		throw error;
	}

	await uploadDone;

	// CompleteMultipartUpload does not report a size, but the archive counted
	// every byte it emitted.
	return { key, name: filename, bytes: archive.pointer() };
}

export const handler = async event => {
	const { jobId, gid, slug, hash, photos, variant } = event ?? {};

	if (!jobId || !gid || !hash || !Array.isArray(photos) || photos.length === 0) {
		throw new Error("Payload must include jobId, gid, hash and a non-empty photos array.");
	}

	// Resolved once, up front, so partitioning and naming both work off the same
	// decision and nothing has to reach for the payload again.
	const fallback = SOURCES[variant] ?? SOURCES.hd;
	const entries = photos.map(photo => ({ ...photo, source: SOURCES[photo.variant] ?? fallback }));

	let job;
	try {
		job = await readJob(jobId);
	} catch (error) {
		console.error("Job document unreadable", { jobId, error: error.message });

		throw error;
	}

	const groups = partition(entries, MAX_PART_BYTES);
	const multi = groups.length > 1;
	let completed = 0;
	let lastProgressAt = 0;

	async function publishProgress(doneInPart) {
		const done = completed + doneInPart;
		const now = Date.now();

		// Throttled: a PUT per photo would cost more time than it buys clarity.
		if (now - lastProgressAt < PROGRESS_INTERVAL_MS && done < photos.length) {
			return;
		}

		lastProgressAt = now;
		await putJson(jobKey(jobId), { ...job, status: "running", done, updatedAt: new Date().toISOString() });
	}

	try {
		await putJson(jobKey(jobId), { ...job, status: "running", done: 0, updatedAt: new Date().toISOString() });

		const parts = [];

		for (const [index, group] of groups.entries()) {
			const suffix = multi ? `-${index + 1}of${groups.length}` : "";
			const filename = `${slug || gid}${suffix}.zip`;

			parts.push(
				await buildPart({
					gid,
					photos: group,
					key: zipKey(gid, hash, suffix),
					filename,
					onProgress: publishProgress
				})
			);

			completed += group.length;
		}

		// The marker is what makes the archive cacheable: the API looks it up by
		// hash and re-signs the parts instead of rebuilding.
		await putJson(markerKey(gid, hash), {
			gid,
			hash,
			parts,
			photoCount: photos.length,
			createdAt: new Date().toISOString()
		});

		await putJson(jobKey(jobId), {
			...job,
			status: "done",
			done: photos.length,
			parts,
			updatedAt: new Date().toISOString()
		});

		console.info("Zip complete", { jobId, gid, variant, parts: parts.length, photos: photos.length });

		return { ok: true, parts };
	} catch (error) {
		console.error("Zip failed", { jobId, gid, error: error.message });

		await putJson(jobKey(jobId), {
			...job,
			status: "failed",
			error: error.message.slice(0, 300),
			updatedAt: new Date().toISOString()
		});

		// Rethrow so the failure lands in the DLQ and is visible in metrics.
		throw error;
	}
};
