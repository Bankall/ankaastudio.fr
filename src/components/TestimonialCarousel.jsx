import { useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Autoplay } from "swiper/modules";
import "swiper/css";

import { TestimonialCard } from "./TestimonialCard.jsx";

export function TestimonialCarousel({ testimonials }) {
	// Arrows live at the bottom of each card, so we drive Swiper directly from
	// the card buttons rather than the Navigation module (single-pair) arrows.
	const swiperRef = useRef(null);

	return (
		<Swiper
			className='testimonial-swiper'
			modules={[A11y, Autoplay]}
			loop
			spaceBetween={24}
			slidesPerView={1}
			autoplay={{ delay: 5000, disableOnInteraction: true }}
			onSwiper={swiper => {
				swiperRef.current = swiper;
			}}>
			{testimonials.map(testimonial => (
				<SwiperSlide key={testimonial.name} className='testimonial-swiper__slide'>
					<TestimonialCard testimonial={testimonial} onPrev={() => swiperRef.current?.slidePrev()} onNext={() => swiperRef.current?.slideNext()} />
				</SwiperSlide>
			))}
		</Swiper>
	);
}
