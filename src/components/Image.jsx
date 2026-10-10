import { useEffect, useRef, useState } from "react";

// The one picture element on the site: the marketing pages, the client galleries
// and their cover photographs all come through here. Several things happen
// between mounting a picture and seeing it, and a caller can tune each one.
//
// 1. Fetching. A picture can be held back until the scroll comes within
//    `preloadMargin` of it. The galleries need that: a 200-photo shoot would
//    otherwise fire 200 signed requests for photos the client never scrolled to.
//    While a picture is held back there is no <img> to observe, so those callers
//    hand over a `frameRef` — the element holding the space — to watch instead.
//
// 2. Readiness. `waitForLoad` holds the fade until the pixels are actually here,
//    so that what fades in is a photograph and not an empty frame that pops a
//    moment later. Worth turning off only for a picture that would rather be
//    seen late than not at all.
//
// 3. The reveal. `revealRatio` is how much of the picture has to be on screen
//    before it may fade in. The marketing site wants a deliberate scroll reveal
//    and asks for half of it; the galleries pass 0, because there the blur-up
//    should be over and done with before the visitor's eyes arrive rather than
//    performed in front of them.
//
// 4. The stagger. A grid hands a whole row the same reveal on the same frame,
//    and a row fading up in unison reads as one slab rather than as pictures.
//    Each one waits a random moment first — see `stagger`.
//
// The fade itself is CSS, on .image / .image--revealed in global.css. Callers
// that cross-fade a layer of their own behind the picture hear about the reveal
// through `onReveal` and key their own rules off it.
//
// The reveal is one-way throughout: a picture scrolled back past stays visible
// and stays loaded, because fading it out again reads as a glitch rather than as
// an entrance.

const REVEAL_RATIO = 0.3;

// The widest the random stagger will throw a picture, in milliseconds. Shorter
// than the fade, so the last picture of a row has started before the first has
// finished and the row still reads as one movement rather than as a queue.
const STAGGER_MS = 0;

// Rungs for the observer to call back on, rather than the reveal ratio alone: an
// image taller than the viewport can never show half of itself at once, so that
// single line would never be crossed and the observer would report the first
// sliver and then go quiet forever. The rungs keep it talking on the way
// through, which is what gives the screen-coverage rule in isOnScreenEnough its
// chance to fire.
const THRESHOLD_LADDER = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export function Image({
	className,
	style,
	onLoad,
	onError,
	// A picture that fails to load counts as settled by default and fades in
	// anyway: its alt text and the browser's own broken-image mark are better
	// than an element that can never become visible, which hides the breakage
	// from everyone. Callers with something to fall back on turn this off.
	revealOnError = true,
	frameRef,
	preloadMargin,
	revealRatio = REVEAL_RATIO,
	waitForLoad = true,
	// How far the fade may be thrown, in milliseconds; 0 turns the stagger off
	// for callers whose timing is already spoken for.
	stagger = STAGGER_MS,
	onReveal,
	...imageProps
}) {
	const imageRef = useRef(null);
	// Each gate opens immediately when it was not asked for, and all of them open
	// without an observer to tell us otherwise (an old browser, or jsdom): no
	// lazy loading and no fade beats a picture that never arrives.
	const [isFetching, setIsFetching] = useState(() => !preloadMargin || !hasObserver());
	const [isOnScreen, setIsOnScreen] = useState(() => !revealRatio || !hasObserver());
	const [hasLoaded, setHasLoaded] = useState(false);
	// Rolled once and kept for the life of the picture. Re-rolling it on a later
	// render would move the delay out from under a fade already running.
	const [fadeDelay] = useState(() => Math.round(Math.random() * stagger));

	const isRevealed = isFetching && isOnScreen && (hasLoaded || !waitForLoad);

	// Holds the picture back until the scroll comes near. The frame is watched
	// rather than the picture, since the whole point is that the <img> does not
	// exist yet.
	useEffect(() => {
		const frame = frameRef?.current ?? imageRef.current;

		if (isFetching || !frame) return;

		const observer = new IntersectionObserver(
			entries => {
				if (entries.some(entry => entry.isIntersecting)) {
					setIsFetching(true);
				}
			},
			{ rootMargin: preloadMargin }
		);

		observer.observe(frame);

		return () => observer.disconnect();
	}, [isFetching, frameRef, preloadMargin]);

	// Holds the fade back until enough of the picture is on screen.
	useEffect(() => {
		const image = imageRef.current;

		if (isOnScreen || !image) return;

		const observer = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					if (isOnScreenEnough(entry, revealRatio)) {
						setIsOnScreen(true);
					}
				}
			},
			{ threshold: thresholdsUpTo(revealRatio) }
		);

		observer.observe(image);

		return () => observer.disconnect();
		// isFetching, because a picture using both gates has no <img> to observe
		// until the first one opens.
	}, [isOnScreen, revealRatio, isFetching]);

	// A cached picture can finish decoding before React attaches onLoad, in which
	// case the event never fires and a waitForLoad caller would hold it hidden for
	// good. `complete` is the only way to catch that one.
	useEffect(() => {
		if (isFetching && imageRef.current?.complete) {
			setHasLoaded(true);
		}
	}, [isFetching]);

	// Held in a ref so that a caller passing the callback inline — most of them —
	// does not have the announcement repeated at it on every later render.
	const onRevealRef = useRef(onReveal);

	useEffect(() => {
		onRevealRef.current = onReveal;
	}, [onReveal]);

	useEffect(() => {
		if (isRevealed) {
			onRevealRef.current?.();
		}
	}, [isRevealed]);

	// Nothing to render until the fetch gate opens — that is what keeps the
	// request from being made at all.
	if (!isFetching) {
		return null;
	}

	// The caller's own class comes last so a picture can still overrule the fade.
	const classNames = ["image", isRevealed && "image--revealed", className].filter(Boolean).join(" ");
	// Left off entirely when there is no stagger, so an unstaggered picture keeps
	// whatever transition-delay its own stylesheet asked for.
	const fadeStyle = fadeDelay ? { ...style, "--image-fade-delay": `${fadeDelay}ms` } : style;

	// onLoad last and merged rather than spread over: it is what tells waitForLoad
	// the pixels are here, so a caller with its own handler must not replace it.
	return (
		<img
			ref={imageRef}
			className={classNames}
			style={fadeStyle}
			{...imageProps}
			onLoad={event => {
				setHasLoaded(true);
				onLoad?.(event);
			}}
			onError={event => {
				if (revealOnError) {
					setHasLoaded(true);
				}

				onError?.(event);
			}}
		/>
	);
}

function hasObserver() {
	return typeof IntersectionObserver !== "undefined";
}

function thresholdsUpTo(ratio) {
	return [...THRESHOLD_LADDER.filter(rung => rung < ratio), ratio];
}

// isIntersecting is true for any sliver on screen, so the ratio itself is what
// says which side of the line we are on.
function isOnScreenEnough(entry, revealRatio) {
	if (entry.intersectionRatio >= revealRatio) {
		return true;
	}

	// The picture is taller than the screen, so half of *it* is more than there is
	// room for and the ratio above can never get there. Covering that much of the
	// screen counts instead. rootBounds is null when the observation crosses into
	// another document, and then there is no screen height to measure against.
	const screenHeight = entry.rootBounds?.height;

	return Boolean(screenHeight) && entry.intersectionRect.height >= screenHeight * revealRatio;
}
