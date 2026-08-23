import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { ApiError, galleryApi } from "../utils/galleryApi.js";
import { DownloadPanel } from "./DownloadPanel.jsx";
import { EmailPrompt } from "./EmailPrompt.jsx";
import { GalleryCover } from "./GalleryCover.jsx";
import { Lightbox } from "./Lightbox.jsx";
import { PasswordGate } from "./PasswordGate.jsx";
import { PhotoTile } from "./PhotoTile.jsx";
import { SetTabs } from "./SetTabs.jsx";
import { readVisitorEmail, storeVisitorEmail } from "./visitorEmail.js";

// Signed viewing cookies last 12h; renew well before that so a client who leaves
// the tab open overnight never meets a wall of broken images.
const REFRESH_MARGIN_SECONDS = 30 * 60;
const SELECTION_SAVE_DELAY_MS = 800;
// What the cover's scroll cue aims at.
const PHOTOS_ID = "photos";
// The grid, as the tabs' panel.
const PANEL_ID = "gallery-set-panel";
// The favourites tab, alongside the sets. Every set id the API mints is prefixed
// `s_`, and the ungrouped one is `null`, so a plain word collides with neither.
const FAVOURITES_ID = "favourites";
// The answer for a photo whose set cannot be resolved, and what the favourites view
// hands the download panel. A module constant so it keeps one identity across
// renders, which the memos below depend on.
const DOWNLOADS_OFF = { enabled: false, hd: false, zip: false };

/** The list with `pid` added, or removed if it was already there. */
const togglePid = (pids, pid) => (pids.includes(pid) ? pids.filter(candidate => candidate !== pid) : [...pids, pid]);

/**
 * Why the gallery is asking for an address, in the visitor's terms.
 *
 * The same prompt serves all three, because it is the same address: what changes is
 * what happens the moment it is given, and saying which is what keeps a dialog in
 * front of a photograph from feeling like a toll gate.
 */
const PROMPT_COPY = {
	download: {
		title: "Avant de télécharger",
		message: "Indiquez votre email pour télécharger cette photo. Le téléchargement démarre aussitôt.",
		submitLabel: "Télécharger"
	},
	favourite: {
		title: "Votre sélection",
		message: "Cette galerie est partagée : indiquez votre email pour que vos favoris soient bien les vôtres, et que le studio sache à qui ils sont.",
		submitLabel: "Garder cette photo"
	},
	filter: {
		title: "Vos favoris",
		message: "Indiquez votre email pour retrouver les photos que vous avez marquées, ici comme sur vos autres appareils.",
		submitLabel: "Voir mes favoris"
	}
};

/**
 * Saves a same-origin URL under a chosen name without navigating away.
 *
 * `download` is only honoured same-origin, which the preview paths are — they are
 * root-relative on purpose — so the watermarked copy lands as a file rather than
 * replacing the gallery with a lone image.
 */
function saveAs(url, filename) {
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
}

