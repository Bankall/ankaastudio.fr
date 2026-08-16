import { useState } from "react";

/**
 * The gallery's sets: their order, their names and their own download switches.
 *
 * No photo is moved from here. A set is created empty and filled from the uploader's
 * target select or one photo at a time in the grid below, which is what makes both
 * creating and deleting one safe — deleting a set only sends its photos back to the
 * gallery's own settings.
 *
 * The order is the array's, so reordering is a pair of arrows rather than a drag:
 * there are a handful of sets, they are one line each, and a drop target that small
 * is harder to hit than a button.
 */
export function SetsPanel({ sets, counts, ungroupedCount, downloadsEnabled, onCreate, onUpdate, onReorder, onDelete }) {
	const [title, setTitle] = useState("");
	const [busy, setBusy] = useState(false);

	const handleCreate = async event => {
		event.preventDefault();
		setBusy(true);

		try {
			// Kept on a refusal — thirty sets is the limit, and retyping the name it
			// was refused for is no help.
			if (await onCreate(title.trim())) {
				setTitle("");
			}
		} finally {
			setBusy(false);
		}
	};

	const move = (index, step) => {
		const next = sets.map(set => set.id);
		const target = index + step;

		if (target < 0 || target >= next.length) {
			return;
		}

		[next[index], next[target]] = [next[target], next[index]];
		onReorder(next);
	};

	return (
		<div className='admin-sets'>
			<p className='admin-hint'>
				Un ensemble regroupe des photos sous un onglet dans la galerie du client, avec ses propres réglages de téléchargement. Sans ensemble, la galerie reste une
				seule série et utilise les réglages ci-dessus.
			</p>

			{sets.length > 0 ?
				<ul className='admin-sets__list'>
					{/* The ungrouped photos are a real tab for the client as soon as one set
					    exists, so they get a row here too — read-only, because their settings
					    are the gallery's own. */}
					{ungroupedCount > 0 ?
						<li className='admin-sets__row admin-sets__row--default'>
							<span className='admin-sets__title'>Galerie (photos hors ensemble)</span>
							<span className='admin-sets__count'>
								{ungroupedCount} photo{ungroupedCount > 1 ? "s" : ""}
							</span>
							<span className='admin-sets__hint'>réglages de la galerie</span>
						</li>
					:	null}

					{sets.map((set, index) => (
						<li key={set.id} className='admin-sets__row'>
							<input
								className='admin-sets__name'
								type='text'
								defaultValue={set.title}
								maxLength={120}
								aria-label={`Titre de l’ensemble ${set.title}`}
								onBlur={event => event.target.value.trim() && event.target.value !== set.title && onUpdate(set.id, { title: event.target.value })}
							/>

							<span className='admin-sets__count'>
								{counts[set.id] ?? 0} photo{(counts[set.id] ?? 0) > 1 ? "s" : ""}
							</span>

							<label className='admin-toggle'>
								<input
									type='checkbox'
									checked={set.downloadsEnabled}
									disabled={!downloadsEnabled}
									onChange={event => onUpdate(set.id, { downloadsEnabled: event.target.checked })}
								/>
								<span>Téléchargements</span>
							</label>

							<label className='admin-toggle'>
								<input
									type='checkbox'
									checked={set.hdEnabled}
									disabled={!downloadsEnabled || !set.downloadsEnabled}
									onChange={event => onUpdate(set.id, { hdEnabled: event.target.checked })}
								/>
								<span>Haute définition</span>
							</label>

							<span className='admin-sets__tools'>
								<button type='button' onClick={() => move(index, -1)} disabled={index === 0} title='Monter'>
									↑
								</button>
								<button type='button' onClick={() => move(index, 1)} disabled={index === sets.length - 1} title='Descendre'>
									↓
								</button>
								<button type='button' className='admin-photo__delete' onClick={() => onDelete(set)} title='Supprimer l’ensemble'>
									🗑
								</button>
							</span>
						</li>
					))}
				</ul>
			:	null}

			<form className='admin-inline-form' onSubmit={handleCreate}>
				<input type='text' placeholder='Nom du nouvel ensemble' value={title} maxLength={120} onChange={event => setTitle(event.target.value)} aria-label='Nom du nouvel ensemble' />
				<button className='button-secondary' type='submit' disabled={busy || title.trim().length === 0}>
					Ajouter un ensemble
				</button>
			</form>

			{!downloadsEnabled ?
				<p className='admin-hint'>Les téléchargements sont coupés pour toute la galerie : aucun ensemble ne peut les rouvrir.</p>
			:	null}
		</div>
	);
}
