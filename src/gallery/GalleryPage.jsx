import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { ApiError, galleryApi } from "../utils/galleryApi.js";
import { DownloadPanel } from "./DownloadPanel.jsx";
import { readDownloadEmail, storeDownloadEmail } from "./downloadEmail.js";
import { EmailPrompt } from "./EmailPrompt.jsx";
import { GalleryCover } from "./GalleryCover.jsx";
import { Lightbox } from "./Lightbox.jsx";
import { PasswordGate } from "./PasswordGate.jsx";
import { PhotoTile } from "./PhotoTile.jsx";
import { SetTabs } from "./SetTabs.jsx";

// Signed viewing cookies last 12h; renew well before that so a client who leaves
// the tab open overnight never meets a wall of broken images.
const REFRESH_MARGIN_SECONDS = 30 * 60;
const SELECTION_SAVE_DELAY_MS = 800;
// What the cover's scroll cue aims at.
const PHOTOS_ID = "photos";
// The grid, as the tabs' panel.
const PANEL_ID = "gallery-set-panel";

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
	// The photo waiting on an email address before it downloads.
	const [pendingPid, setPendingPid] = useState(null);
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

	// Favourites are stored server-side so they survive a device change and so the
	// photographer can read the client's picks.
	useEffect(() => {
		if (status !== "ready") {
			return;
		}

		let cancelled = false;

		galleryApi
			.readSelection(slug)
			.then(payload => {
				if (!cancelled) {
					setSelection(payload.pids ?? []);
				}
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [slug, status]);

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

	/** Debounced: hearting a dozen photos in a row is one write, not a dozen. */
	const toggleFavourite = useCallback(
		pid => {
			setSelection(current => {
				const next = current.includes(pid) ? current.filter(candidate => candidate !== pid) : [...current, pid];

				if (saveTimerRef.current) {
					clearTimeout(saveTimerRef.current);
				}

				saveTimerRef.current = setTimeout(() => {
					galleryApi.saveSelection(slug, next).catch(() => {});
				}, SELECTION_SAVE_DELAY_MS);

				return next;
			});
		},
		[slug]
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
	// The API stamps every photo with the set it was actually placed in, so this is an
	// exact split — and a no-op when there is a single tab.
	const photos = useMemo(() => allPhotos.filter(photo => (photo.setId ?? null) === activeId), [allPhotos, activeId]);
	const favourites = useMemo(() => new Set(selection), [selection]);
	// Each set carries its own switches; the gallery's own cover the ungrouped photos
	// and are the fallback for a manifest that predates sets.
	const downloads = activeSet?.downloads ?? state.gallery?.downloads ?? { enabled: false, hd: false, zip: false };
	// Whether the client takes home the full-resolution file. The button is offered
	// either way: with HD off the watermarked web preview is what they get, which is
	// still better than a gallery with no way to keep a photo at all.
	const hd = Boolean(downloads.hd);

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

			if (hd) {
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
		[allPhotos, hd, slug]
	);

	// Asked once per browser: a prompt in front of every tile would be intolerable,
	// and the address is only there to name the download.
	const downloadPhoto = useCallback(
		pid => {
			const known = readDownloadEmail();

			if (known) {
				performDownload(pid, known);

				return;
			}

			setPendingPid(pid);
		},
		[performDownload]
	);

	const confirmPhotoEmail = address => {
		const pid = pendingPid;
		setPendingPid(null);
		storeDownloadEmail(address);
		performDownload(pid, address);
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
					<span>
						<p className='gallery-view__eyebrow'>ANKAA STUDIO</p>

						<SetTabs
							sets={sets}
							activeId={activeId}
							panelId={PANEL_ID}
							// The open lightbox belongs to the tab that was showing; keeping its
							// index would land on an unrelated photo, or on none at all.
							onSelect={id => {
								setTab({ slug, id });
								setLightboxIndex(null);
							}}
						/>
					</span>

					<DownloadPanel
						slug={slug}
						downloads={downloads}
						photoCount={photos.length}
						selection={downloadableSelection}
						// Scoped to the open tab only when there is more than one: a single
						// tab is the whole gallery, and saying so keeps the photographer's
						// feed reading "toute la galerie" as before.
						setId={sets.length > 1 ? activeId : undefined}
						setTitle={sets.length > 1 ? activeSet?.title : ""}
					/>
				</div>

				{photos.length === 0 ?
					<p className='gallery-view__status gallery-view__status--empty'>Les photos arrivent bientôt.</p>
				:	<div className='photo-grid' id={PANEL_ID} role={sets.length > 1 ? "tabpanel" : undefined} aria-labelledby={sets.length > 1 ? `set-tab-${activeId ?? "default"}` : undefined}>
						{photos.map((photo, index) => (
							<PhotoTile
								key={photo.pid}
								photo={photo}
								index={index}
								isFavourite={favourites.has(photo.pid)}
								showFavourites
								showDownload={downloads.enabled}
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
					downloads={downloads}
					isFavourite={favourites.has(photos[lightboxIndex]?.pid)}
					showFavourites
					onClose={() => setLightboxIndex(null)}
					onNavigate={navigate}
					onToggleFavourite={toggleFavourite}
					onDownload={downloadPhoto}
				/>
			:	null}

			{pendingPid ?
				<EmailPrompt
					title='Avant de télécharger'
					message='Indiquez votre email pour télécharger cette photo. Le téléchargement démarre aussitôt.'
					submitLabel='Télécharger'
					onSubmit={confirmPhotoEmail}
					onCancel={() => setPendingPid(null)}
				/>
			:	null}
		</div>
	);
}
