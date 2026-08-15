import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { ApiError, galleryApi } from "../utils/galleryApi.js";
import { DownloadPanel } from "./DownloadPanel.jsx";
import { GalleryCover } from "./GalleryCover.jsx";
import { Lightbox } from "./Lightbox.jsx";
import { PasswordGate } from "./PasswordGate.jsx";
import { PhotoTile } from "./PhotoTile.jsx";

// Signed viewing cookies last 12h; renew well before that so a client who leaves
// the tab open overnight never meets a wall of broken images.
const REFRESH_MARGIN_SECONDS = 30 * 60;
const SELECTION_SAVE_DELAY_MS = 800;
// What the cover's scroll cue aims at.
const PHOTOS_ID = "photos";

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
	const photos = useMemo(() => state.gallery?.photos ?? [], [state.gallery]);
	const favourites = useMemo(() => new Set(selection), [selection]);
	// Whether the client takes home the full-resolution file. The button is offered
	// either way: with HD off the watermarked web preview is what they get, which is
	// still better than a gallery with no way to keep a photo at all.
	const hd = Boolean(state.gallery?.downloads?.hd);

	const downloadPhoto = useCallback(
		pid => {
			if (hd) {
				// The API answers 302 to a short-lived signed URL, and the object carries
				// Content-Disposition: attachment, so this downloads without navigating.
				window.location.href = galleryApi.downloadUrl(slug, pid);

				return;
			}

			const index = photos.findIndex(photo => photo.pid === pid);

			if (index === -1) {
				return;
			}

			// Numbered by position rather than by pid: an opaque id makes for a
			// baffling filename in a download folder.
			saveAs(photos[index].web, `${slug}-${index + 1}.webp`);
		},
		[hd, photos, slug]
	);

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
	// photo stands in rather than leaving the cover imageless.
	const cover = photos.find(photo => photo.pid === gallery.coverPid) ?? photos[0] ?? null;

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
					<p className='gallery-view__count'>
						{photos.length} photo{photos.length > 1 ? "s" : ""}
					</p>

					<DownloadPanel slug={slug} downloads={gallery.downloads} photoCount={photos.length} selection={selection} />
				</div>

				{photos.length === 0 ?
					<p className='gallery-view__status gallery-view__status--empty'>Les photos arrivent bientôt.</p>
				:	<div className='photo-grid'>
						{photos.map((photo, index) => (
							<PhotoTile
								key={photo.pid}
								photo={photo}
								index={index}
								isFavourite={favourites.has(photo.pid)}
								showFavourites
								showDownload={gallery.downloads.enabled}
								onOpen={setLightboxIndex}
								onToggleFavourite={toggleFavourite}
								onDownload={downloadPhoto}
							/>
						))}
					</div>
				}
			</main>

			{lightboxIndex !== null ?
				<Lightbox
					photos={photos}
					index={lightboxIndex}
					downloads={gallery.downloads}
					isFavourite={favourites.has(photos[lightboxIndex]?.pid)}
					showFavourites
					onClose={() => setLightboxIndex(null)}
					onNavigate={navigate}
					onToggleFavourite={toggleFavourite}
					onDownload={downloadPhoto}
				/>
			:	null}
		</div>
	);
}
