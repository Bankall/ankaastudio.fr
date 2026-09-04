import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SET_TITLE, groupBySet } from "../utils/gallerySets.js";

// Shared so the default prop is one stable identity rather than a new empty Set on
// every render.
const NO_PICKS = new Set();

/**
 * The photo manager: reorder by drag, set the cover, edit captions, move a photo
 * between sets, delete.
 *
 * Order is kept in local state while dragging and pushed once on drop, so a
 * 200-photo gallery is not writing the record on every hover.
 *
 * Photos are shown grouped the way the client will see them, one block per tab.
 * Dragging reorders within a block only — the record holds one flat order, and a
 * drag that crossed blocks would have to mean both "reorder" and "move to another
 * set" at once. Moving between sets is the select on the tile, which says which set
 * it is going to instead of leaving it to be inferred from where a tile was dropped.
 *
 * `pickedPids` marks one visitor's favourites in place. Everything else steps back
 * rather than disappearing: which photos were *not* chosen is half of what the
 * photographer is looking at, and hiding them would also hide the tools.
 */
export function AdminPhotoGrid({ photos, sets, coverPid, pickedPids = NO_PICKS, onReorder, onSetCover, onDelete, onCaption, onAssign }) {
	const [order, setOrder] = useState(photos);
	const [draggedPid, setDraggedPid] = useState(null);
	const [editing, setEditing] = useState(null);
	const [caption, setCaption] = useState("");
	const dirtyRef = useRef(false);

	// Adopt the server's order whenever it changes underneath us — unless a drag is
	// mid-flight, which would yank tiles out from under the cursor.
	useEffect(() => {
		if (!dirtyRef.current) {
			setOrder(photos);
		}
	}, [photos]);

	// Empty sets are kept: the photographer has to see the tab they just created,
	// with somewhere to drop photos into it.
	const groups = useMemo(() => groupBySet(order, sets, { keepEmpty: true }), [order, sets]);
	const setIdOf = useMemo(() => new Map(order.map(photo => [photo.pid, photo.setId ?? null])), [order]);

	const handleDragStart = pid => {
		dirtyRef.current = true;
		setDraggedPid(pid);
	};

	const handleDragOver = (event, targetPid) => {
		event.preventDefault();

		if (!draggedPid || draggedPid === targetPid) {
			return;
		}

		// Two tabs are two orders as far as the client is concerned; hovering across
		// them means nothing, so it does nothing.
		if (setIdOf.get(draggedPid) !== setIdOf.get(targetPid)) {
			return;
		}

		setOrder(current => {
			const from = current.findIndex(photo => photo.pid === draggedPid);
			const to = current.findIndex(photo => photo.pid === targetPid);

			if (from === -1 || to === -1) {
				return current;
			}

			const next = current.slice();
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);

			return next;
		});
	};

	const handleDrop = async () => {
		setDraggedPid(null);

		try {
			await onReorder(order.map(photo => photo.pid));
		} finally {
			dirtyRef.current = false;
		}
	};

	const startCaption = photo => {
		setEditing(photo.pid);
		setCaption(photo.caption ?? "");
	};

	const commitCaption = async pid => {
		setEditing(null);
		await onCaption(pid, caption);
	};

	if (photos.length === 0) {
		return <p className='admin-empty'>Aucune photo pour l’instant. Envoyez-en ci-dessus.</p>;
	}

	const picking = pickedPids.size > 0;
	const gridClass = `admin-photo-grid${picking ? " is-picking" : ""}`;

	const renderTile = (photo, index) => (
		<li
			key={photo.pid}
			className={`admin-photo${draggedPid === photo.pid ? " is-dragging" : ""}${photo.status !== "ready" ? " is-pending" : ""}${pickedPids.has(photo.pid) ? " is-picked" : ""}`}
			draggable={photo.status === "ready"}
			onDragStart={() => handleDragStart(photo.pid)}
			onDragOver={event => handleDragOver(event, photo.pid)}
			onDragEnd={handleDrop}
			onDrop={handleDrop}
		>
			{/* The number and the heart share one row: the index is one to three digits
			    wide, so a marker placed at a fixed offset would sit on top of it. */}
			<span className='admin-photo__flags'>
				<span className='admin-photo__index'>{index + 1}</span>
				{pickedPids.has(photo.pid) ?
					<span className='admin-photo__pick' title='Dans la sélection affichée'>
						♥
					</span>
				:	null}
			</span>

			{photo.thumb ?
				<img className='admin-photo__image' src={photo.thumb} alt={photo.originalName} loading='lazy' draggable={false} />
			:	<span className='admin-photo__pending'>
					{photo.status === "failed" ?
						"échec"
					: photo.status === "archived" ?
						"archivée"
					:	"traitement…"}
				</span>}

			{photo.pid === coverPid ?
				<span className='admin-photo__cover-flag'>Couverture</span>
			:	null}

			<div className='admin-photo__tools'>
				<button type='button' onClick={() => onSetCover(photo.pid)} disabled={photo.status !== "ready" || photo.pid === coverPid} title='Définir comme couverture'>
					★
				</button>
				<button type='button' onClick={() => startCaption(photo)} title='Légende'>
					✎
				</button>
				<button type='button' className='admin-photo__delete' onClick={() => onDelete(photo)} title='Supprimer'>
					🗑
				</button>
			</div>

			{sets.length > 0 ?
				<select
					className='admin-photo__set'
					value={photo.setId ?? ""}
					aria-label='Catégorie de la photo'
					onChange={event => onAssign(photo.pid, event.target.value || null)}
				>
					<option value=''>{DEFAULT_SET_TITLE}</option>
					{sets.map(set => (
						<option key={set.id} value={set.id}>
							{set.title}
						</option>
					))}
				</select>
			:	null}

			{editing === photo.pid ?
				<form
					className='admin-photo__caption-form'
					onSubmit={event => {
						event.preventDefault();
						commitCaption(photo.pid);
					}}
				>
					<input
						type='text'
						autoFocus
						maxLength={300}
						value={caption}
						placeholder='Légende'
						onChange={event => setCaption(event.target.value)}
						onBlur={() => commitCaption(photo.pid)}
					/>
				</form>
			: photo.caption ?
				<span className='admin-photo__caption'>{photo.caption}</span>
			:	null}
		</li>
	);

	// One block with no heading is the pre-sets layout, and a lone "Galerie" title
	// above every photo in the gallery would be noise.
	if (groups.length === 1) {
		return <ul className={gridClass}>{groups[0].photos.map(renderTile)}</ul>;
	}

	return (
		<div className='admin-photo-sets'>
			{groups.map(group => {
				// Which tab a selection came out of is worth a number: it is what says
				// whether a client picked from everything or only from one series.
				const pickedHere = group.photos.filter(photo => pickedPids.has(photo.pid)).length;

				return (
					<section key={group.set?.id ?? "default"} className='admin-photo-set'>
						<h3 className='admin-photo-set__title'>
							{group.set?.title ?? DEFAULT_SET_TITLE}
							<span className='admin-photo-set__count'>
								{group.photos.length} photo{group.photos.length > 1 ? "s" : ""}
								{picking ? ` · ${pickedHere} choisie${pickedHere > 1 ? "s" : ""}` : ""}
							</span>
						</h3>

						{group.photos.length === 0 ?
							<p className='admin-hint'>Catégorie vide — choisissez-la avant d’envoyer des photos, ou déplacez-y une photo existante.</p>
						:	<ul className={gridClass}>{group.photos.map(renderTile)}</ul>}
					</section>
				);
			})}
		</div>
	);
}
