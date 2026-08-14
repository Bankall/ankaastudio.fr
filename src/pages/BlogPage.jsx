import { Link } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { blogDrafts, siteConfig } from "../data/siteData.js";

export function BlogPage() {
	return (
		<>
			<Seo title='Blog | Ankaa Studio' description='Le blog d’Ankaa Studio est prévu dans l’architecture pour publier des conseils, actualités et articles SEO autour de la photo canine.' path='/blog' noIndex />

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'>
						<span className='eyebrow'>Blog</span>
						<h1 className='page-hero__title'>Une future base éditoriale pour le SEO et la pédagogie</h1>
						<div className='page-hero__intro'>
							<p className='page-hero__description'>Le blog est déjà prévu pour publier des contenus utiles autour de la séance photo chien, du comportement, de la préparation et de la visibilité des professionnels.</p>
						</div>
						<div className='page-hero__badge'>
							<div>
								<strong>{siteConfig.message}</strong>
								<span>Contenus éditoriaux à venir</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container blog-section'>
					<SectionHeading eyebrow='Contenu à venir' title='Des sujets pensés pour le référencement local et l’expertise métier' description='Les articles ci-dessous constituent un point de départ éditable pour la future version du blog.' />

					<div className='blog-grid'>
						{blogDrafts.map(draft => (
							<article className='blog-card' key={draft.title}>
								<span className='blog-card__eyebrow'>Article futur</span>
								<h2 className='blog-card__title'>{draft.title}</h2>
								<p className='blog-card__text'>{draft.text}</p>
								<span className='blog-card__meta'>À enrichir avec conseils, images et maillage interne</span>
							</article>
						))}
					</div>

					<div className='cta-banner'>
						<div>
							<p className='eyebrow'>SEO et contenu</p>
							<h2 className='cta-banner__title'>Le blog pourra cibler les requêtes locales et les besoins de vos clients.</h2>
						</div>
						<p className='cta-banner__text'>Les sujets sont déjà alignés avec les mots-clés prioritaires: photographe canin Reims, photographe chien Reims, photographe animalier Reims, photographe canin Marne et séance photo chien Marne.</p>
						<div className='hero__actions'>
							<Link className='button' to='/contact'>
								Préparer un article
							</Link>
							<Link className='button-secondary' to='/tarifs'>
								Voir les prestations
							</Link>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
