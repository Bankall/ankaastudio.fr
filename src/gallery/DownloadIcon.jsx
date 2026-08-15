/**
 * The download marker: an arrow dropping into a tray.
 *
 * Inline and stroked in `currentColor` for the same reasons as [HeartIcon] — one
 * property styles it on a tile and in the lightbox bar, at no extra request.
 */
export function DownloadIcon() {
	return (
		<svg className='download-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
			<path
				d='M12 3.5v11m0 0 4.3-4.3M12 14.5l-4.3-4.3M4 16.8v1.9A2.3 2.3 0 0 0 6.3 21h11.4a2.3 2.3 0 0 0 2.3-2.3v-1.9'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.7'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}
