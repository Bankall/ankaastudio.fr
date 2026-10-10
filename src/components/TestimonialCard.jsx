import { Image } from "./Image.jsx";

function TestimonialArrow() {
	return (
		<svg className='testimonial-card__arrow' viewBox='0 0 52 16' fill='none' aria-hidden='true'>
			<path
				d='M1 8h49M43 2l7 6-7 6'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}

export function TestimonialCard({ testimonial, onPrev, onNext }) {
	// Quotes are hand-edited and may carry line breaks as <br/> or newlines;
	// render them as real breaks without injecting raw HTML.
	const lines = testimonial.quote.split(/\s*<br\s*\/?>\s*|\n/);

	return (
		<article className='testimonial-card'>
			{testimonial.avatar && (
				<div className='testimonial-card__avatar' aria-hidden='true'>
					<Image src={testimonial.avatar} alt='' className='testimonial-card__avatar-image' />
				</div>
			)}

			<div className='testimonial-card__quote-wrap'>
				<p className='testimonial-card__quote'>
					“
					{lines.map((line, index) => (
						<span key={index}>
							{index > 0 && <br />}
							{line}
						</span>
					))}
					”
				</p>
			</div>

			<div className='testimonial-card__footer'>
				<button
					type='button'
					className='testimonial-card__nav testimonial-card__nav--prev'
					onClick={onPrev}
					aria-label='Témoignage précédent'
				>
					<TestimonialArrow />
				</button>
				<p className='testimonial-card__name'>{testimonial.name}</p>
				<button
					type='button'
					className='testimonial-card__nav testimonial-card__nav--next'
					onClick={onNext}
					aria-label='Témoignage suivant'
				>
					<TestimonialArrow />
				</button>
			</div>
		</article>
	);
}
