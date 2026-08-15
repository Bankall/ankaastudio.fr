import { useEffect, useRef, useState } from "react";

/**
 * The photo manager: reorder by drag, set the cover, edit captions, delete.
 *
 * Order is kept in local state while dragging and pushed once on drop, so a
 * 200-photo gallery is not writing the record on every hover.
 */
export function AdminPhotoGrid({ photos, coverPid, onReorder, onSetCover, onDelete, onCaption }) {
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

	const handleDragStart = pid => {
		dirtyRef.current = true;
		setDraggedPid(pid);
	};

	const handleDragOver = (event, targetPid) => {
		event.preventDefault();

		if (!draggedPid || draggedPid === targetPid) {
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

	return (
		<ul className='admin-photo-grid'>
			{order.map((photo, index) => (
				<li
					key={photo.pid}
					className={`admin-photo${draggedPid === photo.pid ? " is-dragging" : ""}${photo.status !== "ready" ? " is-pending" : ""}`}
					draggable={photo.status === "ready"}
					onDragStart={() => handleDragStart(photo.pid)}
					onDragOver={event => handleDragOver(event, photo.pid)}
					onDragEnd={handleDrop}
					onDrop={handleDrop}
				>
					<span className='admin-photo__index'>{index + 1}</span>

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
			))}
		</ul>
	);
}
