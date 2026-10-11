import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { pricingPlans, siteConfig } from "../data/siteData.js";
import { PricingCard } from "../components/PricingCard.jsx";

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
				noIndex
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section'>
				<div className='container page-stack'>
					<SectionHeading level={1} eyebrow='Tarifs & Prestations' title='' description='' />

					<div className='pricing-grid'>
						{pricingPlans
							.filter(plan => plan.featured)
							.map(plan => (
								<PricingCard key={plan.slug} plan={plan} />
							))}
					</div>
				</div>
			</section>
		</>
	);
}
