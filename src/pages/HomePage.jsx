import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { TestimonialCard } from '../components/TestimonialCard.jsx';
import { servicesPreview, siteConfig, testimonials, valueCards } from '../data/siteData.js';

const homeStructuredData = {
	'@context': 'https://schema.org',
	'@type': 'ProfessionalService',
	name: siteConfig.name,
	image: siteConfig.heroImage,
	areaServed: ['Reims', 'Marne'],
	url: siteConfig.domain,
	description: siteConfig.message,
	serviceType: 'Photographie canine'
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
							<h1 className='hero__title'>ANKAA STUDIO</h1>
							<p className='hero__description'>Photographe canin à Reims et dans la Marne</p>

							<div className='hero__actions'>
								<Link className='button' to='/contact'>
									Réserver une séance
								</Link>
								<Link className='button-secondary' to='/portfolio'>
									Découvrir le portfolio
								</Link>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container page-stack'>
					<SectionHeading
						eyebrow='Ankaa Studio'
						title='Un univers doux, authentique et élégant'
						description='Chaque séance est pensée comme une parenthèse à la fois artistique et rassurante, pour des images qui vous ressemblent vraiment.'
					/>

					<div className='intro-card'>
						<h3 className='intro-card__title'>Présentation courte</h3>
						<p className='intro-card__text'>
							Ankaa Studio imagine des photographies pleines de présence, de tendresse et de caractère. Le studio travaille avec la Marne et Reims comme terrain d’expression pour raconter la relation entre
							le chien et son humain, tout en valorisant les professionnels qui font vivre cet univers.
						</p>
					</div>

					<div className='feature-grid'>
						{valueCards.map((valueCard) => (
							<article className='feature-card' key={valueCard.title}>
								<span className='feature-card__icon' aria-hidden='true'>
									{valueCard.icon}
								</span>
								<h3 className='feature-card__title'>{valueCard.title}</h3>
								<p className='feature-card__text'>{valueCard.text}</p>
							</article>
						))}
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container portfolio-preview'>
					<SectionHeading
						eyebrow='Aperçu portfolio'
						title='Des images lisibles, sensibles et pleines de respiration'
						description='Un aperçu de l’univers visuel d’Ankaa Studio, avec des scènes de chiens, de couples, de familles et de portraits plus éditoriaux.'
					/>

					<div className='grid grid--3'>
						{servicesPreview.map((service) => (
							<article className='gallery-card' key={service.title}>
								<div className='gallery-card__media'>
									<img className='gallery-card__image' src={service.image} alt={service.alt} loading='lazy' decoding='async' />
								</div>
								<div className='gallery-card__meta'>
									<span className='gallery-card__category'>{service.title}</span>
									<h3 className='gallery-card__title'>{service.title}</h3>
									<p className='gallery-card__text'>{service.text}</p>
								</div>
							</article>
						))}
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container testimonial-section'>
					<SectionHeading
						eyebrow='Témoignages'
						title='Ce que recherchent les clients: sérénité, naturel et qualité'
						description='Les retours sont pensés comme une base éditable; ils pourront être remplacés par les avis réels au lancement.'
					/>

					<div className='testimonial-grid'>
						{testimonials.map((testimonial) => (
							<TestimonialCard key={testimonial.name} testimonial={testimonial} />
						))}
					</div>
				</div>
			</section>

			<section className='section section--compact'>
				<div className='container'>
					<div className='cta-banner'>
						<div>
							<p className='eyebrow'>Prête à réserver ?</p>
							<h2 className='cta-banner__title'>Créons ensemble des images naturelles et sincères.</h2>
						</div>
						<p className='cta-banner__text'>
							Vous souhaitez une séance chien, une séance famille / couple avec chien ou un reportage pour votre activité ? Le premier échange permet de cadrer l’intention et le style souhaité.
						</p>
						<div className='hero__actions'>
							<Link className='button' to='/contact'>
								Réserver une séance
							</Link>
							<Link className='button-secondary' to='/tarifs'>
								Voir les tarifs
							</Link>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
