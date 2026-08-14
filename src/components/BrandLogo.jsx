export function BrandLogo() {
	return (
		<svg className='brand__mark' viewBox='0 0 64 64' aria-hidden='true' focusable='false'>
			<defs>
				<linearGradient id='logoGradient' x1='0%' x2='100%' y1='0%' y2='100%'>
					<stop offset='0%' stopColor='#ffffff' />
					<stop offset='100%' stopColor='#d8c1a4' />
				</linearGradient>
			</defs>
			<rect x='0.5' y='0.5' width='63' height='63' rx='18' fill='url(#logoGradient)' stroke='rgba(93,66,45,0.16)' />
			<path d='M18 39.5C22 24 28 18 34.8 18c8.2 0 14.2 6.4 14.2 14.9 0 8.1-5.8 13.9-13.7 13.9-5.6 0-10.4-2.8-14.3-8.3L18 39.5Z' fill='none' stroke='#5d422d' strokeWidth='3.2' strokeLinecap='round' strokeLinejoin='round' />
			<circle cx='37.2' cy='28.3' r='2.1' fill='#5d422d' />
			<path d='M25 46.5h16' stroke='#5d422d' strokeWidth='3' strokeLinecap='round' />
		</svg>
	);
}
