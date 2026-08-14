export function TestimonialCard({ testimonial }) {
	return (
		<article className='testimonial-card'>
			<p className='testimonial-card__quote'>“{testimonial.quote}”</p>
			<div className='testimonial-card__footer'>
				<div className='testimonial-card__avatar' aria-hidden='true' />
				<div>
					<p className='testimonial-card__name'>{testimonial.name}</p>
					<p className='testimonial-card__detail'>{testimonial.detail}</p>
				</div>
			</div>
		</article>
	);
}
