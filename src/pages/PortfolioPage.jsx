import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GalleryModal } from "../components/GalleryModal.jsx";
import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { portfolioCategories, portfolioItems, siteConfig } from "../data/siteData.js";

const portfolioStructuredData = {
	"@context": "https://schema.org",
	"@type": "CollectionPage",
	name: "Portfolio Ankaa Studio",
	url: `${siteConfig.domain}/portfolio`,
	description: "Portfolio de photographie canine, humaine et événementielle."
};

export function PortfolioPage() {
	const [activeCategory, setActiveCategory] = useState("Toutes");
	const [selectedItem, setSelectedItem] = useState(null);

	const filteredItems = useMemo(() => {
		if (activeCategory === "Toutes") {
			return portfolioItems;
		}

		return portfolioItems.filter(item => item.category === activeCategory);
	}, [activeCategory]);

	useEffect(() => {
		const onKeyDown = event => {
			if (event.key === "Escape") {
				setSelectedItem(null);
			}
		};

		window.addEventListener("keydown", onKeyDown);

		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<>
			<Seo
				title='Portfolio | Ankaa Studio'
				description='Découvrez le portfolio d’Ankaa Studio: chiens, humains et chiens, chiots et événements en Marne et à Reims.'
				path='/portfolio'
				structuredData={portfolioStructuredData}
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'>
						<h1 className='page-hero__title'>Une galerie par univers pour mieux projeter votre séance</h1>
						<p className='page-hero__description'>
							Le portfolio est organisé par catégories pour faciliter la lecture des prestations. Chaque image s’ouvre en plein écran pour apprécier les détails et l’atmosphère de la séance.
						</p>
					</div>
				</div>
			</section>

			<section className='section'>
				<div className='container page-stack'>
					<SectionHeading eyebrow='Galerie' title='Chiens, humains & chiens, chiots et événements' description='Filtrez les images par catégorie et consultez les visuels comme un mini-showroom éditorial.' />

					<div className='gallery-toolbar' aria-label='Filtres de portfolio'>
						{portfolioCategories.map(category => (
							<button key={category} type='button' className={`gallery-toolbar__button ${activeCategory === category ? "is-active" : ""}`} onClick={() => setActiveCategory(category)}>
								{category}
							</button>
						))}
					</div>

					<div className='gallery-grid'>
						{filteredItems.map(item => (
							<article key={item.id} className='gallery-card' onClick={() => setSelectedItem(item)} role='button' tabIndex={0} onKeyDown={event => event.key === "Enter" && setSelectedItem(item)}>
								<div className='gallery-card__media'>
									<img className='gallery-card__image' src={item.image} alt={item.alt} loading='lazy' decoding='async' />
								</div>
								<div className='gallery-card__meta'>
									<span className='gallery-card__category'>{item.category}</span>
									<h3 className='gallery-card__title'>{item.title}</h3>
									<p className='gallery-card__text'>{item.description}</p>
								</div>
							</article>
						))}
					</div>

					<div className='cta-banner'>
						<div>
							<p className='eyebrow'>Besoin d’un univers précis ?</p>
							<h2 className='cta-banner__title'>Construisons un portfolio cohérent pour votre marque ou votre séance.</h2>
						</div>
						<p className='cta-banner__text'>Vous pouvez orienter la séance vers un rendu plus émotionnel, plus éditorial ou plus orienté communication professionnelle.</p>
						<div className='hero__actions'>
							<Link className='button' to='/contact'>
								Réserver une séance
							</Link>
							<Link className='button-secondary' to='/tarifs'>
								Voir les formules
							</Link>
						</div>
					</div>
				</div>
			</section>

			<GalleryModal item={selectedItem} onClose={() => setSelectedItem(null)} />
		</>
	);
}
