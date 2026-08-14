import { Link } from "react-router-dom";

export function PricingCard({ plan }) {
	return (
		<article className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
			<div className='pricing-card__header'>
				<span className='pricing-card__label'>{plan.label}</span>
				<h3 className='pricing-card__title'>{plan.name}</h3>
				<div className='pricing-card__price'>
					{plan.price}
					<small>{plan.priceNote}</small>
				</div>
			</div>

			<p className='pricing-card__text'>{plan.description}</p>

			<ul className='pricing-card__list'>
				<li>{plan.duration}</li>
				<li>{plan.photos}</li>
				<li>{plan.delivery}</li>
			</ul>

			<div className='pricing-card__actions'>
				<Link className='button' to={`/contact?prestation=${plan.slug}`}>
					Réserver
				</Link>
				<Link className='button-secondary' to='/portfolio'>
					Voir le style
				</Link>
			</div>
		</article>
	);
}
