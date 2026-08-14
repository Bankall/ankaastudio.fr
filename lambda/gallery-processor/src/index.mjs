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
//   media/g/<gid>/d/hd/<pid>_<rev>.jpg   full    download (clean unless mode=all)
//   db/galleries/<gid>/photos/<pid>.json         sidecar, incl. inline LQIP

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import exifReader from "exif-reader";
import sharp from "sharp";

const s3 = new S3Client({});
const BUCKET = process.env.MEDIA_BUCKET;
const WATERMARK_KEY = "assets/watermark.png";

const THUMB_WIDTH = 600;
const WEB_WIDTH = 2048;
const HD_MAX_EDGE = 6000;

// Watermark occupies this share of the derivative's width, inset by this margin.
const WATERMARK_WIDTH_RATIO = 0.22;
const WATERMARK_MARGIN_RATIO = 0.03;

const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "tiff", "heif", "avif"]);

// sharp is CPU-bound and Lambda gives us the whole container; let libvips use it.
sharp.concurrency(0);
sharp.cache({ files: 0 });

// --- watermark -------------------------------------------------------------

let watermarkSource;
const overlayCache = new Map();

async function loadWatermarkSource() {
	if (watermarkSource !== undefined) {
		return watermarkSource;
	}

	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: WATERMARK_KEY }));
		watermarkSource = Buffer.from(await result.Body.transformToByteArray());
	} catch (error) {
		// A missing watermark must not fail the whole derive — better an unmarked
		// gallery than a broken one. infra/upload-watermark.sh installs it.
		console.warn("No watermark installed; deriving without one.", { reason: error.name });
		watermarkSource = null;
	}

	return watermarkSource;
}

/**
 * A composite descriptor placing the mark bottom-right.
 *
 * Pre-scaled per target width and cached in module scope, so a warm container
 * resizes the logo once rather than once per photo.
 */
async function watermarkOverlay(width, height) {
	const source = await loadWatermarkSource();

	if (!source) {
		return null;
	}

	if (!overlayCache.has(width)) {
		const target = Math.max(1, Math.round(width * WATERMARK_WIDTH_RATIO));
		const resized = await sharp(source)
			.resize({ width: target, fit: "inside", withoutEnlargement: true })
			.png()
			.toBuffer({ resolveWithObject: true });

		overlayCache.set(width, resized);
	}

	const overlay = overlayCache.get(width);
	const margin = Math.round(width * WATERMARK_MARGIN_RATIO);

	return {
		input: overlay.data,
		left: Math.max(0, width - overlay.info.width - margin),
		top: Math.max(0, height - overlay.info.height - margin)
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
	const { gid, pid, extension, originalName = "", watermark = "preview", rev = 1 } = event ?? {};

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

		const [thumb, web] = await Promise.all([derivePreview(THUMB_WIDTH, 72), derivePreview(WEB_WIDTH, 80)]);

		// The HD file is what a client actually takes home, so it keeps a
		// copyright tag and, by default, no watermark at all.
		const hdFitted = fittedSize(width, height, Math.min(width, HD_MAX_EDGE));
		let hdPipeline = base.clone().resize({ width: Math.min(width, HD_MAX_EDGE), fit: "inside", withoutEnlargement: true });

		if (markHd) {
			const overlay = await watermarkOverlay(hdFitted.width, hdFitted.height);

			if (overlay) {
				hdPipeline = hdPipeline.composite([overlay]);
			}
		}

		const hd = await hdPipeline
			.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
			.withMetadata({ icc: "srgb" })
			.withExif({ IFD0: { Copyright: "Ankaa Studio", Artist: "Ankaa Studio" } })
			.toBuffer();

		// ~200 bytes of WebP, inlined into the sidecar so the gallery can blur-up
		// without a second request per photo.
		const lqipBuffer = await base.clone().resize({ width: 16 }).webp({ quality: 20 }).toBuffer();

		const downloadName = `${originalName.replace(/\.[^.]+$/, "") || pid}.jpg`;

		await Promise.all([
			putDerivative(`media/g/${gid}/v/t/${pid}_${rev}.webp`, thumb, "image/webp"),
			putDerivative(`media/g/${gid}/v/w/${pid}_${rev}.webp`, web, "image/webp"),
			putDerivative(`media/g/${gid}/d/hd/${pid}_${rev}.jpg`, hd, "image/jpeg", {
				// Set here rather than at request time: CloudFront passes the object's
				// own header through, so downloads land with a sensible filename.
				ContentDisposition: `attachment; filename="${downloadName.replace(/"/g, "")}"`
			})
		]);

		await writeSidecar(gid, pid, {
			pid,
			rev,
			extension,
			originalName,
			status: "ready",
			w: hdFitted.width,
			h: hdFitted.height,
			sourceW: width,
			sourceH: height,
			bytes: hd.length,
			originalBytes: input.length,
			lqip: `data:image/webp;base64,${lqipBuffer.toString("base64")}`,
			takenAt: shotDate(metadata),
			watermark,
			caption: null,
			processedAt: new Date().toISOString()
		});

		console.info("Processed photo", { gid, pid, rev, width, height, hdBytes: hd.length });

		return { ok: true, pid, rev };
	} catch (error) {
		console.error("Processing failed", { gid, pid, rev, error: error.message });

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
