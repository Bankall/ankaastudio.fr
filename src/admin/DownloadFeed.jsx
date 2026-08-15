import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../utils/galleryApi.js";

// Downloads are not urgent news; a minute of latency is invisible and the feed is
// one small S3 GET.
const POLL_INTERVAL_MS = 60000;

const KIND_LABELS = {
	all: "a téléchargé toutes les photos",
	selection: "a téléchargé sa sélection",
	photo: "a téléchargé une photo"
};

const formatMoment = value => (value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");

// ISO timestamps compare correctly as strings, which is the whole reason they are
// stored that way.
const countUnseen = log => log.events.filter(event => !log.seenAt || event.at > log.seenAt).length;

function describe(event) {
	const action = KIND_LABELS[event.kind] ?? "a téléchargé des photos";

	if (event.kind === "selection") {
		return `${action} (${event.count} photo${event.count > 1 ? "s" : ""})`;
	}

	if (event.kind === "photo" && event.photoName) {
		return `${action} — ${event.photoName}`;
	}

	return action;
}

/**
 * Download notifications for the photographer.
 *
 * The read marker lives server-side, so the badge says the same thing on every
 * device; opening the panel is what clears it.
 */
export function DownloadFeed() {
	const [log, setLog] = useState({ events: [], seenAt: null });
	const [open, setOpen] = useState(false);
	const rootRef = useRef(null);
	// Where "new" was drawn before the panel was opened. Held apart from the read
	// marker so that opening the panel clears the badge without also un-highlighting
	// the very events it was pointing at.
	const [marker, setMarker] = useState(null);
	// The panel state is mirrored in a ref so that loading stays a stable callback:
	// were it to close over `open`, toggling the panel would restart the poll and
	// fire a fetch on the way out as well as in.
	const openRef = useRef(false);

	const load = useCallback(() => {
		return adminApi
			.downloads()
			.then(payload => {
				const fresh = { events: payload.events ?? [], seenAt: payload.seenAt ?? null };
				setLog(fresh);

				if (!openRef.current) {
					setMarker(fresh.seenAt);
				}

				return fresh;
			})
			// A missing feed is not worth a message: it just means nothing has been
			// downloaded yet, or the session lapsed and the shell will say so.
			.catch(() => null);
	}, []);

	useEffect(() => {
		load();

		const timer = setInterval(load, POLL_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [load]);

	// Click-outside and Escape, only while the panel is actually open.
	useEffect(() => {
		if (!open) {
			return;
		}

		const handlePointer = event => {
			if (!rootRef.current?.contains(event.target)) {
				setOpen(false);
			}
		};

		const handleKey = event => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};

		document.addEventListener("mousedown", handlePointer);
		window.addEventListener("keydown", handleKey);

		return () => {
			document.removeEventListener("mousedown", handlePointer);
			window.removeEventListener("keydown", handleKey);
		};
	}, [open]);

	const isNew = event => !marker || event.at > marker;
	const unseen = countUnseen(log);

	const toggle = async () => {
		const next = !open;
		openRef.current = next;
		setOpen(next);

		if (!next) {
			return;
		}

		// Opening is the one moment worth a fresh read; closing changes nothing on
		// the server. The read lands before the marker is moved, so its older
		// `seenAt` cannot overwrite the new one.
		const fresh = await load();

		if ((fresh ? countUnseen(fresh) : unseen) === 0) {
			return;
		}

		try {
			const { seenAt } = await adminApi.markDownloadsSeen();
			setLog(current => ({ ...current, seenAt }));
		} catch {
			/* The list is already on screen; the badge will clear on the next try. */
		}
	};

	return (
		<div className='admin-feed' ref={rootRef}>
			<button type='button' className='admin-feed__toggle' onClick={toggle} aria-expanded={open} aria-label='Téléchargements des clients'>
				Téléchargements
				{unseen > 0 ?
					<span className='admin-feed__badge'>{unseen}</span>
				:	null}
			</button>

			{open ?
				<div className='admin-feed__panel'>
					{log.events.length === 0 ?
						<p className='admin-hint'>Aucun téléchargement pour l’instant.</p>
					:	<ul className='admin-feed__list'>
							{log.events.map(event => (
								<li key={event.id} className={`admin-feed__item${isNew(event) ? " is-new" : ""}`}>
									<p className='admin-feed__line'>
										<strong>{event.email}</strong> {describe(event)}
									</p>
									<p className='admin-feed__meta'>
										{event.title}
										{event.clientName ? ` · ${event.clientName}` : ""} · {formatMoment(event.at)}
									</p>
								</li>
							))}
						</ul>
					}
				</div>
			:	null}
		</div>
	);
}
