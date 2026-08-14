import { Link } from "react-router-dom";
import { PricingCard } from "../components/PricingCard.jsx";
import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { pricingPlans, siteConfig } from "../data/siteData.js";

const pricingStructuredData = {
	"@context": "https://schema.org",
	"@type": "Service",
	name: "Prestations photographiques Ankaa Studio",
	url: `${siteConfig.domain}/tarifs`,
	areaServed: ["Reims", "Marne"]
};

export function PricingPage() {
	return (
		<>
			<Seo
				title='Tarifs | Ankaa Studio'
				description='Découvrez les tarifs Ankaa Studio: séance chien, humain + chien, chiot, anniversaire canin, reportage événementiel et communication visuelle professionnelle.'
				path='/tarifs'
				structuredData={pricingStructuredData}
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'>
						<h1 className='page-hero__title'>Des formules claires pour les particuliers et les professionnels</h1>
						<p className='page-hero__description'>
							Les prestations sont présentées de façon lisible pour faciliter le choix et permettre une réservation rapide. Chaque formule peut ensuite être ajustée en fonction du projet.
						</p>
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container page-stack'>
					<SectionHeading
						eyebrow='Prestations'
						title='Séance chien, humain + chien, chiot, événements et communication'
						description='Chaque carte détaille la durée, le nombre de photos incluses, le prix et un bouton de réservation direct vers le contact.'
					/>

					<div className='pricing-grid'>
						{pricingPlans.map(plan => (
							<PricingCard key={plan.slug} plan={plan} />
						))}
					</div>

					<div className='cta-banner'>
						<div>
							<p className='eyebrow'>Besoin d’une offre sur mesure ?</p>
							<h2 className='cta-banner__title'>Les prestations professionnelles peuvent être adaptées à votre activité.</h2>
						</div>
						<p className='cta-banner__text'>
							Communication visuelle, concours, ateliers, journées portes ouvertes ou collaborations éditoriales : l’objectif est de produire des visuels cohérents avec votre identité.
						</p>
						<div className='hero__actions'>
							<Link className='button' to='/contact'>
								Demander un devis
							</Link>
							<Link className='button-secondary' to='/portfolio'>
								Voir des exemples
							</Link>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
