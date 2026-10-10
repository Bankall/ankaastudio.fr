import { useState } from "react";
import { Image } from "../components/Image.jsx";

/**
 * The opening image of a gallery: the shoot's own cover photograph filling the
 * viewport, the title set over it, and a cue pointing at the grid below.
 *
 * This is the one photo worth loading eagerly — it is the first thing the client
 * sees, so it skips the lazy gate the grid tiles use and asks for priority, while
 * its LQIP holds the frame so the title never lands on a bare background. It also
 * takes its `src` from the caller rather than from the photo, because the opening
 * image is served unmarked while the same photo's grid tile is not.
 *
 * A gallery whose photos are all still being derived has no cover to show; the
 * section then falls back to type on the page's own dark ground.
 */
export function GalleryCover({ photo, src, eyebrow, title, meta, notice, photosId }) {
	// The header needs the reveal too, not just the photo: it is what cross-fades
	// the LQIP out from behind it.
	const [loaded, setLoaded] = useState(false);

	return (
		<header className={`gallery-cover${photo ? "" : " gallery-cover--bare"}${loaded ? " is-loaded" : ""}`}>
			{photo ?
				<div className='gallery-cover__media' aria-hidden='true'>
					{photo.lqip ?
						<img className='gallery-cover__placeholder' src={photo.lqip} alt='' />
					:	null}
					<Image
						className='gallery-cover__image'
						src={src ?? photo.web}
						alt=''
						fetchPriority='high'
						decoding='async'
						onContextMenu={event => event.preventDefault()}
						draggable={false}
						// No approach gate and no stagger: this is the one photo worth
						// fetching eagerly, it is alone on screen with nothing to fall out
						// of step with, and it waits only for its own pixels so the title
						// never lands on a bare background.
						revealRatio={0}
						stagger={0}
						waitForLoad
						// An expired signed URL leaves the LQIP holding the frame, so the
						// title still has its backdrop.
						revealOnError={false}
						onReveal={() => setLoaded(true)}
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
