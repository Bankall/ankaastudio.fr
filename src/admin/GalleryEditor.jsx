import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../utils/galleryApi.js";
import { WATERMARK_LABELS, tabOf, watermarkFor } from "../utils/gallerySets.js";
import { AdminPhotoGrid } from "./AdminPhotoGrid.jsx";
import { SetsPanel } from "./SetsPanel.jsx";
import { SharePanel } from "./SharePanel.jsx";
import { Uploader } from "./Uploader.jsx";

// While derivatives are still being produced, poll the record so tiles appear as
// they become ready. Stops as soon as nothing is pending.
const POLL_INTERVAL_MS = 4000;

const STATUS_LABELS = {
	draft: "Brouillon — invisible pour le client",
	published: "En ligne — accessible via le lien",
	archived: "Archivée — aperçus supprimés, originaux en archive froide"
};

/** ISO timestamp ⇄ the yyyy-mm-dd that <input type="date"> wants. */
const toDateInput = value => (value ? value.slice(0, 10) : "");

/**
 * How one selection is told from another.
 *
 * The address, because that is what the API files a selection under — case-folded
 * there, so it is unique. Picks made before selections were attributed have none,
 * and there can only ever be one such list.
 */
const visitorKey = visitor => visitor.email || "anonyme";

/**
 * Filenames as a photographer's numbering reads them: IMG_9 before IMG_10, which
 * plain string order gets backwards. Same collation the API uses when it appends a
 * fresh batch, so sorting here cannot disagree with where an upload landed.
 */
const byFilename = (a, b) => String(a.originalName ?? "").localeCompare(String(b.originalName ?? ""), "fr", { numeric: true, sensitivity: "base" });

/**
 * Mirrors the API's own slugify (minus its random fallback) so the field shows
 * what the server is about to store. Accents are folded, everything else that
 * has no place in an URL collapses into single dashes.
 */
const slugify = value =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");

