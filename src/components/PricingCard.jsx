import { Link } from "react-router-dom";
import { Image } from "./Image";

export function PricingCard({ plan }) {
	return (
		<Link to={`/tarifs/${plan.slug}`}>
			<article className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
				<div className='picture-card'>
					<Image src={plan.image} alt={plan.name} className='picture-card__image' />
				</div>
				<div className='pricing-card__action'>
					<div className='pricing-card__title'>{plan.name}</div>
					<div className='pricing-card__subtitle'>Voir les tarifs</div>
					<svg className='pricing-card__arrow' viewBox='0 0 52 16' fill='none' aria-hidden='true'>
						<path d='M1 8h49M43 2l7 6-7 6' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'></path>
					</svg>
				</div>
			</article>
		</Link>
	);
}
