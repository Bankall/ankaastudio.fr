import { useRef } from "react";
import { HeartIcon } from "./HeartIcon.jsx";

/**
 * The gallery's tabs: its sets, and the visitor's favourites among them.
 *
 * Favourites arrive as one more tab rather than as a filter of their own, and the
 * sets stay in the row while it is open: the selection is another way through the
 * same photographs, so it belongs where the client already looks for one, and
 * getting back out is a click on the set they came from.
 *
 * Nothing is rendered for a single tab, which is what an empty gallery comes to: a
 * lone tab is a label. `null` is a real id here — it is the group of photos that
 * belong to no set — so it travels as-is rather than as a falsy stand-in for "none
 * selected".
 *
 * Real tab semantics, which means the arrow keys have to work and only the current
 * tab may be in the tab order: with a dozen sets, tabbing through every one of them
 * to reach the photos is worse than no roles at all.
 *
 * `sectionId` is the photos section the tabs sit in, brought back into view on a
 * click: a client who has scrolled deep into one set and picks another would
 * otherwise land halfway down a grid that has just been replaced.
 */
export function SetTabs({ tabs, activeId, panelId, sectionId, onSelect }) {
	const listRef = useRef(null);

	if (tabs.length < 2) {
		return null;
	}

	const focusAt = index => {
		const target = tabs[Math.max(0, Math.min(tabs.length - 1, index))];

		onSelect(target.id);
		// The freshly selected tab is the only focusable one, so hand the focus over
		// once React has swapped the tabindexes.
		requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
	};

	const handleClick = id => {
		onSelect(id);
		// After the commit, not during the click: swapping the grid relayouts the page
		// under a smooth scroll already in flight and the browser drops it part of the
		// way up. By the next frame the new tiles are in place — their aspect ratios
		// come from the manifest, so the page is its final height before a single photo
		// has loaded — and the glide runs to the end.
		//
		// The keyboard path leaves this alone: it moves the focus to the tab, which the
		// browser scrolls to on its own.
		requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
	};

	const handleKeyDown = event => {
		const current = tabs.findIndex(tab => tab.id === activeId);
		const step =
			event.key === "ArrowLeft" ? -1
			: event.key === "ArrowRight" ? 1
			: 0;

		if (step !== 0) {
			// Wraps, as a tablist is expected to.
			focusAt((current + step + tabs.length) % tabs.length);
		} else if (event.key === "Home") {
			focusAt(0);
		} else if (event.key === "End") {
			focusAt(tabs.length - 1);
		} else {
			return;
		}

		event.preventDefault();
	};

	return (
		<div className='gallery-tabs' role='tablist' aria-label='Ensembles de la galerie et favoris' ref={listRef} onKeyDown={handleKeyDown}>
			{tabs.map(tab => {
				const selected = tab.id === activeId;

				return (
					<button
						key={tab.id ?? "default"}
						type='button'
						role='tab'
						id={`set-tab-${tab.id ?? "default"}`}
						aria-selected={selected}
						aria-controls={panelId}
						tabIndex={selected ? 0 : -1}
						className={`gallery-tabs__tab${selected ? " is-active" : ""}${tab.favourite ? " gallery-tabs__tab--favourite" : ""}`}
						onClick={() => handleClick(tab.id)}>
						{/* Filled once there is something in it: the heart is the only part of
						    this row that says whether the visitor has picked anything yet. */}
						{tab.favourite ?
							<HeartIcon filled={selected || tab.count > 0} />
						:	null}
						<span className='gallery-tabs__title'>{tab.title}</span>
						{tab.count > 0 ?
							<span className='gallery-tabs__count'>{tab.count}</span>
						:	null}
					</button>
				);
			})}
		</div>
	);
}
