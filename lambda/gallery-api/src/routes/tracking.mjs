// The open pixel: the one route a mail client calls on its own.
//
// Each message the share panel sends carries a 1×1 image whose URL names the
// gallery and the send; loading it is what "opened" means here. Outside every gate,
// because a mail client fetches images with no cookie and no password — the share
// id is the only credential, and it unlocks nothing: the answer is the same
// transparent pixel whatever the URL, so there is nothing to learn by guessing one.
//
// Indicative, not proof. A client whose mail client blocks remote images never
// registers; one whose mail client prefetches them (Apple Mail with its privacy
// protection, some corporate gateways) registers at delivery, before anyone has
// read a word. The panel says as much.

import { openedEvent, recordEvent } from "../lib/downloads.mjs";
import { galleryKey } from "../lib/galleries.mjs";
import { gif } from "../lib/http.mjs";
import { ID_PATTERN } from "../lib/ids.mjs";
import { getJson, updateJson } from "../lib/store.mjs";

async function opened({ params }) {
	const { gid, sid } = params;

	// Nothing is thrown from here: a broken-image icon in the mail is the one thing
	// this route must never produce, so an unknown gallery, a mistyped id and a lost
	// write all answer with the pixel.
	if (ID_PATTERN.test(gid) && ID_PATTERN.test(sid)) {
		try {
			await markOpened(gid, sid);
		} catch (error) {
			console.warn("Open not recorded", { gid, sid, error: error.message });
		}
	}

	return gif();
}

/**
 * Stamps the share with this load, and posts the first one to the activity feed.
 *
 * Checked before the write so that a pixel for a message the gallery has forgotten —
 * twenty sends later — or an id that was never minted costs one read and no write,
 * rather than rewriting the record untouched and racing an admin's save for the etag.
 */
async function markOpened(gid, sid) {
	const current = (await getJson(galleryKey(gid)))?.data;

	if (!current?.shares?.some(share => share.id === sid)) {
		return;
	}

	let first = false;

	const gallery = await updateJson(galleryKey(gid), record => {
		const share = (record.shares ?? []).find(candidate => candidate.id === sid);

		// Gone between the read and the write; nothing to stamp.
		if (!share) {
			return null;
		}

		const now = new Date().toISOString();
		first = !share.openedAt;
		share.openedAt = share.openedAt ?? now;
		share.lastOpenedAt = now;
		share.opens = (share.opens ?? 0) + 1;

		return record;
	});

	if (gallery && first) {
		const share = gallery.shares.find(candidate => candidate.id === sid);
		await recordEvent(openedEvent({ gallery, email: share.to, template: share.template }));
	}
}

export const trackingRoutes = [["GET", "/api/open/:gid/:sid", opened]];
