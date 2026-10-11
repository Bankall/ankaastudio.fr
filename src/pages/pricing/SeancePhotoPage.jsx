import { PackageCard } from "../../components/PackageCard.jsx";
import { Seo } from "../../components/Seo.jsx";
import { siteConfig } from "../../data/siteData.js";
import { SectionHeading } from "../../components/SectionHeading.jsx";

const structuredData = {
	"@context": "https://schema.org",
	"@type": "Service",
	name: "Séance photo canine Ankaa Studio",
	url: `${siteConfig.domain}/tarifs/seance-photo`,
	areaServed: ["Reims", "Marne"]
};

export function SeancePhotoPage() {
	return (
		<>
			<Seo
				title='Séance photo | Ankaa Studio'
				description='Les formules de séance photo Ankaa Studio à Reims : packs 5, 10 ou 20 photos retouchées et séance canniversaire au parc We Can Dog It.'
				path='/tarifs/seance-photo'
				structuredData={structuredData}
				noIndex
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section package'>
				<div className='container page-stack'>
					<SectionHeading level={1} eyebrow='Photo' />

					<PackageCard image='/image/cherry-toune.jpg' alt='Pack Photo 1'>
						<div className='package-card__title'>Pack Photo 1</div>
						<div className='package-card__description'>
							<p>L’essentiel pour garder un souvenir simple et sincère</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>5 photos numériques retouchées</li>
							<li>15€ la photo supplémentaire</li>
							<li>Environ 45 minutes de séance</li>
						</ul>
						<div className='package-card__price'>60€</div>
					</PackageCard>

					<PackageCard image='/image/emeline-coquillette.jpg' alt='Pack Photo 2' odd>
						<div className='package-card__title'>Pack Photo 2</div>
						<div className='package-card__description'>
							<p>Un bel équilibre pour capturer votre complicité</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>10 photos numériques retouchées</li>
							<li>12€ la photo supplémentaire</li>
							<li>Environ 45 minutes de séance</li>
						</ul>
						<div className='package-card__price'>100€</div>
					</PackageCard>

					<PackageCard image='/image/alaska.jpg' alt='Pack Photo 3'>
						<div className='package-card__title'>Pack Photo 3</div>
						<div className='package-card__description'>
							<p>Un ensemble complet pour ne rien laisser de côté</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>20 photos numériques retouchées</li>
							<li>8€ la photo supplémentaire</li>
							<li>Environ 45 minutes de séance</li>
						</ul>
						<div className='package-card__price'>180€</div>
					</PackageCard>

					<PackageCard image='/image/cupcake.jpg' alt='Canniversaire' odd>
						<div className='package-card__title'>Canniversaire</div>
						<div className='package-card__description'>
							<p>
								Une journée spéciale pour votre compagnon.
								<br />
								Je vous accompagne au parc We Can Dog It pour immortaliser cette belle occasion.
							</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Galerie complète (entre 20 et 30 photos numériques)</li>
							<li>Environ 1 heure de séance</li>
						</ul>
						<div className='package-card__price'>60€</div>
					</PackageCard>
				</div>
			</section>

			<section className='section'>
				<div className='container pricing-plan-card pricing-plan__informations-wrap'>
					<div className='pricing-plan__informations' style={{ maxWidth: "none" }}>
						<p>
							<b>INFOS PRATIQUES</b>
						</p>
						<p>
							Quelques jours après notre séance, vous recevrez un lien vers une galerie privée contenant une sélection des plus belles photographies.
							<br />
							Chaque image bénéficiera d’une première retouche afin de vous permettre de mieux apprécier le rendu final et de faire votre choix.
							<br />
							Une fois vos photos préférées sélectionnées, je réaliserai les dernières retouches avec soin avant de vous les transmettre en haute définition.
						</p>
						<p>Et si vous avez un coup de cœur pour davantage de photos ? Vous pourrez bien sûr en ajouter à votre formule, selon les tarifs indiqués.</p>
						<p>
							Les frais de déplacement sont offerts jusqu’à 20 km autour de Reims. Entre 21 et 50 km, un forfait de 30 € s’applique. Au-delà de 50 km, les frais sont établis sur devis. Les distances sont
							calculées sur la base du trajet aller depuis Reims.
						</p>
					</div>
				</div>
			</section>
		</>
	);
}
