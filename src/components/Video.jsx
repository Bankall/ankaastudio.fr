import { useEffect, useRef, useState } from "react";

// The video only plays while at least half of it is on screen: it starts when it
// crosses that threshold and pauses as soon as it falls back below it. Browsers
// without IntersectionObserver fall back to playing straight away.
export function Video({ src, alt, className, style }) {
	const videoRef = useRef(null);
	// Starts muted: autoplay is only allowed without sound, so the toggle is the
	// visitor's way in.
	const [isMuted, setIsMuted] = useState(true);

	useEffect(() => {
		const video = videoRef.current;

		if (!video) return;

		if (typeof IntersectionObserver === "undefined") {
			video.play().catch(() => {});
			return;
		}

		const observer = new IntersectionObserver(
			entries => {
				for (const entry of entries) {
					// isIntersecting is true for any sliver on screen, so compare the
					// ratio itself to know which side of the threshold we are on.
					if (entry.intersectionRatio >= 0.5) {
						// Rejects when autoplay is blocked or the play is interrupted by
						// a pause; either way there is nothing to recover from.
						video.play().catch(() => {});
					} else {
						video.pause();
					}
				}
			},
			{ threshold: 0.5 }
		);

		observer.observe(video);

		return () => observer.disconnect();
	}, [src]);

	// React writes `muted` on first render only, so keep the property in step with
	// the toggle by hand.
	useEffect(() => {
		if (videoRef.current) {
			videoRef.current.muted = isMuted;
		}
	}, [isMuted]);

	return (
		<div className='video-player'>
			<video ref={videoRef} src={src} alt={alt} className={className} style={style} muted loop playsInline />

			<button type='button' className='video-player__sound' onClick={() => setIsMuted(wasMuted => !wasMuted)} aria-pressed={!isMuted} aria-label={isMuted ? "Activer le son" : "Couper le son"}>
				<SoundIcon muted={isMuted} />
			</button>
		</div>
	);
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
