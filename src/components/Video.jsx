import { useEffect, useRef, useState } from "react";

// Half of the player on screen is the one threshold this component works from:
// crossing it starts playback and brings the video into its frame, and falling
// back below it pauses.
//
// The entrance depends on where the visitor came from. On the way down the page
// the video rises into the frame; met on the way up, with the frame already in
// front of them, there is no entrance to make and it is simply put there. Either
// way it happens once — replaying it on every pass would read as a glitch rather
// than as an arrival.

// The same half-on-screen rule the pictures fade in on, so the showreel and the
// photographs around it come to life at one point of a scroll (see Image.jsx).
const ON_SCREEN_RATIO = 0.5;

// How the reveal state renders. On the frame rather than on the video it holds,
// because the frame's own shadow is part of the reveal: one class drives both
// the climb and the shadow that follows it. No entry for the state before the
// scroll gets here — the unmodified frame is the empty, shadowless one.
const REVEAL_CLASSES = {
	pop: "video-player--popped",
	shown: "video-player--shown"
};

export function Video({ src, alt, className, style }) {
	const videoRef = useRef(null);
	const videoPlayerRef = useRef(null);
	// Starts muted: autoplay is only allowed without sound, so the toggle is the
	// visitor's way in.
	const [isMuted, setIsMuted] = useState(true);
	// Null until the scroll brings the player into view. Shown outright where
	// there is no observer to tell us when that is: a frame that stays empty for
	// good is worse than no entrance at all, and that is a fact about the browser
	// rather than about the scroll, so it belongs in the first render.
	const [reveal, setReveal] = useState(() => (typeof IntersectionObserver === "undefined" ? "shown" : null));

	useEffect(() => {
		const video = videoRef.current;
		const videoPlayer = videoPlayerRef.current;

		if (!video || !videoPlayer) return;

		if (typeof IntersectionObserver === "undefined") {
			video.play().catch(() => {});
			return;
		}

		const observer = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					// isIntersecting is true for any sliver on screen, so compare the
					// ratio itself to know which side of the threshold we are on.

					if (entry.intersectionRatio >= ON_SCREEN_RATIO) {
						// Whichever entrance the first crossing picks is the one the
						// visitor gets; later crossings find the state already set and
						// leave it be.
						setReveal(current => current ?? (isApproachedFromBelow(entry) ? "pop" : "shown"));
						// Rejects when autoplay is blocked or the play is interrupted by
						// a pause; either way there is nothing to recover from.
						video.play().catch(() => {});
					} else {
						video.pause();
					}
				}
			},
			{ threshold: ON_SCREEN_RATIO }
		);

		// The frame, and it has to be the frame: the video waits parked outside it
		// and the frame clips, so a video watched directly would report nothing on
		// screen, wait to be revealed, and so never be revealed at all. The frame
		// stays put and is the thing the visitor is scrolling towards anyway.
		observer.observe(videoPlayer);

		return () => observer.disconnect();
	}, [src]);

	// React writes `muted` on first render only, so keep the property in step with
	// the toggle by hand.
	useEffect(() => {
		if (videoRef.current) {
			videoRef.current.muted = isMuted;
		}
	}, [isMuted]);

	const playerClassNames = ["video-player", REVEAL_CLASSES[reveal]].filter(Boolean).join(" ");

	return (
		<div className={playerClassNames} ref={videoPlayerRef}>
			<div className='video-player__container'>
				<video ref={videoRef} src={src} alt={alt} className={className} style={style} muted loop playsInline />

				<button type='button' className='video-player__sound' onClick={() => setIsMuted(wasMuted => !wasMuted)} aria-pressed={!isMuted} aria-label={isMuted ? "Activer le son" : "Couper le son"}>
					<SoundIcon muted={isMuted} />
				</button>
			</div>
		</div>
	);
}

// Which way the visitor came on the player, read off the frame rather than off
// any scroll position.
//
// Half of the frame is on screen and its bottom edge is still below the fold:
// the only way to stand at that point is to have come up on it from underneath,
// scrolling down the page. Reaching the same point on the way up puts the top
// edge off screen instead and the bottom edge in view.
//
// Geometry, so the answer holds however the page got here — an anchor jump, a
// scroll position restored on reload, a flick of a trackpad that lands
// mid-section. The entry carries the measurements from the moment of the
// crossing, which is both cheaper and truer than measuring the DOM again now.
function isApproachedFromBelow(entry) {
	// rootBounds is null when the observation crosses into another document, and
	// then the window is the best guess at what the frame was measured against.
	const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;

	return entry.boundingClientRect.bottom > viewportHeight;
}

// A speaker, with sound waves when on and a cross when off.
function SoundIcon({ muted }) {
	return (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
			<path d='M11 5 6 9H3v6h3l5 4z' />

			{muted ?
				<>
					<path d='m16 9 5 6' />
					<path d='m21 9-5 6' />
				</>
			:	<>
					<path d='M15.5 8.5a5 5 0 0 1 0 7' />
					<path d='M18.5 6a9 9 0 0 1 0 12' />
				</>
			}
		</svg>
	);
}
