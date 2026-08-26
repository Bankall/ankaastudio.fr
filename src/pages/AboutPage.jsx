// import { Link } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
// import { aboutHighlights, siteConfig } from "../data/siteData.js";
import logo from "../assets/media/logo-one-line.png";

export function AboutPage() {
	return (
		<>
			<Seo title='Qui suis-je ? | Ankaa Studio' description='À propos d’Ankaa Studio, photographe canin basée dans la Marne, avec une approche artistique, douce et complice.' path='/a-propos' noIndex />

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'>
						<h1 className='page-hero__title'>
							<img src={logo} alt='Ankaa Studio' className='page-hero__logo' />
						</h1>
						{/* Contenu de la page en cours de rédaction.
						<span className='eyebrow'>À propos</span>
						<h1 className='page-hero__title'>Une future page dédiée à l’histoire et à la démarche du studio</h1>
						<div className='page-hero__intro'>
							<p className='page-hero__description'>Cette page est déjà prévue dans l’architecture pour accueillir un récit de marque, des coulisses et une présentation plus détaillée de votre approche photographique.</p>
						</div>
						<div className='page-hero__badge'>
							<div>
								<strong>{siteConfig.name}</strong>
								<span>Direction artistique, douceur et lien complice</span>
							</div>
						</div>
						*/}
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container about-section'>
					<SectionHeading eyebrow='En construction' title='Prochainement disponible' description='Cette page est en cours de préparation. Revenez très bientôt pour la découvrir.' />

					{/* Contenu de la page en cours de rédaction.
					<SectionHeading eyebrow='Bientôt' title='Une page prête pour votre storytelling de marque' description='Le contenu ci-dessous sert d’espace évolutif pour la future version de la page À propos.' />

					<div className='about-grid'>
						{aboutHighlights.map((highlight, index) => (
							<article className='about-card' key={highlight}>
								<span className='about-card__eyebrow'>Point {String(index + 1).padStart(2, "0")}</span>
								<h2 className='about-card__title'>Intention de marque</h2>
								<p className='about-card__text'>{highlight}</p>
							</article>
						))}
					</div>

					<div className='cta-banner'>
						<div>
							<p className='eyebrow'>Prêt à évoluer</p>
							<h2 className='cta-banner__title'>La structure est déjà là pour raconter votre parcours et vos valeurs.</h2>
						</div>
						<p className='cta-banner__text'>Ajoutez ici vos repères, votre parcours, vos certifications, votre zone d’intervention et votre manière d’accompagner les clients.</p>
						<div className='hero__actions'>
							<Link className='button' to='/contact'>
								Parler du projet
							</Link>
							<Link className='button-secondary' to='/portfolio'>
								Voir le portfolio
							</Link>
						</div>
					</div>
					*/}
				</div>
			</section>
		</>
	);
}
