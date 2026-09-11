import { useState } from "react";

import { DEFAULT_SET_TITLE, INHERITED_WATERMARK_LABEL, WATERMARK_LABELS } from "../utils/gallerySets.js";

/**
 * Every tab the client will see: the categories, plus the photos in none of them.
 *
 * The remainder is listed first and carries the same settings a category does, because
 * it is a tab like any other as far as the client is concerned — and its settings used
 * to be the gallery's own, which are also the master over every category, so there was
 * no way to close downloads for the loose photos while a category kept them. That is
 * the state a gallery is in right after its first upload, when nothing has been sorted
 * yet.
 *
 * The watermark is the odd one out among them: it is not a permission but something
 * burnt into the files, so setting it here only decides how the *next* upload into this
 * tab is derived — which is why changing it offers to re-derive the photos already there
 * on the spot. ⟳ is that regenerate on its own, kept because the offer can be declined
 * and because photos moved in from another tab arrive carrying its mark. Per tab in both
 * cases: taking the mark off one category should not re-derive the gallery.
 *
 * No photo is moved from here. A set is created empty and filled from the uploader's
 * target select or one photo at a time in the grid below, which is what makes both
 * creating and deleting one safe — deleting a set only sends its photos back to the
 * remainder's settings.
 *
 * The order is the array's, so reordering is a pair of arrows rather than a drag:
 * there are a handful of sets, they are one line each, and a drop target that small
 * is harder to hit than a button.
 */
/**
 * A tab's watermark override. `""` is the empty option — the gallery decides — which is
 * also what the API reads as "no override", so nothing has to translate between them.
 */
function WatermarkSelect({ id, value, onChange }) {
	return (
		<select className='admin-sets__watermark' id={id} value={value ?? ""} aria-label='Filigrane' onChange={event => onChange(event.target.value)}>
			<option value=''>{INHERITED_WATERMARK_LABEL}</option>
			{Object.entries(WATERMARK_LABELS).map(([mode, label]) => (
				<option key={mode} value={mode}>
					{label}
				</option>
			))}
		</select>
	);
}

export function SetsPanel({
	sets,
	counts,
	ungroupedCount,
	ungrouped,
	downloadsEnabled,
	onCreate,
	onUpdate,
	onUpdateUngrouped,
	onWatermark,
	onRegenerate,
	onReorder,
	onDelete
}) {
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

	// The same rule the client's groupBySet() applies: the loose photos are a tab of
	// their own while there are any, and a gallery with no categories is nothing but
	// that tab. Hidden once every photo has been sorted, when its switches would govern
	// no photo and only invite being set to something that has no effect.
	const showUngrouped = ungroupedCount > 0 || sets.length === 0;
	const own = ungrouped ?? { downloadsEnabled: true, hdEnabled: true, watermark: null };
	// Names this tab in the confirmations, which are read away from the row they came
	// from: "la galerie" while it is the only tab, since that is all it is.
	const ungroupedLabel = sets.length > 0 ? "les photos hors catégorie" : "la galerie";

	return (
		<div className='admin-sets'>
			<p className='admin-hint'>
				Une catégorie regroupe des photos sous un onglet dans la galerie du client, avec ses propres réglages de téléchargement et de filigrane. Les photos qui n’en
				ont aucune forment un onglet à part, avec les siens. Changer le filigrane propose d’en régénérer les aperçus, et une photo déplacée d’un onglet à l’autre prend
				d’office celui de son nouvel onglet ; ⟳ régénère un onglet à la demande.
			</p>

			<ul className='admin-sets__list'>
				{showUngrouped ?
					<li className='admin-sets__row admin-sets__row--default'>
						{/* No name field: this row is not a record, it is whatever is left over,
						    and the client names that tab after the gallery. */}
						<span className='admin-sets__title'>{sets.length > 0 ? `${DEFAULT_SET_TITLE} (photos hors catégorie)` : "Toutes les photos"}</span>

						<span className='admin-sets__count'>
							{ungroupedCount} photo{ungroupedCount > 1 ? "s" : ""}
						</span>

						<label className='admin-toggle'>
							<input
								type='checkbox'
								checked={own.downloadsEnabled}
								disabled={!downloadsEnabled}
								onChange={event => onUpdateUngrouped({ downloadsEnabled: event.target.checked })}
							/>
							<span>Téléchargements</span>
						</label>

						<label className='admin-toggle'>
							<input
								type='checkbox'
								checked={own.hdEnabled}
								disabled={!downloadsEnabled || !own.downloadsEnabled}
								onChange={event => onUpdateUngrouped({ hdEnabled: event.target.checked })}
							/>
							<span>Haute définition</span>
						</label>

						<WatermarkSelect id='ungrouped-watermark' value={own.watermark} onChange={value => onWatermark(null, value, ungroupedLabel, ungroupedCount)} />

						{/* No arrows and no bin, unlike a category's row: this tab always leads,
						    and the only way to be rid of it is to sort every photo into one. */}
						<span className='admin-sets__tools'>
							<button
								type='button'
								onClick={() => onRegenerate(null, ungroupedLabel, ungroupedCount)}
								disabled={ungroupedCount === 0}
								title='Régénérer les aperçus de cet onglet'>
								⟳
							</button>
						</span>
					</li>
				:	null}

				{sets.map((set, index) => {
					const count = counts[set.id] ?? 0;
					const label = `« ${set.title} »`;

					return (
						<li key={set.id} className='admin-sets__row'>
							<input
								className='admin-sets__name'
								type='text'
								defaultValue={set.title}
								maxLength={120}
								aria-label={`Titre de la catégorie ${set.title}`}
								onBlur={event => event.target.value.trim() && event.target.value !== set.title && onUpdate(set.id, { title: event.target.value })}
							/>

							<span className='admin-sets__count'>
								{count} photo{count > 1 ? "s" : ""}
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

							<WatermarkSelect id={`set-watermark-${set.id}`} value={set.watermark} onChange={value => onWatermark(set.id, value, label, count)} />

							<span className='admin-sets__tools'>
								<button type='button' onClick={() => onRegenerate(set.id, label, count)} disabled={count === 0} title='Régénérer les aperçus de cette catégorie'>
									⟳
								</button>
								<button type='button' onClick={() => move(index, -1)} disabled={index === 0} title='Monter'>
									↑
								</button>
								<button type='button' onClick={() => move(index, 1)} disabled={index === sets.length - 1} title='Descendre'>
									↓
								</button>
								<button type='button' className='admin-photo__delete' onClick={() => onDelete(set)} title='Supprimer la catégorie'>
									🗑
								</button>
							</span>
						</li>
					);
				})}
			</ul>

			<form className='admin-inline-form' onSubmit={handleCreate}>
				<input type='text' placeholder='Nom de la nouvelle catégorie' value={title} maxLength={120} onChange={event => setTitle(event.target.value)} aria-label='Nom de la nouvelle catégorie' />
				<button className='button-secondary' type='submit' disabled={busy || title.trim().length === 0}>
					Ajouter une catégorie
				</button>
			</form>

			{!downloadsEnabled ?
				<p className='admin-hint'>Les téléchargements sont coupés pour toute la galerie : aucune catégorie ne peut les rouvrir.</p>
			:	null}
		</div>
	);
}
