import { useEffect, useState } from "react";
import { SectionHeading } from "./SectionHeading.jsx";
import { Image } from "./Image.jsx";
import { siteConfig } from "../data/siteData.js";

// The feed is a static document written by the instagram-feed Lambda and served
// same-origin through CloudFront (/instagram/feed.json). It is progressive
// enhancement: if it is missing — the Lambda has never run, the token is not yet
// seeded, a fetch fails — the section renders nothing rather than breaking the
// page.
export function InstagramFeed() {
	const [posts, setPosts] = useState([]);

	useEffect(() => {
		const controller = new AbortController();

		fetch("/instagram/feed.json", { signal: controller.signal })
			.then(response => (response.ok ? response.json() : null))
			.then(feed => {
				if (Array.isArray(feed?.posts)) {
					setPosts(feed.posts);
				}
			})
			.catch(() => {
				// Aborted on unmount, or the feed does not exist yet: stay empty.
			});

		return () => controller.abort();
	}, []);

	// Nothing to show yet (Lambda not run, token not seeded, fetch failed): keep
	// the whole section out of the page rather than leaving a bare heading.
	if (posts.length === 0) {
		return null;
	}

	return (
		<section className='section instagram-section'>
			<div className='container'>
				<SectionHeading eyebrow='Instagram' />

				<div className='instagram-grid'>
					{posts.map(post => (
						<a className='picture-card instagram-card' key={post.id} href={post.permalink} target='_blank' rel='noopener noreferrer'>
							<Image src={post.image} alt={post.caption ? post.caption.slice(0, 120) : "Publication Instagram d’Ankaa Studio"} className='picture-card__image' loading='lazy' decoding='async' />
						</a>
					))}

					<div className='instagram__cta'>
						<a className='button-secondary' href={siteConfig.instagramUrl} target='_blank' rel='noopener noreferrer'>
							<span className='instagram__cta-title'>Suivez moi sur Instagram</span>
							<span className='instagram__cta-handle'>@studio_ankaa</span>
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
