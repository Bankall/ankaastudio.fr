// What happens to a gallery's bytes when it is archived.
//
// Only the originals are kept. Every derivative — previews, HD files, cached ZIPs,
// and the sidecars describing them — can be rebuilt from an original by the
// processor, and together they run to roughly 28% of an original's bytes per photo
// while sitting in Standard for ever. That makes the rebuildable copies cost more
// to keep than the masters they came from, so archiving deletes them outright and
// moves the originals to Deep Archive: ~23× cheaper than Standard, and ~4×
// cheaper than the Glacier IR they were headed for at 60 days.
//
// The move is left to a lifecycle rule keyed on an object tag rather than done
// here with a copy, for one decisive reason: originals older than 60 days are
// already in Glacier IR, and copying an object out of Glacier IR is billed as a
// retrieval of every byte, while a lifecycle transition is billed per object. On a
// 2 TB library that is the difference between tens of dollars and pennies.

import { DeleteObjectTaggingCommand, PutObjectTaggingCommand, RestoreObjectCommand } from "@aws-sdk/client-s3";

import { mediaPrefix, originalPrefix, sidecarPrefix, zipMarkerPrefix } from "./galleries.mjs";
import { BUCKET, deletePrefix, listKeys, mapWithLimit, s3 } from "./store.mjs";

// Matched by the archived-originals-to-deep-archive lifecycle rule. A tag rather
// than a prefix because the rule has no way to name one gallery: the id sits in
// the middle of originals/<gid>/<pid>.<ext>, and lifecycle prefixes do not
// wildcard.
const ARCHIVED_TAG = { Key: "ankaa-state", Value: "archived" };

// Deep Archive will not serve a GET; it needs an explicit restore first. Bulk is
// the cheap tier — 48 hours instead of 12, at an eighth of the price — and nothing
// about coming back out of archive is urgent, since it ends in a re-derive the
// photographer starts by hand anyway.
const RESTORE_TIER = "Bulk";

// How long a restored copy stays readable. It only has to outlast the re-derive it
// exists for, but a week costs almost nothing and covers a restore started on a
// Friday.
const RESTORE_DAYS = 7;

// Classes an object cannot simply be read out of. Glacier IR is deliberately not
// here: it is millisecond-retrieval, which is the whole reason originals go there
// first and re-processing an ordinary gallery never needs a restore.
const FROZEN_CLASSES = new Set(["DEEP_ARCHIVE", "GLACIER"]);

// One request per object, so a large gallery is thousands of them. High enough to
// finish a normal gallery well inside one API call, low enough to stay far from
// S3's per-prefix request ceiling.
const CONCURRENCY = 16;

/** Whether a frozen object currently has a restored copy to read. */
function isRestored(item) {
	if (item.restore?.IsRestoreInProgress) {
		return false;
	}

	const expiry = item.restore?.RestoreExpiryDate;

	return Boolean(expiry && Date.parse(expiry) > Date.now());
}

const needsRestore = item => FROZEN_CLASSES.has(item.storageClass) && !item.restore?.IsRestoreInProgress && !isRestored(item);

/**
 * Deletes everything the originals can regenerate.
 *
 * The sidecars go too, and that part is not housekeeping: reconcile folds any
 * sidecar it finds back into the record, so one left behind would flip an archived
 * photo to "ready" pointing at a derivative that no longer exists.
 */
export async function purgeDerivatives(gid) {
	// media/g/<gid>/ is previews, HD files and cached ZIPs under one prefix.
	const media = await deletePrefix(mediaPrefix(gid));
	const sidecars = await deletePrefix(sidecarPrefix(gid));
	const markers = await deletePrefix(zipMarkerPrefix(gid));

	return media + sidecars + markers;
}

/**
 * Tags the originals so the lifecycle rule moves them to Deep Archive.
 *
 * Objects already there are skipped, which is what makes this safe to call on
 * every save of an already-archived gallery: one listing and no writes. That in
 * turn is what lets the caller run it unconditionally, so a run cut short by a
 * timeout is finished by the next save rather than leaving objects behind in the
 * expensive class, billing quietly for ever.
 */
export async function freezeOriginals(gid) {
	const originals = await listKeys(originalPrefix(gid));
	const pending = originals.filter(item => item.storageClass !== "DEEP_ARCHIVE");

	await mapWithLimit(pending, CONCURRENCY, item =>
		s3.send(
			new PutObjectTaggingCommand({
				Bucket: BUCKET,
				Key: item.key,
				Tagging: { TagSet: [ARCHIVED_TAG] }
			})
		)
	);

	return pending.length;
}

/**
 * Starts the way back: drops the tag, and asks S3 to restore what is already cold.
 *
 * Two things this deliberately does not do. It does not bring anything back by
 * removing the tag — lifecycle transitions only ever go one way, so the tag going
 * away merely stops the rule re-applying. And a restore is a temporary readable
 * copy rather than a move, so the objects stay in Deep Archive; that is enough,
 * because the only thing that ever reads an original is the re-derive, and the
 * derivatives it writes land in Standard where the client needs them.
 */
export async function thawOriginals(gid) {
	const originals = await listKeys(originalPrefix(gid), { restoreStatus: true });

	await mapWithLimit(originals, CONCURRENCY, item => s3.send(new DeleteObjectTaggingCommand({ Bucket: BUCKET, Key: item.key })));

	const frozen = originals.filter(needsRestore);

	await mapWithLimit(frozen, CONCURRENCY, async item => {
		try {
			await s3.send(
				new RestoreObjectCommand({
					Bucket: BUCKET,
					Key: item.key,
					RestoreRequest: { Days: RESTORE_DAYS, GlacierJobParameters: { Tier: RESTORE_TIER } }
				})
			);
		} catch (error) {
			// Two callers racing for the same object — two admin tabs, or a retried
			// request — is not a failure: the outcome we asked for is already happening.
			if (error.name !== "RestoreAlreadyInProgress") {
				throw error;
			}
		}
	});

	return frozen.length;
}

/**
 * Whether the originals can be read right now, for callers that are about to.
 *
 * One listing answers it for a whole gallery, because ListObjectsV2 will return
 * restore state alongside the storage class if asked — far cheaper than a HEAD per
 * object.
 */
export async function originalsState(gid) {
	const originals = await listKeys(originalPrefix(gid), { restoreStatus: true });

	let restoring = 0;
	let frozen = 0;

	for (const item of originals) {
		if (!FROZEN_CLASSES.has(item.storageClass) || isRestored(item)) {
			continue;
		}

		if (item.restore?.IsRestoreInProgress) {
			restoring += 1;
		} else {
			frozen += 1;
		}
	}

	return { total: originals.length, frozen, restoring, readable: originals.length - frozen - restoring };
}
