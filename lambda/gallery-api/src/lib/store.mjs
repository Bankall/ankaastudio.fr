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

/** Every key under a prefix, following continuation tokens. */
export async function listKeys(prefix) {
	const keys = [];
	let token;

	do {
		const result = await s3.send(
			new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: prefix,
				ContinuationToken: token
			})
		);

		for (const item of result.Contents ?? []) {
			keys.push({ key: item.Key, size: Number(item.Size || 0), modified: item.LastModified });
		}

		token = result.IsTruncated ? result.NextContinuationToken : undefined;
	} while (token);

	return keys;
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
