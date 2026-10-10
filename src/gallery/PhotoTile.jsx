import { useRef, useState } from "react";
import { Image } from "../components/Image.jsx";
import { DownloadIcon } from "./DownloadIcon.jsx";
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
 * The photo itself is an Image, which is what holds the request back until the
 * tile is approached and the fade back until the pixels land. Native
 * `loading='lazy'` is kept as a second line of defence, but browsers apply it with
 * a very generous threshold — on a long gallery that still means dozens of signed
 * requests the client never sees.
 */
export function PhotoTile({ photo, index, isFavourite, showFavourites, showDownload, fullResTiles = false, onOpen, onToggleFavourite, onDownload }) {
	const figureRef = useRef(null);
	// The tile needs the reveal too, not just the photo: it is what cross-fades
	// the placeholder out from behind it.
	const [loaded, setLoaded] = useState(false);

	return (
		<figure
			ref={figureRef}
			// is-picked keeps the scrim lit for a photo whose heart stays on screen
			// after the pointer leaves.
			className={`photo-tile${loaded ? " is-loaded" : ""}${isFavourite ? " is-picked" : ""}`}
			style={{ aspectRatio: `${photo.w} / ${photo.h}` }}
		>
			<button type='button' className='photo-tile__button' onClick={() => onOpen(index)} aria-label={photo.caption || `Ouvrir la photo ${index + 1}`}>
				{photo.lqip ?
					<img className='photo-tile__placeholder' src={photo.lqip} alt='' aria-hidden='true' />
				:	null}
				<Image
					className='photo-tile__image'
					src={fullResTiles ? photo.web : photo.thumb}
					// Under fullResTiles the 2048px file is the whole point, so there is no
					// set to choose from: offering the 600px one as a candidate would let the
					// browser go back to it on the narrow screens where it is cheapest —
					// which is exactly the gallery this setting is turned on for.
					srcSet={fullResTiles ? undefined : `${photo.thumb} 600w, ${photo.web} 2048w`}
					// Tracks the full-bleed column counts below, so the browser never
					// picks the 2048px derivative for a tile a fifth of the screen wide.
					sizes={fullResTiles ? undefined : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1499px) 34vw, (max-width: 2099px) 25vw, 20vw"}
					alt={photo.caption || `Photo ${index + 1}`}
					loading='lazy'
					decoding='async'
					// Right-click save is trivially bypassed, but the watermarked preview
					// is the real protection; this only removes the obvious temptation.
					onContextMenu={event => event.preventDefault()}
					draggable={false}
					// The figure holds the tile's space while the photo is still unmounted,
					// so it is what the approach is measured against.
					frameRef={figureRef}
					preloadMargin={PRELOAD_MARGIN}
					// No scroll reveal and no stagger here: the placeholder underneath is
					// cross-faded on a hand-tuned delay, which a random offset would pull
					// apart, and the blur-up should be over before the visitor arrives
					// rather than performed in front of them.
					revealRatio={0}
					stagger={0}
					waitForLoad
					// A signed URL that has expired leaves the blur in place rather than
					// a row of broken-image marks across a client's gallery.
					revealOnError={false}
					onReveal={() => setLoaded(true)}
				/>
			</button>

			{showFavourites || showDownload ?
				<>
					<div className='photo-tile__actions'>
						{showDownload ?
							<button
								type='button'
								className='photo-tile__action photo-tile__action--download'
								onClick={() => onDownload(photo.pid)}
								aria-label={`Télécharger la photo ${index + 1}`}
							>
								<DownloadIcon />
							</button>
						:	null}

						{showFavourites ?
							<button
								type='button'
								className={`photo-tile__action photo-tile__action--favourite${isFavourite ? " is-active" : ""}`}
								onClick={() => onToggleFavourite(photo.pid)}
								aria-pressed={isFavourite}
								aria-label={isFavourite ? "Retirer de la sélection" : "Ajouter à la sélection"}
							>
								<HeartIcon filled={isFavourite} />
							</button>
						:	null}
					</div>

					<span className='photo-tile__scrim' aria-hidden='true' />
				</>
			:	null}

			{photo.caption ?
				<figcaption className='photo-tile__caption'>{photo.caption}</figcaption>
			:	null}
		</figure>
	);
}
