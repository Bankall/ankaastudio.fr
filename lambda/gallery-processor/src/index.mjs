// Derives everything a gallery serves from one uploaded original.
//
// Invoked asynchronously (InvocationType: Event) by the API once the browser
// confirms an upload landed in S3. Writes ONLY its own per-photo sidecar —
// never the gallery record — which is what lets many of these run in parallel
// without racing each other. The API's `reconcile` step folds sidecars in.
//
// Outputs, per photo revision:
//   media/g/<gid>/v/t/<pid>_<rev>.webp    600px  watermarked preview
//   media/g/<gid>/v/w/<pid>_<rev>.webp   2048px  watermarked preview
//   db/galleries/<gid>/photos/<pid>.json         sidecar, incl. inline LQIP
//
// Plus, and only under `watermark: "all"`:
//   media/g/<gid>/d/hd/<pid>_<rev>.jpg   full    marked download
//
// There is no unmarked HD derivative, because there is nothing for it to improve
// on: a download sold as high definition is served as the uploaded file itself,
// straight out of `originals/`. Only a marked download has to be a new file.
//
// A `variant: "cover"` invocation instead writes only:
//   media/g/<gid>/v/c/<pid>_<rev>.webp   2048px  unmarked, for the gallery cover
//
// And a `variant: "share"` invocation only:
//   media/g/<gid>/v/s/<pid>_<rev>.jpg    1200px  unmarked, for link previews

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import exifReader from "exif-reader";
import sharp from "sharp";

const s3 = new S3Client({});
const BUCKET = process.env.MEDIA_BUCKET;
const WATERMARK_KEY = "assets/watermark.png";

const THUMB_WIDTH = 600;
const WEB_WIDTH = 2048;
const HD_MAX_EDGE = 6000;
// Wide enough for the large card every messaging app draws (they ask for 1200),
// and small enough that a crawler on a timeout still gets the whole file.
const SHARE_WIDTH = 1200;

// The mark spans nearly the whole frame — it is a download deterrent, not a
// signature — but stops short of the edges, because the PNG carries no safe zone
// of its own and artwork bleeding off the frame looks like a mistake.
const WATERMARK_WIDTH_RATIO = 0.9;

// Applied on top of whatever alpha the PNG already carries, so the mark can be
// re-tuned here without re-exporting artwork.
const WATERMARK_OPACITY = 0.6;

// What each preview quality mode is worth in WebP quality, for the thumbnail and the
// web preview respectively. Only the compression moves: the widths above are what the
// gallery's `sizes` attributes are written against, so a mode that changed them would
// have the browser picking derivatives against stale hints.
//
// "standard" is what every photo derived before the setting existed was written at, so
// it has to stay exactly 72/80 — it is also the answer for a payload that carries no
// mode at all. Above it the curve is deliberately shallow: WebP past ~q95 buys almost
// no visible detail for a great deal of weight.
const PREVIEW_QUALITY = {
	standard: { thumb: 72, web: 80 },
	high: { thumb: 80, web: 88 },
	max: { thumb: 86, web: 95 }
};

const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "tiff", "heif", "avif"]);

// sharp is CPU-bound and Lambda gives us the whole container; let libvips use it.
sharp.concurrency(0);
sharp.cache({ files: 0 });

// --- watermark -------------------------------------------------------------

// Caching for the container's whole life would break the one promise
// upload-watermark.sh makes: a container that once found no mark would keep
// deriving unmarked photos until Lambda happened to recycle it, and a replaced
// logo would keep being ignored. One GetObject per container per five minutes is
// nothing next to the derive it is part of.
const WATERMARK_TTL_MS = 5 * 60 * 1000;

let watermarkSource;
let watermarkEtag = null;
let watermarkExpiresAt = 0;
let watermarkInFlight = null;

// Overlays are keyed by both dimensions of the frame they cover, so a batch of
// mixed aspect ratios would otherwise pile up one full-width PNG per photo.
// Oldest evicted first; a run of similar photos keeps hitting the last few.
const OVERLAY_CACHE_MAX = 8;
const overlayCache = new Map();

