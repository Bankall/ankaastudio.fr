import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { TestimonialCarousel } from "../components/TestimonialCarousel.jsx";
import { InstagramFeed } from "../components/InstagramFeed.jsx";
import { siteConfig, testimonials, photographyCards, designCards } from "../data/siteData.js";

import logo from "../assets/media/logo-one-line.png";

const homeStructuredData = {
	"@context": "https://schema.org",
	"@type": "ProfessionalService",
	name: siteConfig.name,
	image: siteConfig.heroImage,
	areaServed: ["Reims", "Marne"],
	url: siteConfig.domain,
	description: siteConfig.message,
	serviceType: "Photographie canine"
};

export function HomePage() {
	return (
		<>
			<Seo
				title='Ankaa Studio | Photographe canin à Reims et dans la Marne'
				description='Ankaa Studio crée des images naturelles et sincères pour chiens, familles, couples et professionnels du monde canin à Reims et dans la Marne.'
				path='/'
				structuredData={homeStructuredData}
			/>

			<section className='hero'>
				<div className='container'>
					<div className='hero__panel'>
						<div className='hero__content'>
							<img src={logo} alt='Ankaa Studio' className='hero__logo' />
							<h1 className='hero__title'>Photographie - Création graphique</h1>
							<p className='hero__description eyebrow'>Spécialiste de l’univers canin</p>
						</div>
					</div>
				</div>
			</section>

			<section className='section photography'>
				<div className='container'>
					<SectionHeading
						eyebrow='Photographie'
						title='Raconter votre histoire… et celle de votre chien'
						description='J’accorde une attention particulière au respect de l’animal, à son rythme, à ses émotions, pour créer des images justes et sincères. Spécialisée dans la photographie canine, ce qui me touche le plus, c’est de révéler ces liens invisibles, ces regards, ces instants parfois discrets mais profondément vrais. Chaque séance est différente, et je m’adapte à chacun - chien comme humain - pour que l’expérience soit douce, naturelle, et fidèle à ce que vous êtes. '
					/>

					<div className='picture-grid'>
						{photographyCards.map(valueCard => (
							<article className='picture-card' key={valueCard.title}>
								<img src={valueCard.url} alt={valueCard.text} className='picture-card__image' loading='lazy' decoding='async' />
							</article>
						))}
					</div>
				</div>
			</section>

			<section className='section design'>
				<div className='container'>
					<SectionHeading
						eyebrow='Graphisme'
						title='Parce que l’image ne s’arrête pas à la prise de vue'
						description='Je vous accompagne dans la création de votre univers visuel, pour donner une image forte et cohérente à votre activité.
Identité graphique, contenus pour les réseaux sociaux, supports imprimés… chaque élément est pensé pour s’intégrer naturellement à votre image de marque.'
					/>

					<div className='grid grid--3 design-grid'>
						{designCards.map(designCard => (
							<article className='picture-card' key={designCard.title}>
								<img src={designCard.url} alt={designCard.text} className='picture-card__image' loading='lazy' decoding='async' />
							</article>
						))}
					</div>
				</div>
			</section>

			<section className='section testimonial'>
				<div className='container '>
					<SectionHeading eyebrow='Témoignages' title="Ils m'ont fait confiance pour raconter leur histoire... voici leurs mots." description='' />

					<TestimonialCarousel testimonials={testimonials} />
				</div>
			</section>

			<InstagramFeed />
		</>
	);
}
