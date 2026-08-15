/**
 * The favourite marker, outlined until the photo is picked and solid once it is.
 *
 * Inline rather than a font glyph or an image: it inherits `currentColor`, so the
 * tile chip and the lightbox bar — light and dark — style it with one property,
 * and it costs no extra request on a page that is already all images.
 */
export function HeartIcon({ filled = false }) {
	return (
		<svg className='heart-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
			<path
				d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z'
				fill={filled ? "currentColor" : "none"}
				stroke='currentColor'
				strokeWidth='1.7'
				strokeLinejoin='round'
			/>
		</svg>
	);
}
