import { Image } from "./Image";
import { Video } from "./Video";

// Layout shell only: the copy lives in each pricing page, because no two
// formulas describe themselves the same way.
export function PackageCard({ image, video, alt, odd, children }) {
	return (
		<article className={`package-card ${odd ? "is-odd" : ""}`}>
			<div className='picture-card'>
				{image && <Image src={image} alt={alt} className='picture-card__image' />}
				{video && <Video src={video} alt={alt} className='picture-card__video' muted />}
			</div>
			<div className='package-card__content'>{children}</div>
		</article>
	);
}
