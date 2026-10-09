import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";

export function AboutPage() {
	return (
		<>
			<Seo
				title='Qui suis-je ? | Ankaa Studio'
				description='Sophie, photographe animalière et graphiste dans la Marne : l’histoire d’Ankaa Studio, une approche naturelle et sensible, et les animaux qui l’inspirent.'
				path='/a-propos'
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section'>
				<div className='container about-section'>
					<SectionHeading level={1} eyebrow='Qui suis-je ?' title='Hello, moi c’est Sophie' />

					<span className='about-section__description text-center'>
						<p>Ankaa Studio est né à la rencontre de mes deux univers : la photographie et le graphisme, avec une passion qui les relie naturellement : les animaux.</p>
						<p>
							Mon objectif est simple : immortaliser l’amour et l’énergie unique de chaque animal. Capturer leur personnalité, leurs expressions, pour créer des souvenirs que vous pourrez revivre encore et
							encore.
						</p>
						<p>Mon regard de graphiste influence également mon travail : composition, lumière, couleurs, harmonie et sens du détail font partie intégrante de mon univers créatif.</p>
						<p>
							Inspiré par les étoiles et par Ankaa, l’étoile du Phénix, le studio est né avec l’envie de donner une place particulière à ces instants parfois fugaces et d’en faire des souvenirs qui
							traversent le temps.
						</p>
					</span>

					<div className='grid grid--3 mt-2 mb-2'>
						<article className='picture-card'>
							<img alt='Portrait de Sophie avec Sankaa' className='picture-card__image' loading='lazy' decoding='async' src='/about/sankaa_sophie.min.jpg' />
						</article>
						<article className='picture-card'>
							<img alt='Portrait de Hysis' className='picture-card__image' loading='lazy' decoding='async' src='/about/hysis.min.jpg' />
						</article>
						<article className='picture-card'>
							<img alt='Portrait de Bulma avec Sophie' className='picture-card__image' loading='lazy' decoding='async' src='/about/bulma_sophie.min.jpg' />
						</article>
					</div>

					<span className='about-section__description text-center'>
						<p>Les animaux ont toujours occupé une place importante dans ma vie et naturellement, ils sont devenus une grande source d’inspiration dans mon travail.</p>
						<p>
							À mes côtés, il y a d’abord Sankaa, ma Labrador, celle qui a inspiré le nom Ankaa Studio. Plus qu’un simple clin d’œil à son prénom, elle est aussi celle qui m’a donné envie de photographier
							davantage les chiens, leurs expressions, leur personnalité et tous ces petits moments qui rendent le lien avec eux si particulier.
						</p>
						<p>Puis est arrivée Bulma, ma petite dernière, une jeune Berger Australien pleine de vie, qui apporte une nouvelle énergie à notre quotidien.</p>
						<p>Et enfin, il y a Hysis, ma chatte, qui partage ma vie depuis maintenant 14 ans et qui m’accompagne depuis bien avant la naissance d’Ankaa Studio.</p>
						<p>
							Trois personnalités très différentes, mais une même place immense dans ma vie. Elles sont aussi, chacune à leur manière, une partie de l’histoire et de la sensibilité que je mets aujourd’hui
							dans Ankaa Studio.
						</p>
					</span>
				</div>
			</section>
		</>
	);
}
