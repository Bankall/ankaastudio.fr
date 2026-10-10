import { useEffect, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Autoplay } from "swiper/modules";
import "swiper/css";

import { TestimonialCard } from "./TestimonialCard.jsx";

export function TestimonialCarousel({ testimonials }) {
	// Arrows live at the bottom of each card, so we drive Swiper directly from
	// the card buttons rather than the Navigation module (single-pair) arrows.
	const swiperRef = useRef(null);

	// Autoplay only runs while the carousel is on screen, so it doesn't advance
	// silently behind the fold and jump when the visitor scrolls back to it.
	useEffect(() => {
		const node = swiperRef.current?.el;
		if (!node) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				const autoplay = swiperRef.current?.autoplay;
				if (!autoplay) return;
				if (entry.isIntersecting) autoplay.start();
				else autoplay.stop();
			},
			{ threshold: 0.3 }
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<Swiper
			className='testimonial-swiper'
			modules={[A11y, Autoplay]}
			loop
			spaceBetween={24}
			slidesPerView={1}
			autoplay={{ delay: 4000, disableOnInteraction: true }}
			onSwiper={swiper => {
				swiperRef.current = swiper;
			}}>
			{testimonials.map(testimonial => (
				<SwiperSlide key={testimonial.name} className='testimonial-swiper__slide'>
					<TestimonialCard className={testimonial.className} testimonial={testimonial} onPrev={() => swiperRef.current?.slidePrev()} onNext={() => swiperRef.current?.slideNext()} />
				</SwiperSlide>
			))}
		</Swiper>
	);
}
