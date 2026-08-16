// Client activity, as the photographer sees it.
//
// Every download a client confirms with an email address lands here, and so does
// the moment someone starts a selection — the two questions "who has taken what?"
// and "who is picking?" are the same glance at the same bell. The admin
// notification feed is a read of this one document. One document rather than one
// per gallery because the feed is cross-gallery by nature — a single GET answers
// "what happened lately?" — and because a shoot produces a handful of events,
// nowhere near what would justify a table.

import { eventId } from "./ids.mjs";
import { getJson, updateJson } from "./store.mjs";

// Named for what it held first. The key is what a year of events is already stored
// under, so it stays as it is.
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
 *   favourite — nothing taken yet: they have started marking favourites
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

/**
 * The first favourite from an address the gallery had never heard from.
 *
 * Only the first: a client hearts a dozen photos in a minute, and a dozen
 * notifications for one person making up their mind is a bell worth silencing. What
 * they ended up choosing is in the gallery's selection panel, which is always
 * current — this only says to go and look.
 */
export const favouriteEvent = ({ gallery, email, count }) => downloadEvent({ gallery, email, kind: "favourite", count });

export async function readDownloadLog() {
	return (await getJson(DOWNLOADS_KEY))?.data ?? emptyDownloadLog();
}

/**
 * Appends an event, newest first.
 *
 * Never let this take a download or a favourite down with it: the client came for
 * their photos, and a lost notification is a far smaller failure than a button that
 * answers 500 because two visitors clicked at the same second.
 */
export async function recordEvent(event) {
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
		console.warn("Activity event not recorded", { gid: event.gid, kind: event.kind, error: error.message });
	}
}

export async function markDownloadsSeen() {
	const seenAt = new Date().toISOString();

	await updateJson(DOWNLOADS_KEY, log => ({ ...log, seenAt }), { fallback: emptyDownloadLog });

	return seenAt;
}