function formatDate(value) {
	if (!value) {
		return "";
	}

	return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function GalleryPage() {
	const { slug } = useParams();
	// The slug travels with the state so that a route change is "loading" by
	// derivation, without an extra render just to reset it.
	const [state, setState] = useState({ status: "loading", slug });
	const [selection, setSelection] = useState([]);
	const [lightboxIndex, setLightboxIndex] = useState(null);
	// The open tab, carrying its slug the way `state` does so that a route change
	// makes it stale by derivation rather than through an effect that resets it.
	// `undefined` means "whatever the manifest lists first", which is not the same as
	// `null` — that one is the tab of photos belonging to no set.
	const [tab, setTab] = useState({ slug, id: undefined });
	// Who this browser belongs to, as far as the gallery knows. Favourites are filed
	// under it, so nothing can be hearted before it is given.
	const [email, setEmail] = useState(readVisitorEmail);
	// Whether the favourites tab is the open one. Held apart from `tab` rather than as
	// one of its values: the set stays remembered underneath, so leaving the selection
	// is a click back onto the tab they came from.
	const [favouritesOnly, setFavouritesOnly] = useState(false);
	// What the visitor asked for before we knew who they were, waiting on the email
	// prompt: { intent: "download" | "favourite" | "filter", pid? }.
	const [prompt, setPrompt] = useState(null);
	const saveTimerRef = useRef(null);

	const applyManifest = useCallback(
		payload => {
			setState({ status: "ready", slug, gallery: payload.gallery, signedUntil: payload.signedUntil });
		},
		[slug]
	);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const payload = await galleryApi.read(slug);

				if (!cancelled) {
					setState({ status: "ready", slug, gallery: payload.gallery, signedUntil: payload.signedUntil });
				}
			} catch (failure) {
				if (cancelled) {
					return;
				}

				if (failure instanceof ApiError && failure.status === 401 && failure.payload?.passwordRequired) {
					setState({ status: "locked", slug, title: failure.payload.title, clientName: failure.payload.clientName });
				} else if (failure instanceof ApiError && failure.status === 410) {
					setState({ status: "gone", slug, message: failure.message });
				} else if (failure instanceof ApiError && failure.status === 404) {
					setState({ status: "missing", slug });
				} else {
					setState({ status: "error", slug });
				}
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, [slug]);

	// Anything held for a previous slug is stale by definition.
	const status = state.slug === slug ? state.status : "loading";

	// Favourites are stored server-side, under the visitor's address, so they survive
	// a device change and so the photographer can read each person's picks.
	const loadSelection = useCallback(
		async address => {
			if (!address) {
				return [];
			}

			try {
				return (await galleryApi.readSelection(slug, address)).pids ?? [];
			} catch {
				// A selection that cannot be read is not worth a message in front of the
				// photographs; the hearts simply start empty.
				return [];
			}
		},
		[slug]
	);

	// On the way in, for an address this browser already holds: a client who picked
	// here last week — or on their phone — finds their hearts already lit. A new
	// address arrives through the prompt, which loads it itself before adding to it.
	useEffect(() => {
		if (status !== "ready" || !email) {
			return;
		}

		let cancelled = false;

		loadSelection(email).then(pids => {
			if (!cancelled) {
				setSelection(pids);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [email, loadSelection, status]);

	// Cookie renewal. One timer, rescheduled whenever a fresh manifest lands.
	useEffect(() => {
		if (status !== "ready" || !state.signedUntil) {
			return;
		}

		const secondsLeft = state.signedUntil - Math.floor(Date.now() / 1000) - REFRESH_MARGIN_SECONDS;
		const delay = Math.max(60, secondsLeft) * 1000;

		const timer = setTimeout(() => {
			galleryApi
				.refresh(slug)
				.then(payload => setState(current => (current.status === "ready" ? { ...current, signedUntil: payload.signedUntil } : current)))
				.catch(() => {});
		}, delay);

		return () => clearTimeout(timer);
	}, [slug, state.signedUntil, status]);

	const unlock = async password => {
		applyManifest(await galleryApi.unlock(slug, password));
	};

	/**
	 * Marks or unmarks a photo. Debounced: hearting a dozen photos in a row is one
	 * write, not a dozen.
	 *
	 * The first heart of all asks who is pressing it. Several people are usually
	 * behind one gallery link — a shoot with three models is three selections — and a
	 * pick that is not attributed to anyone is of no use to the photographer.
	 */
	const toggleFavourite = useCallback(
		pid => {
			if (!email) {
				setPrompt({ intent: "favourite", pid });

				return;
			}

			setSelection(current => {
				const next = togglePid(current, pid);

				if (saveTimerRef.current) {
					clearTimeout(saveTimerRef.current);
				}

				saveTimerRef.current = setTimeout(() => {
					galleryApi.saveSelection(slug, email, next).catch(() => {});
				}, SELECTION_SAVE_DELAY_MS);

				return next;
			});
		},
		[email, slug]
	);

	useEffect(
		() => () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
			}
		},
		[]
	);

	// Memoised for its identity, not its cost: the download handler closes over the
	// list, and a fresh array every render would rebuild every tile's callback.
	const allPhotos = useMemo(() => state.gallery?.photos ?? [], [state.gallery]);
	// Always at least one entry, even for a gallery that has no sets — the API sends
	// the ungrouped photos as a set of their own, so there is nothing to special-case.
	const sets = useMemo(() => state.gallery?.sets ?? [], [state.gallery]);
	// An id the manifest no longer lists — a set deleted while the page was open, or a
	// tab held over from another gallery — falls back to the first tab rather than to
	// an empty gallery.
	const activeSet = (tab.slug === slug ? sets.find(set => set.id === tab.id) : null) ?? sets[0] ?? null;
	const activeId = activeSet?.id ?? null;
	const favourites = useMemo(() => new Set(selection), [selection]);
	// The selection closes the row, after the sets it is drawn from. A tab of its own
	// rather than a filter beside the row: it is another way through the same
	// photographs, and the sets stay in place while it is open.
	const tabs = useMemo(() => [...sets, { id: FAVOURITES_ID, title: "Favoris", favourite: true, count: selection.length }], [selection.length, sets]);
	const activeTabId = favouritesOnly ? FAVOURITES_ID : activeId;
	// A lone tab is a label, not a row — a gallery with no photos yet, where favourites
	// are the only entry — and with no row the grid is nobody's tabpanel.
	const showTabs = tabs.length > 1;
	// The API stamps every photo with the set it was actually placed in, so the split
	// by tab is exact — and a no-op when there is a single one. The favourites view
	// ignores it: a selection spans the gallery, and someone looking for their picks
	// wants all of them, not the ones that happen to sit in the open tab.
	const photos = useMemo(
		() => (favouritesOnly ? allPhotos.filter(photo => favourites.has(photo.pid)) : allPhotos.filter(photo => (photo.setId ?? null) === activeId)),
		[activeId, allPhotos, favourites, favouritesOnly]
	);
	// Each set carries its own switches; the gallery's own cover the ungrouped photos
	// and are the fallback for a manifest that predates sets.
	const galleryDownloads = state.gallery?.downloads ?? DOWNLOADS_OFF;
	const downloads = activeSet?.downloads ?? galleryDownloads;
	// Resolved per photo rather than per tab, because the favourites view puts photos
	// from several sets in one grid: whether this photo may be saved, and whether it
	// comes back full-resolution, is its own set's answer and nobody else's.
	const downloadsByPid = useMemo(() => {
		const bySet = new Map(sets.map(set => [set.id ?? null, set.downloads]));

		return new Map(allPhotos.map(photo => [photo.pid, bySet.get(photo.setId ?? null) ?? galleryDownloads]));
	}, [allPhotos, galleryDownloads, sets]);

	// A favourite may sit in a set whose downloads are off, and the archive route
	// silently drops those — so they are dropped here too, where the count is shown.
	const downloadableSelection = useMemo(() => {
		const open = new Set(sets.filter(set => set.downloads?.enabled).map(set => set.id ?? null));
		const placement = new Map(allPhotos.map(photo => [photo.pid, photo.setId ?? null]));

		return selection.filter(pid => placement.has(pid) && open.has(placement.get(pid)));
	}, [allPhotos, selection, sets]);

	/**
	 * Hands the photo over, having told the photographer who is taking it.
	 *
	 * The notification is awaited rather than fired and forgotten: setting
	 * `location` on the HD path can cancel a request still in flight, and a
	 * download that silently stops being reported is worse than one that starts a
	 * fraction of a second later. A failed notification never blocks the file.
	 */
	const performDownload = useCallback(
		async (pid, address) => {
			await galleryApi.logDownload(slug, pid, address).catch(() => {});

			// Whether the client takes home the full-resolution file. The button is
			// offered either way: with HD off the watermarked web preview is what they
			// get, which is still better than a gallery with no way to keep a photo.
			if (downloadsByPid.get(pid)?.hd) {
				// The API answers 302 to a short-lived signed URL, and the object carries
				// Content-Disposition: attachment, so this downloads without navigating.
				window.location.href = galleryApi.downloadUrl(slug, pid);

				return;
			}

			const index = allPhotos.findIndex(photo => photo.pid === pid);

			if (index === -1) {
				return;
			}

			// Numbered by position rather than by pid: an opaque id makes for a
			// baffling filename in a download folder. Numbered across the whole gallery
			// rather than within the tab, so two sets cannot both produce a "-1".
			saveAs(allPhotos[index].web, `${slug}-${index + 1}.webp`);
		},
		[allPhotos, downloadsByPid, slug]
	);

	// Asked once per browser: a prompt in front of every tile would be intolerable,
	// and the address is only there to name the download.
	const downloadPhoto = useCallback(
		pid => {
			if (email) {
				performDownload(pid, email);

				return;
			}

			setPrompt({ intent: "download", pid });
		},
		[email, performDownload]
	);

	/**
	 * Opens a tab, favourites included.
	 *
	 * The sets are open to everyone; the favourites tab is the one that needs a name to
	 * show anything, so an unknown visitor is asked for theirs and the tab opens once
	 * they answer. Cancelling leaves the set they were on showing.
	 */
	const selectTab = id => {
		// The open lightbox belongs to the list that was showing, and this replaces it.
		setLightboxIndex(null);

		if (id !== FAVOURITES_ID) {
			setFavouritesOnly(false);
			setTab({ slug, id });

			return;
		}

		if (!email) {
			setPrompt({ intent: "filter" });

			return;
		}

		setFavouritesOnly(true);
	};

	/**
	 * The address, and then whatever it was asked for.
	 *
	 * A returning visitor may have picked on another device, so their stored list is
	 * fetched before the new favourite is added to it rather than starting from this
	 * browser's empty one — and the first pick is written straight away instead of
	 * through the debounce, because it is also what tells the photographer that
	 * somebody new has started choosing.
	 */
	const confirmEmail = async address => {
		const asked = prompt;
		setPrompt(null);
		storeVisitorEmail(address);

		if (asked.intent === "download") {
			setEmail(address);
			performDownload(asked.pid, address);

			return;
		}

		const known = await loadSelection(address);
		const next = asked.intent === "favourite" ? togglePid(known, asked.pid) : known;

		setSelection(next);

		if (asked.intent === "favourite") {
			await galleryApi.saveSelection(slug, address, next).catch(() => {});
		} else {
			// The tab that raised the prompt, opening now that it has something to show.
			setFavouritesOnly(true);
		}

		// Last, so that the load this starts cannot answer with a list that predates the
		// pick just written.
		setEmail(address);
	};

	const navigate = useCallback(
		step => {
			setLightboxIndex(current => {
				if (current === null) {
					return current;
				}

				return Math.min(photos.length - 1, Math.max(0, current + step));
			});
		},
		[photos.length]
	);

	if (status === "loading") {
		return (
			<div className='gallery-view gallery-view--centered'>
				<p className='gallery-view__status'>Chargement de la galerie…</p>
			</div>
		);
	}

	if (status === "locked") {
		return (
			<>
				<Seo title={`${state.title || "Galerie privée"} | Ankaa Studio`} description='Galerie privée Ankaa Studio.' path={`/gallery/${slug}`} noIndex />
				<PasswordGate title={state.title} clientName={state.clientName} onUnlock={unlock} />
			</>
		);
	}

	if (status === "gone" || status === "missing" || status === "error") {
		const message =
			status === "gone" ? state.message
			: status === "missing" ? "Cette galerie n’existe pas ou le lien a changé."
			: "Une erreur est survenue. Réessayez dans un instant.";

		return (
			<div className='gallery-view gallery-view--centered'>
				<div className='gallery-view__empty'>
					<h1 className='gallery-view__title'>Galerie indisponible</h1>
					<p className='gallery-view__status'>{message}</p>
					<a className='button-secondary' href='/contact'>
						Contacter le studio
					</a>
				</div>
			</div>
		);
	}

	const { gallery } = state;
	// coverPid is only a hint: it can be absent from an older manifest, so the first
	// photo stands in rather than leaving the cover imageless. Taken from the whole
	// gallery, not the open tab — the cover belongs to the gallery, and one that
	// changed as the client switched tabs underneath it would be a glitch.
	const cover = allPhotos.find(photo => photo.pid === gallery.coverPid) ?? allPhotos[0] ?? null;

	return (
		<div className='gallery-view'>
			<Seo title={`${gallery.title} | Ankaa Studio`} description={`Galerie privée : ${gallery.title}.`} path={`/gallery/${slug}`} noIndex />

			<GalleryCover
				photo={cover}
				// The API only sends coverImage once the unmarked derivative it points
				// at exists; until then the marked preview opens the gallery.
				src={gallery.coverImage ?? cover?.web}
				eyebrow='Ankaa Studio'
				title={gallery.title}
				meta={[gallery.clientName, formatDate(gallery.shootDate)].filter(Boolean).join(" · ")}
				notice={gallery.expiresAt ? `Disponible jusqu’au ${formatDate(gallery.expiresAt)}.` : ""}
				photosId={PHOTOS_ID}
			/>

			<main id={PHOTOS_ID} className='gallery-view__body'>
				<div className='gallery-view__bar'>
					<p className='gallery-view__eyebrow'>ANKAA STUDIO</p>

					{showTabs ?
						<SetTabs tabs={tabs} activeId={activeTabId} panelId={PANEL_ID} sectionId={PHOTOS_ID} onSelect={selectTab} />
					:	null}

					<DownloadPanel
						slug={slug}
						// In the favourites view the grid spans every set, so "tout télécharger"
						// has no one set to mean; the selection archive is the batch download
						// that still says something there.
						downloads={favouritesOnly ? DOWNLOADS_OFF : downloads}
						photoCount={photos.length}
						selection={downloadableSelection}
						// Scoped to the open set only when there is more than one of them: a
						// gallery with a single set is the whole gallery, and saying so keeps
						// the photographer's feed reading "toute la galerie" as before.
						setId={sets.length > 1 ? activeId : undefined}
						setTitle={sets.length > 1 ? activeSet?.title : ""}
					/>
				</div>

				{photos.length === 0 ?
					// Still the tabs' panel, so that the favourites tab — which anyone can open
					// before picking anything — is never a tab pointing at nothing.
					<p className='gallery-view__status gallery-view__status--empty' id={PANEL_ID} role={showTabs ? "tabpanel" : undefined} aria-labelledby={showTabs ? `set-tab-${activeTabId ?? "default"}` : undefined}>
						{favouritesOnly ? "Vous n’avez pas encore de favori. Touchez le cœur d’une photo pour la garder de côté." : "Les photos arrivent bientôt."}
					</p>
				:	<div className='photo-grid' id={PANEL_ID} role={showTabs ? "tabpanel" : undefined} aria-labelledby={showTabs ? `set-tab-${activeTabId ?? "default"}` : undefined}>
						{photos.map((photo, index) => (
							<PhotoTile
								key={photo.pid}
								photo={photo}
								index={index}
								isFavourite={favourites.has(photo.pid)}
								showFavourites
								// Per photo, not per tab: the favourites view mixes sets, and each
								// one decides for its own photos whether they may be saved.
								showDownload={Boolean(downloadsByPid.get(photo.pid)?.enabled)}
								onOpen={setLightboxIndex}
								onToggleFavourite={toggleFavourite}
								onDownload={downloadPhoto}
							/>
						))}
					</div>
				}
			</main>

			{/* The index belongs to the list that was on screen when the tile was opened;
			    a route change can outlive it, so the photo has to still be there. */}
			{lightboxIndex !== null && photos[lightboxIndex] ?
				<Lightbox
					photos={photos}
					index={lightboxIndex}
					downloads={downloadsByPid.get(photos[lightboxIndex].pid) ?? DOWNLOADS_OFF}
					isFavourite={favourites.has(photos[lightboxIndex]?.pid)}
					showFavourites
					onClose={() => setLightboxIndex(null)}
					onNavigate={navigate}
					onToggleFavourite={toggleFavourite}
					onDownload={downloadPhoto}
				/>
			:	null}

			{/* One prompt for all three: the address is the same one, asked once, and a
			    second dialog of its own would only be a second thing to dismiss. */}
			{prompt ?
				<EmailPrompt
					title={PROMPT_COPY[prompt.intent].title}
					message={PROMPT_COPY[prompt.intent].message}
					submitLabel={PROMPT_COPY[prompt.intent].submitLabel}
					onSubmit={confirmEmail}
					onCancel={() => setPrompt(null)}
				/>
			:	null}
		</div>
	);
}
