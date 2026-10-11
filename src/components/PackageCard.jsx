import { Image } from "./Image";

// Layout shell only: the copy lives in each pricing page, because no two
// formulas describe themselves the same way.
export function PackageCard({ image, video, alt, odd, children }) {
	return (
		<article className={`package-card ${odd ? "is-odd" : ""}`}>
			<div className='picture-card'>
				{image && <Image src={image} alt={alt} className='picture-card__image' />}
				{video && <video src={video} loop muted autoPlay className='picture-card__video' />}
			</div>
			<div className='package-card__content'>{children}</div>
		</article>
	);
}
