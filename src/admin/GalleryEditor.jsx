import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApi } from "../utils/galleryApi.js";
import { AdminPhotoGrid } from "./AdminPhotoGrid.jsx";
import { SharePanel } from "./SharePanel.jsx";
import { Uploader } from "./Uploader.jsx";

// While derivatives are still being produced, poll the record so tiles appear as
// they become ready. Stops as soon as nothing is pending.
const POLL_INTERVAL_MS = 4000;

const WATERMARK_LABELS = {
	preview: "Aperçus uniquement (recommandé)",
	all: "Aperçus et fichiers HD",
	none: "Aucun filigrane"
};

const STATUS_LABELS = {
	draft: "Brouillon — invisible pour le client",
	published: "En ligne — accessible via le lien",
	archived: "Archivée — le lien renvoie une page d’expiration"
};

/** ISO timestamp ⇄ the yyyy-mm-dd that <input type="date"> wants. */
const toDateInput = value => (value ? value.slice(0, 10) : "");

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

	const handleReprocess = async () => {
		if (!window.confirm("Régénérer tous les aperçus avec les réglages actuels de filigrane ? Les archives ZIP en cache seront supprimées.")) {
			return;
		}

		try {
			await adminApi.reprocess(gid);
			setNotice("Régénération lancée.");
			await reconcile();
		} catch (failure) {
			setError(failure.message);
		}
	};

	const loadSelection = async () => {
		try {
			setSelection(await adminApi.selection(gid));
		} catch (failure) {
			setError(failure.message);
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
						{saving ? " · enregistrement…" : ""}
						{notice ? ` · ${notice}` : ""}
					</p>
				</div>

				<div className='admin-section__actions'>
					<select value={gallery.status} onChange={event => patch({ status: event.target.value })} aria-label='Statut de la galerie'>
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
							<input
								id='gallery-client'
								type='text'
								defaultValue={gallery.clientName}
								onBlur={event => event.target.value !== gallery.clientName && patch({ clientName: event.target.value })}
							/>
						</div>

						<div className='field'>
							<label htmlFor='gallery-email'>Email du client</label>
							<input
								id='gallery-email'
								type='email'
								defaultValue={gallery.clientEmail}
								onBlur={event => event.target.value !== gallery.clientEmail && patch({ clientEmail: event.target.value })}
							/>
						</div>

						<div className='field'>
							<label htmlFor='gallery-shoot'>Date de séance</label>
							<input
								id='gallery-shoot'
								type='date'
								defaultValue={toDateInput(gallery.shootDate)}
								onChange={event => patch({ shootDate: event.target.value || null })}
							/>
						</div>

						<div className='field'>
							<label htmlFor='gallery-expires'>Expire le</label>
							<input
								id='gallery-expires'
								type='date'
								defaultValue={toDateInput(gallery.expiresAt)}
								onChange={event => patch({ expiresAt: event.target.value || null })}
							/>
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
								}}
							>
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

					<div className='field'>
						<label htmlFor='gallery-watermark'>Filigrane</label>
						<select id='gallery-watermark' value={gallery.watermark} onChange={event => patch({ watermark: event.target.value })}>
							{Object.entries(WATERMARK_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						<p className='admin-hint'>Changer ce réglage n’affecte que les nouvelles photos. Utilisez « Régénérer » pour appliquer aux photos existantes.</p>
					</div>

					<div className='admin-toggles'>
						<label className='admin-toggle'>
							<input type='checkbox' checked={gallery.downloadsEnabled} onChange={event => patch({ downloadsEnabled: event.target.checked })} />
							<span>Téléchargements autorisés</span>
						</label>

						<label className='admin-toggle'>
							<input type='checkbox' checked={gallery.hdEnabled} disabled={!gallery.downloadsEnabled} onChange={event => patch({ hdEnabled: event.target.checked })} />
							<span>Fichiers haute définition</span>
						</label>

						<label className='admin-toggle'>
							<input type='checkbox' checked={gallery.zipEnabled} disabled={!gallery.downloadsEnabled} onChange={event => patch({ zipEnabled: event.target.checked })} />
							<span>Archive ZIP groupée</span>
						</label>
					</div>

					<p className='admin-hint'>Sans haute définition, le client télécharge l’aperçu web filigrané photo par photo.</p>

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
					<h2 className='admin-panel__title'>Photos</h2>
					<Uploader gid={gid} onUploaded={reconcile} />

					<div className='admin-panel__toolbar'>
						<button className='button-secondary' type='button' onClick={reconcile}>
							Actualiser
						</button>
						<button className='button-secondary' type='button' onClick={loadSelection}>
							Voir la sélection du client
						</button>
					</div>

					{selection ?
						<div className='admin-selection'>
							{selection.photos.length === 0 ?
								<p className='admin-hint'>Le client n’a encore rien sélectionné.</p>
							:	<>
									<p className='admin-hint'>
										{selection.photos.length} photo{selection.photos.length > 1 ? "s" : ""} sélectionnée{selection.photos.length > 1 ? "s" : ""}
										{selection.updatedAt ? ` le ${new Date(selection.updatedAt).toLocaleString("fr-FR")}` : ""} :
									</p>
									<ul className='admin-selection__list'>
										{selection.photos.map(photo => (
											<li key={photo.pid}>{photo.originalName || photo.pid}</li>
										))}
									</ul>
								</>
							}
						</div>
					:	null}

					<AdminPhotoGrid
						photos={gallery.photos}
						coverPid={gallery.coverPid}
						onReorder={order => adminApi.updatePhotos(gid, { order }).then(payload => setGallery(payload.gallery))}
						onSetCover={pid => patch({ coverPid: pid })}
						onDelete={handleDeletePhoto}
						onCaption={(pid, caption) => adminApi.updatePhotos(gid, { captions: { [pid]: caption } }).then(payload => setGallery(payload.gallery))}
					/>
				</article>
			</div>
		</section>
	);
}
