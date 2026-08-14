import { useEffect } from 'react';

export function Seo({ title, description, path = '/', structuredData, noIndex = false }) {
	useEffect(() => {
		const previousTitle = document.title;
		const head = document.head;
		const canonicalUrl = `${window.location.origin}${path}`;

		let descriptionTag = head.querySelector('meta[name="description"]');
		const previousDescription = descriptionTag?.getAttribute('content');
		if (!descriptionTag) {
			descriptionTag = document.createElement('meta');
			descriptionTag.setAttribute('name', 'description');
			head.appendChild(descriptionTag);
		}
		descriptionTag.setAttribute('content', description);

		let robotsTag = head.querySelector('meta[name="robots"]');
		const previousRobots = robotsTag?.getAttribute('content');
		if (!robotsTag) {
			robotsTag = document.createElement('meta');
			robotsTag.setAttribute('name', 'robots');
			head.appendChild(robotsTag);
		}
		robotsTag.setAttribute('content', noIndex ? 'noindex,follow' : 'index,follow');

		let canonicalTag = head.querySelector('link[rel="canonical"]');
		const previousCanonical = canonicalTag?.getAttribute('href');
		if (!canonicalTag) {
			canonicalTag = document.createElement('link');
			canonicalTag.setAttribute('rel', 'canonical');
			head.appendChild(canonicalTag);
		}
		canonicalTag.setAttribute('href', canonicalUrl);

		const jsonLdScript =
			structuredData ?
				(() => {
					const script = document.createElement('script');
					script.type = 'application/ld+json';
					script.textContent = JSON.stringify(structuredData);
					head.appendChild(script);
					return script;
				})()
			:	null;

		document.title = title;

		return () => {
			document.title = previousTitle;

			if (descriptionTag) {
				if (previousDescription) {
					descriptionTag.setAttribute('content', previousDescription);
				} else {
					descriptionTag.removeAttribute('content');
				}
			}

			if (robotsTag) {
				if (previousRobots) {
					robotsTag.setAttribute('content', previousRobots);
				} else {
					robotsTag.removeAttribute('content');
				}
			}

			if (canonicalTag) {
				if (previousCanonical) {
					canonicalTag.setAttribute('href', previousCanonical);
				} else {
					canonicalTag.removeAttribute('href');
				}
			}

			if (jsonLdScript) {
				jsonLdScript.remove();
			}
		};
	}, [description, noIndex, path, structuredData, title]);

	return null;
}
