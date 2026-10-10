// Daily Instagram mirror.
//
// The browser must never touch Meta's API: the token would be exposed, the CDN
// image URLs expire within hours, and there are rate limits and CORS in the way.
// So a scheduled Lambda pulls the latest posts, copies each image into S3, and
// writes a small feed.json. The home page then fetches that same-origin static
// document through CloudFront — no secrets, no Meta call, nothing that expires.
//
// Uses the Instagram Graph API ("Instagram API with Instagram Login"): a
// long-lived IG user token that this function refreshes on every run. The old
// Basic Display API was shut down in December 2024.

import { GetParametersCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

const ssm = new SSMClient({});
const s3 = new S3Client({});

// sharp is CPU-bound and Lambda gives us the whole container; let libvips use it.
sharp.concurrency(0);
sharp.cache({ files: 0 });

const BUCKET = process.env.MEDIA_BUCKET;
const SSM_PREFIX = process.env.SSM_PREFIX || "/ankaa/instagram";
const POST_COUNT = Number(process.env.POST_COUNT || 6);

const GRAPH = "https://graph.instagram.com";
const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

const TOKEN_NAME = `${SSM_PREFIX}/access-token`;
const USER_ID_NAME = `${SSM_PREFIX}/user-id`;

// Objects are keyed by the Instagram media id, so their bytes never change: the
// image can cache forever, the feed only for an hour so a new post shows up the
// same day the schedule next runs.
const IMAGE_CACHE_CONTROL = "public,max-age=31536000,immutable";
const FEED_CACHE_CONTROL = "public,max-age=3600";

// Instagram hands over the full-resolution original — up to 3277x4096 and 1.7 MB
// — for a card the home page never draws wider than ~190px. Mirroring that
// verbatim cost the strip about 3.4 MB, but the bytes were the lesser half of it:
// the originals are progressive JPEGs, and decoding 13 megapixels to fill a
// thumbnail is slow enough that the row visibly arrived one picture at a time,
// however the fade was timed.
//
// 640px covers that card on a 3x screen with room to spare, and WebP is what the
// galleries already serve.
const IMAGE_WIDTH = 640;
const IMAGE_QUALITY = 80;

async function loadConfig() {
	const result = await ssm.send(new GetParametersCommand({ Names: [TOKEN_NAME, USER_ID_NAME], WithDecryption: true }));

	if (result.InvalidParameters?.length) {
		throw new Error(`Missing SSM parameters: ${result.InvalidParameters.join(", ")}. See lambda/instagram-feed/README.md.`);
	}

	const byName = new Map(result.Parameters.map(parameter => [parameter.Name, parameter.Value]));

	return { token: byName.get(TOKEN_NAME), userId: byName.get(USER_ID_NAME) };
}

async function fetchJson(url) {
	const response = await fetch(url);
	const body = await response.json();

	if (!response.ok) {
		// The Graph API reports errors in the body, not just the status.
		throw new Error(`Instagram API ${response.status}: ${JSON.stringify(body?.error ?? body)}`);
	}

	return body;
}

async function fetchLatestPosts(userId, token) {
	const url = new URL(`${GRAPH}/${userId}/media`);
	url.searchParams.set("fields", MEDIA_FIELDS);
	url.searchParams.set("limit", String(POST_COUNT));
	url.searchParams.set("access_token", token);

	const body = await fetchJson(url);

	return (body.data ?? []).slice(0, POST_COUNT);
}

async function objectExists(key) {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));

		return true;
	} catch (error) {
		if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
			return false;
		}

		throw error;
	}
}

// Copies a post's image into S3 once, resized for the home page, skipping the
// download if it is already there. Videos have no still of their own, so their
// thumbnail stands in.
async function mirrorImage(post) {
	// The extension is part of the key, so moving to WebP is also what re-derives
	// the posts mirrored before it. On the old key the existence check below would
	// have kept the full-size JPEGs in place forever.
	const key = `instagram/media/${post.id}.webp`;

	if (await objectExists(key)) {
		return `/${key}`;
	}

	const source = post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;
	if (!source) {
		return null;
	}

	const response = await fetch(source);
	if (!response.ok) {
		throw new Error(`Image download failed (${response.status}) for ${post.id}`);
	}

	const original = Buffer.from(await response.arrayBuffer());

	// failOn 'truncated' so a download cut short is thrown rather than mirrored as
	// a half-grey card that then caches for a year. rotate() bakes in any EXIF
	// orientation, since the derivative carries no metadata of its own.
	const image = await sharp(original, { failOn: "truncated" })
		.rotate()
		.resize({ width: IMAGE_WIDTH, fit: "inside", withoutEnlargement: true })
		.webp({ quality: IMAGE_QUALITY, effort: 4 })
		.toBuffer();

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: image,
			ContentType: "image/webp",
			CacheControl: IMAGE_CACHE_CONTROL
		})
	);

	return `/${key}`;
}

async function writeFeed(posts) {
	const feed = {
		updatedAt: new Date().toISOString(),
		posts
	};

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: "instagram/feed.json",
			Body: JSON.stringify(feed),
			ContentType: "application/json",
			CacheControl: FEED_CACHE_CONTROL
		})
	);
}

// Long-lived IG tokens last 60 days and are renewed by exchanging the current
// one; running daily keeps it indefinitely fresh. Never fatal: a failed refresh
// leaves a still-valid token in place, so it must not sink an otherwise good run.
async function refreshToken(token) {
	try {
		const url = new URL(`${GRAPH}/refresh_access_token`);
		url.searchParams.set("grant_type", "ig_refresh_token");
		url.searchParams.set("access_token", token);

		const body = await fetchJson(url);
		if (!body.access_token || body.access_token === token) {
			return;
		}

		await ssm.send(
			new PutParameterCommand({
				Name: TOKEN_NAME,
				Value: body.access_token,
				Type: "SecureString",
				Overwrite: true
			})
		);

		console.info("Instagram token refreshed.", { expiresIn: body.expires_in });
	} catch (error) {
		console.warn("Instagram token refresh failed; keeping the current token.", { error: error.message });
	}
}

export async function handler() {
	const { token, userId } = await loadConfig();

	const rawPosts = await fetchLatestPosts(userId, token);

	const posts = [];
	for (const post of rawPosts) {
		const image = await mirrorImage(post);
		if (!image) {
			continue;
		}

		posts.push({
			id: post.id,
			permalink: post.permalink,
			caption: post.caption ?? "",
			mediaType: post.media_type,
			timestamp: post.timestamp,
			image
		});
	}

	if (posts.length === 0) {
		// Nothing usable came back. Leave yesterday's feed untouched rather than
		// publishing an empty one that would blank the section on the site.
		console.warn("No usable posts returned; leaving the existing feed in place.");
	} else {
		await writeFeed(posts);
		console.info(`Instagram feed written with ${posts.length} post(s).`);
	}

	await refreshToken(token);

	return { posts: posts.length };
}
