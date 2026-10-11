import { PackageCard } from "../../components/PackageCard.jsx";
import { Seo } from "../../components/Seo.jsx";
import { siteConfig } from "../../data/siteData.js";
import { SectionHeading } from "../../components/SectionHeading.jsx";

const structuredData = {
	"@context": "https://schema.org",
	"@type": "Service",
	name: "Reportage vidéo canin Ankaa Studio",
	url: `${siteConfig.domain}/tarifs/reportage-video`,
	areaServed: ["Reims", "Marne"]
};

export function ReportageVideoPage() {
	return (
		<>
			<Seo
				title='Reportage vidéo | Ankaa Studio'
				description='Les formules vidéo Ankaa Studio à Reims : film souvenir de 30 secondes en complément d’une séance photo, ou reportage vidéo dédié à votre duo.'
				path='/tarifs/reportage-video'
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
					<SectionHeading level={1} eyebrow='Vidéo' />

					<PackageCard video='/video/short-alaska.mp4' alt='Le souvenir en mouvement'>
						<div className='package-card__title'>Le souvenir en mouvement</div>
						<div className='package-card__description'>
							<p>
								En complément de votre séance photo, offrez-vous un petit film souvenir de votre compagnon. Des regards, des mouvements et des instants spontanés réunis dans une courte vidéo pour garder
								une trace vivante de ce moment.
							</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Vidéo d’environ 30 secondes</li>
							<li>Prises de vue pendant la séance photo</li>
							<li>Dérushage, montage, étalonnage et musique</li>
							<li>Livraison en format numérique</li>
						</ul>
						<div className='package-card__informations'>
							<p>Uniquement en complément d’une formule photo</p>
						</div>
						<div className='package-card__price'>70€</div>
					</PackageCard>

					<PackageCard video='/video/video-report.mp4' alt='Le reportage vidéo' odd>
						<div className='package-card__title'>Le reportage vidéo</div>
						<div className='package-card__description'>
							<p>
								Une séance dédiée à la vidéo pour capturer ce qui vous passionne et ce qui rend votre duo unique. Sport canin, entraînement, aventure ou simple moment de partage… Je vous accompagne pour
								réaliser un film qui raconte votre histoire, au plus près de vos émotions.
							</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Environ 2 heures de tournage</li>
							<li>Vidéo d’environ 1 minute</li>
							<li>Dérushage, montage, étalonnage et musique</li>
							<li>Livraison numérique en haute définition</li>
						</ul>
						<div className='package-card__price'>150€</div>
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
							Après notre tournage, je prends le temps de visionner et de sélectionner les plus belles séquences pour donner vie à votre vidéo.
							<br />
							Chaque film est ensuite réalisé avec soin : montage, ajustement des couleurs, choix d’une musique adaptée et mise en valeur des petits détails qui rendent votre histoire unique.
						</p>
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
