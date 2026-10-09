// The "database": JSON documents in S3.
//
// Writes use S3 conditional requests (If-Match / If-None-Match) so a
// read-modify-write cannot silently lose an update. The API Lambda is the only
// writer of gallery records — the processor writes per-photo sidecars and
// nothing else — which keeps the whole conflict surface down to concurrent
// admin tabs.
//
// If this ever grows a second admin, swap this module for DynamoDB. Everything
// upstream talks in terms of these functions, so it is a one-file change.

import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({});
export const BUCKET = process.env.MEDIA_BUCKET;

export class ConflictError extends Error {
	constructor(message = "Concurrent modification") {
		super(message);
		this.name = "ConflictError";
	}
}

function isNotFound(error) {
	return error?.name === "NoSuchKey" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404;
}

function isPreconditionFailed(error) {
	// 412 = If-Match lost the race. 409 = a concurrent create beat If-None-Match.
	const status = error?.$metadata?.httpStatusCode;

	return status === 412 || status === 409 || error?.name === "PreconditionFailed";
}

/** Returns `{ data, etag }`, or null when the key does not exist. */
export async function getJson(key) {
	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
		const body = await result.Body.transformToString();

		return { data: JSON.parse(body), etag: result.ETag };
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}

		throw error;
	}
}

/**
 * Writes a JSON document.
 *   etag: "<etag>" → only if unchanged since that read (If-Match)
 *   etag: null     → only if it does not exist yet (If-None-Match: *)
 *   etag: undefined → unconditional
 */
export async function putJson(key, data, { etag, tags } = {}) {
	const command = new PutObjectCommand({
		Bucket: BUCKET,
		Key: key,
		Body: JSON.stringify(data),
		ContentType: "application/json",
		CacheControl: "no-store",
		...(etag ? { IfMatch: etag } : {}),
		...(etag === null ? { IfNoneMatch: "*" } : {}),
		...(tags ? { Tagging: tags } : {})
	});

	try {
		const result = await s3.send(command);

		return result.ETag;
	} catch (error) {
		if (isPreconditionFailed(error)) {
			throw new ConflictError();
		}

		throw error;
	}
}

/**
 * Optimistic read-modify-write. `mutate(data)` may return a new document or
 * mutate in place; returning null aborts the write.
 *
 * Retries on 412 with jittered backoff, then gives up — a caller that keeps
 * losing is a caller with a genuinely concurrent peer, and reporting that is
 * more honest than looping forever.
 */
export async function updateJson(key, mutate, { attempts = 6, fallback = null } = {}) {
	let lastError;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const current = await getJson(key);
		const data = current?.data ?? (typeof fallback === "function" ? fallback() : fallback);

		if (data === null || data === undefined) {
			return null;
		}

		const next = (await mutate(data)) ?? data;
		if (next === null) {
			return null;
		}

		try {
			await putJson(key, next, { etag: current?.etag ?? null });

			return next;
		} catch (error) {
			if (!(error instanceof ConflictError)) {
				throw error;
			}

			lastError = error;
			// 25ms, 50ms, 100ms … with jitter, so retrying peers desynchronise.
			const backoff = 25 * 2 ** attempt * (0.5 + Math.random());
			await new Promise(resolve => setTimeout(resolve, backoff));
		}
	}

	throw lastError ?? new ConflictError();
}

export async function objectExists(key) {
	try {
		const result = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));

		return { size: Number(result.ContentLength || 0), etag: result.ETag };
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}

		throw error;
	}
}

/**
 * A short-lived URL for one object, signed with this function's own credentials.
 *
 * The one door onto `originals/`, which no CloudFront behaviour maps to: a client's
 * high-definition download is the upload itself, and copying every original under
 * `media/` just to keep it on the CDN would double the largest thing in the bucket.
 * Everything else the client fetches still goes through CloudFront — this is signed
 * per request precisely because it must not be, and must not be cached at an edge.
 *
 * `filename` is applied to the response rather than stored on the object, which is what
 * lets a photo uploaded long before any of this download under its own name. Both forms
 * of the header are sent: the quoted one for software that reads no further, and RFC
 * 5987's for the accents that survive it. The plain form strips the accents rather than
 * blanking them, so the fallback reads `Ete-2.jpg` and not `_t_-2.jpg`, and the encoded
 * form escapes the apostrophe French filenames are full of — it is the delimiter of the
 * `charset'lang'value` syntax it sits inside.
 */
export function presignedGetUrl(key, { filename = "", expiresIn = 300 } = {}) {
	const ascii = filename
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^\x20-\x7e]/g, "_")
		.replace(/["\\]/g, "");

	const disposition = filename ? `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, "%27")}` : "attachment";

	return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: disposition }), { expiresIn });
}

/**
 * Every key under a prefix, following continuation tokens.
 *
 * `restoreStatus` asks S3 for each object's thaw state as well. It is opt-in
 * because it is an optional attribute S3 only computes when requested, and the
 * callers that just want key names have no use for it.
 */
export async function listKeys(prefix, { restoreStatus = false } = {}) {
	const keys = [];
	let token;

	do {
		const result = await s3.send(
			new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: prefix,
				ContinuationToken: token,
				...(restoreStatus ? { OptionalObjectAttributes: ["RestoreStatus"] } : {})
			})
		);

		for (const item of result.Contents ?? []) {
			keys.push({
				key: item.Key,
				size: Number(item.Size || 0),
				modified: item.LastModified,
				storageClass: item.StorageClass ?? "STANDARD",
				// Present only once a restore has been asked for, so absent means
				// "nobody has tried", not "not restored".
				restore: item.RestoreStatus ?? null
			});
		}

		token = result.IsTruncated ? result.NextContinuationToken : undefined;
	} while (token);

	return keys;
}

/**
 * Runs `mapper` over `items` with at most `limit` in flight, preserving order.
 *
 * Lives here because every caller is fanning out one S3 request per object, where
 * unbounded Promise.all over a few thousand keys is what turns a slow gallery into
 * a throttled one.
 */
export async function mapWithLimit(items, limit, mapper) {
	const results = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

	return results;
}

/** Bulk delete, batched at the 1000-key API limit. */
export async function deleteKeys(keys) {
	for (let index = 0; index < keys.length; index += 1000) {
		const batch = keys.slice(index, index + 1000);

		await s3.send(
			new DeleteObjectsCommand({
				Bucket: BUCKET,
				Delete: { Objects: batch.map(key => ({ Key: key })), Quiet: true }
			})
		);
	}
}

export async function deletePrefix(prefix) {
	const keys = await listKeys(prefix);

	if (keys.length) {
		await deleteKeys(keys.map(item => item.key));
	}

	return keys.length;
}
