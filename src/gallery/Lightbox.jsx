import { useEffect, useRef } from "react";
import { HeartIcon } from "./HeartIcon.jsx";

/**
 * Fullscreen viewer with keyboard navigation.
 *
 * Neighbours are preloaded as soon as the current photo settles, which is what
 * makes arrow-key browsing feel instant on a 2048px web derivative.
 */
export function Lightbox({ photos, index, downloads, isFavourite, showFavourites, onClose, onNavigate, onToggleFavourite, onDownload }) {
	const closeRef = useRef(null);
	const photo = photos[index];

	useEffect(() => {
		const handleKey = event => {
			if (event.key === "Escape") {
				onClose();
			} else if (event.key === "ArrowRight") {
				onNavigate(1);
			} else if (event.key === "ArrowLeft") {
				onNavigate(-1);
			} else if (event.key === "f" && showFavourites) {
				onToggleFavourite(photo.pid);
			}
		};

		window.addEventListener("keydown", handleKey);

		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose, onNavigate, onToggleFavourite, photo, showFavourites]);

	// Scroll-lock the page behind the overlay, restoring whatever was set before.
	useEffect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previous;
		};
	}, []);

	useEffect(() => {
		closeRef.current?.focus();
	}, []);

	useEffect(() => {
		// Warm the two most likely next requests. new Image() is enough — the browser
		// cache is what the <img> below will hit.
		for (const offset of [1, -1]) {
			const neighbour = photos[index + offset];

			if (neighbour) {
				const preload = new Image();
				preload.src = neighbour.web;
			}
		}
	}, [index, photos]);

	if (!photo) {
		return null;
	}

	return (
		<div className='lightbox' role='dialog' aria-modal='true' aria-label={photo.caption || `Photo ${index + 1} sur ${photos.length}`}>
			<div className='lightbox__bar'>
				<span className='lightbox__counter'>
					{index + 1} / {photos.length}
				</span>

				<div className='lightbox__actions'>
					{showFavourites ?
						<button
							type='button'
							className={`lightbox__action lightbox__action--favourite${isFavourite ? " is-active" : ""}`}
							onClick={() => onToggleFavourite(photo.pid)}
							aria-pressed={isFavourite}
						>
							<HeartIcon filled={isFavourite} />
							{isFavourite ? "Sélectionnée" : "Sélectionner"}
						</button>
					:	null}

					{downloads.hd ?
						<button type='button' className='lightbox__action' onClick={() => onDownload(photo.pid)}>
							Télécharger
						</button>
					:	null}

					<button ref={closeRef} type='button' className='lightbox__action lightbox__close' onClick={onClose} aria-label='Fermer'>
						×
					</button>
				</div>
			</div>

			<button type='button' className='lightbox__nav lightbox__nav--prev' onClick={() => onNavigate(-1)} aria-label='Photo précédente' disabled={index === 0}>
				‹
			</button>

			<div className='lightbox__stage'>
				<img className='lightbox__image' src={photo.web} alt={photo.caption || `Photo ${index + 1}`} onContextMenu={event => event.preventDefault()} draggable={false} />
			</div>

			<button type='button' className='lightbox__nav lightbox__nav--next' onClick={() => onNavigate(1)} aria-label='Photo suivante' disabled={index === photos.length - 1}>
				›
			</button>

			{photo.caption ?
				<p className='lightbox__caption'>{photo.caption}</p>
			:	null}
		</div>
	);
}
