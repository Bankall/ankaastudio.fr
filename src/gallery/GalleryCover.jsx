import { useEffect, useRef, useState } from "react";

/**
 * The opening image of a gallery: the shoot's own cover photograph filling the
 * viewport, the title set over it, and a cue pointing at the grid below.
 *
 * This is the one photo worth loading eagerly — it is the first thing the client
 * sees, so it skips the lazy gate the grid tiles use and asks for priority, while
 * its LQIP holds the frame so the title never lands on a bare background.
 *
 * A gallery whose photos are all still being derived has no cover to show; the
 * section then falls back to type on the page's own dark ground.
 */
export function GalleryCover({ photo, eyebrow, title, meta, notice, photosId }) {
	const imageRef = useRef(null);
	const [loaded, setLoaded] = useState(false);

	// A cached cover can finish decoding before React attaches onLoad, in which case
	// the event never fires and the full image would stay hidden behind its LQIP.
	useEffect(() => {
		if (imageRef.current?.complete) {
			setLoaded(true);
		}
	}, []);

	return (
		<header className={`gallery-cover${photo ? "" : " gallery-cover--bare"}${loaded ? " is-loaded" : ""}`}>
			{photo ?
				<div className='gallery-cover__media' aria-hidden='true'>
					{photo.lqip ?
						<img className='gallery-cover__placeholder' src={photo.lqip} alt='' />
					:	null}
					<img
						ref={imageRef}
						className='gallery-cover__image'
						src={photo.web}
						alt=''
						fetchPriority='high'
						decoding='async'
						onContextMenu={event => event.preventDefault()}
						draggable={false}
						onLoad={() => setLoaded(true)}
					/>
				</div>
			:	null}

			<div className='gallery-cover__content'>
				<span className='gallery-cover__eyebrow'>{eyebrow}</span>
				<h1 className='gallery-cover__title'>{title}</h1>

				{meta ?
					<p className='gallery-cover__meta'>{meta}</p>
				:	null}

				{notice ?
					<p className='gallery-cover__notice'>{notice}</p>
				:	null}
			</div>

			{/* An anchor, not a scroll handler: it works before hydration, it is
			    keyboard-reachable for free, and html{scroll-behavior:smooth} already
			    makes the jump a glide. */}
			<a className='gallery-cover__scroll' href={`#${photosId}`} aria-label='Voir les photos'>
				<svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
					<path d='M5 9l7 7 7-7' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' />
				</svg>
			</a>
		</header>
	);
}
