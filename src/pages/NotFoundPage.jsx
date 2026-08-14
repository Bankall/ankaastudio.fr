import { Link } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";

export function NotFoundPage() {
	return (
		<section className='section'>
			<Seo title='Page introuvable | Ankaa Studio' description='Cette page n’existe pas. Retournez à l’accueil d’Ankaa Studio.' path='/404' noIndex />

			<div className='container'>
				<div className='page-hero__panel'>
					<span className='eyebrow'>404</span>
					<h1 className='page-hero__title'>Cette page n’existe pas encore</h1>
					<p className='page-hero__description'>Le site reste accessible via les routes principales. Revenez à l’accueil pour découvrir le portfolio, les tarifs et le contact.</p>
					<div className='hero__actions'>
						<Link className='button' to='/'>
							Retour à l’accueil
						</Link>
						<Link className='button-secondary' to='/contact'>
							Réserver une séance
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
