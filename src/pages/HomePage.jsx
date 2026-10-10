import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { TestimonialCarousel } from "../components/TestimonialCarousel.jsx";
import { InstagramFeed } from "../components/InstagramFeed.jsx";
import { Image } from "../components/Image.jsx";
import { Video } from "../components/Video.jsx";
import { siteConfig, testimonials, photographyCards, videoCard, designCards } from "../data/siteData.js";

import logo from "../assets/media/logo-one-line.png";

const homeStructuredData = {
	"@context": "https://schema.org",
	"@type": "ProfessionalService",
	name: siteConfig.name,
	image: siteConfig.heroImage,
	areaServed: ["Reims", "Marne"],
	url: siteConfig.domain,
	description: siteConfig.message,
	serviceType: "Photographie canin"
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
							<Image src={logo} alt='Ankaa Studio' className='hero__logo' />
							<h1 className='hero__title'>Photo - Vidéo - Création graphique</h1>
						</div>
					</div>
				</div>
			</section>

			<section className='section photography'>
				<div className='container'>
					<SectionHeading
						eyebrow='Photographie'
						title='Raconter votre histoire… et celle de votre chien'
						description='Lors d’une séance, je prends le temps d’observer votre chien, son caractère, son énergie et sa façon d’interagir avec vous. <b>L’idée est de créer des images naturelles, qui vous ressemblent</b>. Je travaille avec les particuliers pour des souvenirs simples et authentiques, mais aussi avec les professionnels du monde canin : élevages, éducateurs, clubs ou structures souhaitant valoriser leur activité. J’aime également photographier les disciplines sportives comme l’agility, le hoopers, le mantrailing ou le nosework. Des moments vivants, spontanés, où l’on retrouve toute l’énergie du chien et la relation avec son humain.'
					/>

					<div className='picture-grid'>
						{photographyCards.map((valueCard, index) => (
							<article className='picture-card' key={`photography-card-${index}`}>
								<Image src={valueCard.url} alt={valueCard.text} className='picture-card__image' loading='lazy' decoding='async' />
							</article>
						))}
					</div>
				</div>
			</section>

			<section className='section video'>
				<div className='container'>
					<SectionHeading
						eyebrow='Video'
						title='Donner du mouvement à vos souvenirs'
						description='Je réalise des vidéos courtes pour garder une trace vivante de vos moments avec votre animal, que ce soit lors d’une séance photo, d’une activité canine ou d’un instant du quotidien. Je crée également des mini reportages autour des sports canins, comme l’agility, le hoopers, le mantrailing ou le nosework. L’objectif est de mettre en valeur une ambiance, une discipline, l’énergie du chien et la relation avec son humain. Des vidéos naturelles, dynamiques et faciles à partager, pensées pour conserver un souvenir précieux ou valoriser votre activité sur les réseaux sociaux.'
					/>

					<div className='video-container'>
						<Video src={videoCard.url} alt={videoCard.text} className='picture-card__video' style={{ opacity: videoCard.url ? 1 : 0 }} />
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
						{designCards.map((designCard, index) => (
							<article className='picture-card' key={`design-card-${index}`}>
								{/* Cards whose picture is not chosen yet hold their place in the
								    grid as an empty frame. It takes the image class for its
								    aspect ratio, so the row keeps its height — and it is a plain
								    div rather than a hidden <img>, which would otherwise be an
								    image element pointed at nothing. */}
								{designCard.url ?
									<Image src={designCard.url} alt={designCard.text} className='picture-card__image' loading='lazy' decoding='async' />
								:	<div className='picture-card__image' />}
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