export function GalleryEditor() {
	const { gid } = useParams();
	const navigate = useNavigate();
	const [gallery, setGallery] = useState(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [saving, setSaving] = useState(false);
	const [password, setPassword] = useState("");
	const [selection, setSelection] = useState(null);
	// Which visitor's picks are marked in the grid below, by visitorKey. One at a
	// time: two selections marked in the same colour would say nothing about whose
	// photo is whose, which is the only question worth asking of them.
	const [picked, setPicked] = useState(null);
	const pollRef = useRef(null);
	const slugRef = useRef(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const payload = await adminApi.readGallery(gid);

				if (!cancelled) {
					setGallery(payload.gallery);
				}
			} catch (failure) {
				if (!cancelled) {
					setError(failure.status === 404 ? "Cette galerie n’existe plus." : "Chargement impossible.");
				}
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, [gid]);

	// Reconcile folds the processor's sidecars into the record, so it doubles as
	// the refresh mechanism while photos are still being processed.
	const reconcile = useCallback(async () => {
		try {
			const payload = await adminApi.reconcile(gid);
			setGallery(payload.gallery);

			return payload.gallery;
		} catch {
			return null;
		}
	}, [gid]);

	useEffect(() => {
		if (!gallery) {
			return;
		}

		const pending = gallery.photos.some(photo => photo.status === "processing");

		if (!pending) {
			return;
		}

		pollRef.current = setTimeout(reconcile, POLL_INTERVAL_MS);

		return () => clearTimeout(pollRef.current);
	}, [gallery, reconcile]);

	const patch = useCallback(
		async changes => {
			setSaving(true);
			setError("");

			try {
				const payload = await adminApi.updateGallery(gid, changes);
				setGallery(payload.gallery);
				setNotice("Enregistré.");
				setTimeout(() => setNotice(""), 1500);

				return payload.gallery;
			} catch (failure) {
				setError(failure.message);

				return null;
			} finally {
				setSaving(false);
			}
		},
		[gid]
	);

	// A blank slug field means no URL has been minted from this title yet, so the
	// title can seed it. Once the field holds something the client may already
	// have the link, and retitling must not move the gallery.
	const handleTitleBlur = async event => {
		const title = event.target.value;

		if (title === gallery.title) {
			return;
		}

		const derived = slugRef.current?.value.trim() === "" ? slugify(title) : "";
		const updated = await patch(derived ? { title, slug: derived } : { title });

		if (derived && updated && slugRef.current) {
			// The API uniquifies slugs, so show what it actually stored.
			slugRef.current.value = updated.slug;
		}
	};

	const handleSlugBlur = async event => {
		// Emptying the field falls back to the title rather than to the random
		// identifier the API mints for a slug it cannot derive.
		const desired = event.target.value.trim() === "" ? slugify(gallery.title) : event.target.value;

		if (!desired || desired === gallery.slug) {
			event.target.value = gallery.slug;

			return;
		}

		const updated = await patch({ slug: desired });
		event.target.value = updated ? updated.slug : gallery.slug;
	};

	const handleDelete = async () => {
		if (!window.confirm(`Supprimer « ${gallery.title} » et toutes ses photos ? Cette action est définitive.`)) {
			return;
		}

		try {
			await adminApi.deleteGallery(gid);
			navigate("/admin");
		} catch (failure) {
			setError(failure.message);
		}
	};

	const handleDeletePhoto = async photo => {
		if (!window.confirm(`Supprimer ${photo.originalName || "cette photo"} ?`)) {
			return;
		}

		try {
			const payload = await adminApi.deletePhoto(gid, photo.pid);
			setGallery(payload.gallery);
		} catch (failure) {
			setError(failure.message);
		}
	};

	// Every set route answers with the whole gallery, so each of these is one call
	// and one state swap — the photos' new setId comes back with it. Resolves to the
	// gallery or to null, like `patch`, so a caller can tell a failure from a success
	// without handling the error itself.
	const withGallery = async call => {
		setError("");

		try {
			const payload = await call();
			setGallery(payload.gallery);

			return payload.gallery;
		} catch (failure) {
			setError(failure.message);

			return null;
		}
	};

	/**
	 * The answer to a move — one photo into another tab, or a whole set's worth back into
	 * the remainder.
	 *
	 * The tab a photo lands in can ask for a different watermark than the one burnt into
	 * it, and the API re-derives it on the spot rather than leaving the odd one out in the
	 * tab. Said out loud because the tiles drop back to "traitement" for a moment, which
	 * otherwise reads as the move having gone wrong.
	 */
	const applyMove = payload => {
		setGallery(payload.gallery);

		if (payload.requeued > 0) {
			setNotice(`Filigrane du nouvel onglet appliqué : ${payload.requeued} aperçu(s) en cours de régénération.`);
			setTimeout(() => setNotice(""), 3000);
		}
	};

	const handleDeleteSet = async set => {
		if (!window.confirm(`Supprimer la catégorie « ${set.title} » ? Ses photos restent dans la galerie, sans onglet, et prennent les réglages des photos hors catégorie.`)) {
			return;
		}

		setError("");

		// Its photos land in the remainder, which may ask for a different watermark than
		// the set did — a move like the grid's, announced the same way.
		try {
			applyMove(await adminApi.deleteSet(gid, set.id));
		} catch (failure) {
			setError(failure.message);
		}
	};

	// Archiving deletes every derivative, so it must not happen on a mis-click in a
	// select. It stays a confirmation rather than a separate guarded action because
	// the originals survive and Régénérer les aperçus rebuilds the rest — expensive
	// to undo, not impossible.
	const handleStatus = async status => {
		const confirmation = `Archiver « ${gallery.title} » ?\n\nLes aperçus, fichiers HD et archives ZIP seront supprimés, et les originaux placés en archive froide. La galerie renverra une page d’expiration.\n\nTout est régénérable depuis les originaux, en comptant jusqu’à 48 h pour les ressortir d’archive.`;

		if (status === "archived" && !window.confirm(confirmation)) {
			return;
		}

		await patch({ status });
	};

	// Scope-free means the whole gallery; `{ setId }` narrows it to one tab, null setId
	// being the photos in no category.
	const runReprocess = async scope => {
		try {
			const { queued } = await adminApi.reprocess(gid, scope);
			setNotice(`Régénération lancée : ${queued} photo(s).`);
			await reconcile();
		} catch (failure) {
			setError(failure.message);
		}
	};

	const handleReprocess = async () => {
		if (!window.confirm("Régénérer tous les aperçus avec les réglages actuels de filigrane ? Les archives ZIP en cache seront supprimées.")) {
			return;
		}

		await runReprocess();
	};

	/**
	 * One tab's photos, re-derived with the watermark that tab now asks for.
	 *
	 * Confirmed like the gallery-wide button because it is the same operation at a
	 * smaller scope — every photo gets a new rev, and the cached ZIPs go either way.
	 */
	const handleRegenerateSet = async (setId, label, count) => {
		if (!window.confirm(`Régénérer les ${count} aperçu(s) de ${label} avec le filigrane réglé pour cet onglet ? Les archives ZIP en cache seront supprimées.`)) {
			return;
		}

		await runReprocess({ setId });
	};

	/**
	 * A tab's watermark: saved, then offered to the photos already in it.
	 *
	 * The mark is burnt into the derivatives, so the setting alone only decides how the
	 * next upload is derived — and a select that says "Aucun filigrane" over a grid of
	 * marked thumbnails is simply wrong. Asked here rather than left to ⟳, because this
	 * is the moment the answer is known.
	 *
	 * Declining keeps the setting: it applies from the next upload, and ⟳ catches up
	 * whenever. Saved before regenerating either way, since the processor reads the mode
	 * off the record.
	 */
	const handleWatermark = async (setId, mode, label, count) => {
		const saved = setId ? await withGallery(() => adminApi.updateSet(gid, setId, { watermark: mode })) : await patch({ ungrouped: { watermark: mode } });

		if (!saved || count === 0) {
			return;
		}

		if (!window.confirm(`Appliquer ce filigrane aux ${count} photo(s) de ${label} déjà en ligne ?\n\nLes archives ZIP en cache seront supprimées. Sinon le réglage ne vaudra que pour les prochains envois, et ⟳ l’appliquera plus tard.`)) {
			return;
		}

		await runReprocess({ setId });
	};

	const handleAssign = async (pid, sid) => {
		setError("");

		try {
			applyMove(await adminApi.updatePhotos(gid, { sets: { [pid]: sid } }));
		} catch (failure) {
			setError(failure.message);
		}
	};

	/**
	 * The gallery's default watermark, offered to the photos it governs.
	 *
	 * Counted over the tabs with no mode of their own, since those are the ones this
	 * select reaches — but regenerated gallery-wide, there being no scope in between: a
	 * tab that overrides the default is re-derived with the mode it already had, which
	 * costs a derive and changes nothing.
	 */
	const handleGalleryWatermark = async mode => {
		const saved = await patch({ watermark: mode });

		if (!saved) {
			return;
		}

		const inheriting = saved.photos.filter(photo => !tabOf(saved, photo).watermark).length;

		if (inheriting === 0) {
			return;
		}

		if (!window.confirm(`Appliquer ce filigrane aux ${inheriting} photo(s) déjà en ligne qui suivent le réglage par défaut ?\n\nLa régénération porte sur toute la galerie et les archives ZIP en cache seront supprimées. Sinon le réglage ne vaudra que pour les prochains envois.`)) {
			return;
		}

		await runReprocess();
	};

	// A toggle rather than a one-way reveal, because the panel now drives the marks in
	// the grid below: closing it is how the whole gallery comes back into view.
	const toggleSelection = async () => {
		if (selection) {
			setSelection(null);
			setPicked(null);

			return;
		}

		try {
			setSelection(await adminApi.selection(gid));
		} catch (failure) {
			setError(failure.message);
		}
	};

	/**
	 * Puts the whole gallery back in filename order.
	 *
	 * Uploads run in parallel and a second batch is appended after the first, so the
	 * grid drifts out of the order the séance was shot in — which the export numbering
	 * still holds. One flat order covers every tab: the client sees each set sorted by
	 * the same rule, since a set is only a filter over this array.
	 */
	const handleSortByFilename = async () => {
		const sorted = gallery.photos.slice().sort(byFilename);

		if (sorted.every((photo, index) => photo.pid === gallery.photos[index].pid)) {
			setNotice("Déjà trié par nom de fichier.");
			setTimeout(() => setNotice(""), 2000);

			return;
		}

		if (!window.confirm("Trier toutes les photos par nom de fichier ? L’ordre actuel, s’il a été arrangé à la main, sera remplacé.")) {
			return;
		}

		if (await withGallery(() => adminApi.updatePhotos(gid, { order: sorted.map(photo => photo.pid) }))) {
			setNotice("Trié par nom de fichier.");
			setTimeout(() => setNotice(""), 2000);
		}
	};

	if (error && !gallery) {
		return (
			<section className='admin-section'>
				<p className='admin-error'>{error}</p>
				<Link className='button-secondary' to='/admin'>
					Retour aux galeries
				</Link>
			</section>
		);
	}

	if (!gallery) {
		return <p className='admin-empty'>Chargement…</p>;
	}

	const publicUrl = `${window.location.origin}/gallery/${gallery.slug}`;
	const readyCount = gallery.photos.filter(photo => photo.status === "ready").length;
	const pendingCount = gallery.photos.filter(photo => photo.status === "processing").length;
	const failedCount = gallery.photos.filter(photo => photo.status === "failed").length;
	const archivedCount = gallery.photos.filter(photo => photo.status === "archived").length;
	const sets = gallery.sets ?? [];
	const setCounts = Object.fromEntries(sets.map(set => [set.id, gallery.photos.filter(photo => photo.setId === set.id).length]));
	// Counted by exclusion so a photo left pointing at a deleted set lands here,
	// which is exactly where the client's manifest puts it.
	const ungroupedCount = gallery.photos.filter(photo => !sets.some(set => set.id === photo.setId)).length;
	// Looked up rather than stored alongside the email, so reloading the panel picks up
	// whatever the visitor has added since — and a list that has gone away stops marking.
	const pickedVisitor = selection?.visitors.find(visitor => visitorKey(visitor) === picked) ?? null;
	const pickedPids = new Set((pickedVisitor?.photos ?? []).map(photo => photo.pid));

	return (
		<section className='admin-section'>
			<header className='admin-section__header'>
				<div>
					<Link className='admin-back' to='/admin'>
						← Galeries
					</Link>
					<h1 className='admin-section__title'>{gallery.title}</h1>
					<p className='admin-section__subtitle'>
						{readyCount} photo{readyCount > 1 ? "s" : ""} en ligne
						{pendingCount > 0 ? ` · ${pendingCount} en traitement` : ""}
						{failedCount > 0 ? ` · ${failedCount} en échec` : ""}
						{archivedCount > 0 ? ` · ${archivedCount} archivée${archivedCount > 1 ? "s" : ""}` : ""}
						{saving ? " · enregistrement…" : ""}
						{notice ? ` · ${notice}` : ""}
					</p>
				</div>

				<div className='admin-section__actions'>
					<select value={gallery.status} onChange={event => handleStatus(event.target.value)} aria-label='Statut de la galerie'>
						{Object.entries(STATUS_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</div>
			</header>

			{error ?
				<p className='admin-error' role='alert'>
					{error}
				</p>
			:	null}

			{/* The only place that explains how to get an archived gallery back, which
			    is worth a permanent line rather than a notice that fades: the answer
			    involves a 48-hour wait and is not guessable from the status select. */}
			{archivedCount > 0 ?
				<p className='admin-hint'>
					{archivedCount} photo{archivedCount > 1 ? "s" : ""} archivée{archivedCount > 1 ? "s" : ""} : seuls les originaux subsistent.{" "}
					{gallery.status === "archived" ?
						"Repassez la galerie en brouillon ou en ligne pour lancer leur restauration."
					:	"Régénérez les aperçus pour les reconstruire — sortir les originaux d’archive peut prendre jusqu’à 48 h."}
				</p>
			:	null}

			<div className='admin-panels'>
				<article className='admin-panel'>
					<h2 className='admin-panel__title'>Informations</h2>

					<div className='admin-form-grid'>
						<div className='field'>
							<label htmlFor='gallery-title'>Titre</label>
							<input id='gallery-title' type='text' defaultValue={gallery.title} onBlur={handleTitleBlur} />
						</div>

						<div className='field'>
							<label htmlFor='gallery-slug'>Identifiant d’URL</label>
							<input id='gallery-slug' ref={slugRef} type='text' defaultValue={gallery.slug} onBlur={handleSlugBlur} />
						</div>

						<div className='field'>
							<label htmlFor='gallery-client'>Nom du client</label>
							<input id='gallery-client' type='text' defaultValue={gallery.clientName} onBlur={event => event.target.value !== gallery.clientName && patch({ clientName: event.target.value })} />
						</div>

						<div className='field'>
							<label htmlFor='gallery-email'>Email du client</label>
							<input id='gallery-email' type='email' defaultValue={gallery.clientEmail} onBlur={event => event.target.value !== gallery.clientEmail && patch({ clientEmail: event.target.value })} />
						</div>

						<div className='field'>
							<label htmlFor='gallery-shoot'>Date de séance</label>
							<input id='gallery-shoot' type='date' defaultValue={toDateInput(gallery.shootDate)} onChange={event => patch({ shootDate: event.target.value || null })} />
						</div>

						<div className='field'>
							<label htmlFor='gallery-expires'>Expire le</label>
							<input id='gallery-expires' type='date' defaultValue={toDateInput(gallery.expiresAt)} onChange={event => patch({ expiresAt: event.target.value || null })} />
						</div>
					</div>
				</article>

				<article className='admin-panel'>
					<h2 className='admin-panel__title'>Accès et protection</h2>

					<div className='field'>
						<label htmlFor='gallery-password'>Mot de passe {gallery.hasPassword ? "(défini)" : "(aucun)"}</label>
						<div className='admin-inline-form'>
							<input
								id='gallery-password'
								type='text'
								value={password}
								placeholder={gallery.hasPassword ? "Nouveau mot de passe" : "6 caractères minimum"}
								onChange={event => setPassword(event.target.value)}
							/>
							<button
								className='button-secondary'
								type='button'
								disabled={password.length < 6}
								onClick={async () => {
									await patch({ password });
									setPassword("");
								}}>
								Définir
							</button>
							{gallery.hasPassword ?
								<button className='button-secondary' type='button' onClick={() => patch({ password: "" })}>
									Retirer
								</button>
							:	null}
						</div>
						{/* The record only ever holds a hash, so an existing password can be
						    replaced but never displayed. */}
						<p className='admin-hint'>Le mot de passe n’est pas conservé en clair : il peut être remplacé, pas relu.</p>
					</div>

					<div className='admin-toggles'>
						<label className='admin-toggle'>
							<input type='checkbox' checked={gallery.downloadsEnabled} onChange={event => patch({ downloadsEnabled: event.target.checked })} />
							<span>Téléchargements autorisés</span>
						</label>
					</div>

					{/* The master switch, and nothing else: it alone decides whether the API
					    signs anything under d/. Which files each tab actually offers — the
					    photos in no category included — is set per tab in the panel below,
					    because those settings have to be able to differ from one another. */}
					<p className='admin-hint'>
						Interrupteur général : le couper coupe les téléchargements de toute la galerie, catégories comprises. Le détail (haute définition ou simple aperçu web) se règle
						catégorie par catégorie dans le panneau « Catégories ».
					</p>

					<div className='field'>
						<label htmlFor='gallery-watermark'>Filigrane par défaut</label>
						<select id='gallery-watermark' value={gallery.watermark} onChange={event => handleGalleryWatermark(event.target.value)}>
							{Object.entries(WATERMARK_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						{/* The one thing it is easy to expect and not get: a category carrying its
						    own mode ignores this entirely. The photos already uploaded are handled
						    by the offer that follows the change, so the hint no longer has to send
						    the photographer to a button. */}
						<p className='admin-hint'>
							S’applique aux onglets qui n’ont pas leur propre réglage. Le changer propose de régénérer les photos déjà en ligne, puisque le filigrane est incrusté dans
							les fichiers.
						</p>
					</div>

					<div className='admin-panel__footer'>
						<button className='button-secondary' type='button' onClick={handleReprocess}>
							Régénérer les aperçus
						</button>
						<button className='button-secondary admin-danger' type='button' onClick={handleDelete}>
							Supprimer la galerie
						</button>
					</div>
				</article>

				<article className='admin-panel admin-panel--wide'>
					<h2 className='admin-panel__title'>Partage</h2>
					<SharePanel gallery={gallery} publicUrl={publicUrl} />
				</article>

				<article className='admin-panel admin-panel--wide'>
					<h2 className='admin-panel__title'>Catégories</h2>
					<SetsPanel
						sets={sets}
						counts={setCounts}
						ungroupedCount={ungroupedCount}
						ungrouped={gallery.ungrouped}
						downloadsEnabled={gallery.downloadsEnabled}
						onUpdateUngrouped={changes => patch({ ungrouped: changes })}
						onWatermark={handleWatermark}
						onRegenerate={handleRegenerateSet}
						onCreate={title => withGallery(() => adminApi.createSet(gid, title))}
						onUpdate={(sid, changes) => withGallery(() => adminApi.updateSet(gid, sid, changes))}
						onReorder={order => withGallery(() => adminApi.reorderSets(gid, order))}
						onDelete={handleDeleteSet}
					/>
				</article>

				<article className='admin-panel admin-panel--wide'>
					<h2 className='admin-panel__title'>Photos</h2>
					<Uploader gid={gid} sets={sets} archived={gallery.status === "archived"} watermarkOf={setId => watermarkFor(gallery, setId)} onUploaded={reconcile} />

					<div className='admin-panel__toolbar'>
						<button className='button-secondary' type='button' onClick={reconcile}>
							Actualiser
						</button>
						<button className='button-secondary' type='button' onClick={toggleSelection}>
							{selection ? "Masquer les sélections" : "Voir les sélections"}
						</button>
						<button className='button-secondary' type='button' disabled={gallery.photos.length < 2} onClick={handleSortByFilename}>
							Trier par nom de fichier
						</button>
					</div>

					{/* One list per person: a gallery link goes to everyone who was
					    photographed, and which photo is on whose list is the point. */}
					{selection ?
						<div className='admin-selection'>
							{selection.visitors.length === 0 ?
								<p className='admin-hint'>Personne n’a encore sélectionné de photo.</p>
							:	selection.visitors.map(visitor => {
									const key = visitorKey(visitor);
									const marking = key === picked;

									return (
										<div className='admin-selection__visitor' key={key}>
											<div className='admin-selection__header'>
												<p className='admin-hint'>
													<strong>{visitor.email || "Sélection sans email"}</strong> — {visitor.photos.length} photo{visitor.photos.length > 1 ? "s" : ""}
													{visitor.updatedAt ? `, le ${new Date(visitor.updatedAt).toLocaleString("fr-FR")}` : ""}
												</p>

												{/* File names alone cannot be recognised — pointing at the
												    photos themselves is what the photographer is after. */}
												<button
													className='button-secondary admin-selection__mark'
													type='button'
													aria-pressed={marking}
													onClick={() => setPicked(marking ? null : key)}>
													{marking ? "Masquer dans la grille" : "Voir dans la grille"}
												</button>
											</div>

											<ul className='admin-selection__list'>
												{visitor.photos.map(photo => (
													<li key={photo.pid}>{photo.originalName || photo.pid}</li>
												))}
											</ul>
										</div>
									);
								})
							}
						</div>
					:	null}

					{/* Repeated here because the grid is long: whose selection is being read
					    has to stay legible once the panel above has scrolled away. */}
					{pickedVisitor ?
						<p className='admin-selection__legend'>
							<span className='admin-selection__heart' aria-hidden='true'>
								♥
							</span>
							{pickedVisitor.photos.length} photo{pickedVisitor.photos.length > 1 ? "s" : ""} choisie{pickedVisitor.photos.length > 1 ? "s" : ""} par{" "}
							<strong>{pickedVisitor.email || "un visiteur sans email"}</strong>
							<button className='button-secondary admin-selection__mark' type='button' onClick={() => setPicked(null)}>
								Tout réafficher
							</button>
						</p>
					:	null}

					<AdminPhotoGrid
						photos={gallery.photos}
						sets={sets}
						pickedPids={pickedPids}
						coverPid={gallery.coverPid}
						onReorder={order => adminApi.updatePhotos(gid, { order }).then(payload => setGallery(payload.gallery))}
						onSetCover={pid => patch({ coverPid: pid })}
						onDelete={handleDeletePhoto}
						onCaption={(pid, caption) => adminApi.updatePhotos(gid, { captions: { [pid]: caption } }).then(payload => setGallery(payload.gallery))}
						onAssign={handleAssign}
					/>
				</article>
			</div>
		</section>
	);
}
