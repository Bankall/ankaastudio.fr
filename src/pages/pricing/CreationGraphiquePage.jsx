import { PackageCard } from "../../components/PackageCard.jsx";
import { Seo } from "../../components/Seo.jsx";
import { siteConfig } from "../../data/siteData.js";
import { SectionHeading } from "../../components/SectionHeading.jsx";

const structuredData = {
	"@context": "https://schema.org",
	"@type": "Service",
	name: "Création graphique Ankaa Studio",
	url: `${siteConfig.domain}/tarifs/creation-graphique`,
	areaServed: ["Reims", "Marne"]
};

// TODO: les formules ci-dessous reprennent encore la copie des packs photo, à
// remplacer par les véritables prestations graphiques.
export function CreationGraphiquePage() {
	return (
		<>
			<Seo
				title='Création graphique | Ankaa Studio'
				description='Les prestations de création graphique Ankaa Studio : identité visuelle et communication pour les professionnels du monde canin à Reims et dans la Marne.'
				path='/tarifs/creation-graphique'
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
					<SectionHeading level={2} eyebrow='Création Graphique' />
					<span className='section-heading__description'>
						<p>
							Graphiste de métier, je vous accompagne dans la création de supports qui vous ressemblent, pour donner vie à vos idées et mettre en valeur votre univers. Que vous soyez un professionnel, une
							association ou un particulier, chaque projet est pensé avec soin, créativité et attention aux détails.
						</p>
						<p>
							<b>Supports imprimés</b>
							<br />
							<i>Des créations pour donner vie à votre communication.</i>
							<br />
							<br />
							Faire connaître votre activité, annoncer un événement ou simplement partager une information… <br />
							Je crée des supports de communication adaptés à votre image :<br />
							Flyers, affiches, cartes de visite, brochures, dépliants et bien plus encore.
						</p>
						<p>
							<b>Grand format & personnalisation</b>
							<br />
							<i>Votre univers sur tous les supports.</i>
							<br />
							<br />
							Vous souhaitez mettre en valeur votre activité lors d'un événement, habiller un stand ou personnaliser des produits ? <br />
							Je vous accompagne dans la création et l'adaptation de visuels pour différents supports :<br />
							Roll-ups, banderoles, t-shirts, textiles et autres supports personnalisés.
						</p>
						<p>
							<b>Communication digitale</b>
							<br />
							<i>Une communication soignée, jusque dans les détails.</i>
							<br />
							<br />
							Je vous aide à créer des visuels harmonieux et adaptés à vos réseaux sociaux ou à vos supports numériques, pour partager votre univers et communiquer de manière claire, professionnelle et
							authentique :<br />
							Publications Instagram et Facebook, stories, bannières numériques et autres créations digitales.
						</p>

						<p>
							<b>Quelques exemples de créations</b>
							<br />
							Chaque projet est unique ! Les tarifs présentés sont donnés à titre indicatif et peuvent varier selon la complexité de la création et vos besoins.
						</p>
					</span>

					<PackageCard image='/image/flyer.png' alt='flyer'>
						<div className='package-card__title'>Flyer</div>
						<div className='package-card__description'>
							<p>Création et mise en page d'un flyer personnalisé, à partir de vos textes et visuels.</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Format A5</li>
							<li>Recto simple </li>
							<li>Fichier prêt pour l'impression</li>
						</ul>
						<div className='package-card__price'>À partir de 60 €</div>
					</PackageCard>
					<PackageCard image='/image/kakemono.jpg' alt='Roll-up/Kakémono' odd>
						<div className='package-card__title'>Roll-up/Kakémono</div>
						<div className='package-card__description'>
							<p>Création d'un visuel grand format pour mettre en valeur votre activité lors de vos événements.</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Format standard 85 × 200 cm </li>
							<li>Fichier prêt pour l'impression</li>
						</ul>
						<div className='package-card__price'>À partir de 120 €</div>
					</PackageCard>
					<PackageCard image='/image/t-shirt.png' alt='Personnalisation textile'>
						<div className='package-card__title'>Personnalisation textile</div>
						<div className='package-card__description'>
							<p>Création d'une composition graphique personnalisée avec recherche typographique, mise en page et petits éléments graphiques.</p>
						</div>
						<ul className='package-card__keypoints'>
							<li>Un visuel personnalisé</li>
							<li>Sans création d'illustration</li>
							<li>Fichier adapté à l'impression textile</li>
						</ul>
						<div className='package-card__price'>À partir de 70 €</div>
					</PackageCard>
				</div>
			</section>

			<section className='section'>
				<div className='container pricing-plan-card pricing-plan__informations-wrap'>
					<div className='pricing-plan__informations'>
						<p>
							<b>INFOS PRATIQUES</b>
						</p>
						<p>Après avoir échangé sur vos besoins et vos envies, je vous propose un devis personnalisé, adapté à votre demande.</p>
						<p>
							Les tarifs comprennent la création graphique, les ajustements prévus dans le devis et la livraison des fichiers numériques adaptés à leur utilisation. Les frais d'impression et de fabrication
							ne sont pas inclus.
						</p>
						<p>Pour les créations destinées à une utilisation commerciale, les droits d'exploitation sont précisés dans le devis.</p>
					</div>
				</div>
			</section>
		</>
	);
}
