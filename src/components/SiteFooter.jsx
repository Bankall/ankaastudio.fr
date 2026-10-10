import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo.jsx";
import { navigation, socialLinks, siteConfig } from "../data/siteData.js";

export function SiteFooter() {
	return (
		<footer className='site-footer'>
			<div className='container'>
				<div className='site-footer__grid'>
					<div>
						<Link className='brand' to='/'>
							<BrandLogo />
							<span className='brand__copy'>
								<span className='brand__name'>Ankaa Studio</span>
							</span>
						</Link>
						<p className='site-footer__text'>Photographe canin basée dans la Marne, au service des chiens, des familles, des couples et des professionnels du monde canin.</p>
					</div>

					<div>
						<p className='footer-kicker'>Navigation</p>
						<ul className='footer-links'>
							{navigation.map(item => (
								<li key={item.href}>
									<Link to={item.href}>{item.label}</Link>
								</li>
							))}
						</ul>
					</div>

					<div>
						<p className='footer-kicker'>Contact</p>
						<ul className='footer-meta'>
							<li>
								<a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
							</li>
							<li>{siteConfig.regionLabel}</li>
							{socialLinks.map(social => (
								<li key={social.label}>
									<a href={social.href} target='_blank' rel='noreferrer'>
										{social.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className='site-footer__bottom'>
					<span>© {new Date().getFullYear()} Ankaa Studio</span>
				</div>
			</div>
		</footer>
	);
}
