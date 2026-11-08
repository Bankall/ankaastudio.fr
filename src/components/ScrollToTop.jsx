import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// A gallery is one page whatever tab it is on: /gallery/<slug>/<set> keeps the
// open tab in the path, and a tab switch already scrolls to its own photos.
const pageOf = pathname => pathname.replace(/^(\/gallery\/[^/]+)\/.*$/, "$1");

/** Back to the top on a new page — not on a new query string, nor on a gallery tab. */
export function ScrollToTop() {
	const page = pageOf(useLocation().pathname);

	useEffect(() => {
		window.scrollTo(0, 0);
	}, [page]);

	return null;
}
