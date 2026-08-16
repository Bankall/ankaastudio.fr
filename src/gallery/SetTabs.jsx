import { useRef } from "react";

/**
 * The gallery's sets, as a row of tabs.
 *
 * Nothing is rendered for a single set: a lone tab is a label, and the gallery
 * looked like one series before sets existed. `null` is a real id here — it is the
 * group of photos that belong to no set — so it travels as-is rather than as a
 * falsy stand-in for "none selected".
 *
 * Real tab semantics, which means the arrow keys have to work and only the current
 * tab may be in the tab order: with a dozen sets, tabbing through every one of them
 * to reach the photos is worse than no roles at all.
 */
export function SetTabs({ sets, activeId, panelId, onSelect }) {
	const listRef = useRef(null);

	if (sets.length < 2) {
		return null;
	}

	const focusAt = index => {
		const target = sets[Math.max(0, Math.min(sets.length - 1, index))];

		onSelect(target.id);
		// The freshly selected tab is the only focusable one, so hand the focus over
		// once React has swapped the tabindexes.
		requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
	};

	const handleKeyDown = event => {
		const current = sets.findIndex(set => set.id === activeId);
		const step =
			event.key === "ArrowLeft" ? -1
			: event.key === "ArrowRight" ? 1
			: 0;

		if (step !== 0) {
			// Wraps, as a tablist is expected to.
			focusAt((current + step + sets.length) % sets.length);
		} else if (event.key === "Home") {
			focusAt(0);
		} else if (event.key === "End") {
			focusAt(sets.length - 1);
		} else {
			return;
		}

		event.preventDefault();
	};

	return (
		<div className='gallery-tabs' role='tablist' aria-label='Ensembles de la galerie' ref={listRef} onKeyDown={handleKeyDown}>
			{sets.map(set => {
				const selected = set.id === activeId;

				return (
					<button
						key={set.id ?? "default"}
						type='button'
						role='tab'
						id={`set-tab-${set.id ?? "default"}`}
						aria-selected={selected}
						aria-controls={panelId}
						tabIndex={selected ? 0 : -1}
						className={`gallery-tabs__tab${selected ? " is-active" : ""}`}
						onClick={() => onSelect(set.id)}
					>
						<span className='gallery-tabs__title'>{set.title}</span>
						<span className='gallery-tabs__count'>{set.photoCount}</span>
					</button>
				);
			})}
		</div>
	);
}
