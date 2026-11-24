/**
 * Which ends of a sideways-scrolling row still hide something.
 *
 * A pixel of slack on each side: scroll positions are fractional on high-density
 * screens and a row scrolled all the way can stop a hair short of its end, which
 * would otherwise leave a fade over a tab that is fully in view.
 */
export function scrollEdges({ scrollLeft, clientWidth, scrollWidth }) {
	return {
		start: scrollLeft > 1,
		end: scrollLeft + clientWidth < scrollWidth - 1
	};
}
