// Download activity, as the photographer sees it.
//
// Every download a client confirms with an email address lands here, and the
// admin notification feed is a read of this one document. One document rather
// than one per gallery because the feed is cross-gallery by nature — a single
// GET answers "what happened lately?" — and because a shoot produces a handful
// of events, nowhere near what would justify a table.

import { eventId } from "./ids.mjs";
import { getJson, updateJson } from "./store.mjs";

export const DOWNLOADS_KEY = "db/downloads.json";

// Trimmed on every write. This is a notification feed, not an audit trail: a
// photographer scrolling back three hundred downloads is looking for something
// it was never meant to answer.
const MAX_EVENTS = 300;

export const emptyDownloadLog = () => ({ events: [], seenAt: null });

/**
 * `kind` is what the client asked for, not what they received:
 *   all       — the whole gallery as an archive
 *   set       — one of the gallery's sets as an archive, named by `setTitle`
 *   selection — their favourites as an archive
 *   photo     — one photo, straight from a tile or the lightbox
 */
export function downloadEvent({ gallery, email, kind, count, photoName = null, setTitle = "" }) {
	return {
		id: eventId(),
		at: new Date().toISOString(),
		gid: gallery.id,
		slug: gallery.slug,
		title: gallery.title,
		clientName: gallery.clientName ?? "",
		email,
		kind,
		count,
		photoName,
		setTitle
	};
}

export async function readDownloadLog() {
	return (await getJson(DOWNLOADS_KEY))?.data ?? emptyDownloadLog();
}

/**
 * Appends an event, newest first.
 *
 * Never let this take a download down with it: the client came for their photos,
 * and a lost notification is a far smaller failure than a button that answers
 * 500 because two visitors clicked at the same second.
 */
export async function recordDownload(event) {
	try {
		await updateJson(
			DOWNLOADS_KEY,
			log => ({
				...log,
				events: [event, ...(log.events ?? [])].slice(0, MAX_EVENTS)
			}),
			{ fallback: emptyDownloadLog }
		);
	} catch (error) {
		console.warn("Download event not recorded", { gid: event.gid, kind: event.kind, error: error.message });
	}
}

export async function markDownloadsSeen() {
	const seenAt = new Date().toISOString();

	await updateJson(DOWNLOADS_KEY, log => ({ ...log, seenAt }), { fallback: emptyDownloadLog });

	return seenAt;
}
