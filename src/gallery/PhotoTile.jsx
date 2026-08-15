import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "./HeartIcon.jsx";

// Fetching starts a little before the tile reaches the viewport, so the photo is
// usually decoded by the time it is actually on screen and the fade reads as a
// gentle reveal rather than a wait. Small enough that a 200-photo gallery still
// only requests the handful of images the visitor is looking at.
const PRELOAD_MARGIN = "300px 0px";

/**
 * One photo in the masonry grid.
 *
 * The LQIP is a ~200 byte WebP inlined in the manifest, so the blur-up placeholder
 * costs no request and the layout never jumps: the aspect ratio is known before
 * anything is fetched.
 *
 * The full image is only mounted once the tile intersects the viewport. Native
 * `loading='lazy'` is kept as a second line of defence, but browsers apply it with
 * a very generous threshold — on a long gallery that still means dozens of signed
 * requests the client never sees.
 */
export function PhotoTile({ photo, index, isFavourite, showFavourites, onOpen, onToggleFavourite }) {
	const figureRef = useRef(null);
	const imageRef = useRef(null);
	// No observer (old browser, jsdom) means no lazy loading: show everything.
	const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (visible || !figureRef.current) {
			return;
		}

		const observer = new IntersectionObserver(
			entries => {
				if (entries.some(entry => entry.isIntersecting)) {
					// One-way switch: a photo scrolled back out stays loaded.
					setVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: PRELOAD_MARGIN }
		);

		observer.observe(figureRef.current);

		return () => observer.disconnect();
	}, [visible]);

	// A cached image can finish decoding before React attaches onLoad, in which case
	// the event never fires and the tile would stay transparent for good.
	useEffect(() => {
		if (visible && imageRef.current?.complete) {
			setLoaded(true);
		}
	}, [visible]);

	return (
		<figure ref={figureRef} className={`photo-tile${loaded ? " is-loaded" : ""}`} style={{ aspectRatio: `${photo.w} / ${photo.h}` }}>
			<button type='button' className='photo-tile__button' onClick={() => onOpen(index)} aria-label={photo.caption || `Ouvrir la photo ${index + 1}`}>
				{photo.lqip ?
					<img className='photo-tile__placeholder' src={photo.lqip} alt='' aria-hidden='true' />
				:	null}
				{visible ?
					<img
						ref={imageRef}
						className='photo-tile__image'
						src={photo.thumb}
						srcSet={`${photo.thumb} 600w, ${photo.web} 2048w`}
						// Tracks the full-bleed column counts below, so the browser never
						// picks the 2048px derivative for a tile a fifth of the screen wide.
						sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1499px) 34vw, (max-width: 2099px) 25vw, 20vw'
						alt={photo.caption || `Photo ${index + 1}`}
						loading='lazy'
						decoding='async'
						// Right-click save is trivially bypassed, but the watermarked preview
						// is the real protection; this only removes the obvious temptation.
						onContextMenu={event => event.preventDefault()}
						draggable={false}
						onLoad={() => setLoaded(true)}
					/>
				:	null}
			</button>

			{showFavourites ?
				<button
					type='button'
					className={`photo-tile__favourite${isFavourite ? " is-active" : ""}`}
					onClick={() => onToggleFavourite(photo.pid)}
					aria-pressed={isFavourite}
					aria-label={isFavourite ? "Retirer de la sélection" : "Ajouter à la sélection"}
				>
					<HeartIcon filled={isFavourite} />
				</button>
			:	null}

			{photo.caption ?
				<figcaption className='photo-tile__caption'>{photo.caption}</figcaption>
			:	null}
		</figure>
	);
}
