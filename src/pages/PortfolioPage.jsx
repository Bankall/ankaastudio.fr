import { useCallback, useEffect, useState } from "react";
import { Seo } from "../components/Seo.jsx";
import { Lightbox } from "../gallery/Lightbox.jsx";
import { PhotoTile } from "../gallery/PhotoTile.jsx";
import { siteConfig } from "../data/siteData.js";
import { galleryApi } from "../utils/galleryApi.js";

// The portfolio is an ordinary gallery, curated in the admin like any shoot and
// published under this slug without a password. This page is only the public way
// through it, so the photographer changes what the site shows by changing the
// gallery — nothing here needs touching.
const PORTFOLIO_SLUG = "portfolio";
// Nothing is offered for download on a public portfolio, and there is nobody to
// file favourites under, so the lightbox is told so once.
const DOWNLOADS_OFF = { enabled: false, hd: false, zip: false };
// One identity across renders, so a gallery that is still loading does not hand
// the grid a fresh array every time.
const NO_PHOTOS = [];

const portfolioStructuredData = {
	"@context": "https://schema.org",
	"@type": "CollectionPage",
	name: "Portfolio Ankaa Studio",
	url: `${siteConfig.domain}/portfolio`,
	description: "Portfolio de photographie canine, humaine et événementielle."
};

export function PortfolioPage() {
	const [state, setState] = useState({ status: "loading" });
	const [lightboxIndex, setLightboxIndex] = useState(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const payload = await galleryApi.read(PORTFOLIO_SLUG);

				if (!cancelled) {
					// Every photo of the gallery, sets and all: a portfolio is one
					// sequence, not a set of tabs to pick through.
					setState({ status: "ready", photos: payload.gallery?.photos ?? NO_PHOTOS, fullResTiles: Boolean(payload.gallery?.fullResTiles) });
				}
			} catch {
				// A portfolio that cannot be read is a studio problem, not the
				// visitor's: it says so plainly and the rest of the page stands.
				if (!cancelled) {
					setState({ status: "error" });
				}
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, []);

	const photos = state.status === "ready" ? state.photos : NO_PHOTOS;

	const navigate = useCallback(
		step => {
			setLightboxIndex(current => {
				if (current === null) {
					return current;
				}

				return Math.min(photos.length - 1, Math.max(0, current + step));
			});
		},
		[photos.length]
	);

	return (
		<>
			<Seo
				title='Portfolio | Ankaa Studio'
				description='Découvrez le portfolio d’Ankaa Studio: chiens, humains et chiens, chiots et événements en Marne et à Reims.'
				path='/portfolio'
				structuredData={portfolioStructuredData}
				noIndex
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section'>
				{state.status === "loading" ?
					<p className='gallery-view__status'>Chargement du portfolio…</p>
				: state.status === "error" ?
					<p className='gallery-view__status'>Le portfolio est momentanément indisponible. Réessayez dans un instant.</p>
				: photos.length === 0 ?
					<p className='gallery-view__status'>Les photos arrivent bientôt.</p>
				:	<div className='photo-grid photo-grid--portfolio'>
						{photos.map((photo, index) => (
							<PhotoTile key={photo.pid} photo={photo} index={index} fullResTiles={Boolean(state.fullResTiles)} onOpen={setLightboxIndex} />
						))}
					</div>
				}
			</section>

			{lightboxIndex !== null && photos[lightboxIndex] ?
				<Lightbox photos={photos} index={lightboxIndex} downloads={DOWNLOADS_OFF} onClose={() => setLightboxIndex(null)} onNavigate={navigate} />
			:	null}
		</>
	);
}
