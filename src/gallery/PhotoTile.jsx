import { useState } from "react";

/**
 * One photo in the masonry grid.
 *
 * The LQIP is a ~200 byte WebP inlined in the manifest, so the blur-up placeholder
 * costs no request and the layout never jumps: the aspect ratio is known before
 * anything is fetched.
 */
export function PhotoTile({ photo, index, isFavourite, showFavourites, onOpen, onToggleFavourite }) {
	const [loaded, setLoaded] = useState(false);

	return (
		<figure className={`photo-tile${loaded ? " is-loaded" : ""}`} style={{ aspectRatio: `${photo.w} / ${photo.h}` }}>
			<button type='button' className='photo-tile__button' onClick={() => onOpen(index)} aria-label={photo.caption || `Ouvrir la photo ${index + 1}`}>
				{photo.lqip ?
					<img className='photo-tile__placeholder' src={photo.lqip} alt='' aria-hidden='true' />
				:	null}
				<img
					className='photo-tile__image'
					src={photo.thumb}
					srcSet={`${photo.thumb} 600w, ${photo.web} 2048w`}
					sizes='(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 30vw'
					alt={photo.caption || `Photo ${index + 1}`}
					loading='lazy'
					decoding='async'
					// Right-click save is trivially bypassed, but the watermarked preview
					// is the real protection; this only removes the obvious temptation.
					onContextMenu={event => event.preventDefault()}
					draggable={false}
					onLoad={() => setLoaded(true)}
				/>
			</button>

			{showFavourites ?
				<button
					type='button'
					className={`photo-tile__favourite${isFavourite ? " is-active" : ""}`}
					onClick={() => onToggleFavourite(photo.pid)}
					aria-pressed={isFavourite}
					aria-label={isFavourite ? "Retirer de la sélection" : "Ajouter à la sélection"}
				>
					{isFavourite ? "★" : "☆"}
				</button>
			:	null}

			{photo.caption ?
				<figcaption className='photo-tile__caption'>{photo.caption}</figcaption>
			:	null}
		</figure>
	);
}