function cacheOverlay(key, overlay) {
	if (overlayCache.size >= OVERLAY_CACHE_MAX) {
		overlayCache.delete(overlayCache.keys().next().value);
	}

	overlayCache.set(key, overlay);
}

async function fetchWatermarkSource() {
	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: WATERMARK_KEY }));

		// The pre-scaled overlays are derived from these bytes, so they are only
		// valid for as long as the ETag is.
		if (result.ETag !== watermarkEtag) {
			overlayCache.clear();
			watermarkEtag = result.ETag;
		}

		return Buffer.from(await result.Body.transformToByteArray());
	} catch (error) {
		// A missing watermark must not fail the whole derive — better an unmarked
		// gallery than a broken one. infra/upload-watermark.sh installs it.
		console.warn("No watermark installed; deriving without one.", { reason: error.name });
		overlayCache.clear();
		watermarkEtag = null;

		return null;
	}
}

async function loadWatermarkSource() {
	if (watermarkSource !== undefined && Date.now() < watermarkExpiresAt) {
		return watermarkSource;
	}

	// The thumb and web derives run concurrently: without this they would each
	// fetch the mark on a cold container.
	watermarkInFlight ??= fetchWatermarkSource()
		.then(source => {
			watermarkSource = source;
			watermarkExpiresAt = Date.now() + WATERMARK_TTL_MS;

			return source;
		})
		.finally(() => {
			watermarkInFlight = null;
		});

	return watermarkInFlight;
}

/**
 * A composite descriptor stretching the mark across the derivative, centred.
 *
 * The mark is a download deterrent rather than an artist's signature — that
 * belongs in Lightroom — so it spans most of the width in the middle of the
 * frame, where nothing can be cropped around it. It is scaled up when the source
 * PNG is narrower than the derivative; `fit: "inside"` keeps its aspect ratio
 * and, on a frame wider than the mark itself, stops it overflowing the height.
 *
 * Pre-scaled per derivative size and cached in module scope, so a warm container
 * resizes the logo once rather than once per photo.
 */
async function watermarkOverlay(width, height) {
	const source = await loadWatermarkSource();

	if (!source) {
		return null;
	}

	const cacheKey = `${width}x${height}`;

	if (!overlayCache.has(cacheKey)) {
		const scaled = await sharp(source)
			.resize({ width: Math.max(1, Math.round(width * WATERMARK_WIDTH_RATIO)), height, fit: "inside" })
			.ensureAlpha()
			.png()
			.toBuffer({ resolveWithObject: true });

		// `dest-in` keeps the mark only where the mask has alpha, which for a
		// uniform mask means multiplying the mark's own alpha by WATERMARK_OPACITY.
		// sharp has no opacity option on a composite, and dimming the colour
		// channels instead would grey the artwork rather than fade it.
		const faded = await sharp(scaled.data)
			.composite([
				{
					input: {
						create: {
							width: scaled.info.width,
							height: scaled.info.height,
							channels: 4,
							background: { r: 0, g: 0, b: 0, alpha: WATERMARK_OPACITY }
						}
					},
					blend: "dest-in"
				}
			])
			.png()
			.toBuffer({ resolveWithObject: true });

		cacheOverlay(cacheKey, faded);
	}

	const overlay = overlayCache.get(cacheKey);

	return {
		input: overlay.data,
		left: Math.max(0, Math.round((width - overlay.info.width) / 2)),
		top: Math.max(0, Math.round((height - overlay.info.height) / 2))
	};
}

// --- helpers ---------------------------------------------------------------

/** Dimensions after a resize-to-fit, needed to place the watermark. */
function fittedSize(width, height, targetWidth) {
	if (width <= targetWidth) {
		return { width, height };
	}

	return { width: targetWidth, height: Math.max(1, Math.round((height * targetWidth) / width)) };
}

function shotDate(metadata) {
	if (!metadata.exif) {
		return null;
	}

	try {
		const parsed = exifReader(metadata.exif);
		const taken = parsed?.Photo?.DateTimeOriginal ?? parsed?.Image?.DateTime;

		return taken ? new Date(taken).toISOString() : null;
	} catch {
		return null;
	}
}

