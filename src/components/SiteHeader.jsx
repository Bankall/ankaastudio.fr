import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { navigation } from '../data/siteData.js';

export function SiteHeader() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);

	useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > 50);
		};

		handleScroll();
		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	return (
		<header className={`site-header ${isScrolled ? 'scrolled' : ''}`}>
			<div className='container site-header__inner'>
				<Link className='button site-header__cta' to='/contact' onClick={() => setIsMenuOpen(false)}>
					Réserver une séance
				</Link>

				<nav className={`site-nav ${isMenuOpen ? 'is-open' : ''}`} id='primary-navigation' aria-label='Navigation principale'>
					{navigation.map((item) => (
						<NavLink key={item.href} className='site-nav__link' to={item.href} onClick={() => setIsMenuOpen(false)}>
							{item.label}
						</NavLink>
					))}
				</nav>

				<button type='button' className={`menu-toggle ${isMenuOpen ? 'is-open' : ''}`} aria-expanded={isMenuOpen} aria-controls='primary-navigation' onClick={() => setIsMenuOpen((currentValue) => !currentValue)}>
					<span className='menu-toggle__lines'>
						<span />
					</span>
					<span className='visually-hidden'>Ouvrir le menu</span>
				</button>
			</div>
		</header>
	);
}