async function putDerivative(key, body, contentType, extra = {}) {
	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: contentType,
			// Keys carry a rev suffix, so a given URL's bytes never change and the
			// edge can hold them forever. Re-processing bumps rev, not content.
			CacheControl: "public, max-age=31536000, immutable",
			...extra
		})
	);
}

async function writeSidecar(gid, pid, sidecar) {
	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: `db/galleries/${gid}/photos/${pid}.json`,
			Body: JSON.stringify(sidecar),
			ContentType: "application/json",
			CacheControl: "no-store"
		})
	);
}

// --- handler ---------------------------------------------------------------

export const handler = async event => {
	const { gid, pid, extension, originalName = "", watermark = "preview", previewQuality = "standard", rev = 1, variant = "full" } = event ?? {};
	// An unknown mode is a caller that has outrun this function — a deploy in flight —
	// and the old default is a better answer than a crash in front of an upload.
	const quality = PREVIEW_QUALITY[previewQuality] ?? PREVIEW_QUALITY.standard;

	if (!gid || !pid || !extension) {
		throw new Error("Payload must include gid, pid and extension.");
	}

	const originalKey = `originals/${gid}/${pid}.${extension}`;

	try {
		const source = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: originalKey }));
		const input = Buffer.from(await source.Body.transformToByteArray());

		// sharp throws on anything that is not a decodable image, which doubles as
		// the content check — an extension proves nothing about the bytes.
		const base = sharp(input, { failOn: "truncated" }).rotate();
		const metadata = await base.metadata();

		if (!ALLOWED_FORMATS.has(metadata.format)) {
			throw new Error(`Unsupported image format: ${metadata.format}`);
		}

		// .rotate() has already applied orientation, so swap the axes for the
		// EXIF orientations that transpose the image.
		const upright = (metadata.orientation ?? 1) >= 5;
		const width = upright ? metadata.height : metadata.width;
		const height = upright ? metadata.width : metadata.height;

		if (!width || !height) {
			throw new Error("Could not determine image dimensions.");
		}

		// The gallery's opening image is the one photo shown unmarked: it is the
		// client's first impression, and a mark centred over it is the whole page.
		// It is a job of its own because only the API knows which photo is the
		// cover, and that can change long after the photo was derived.
		if (variant === "cover") {
			// Written at the web preview's quality rather than a fixed one: the cover is
			// the largest image the gallery ever shows, and a hero visibly softer than
			// the photographs under it is the first thing a photographer would notice
			// after turning the quality up.
			const cover = await base
				.clone()
				.resize({ width: WEB_WIDTH, fit: "inside", withoutEnlargement: true })
				.webp({ quality: quality.web, effort: 4 })
				.toBuffer();

			await putDerivative(`media/g/${gid}/v/c/${pid}_${rev}.webp`, cover, "image/webp");

			console.info("Derived clean cover", { gid, pid, rev, bytes: cover.length });

			return { ok: true, pid, rev, variant };
		}

		// The image a link preview shows. Unmarked for the same reason the cover is —
		// it is the whole card, and a mark across it is what the photographer was
		// complaining about — and JPEG because the crawlers that draw those cards are
		// the last software on earth that cannot be relied on to read WebP.
		if (variant === "share") {
			const preview = await base
				.clone()
				.resize({ width: SHARE_WIDTH, fit: "inside", withoutEnlargement: true })
				.jpeg({ quality: 82, mozjpeg: true })
				.toBuffer();

			await putDerivative(`media/g/${gid}/v/s/${pid}_${rev}.jpg`, preview, "image/jpeg");

			console.info("Derived share preview", { gid, pid, rev, bytes: preview.length });

			return { ok: true, pid, rev, variant };
		}

		const markPreviews = watermark === "preview" || watermark === "all";
		const markHd = watermark === "all";

		async function derivePreview(targetWidth, quality) {
			const fitted = fittedSize(width, height, targetWidth);
			let pipeline = base.clone().resize({ width: targetWidth, fit: "inside", withoutEnlargement: true });

			if (markPreviews) {
				const overlay = await watermarkOverlay(fitted.width, fitted.height);

				if (overlay) {
					pipeline = pipeline.composite([overlay]);
				}
			}

			return pipeline.webp({ quality, effort: 4 }).toBuffer();
		}

		const [thumb, web] = await Promise.all([derivePreview(THUMB_WIDTH, quality.thumb), derivePreview(WEB_WIDTH, quality.web)]);

		// Under `watermark: "all"` the mark has to be *in* the file the client keeps,
		// so that file cannot be their upload and has to be derived: a full-size JPEG,
		// marked, with a copyright tag. Every other mode hands over the original, and
		// deriving a second-generation copy of it would only lose detail and store
		// another ~26% of the bucket to do it.
		async function deriveMarkedHd(fitted) {
			let pipeline = base.clone().resize({ width: Math.min(width, HD_MAX_EDGE), fit: "inside", withoutEnlargement: true });
			const overlay = await watermarkOverlay(fitted.width, fitted.height);

			if (overlay) {
				pipeline = pipeline.composite([overlay]);
			}

			return pipeline
				.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
				.withMetadata({ icc: "srgb" })
				.withExif({ IFD0: { Copyright: "Ankaa Studio", Artist: "Ankaa Studio" } })
				.toBuffer();
		}

		const hdFitted = markHd ? fittedSize(width, height, Math.min(width, HD_MAX_EDGE)) : null;
		const hd = hdFitted ? await deriveMarkedHd(hdFitted) : null;

		// ~200 bytes of WebP, inlined into the sidecar so the gallery can blur-up
		// without a second request per photo.
		const lqipBuffer = await base.clone().resize({ width: 16 }).webp({ quality: 20 }).toBuffer();

		const downloadName = `${originalName.replace(/\.[^.]+$/, "") || pid}.jpg`;

		await Promise.all([
			putDerivative(`media/g/${gid}/v/t/${pid}_${rev}.webp`, thumb, "image/webp"),
			putDerivative(`media/g/${gid}/v/w/${pid}_${rev}.webp`, web, "image/webp"),
			...(hd ?
				[
					putDerivative(`media/g/${gid}/d/hd/${pid}_${rev}.jpg`, hd, "image/jpeg", {
						// Set here rather than at request time: CloudFront passes the object's
						// own header through, so downloads land with a sensible filename. An
						// original is named per response instead — it is signed, not cached.
						ContentDisposition: `attachment; filename="${downloadName.replace(/"/g, "")}"`
					})
				]
			:	[])
		]);

		await writeSidecar(gid, pid, {
			pid,
			rev,
			extension,
			originalName,
			status: "ready",
			// `w`/`h` and `bytes` describe the file the client downloads — the marked JPEG
			// where there is one, the original otherwise. The zipper partitions an archive
			// on `bytes`, so it has to be that file's size and not the source's.
			w: hdFitted?.width ?? width,
			h: hdFitted?.height ?? height,
			sourceW: width,
			sourceH: height,
			bytes: hd ? hd.length : input.length,
			originalBytes: input.length,
			lqip: `data:image/webp;base64,${lqipBuffer.toString("base64")}`,
			takenAt: shotDate(metadata),
			watermark,
			// Recorded for the same reason `watermark` is: this is the compression the
			// files on S3 were actually written at, which a setting changed since then
			// reaches only through a re-derive.
			previewQuality,
			caption: null,
			processedAt: new Date().toISOString()
		});

		console.info("Processed photo", { gid, pid, rev, width, height, originalBytes: input.length, markedHdBytes: hd?.length ?? null });

		return { ok: true, pid, rev };
	} catch (error) {
		console.error("Processing failed", { gid, pid, rev, variant, error: error.message });

		// A cover or share job derives nothing the gallery depends on — the photo is
		// already processed — so a failure there must not overwrite a healthy sidecar
		// with a failed one. Both callers fall back to the marked preview instead.
		if (variant !== "full") {
			throw error;
		}

		// A failed sidecar is deliberate: reconcile surfaces it as a retryable
		// tile in the admin grid instead of the photo vanishing silently.
		await writeSidecar(gid, pid, {
			pid,
			rev,
			extension,
			originalName,
			status: "failed",
			error: error.message.slice(0, 300),
			processedAt: new Date().toISOString()
		});

		throw error;
	}
};
