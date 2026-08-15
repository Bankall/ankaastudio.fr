import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi } from "../utils/galleryApi.js";

const STATUS_LABELS = {
	draft: "Brouillon",
	published: "En ligne",
	archived: "Archivée"
};

function formatDate(value) {
	if (!value) {
		return "—";
	}

	return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function GalleryList() {
	const navigate = useNavigate();
	const [galleries, setGalleries] = useState(null);
	const [error, setError] = useState("");
	const [creating, setCreating] = useState(false);
	const [title, setTitle] = useState("");

	useEffect(() => {
		adminApi
			.listGalleries()
			.then(payload => setGalleries(payload.galleries))
			.catch(() => setError("Impossible de charger les galeries."));
	}, []);

	const handleCreate = async event => {
		event.preventDefault();
		setCreating(true);
		setError("");

		try {
			const { gallery } = await adminApi.createGallery({ title });
			// Straight into the editor: a gallery with no photos has nothing to show
			// in the list anyway.
			navigate(`/admin/galleries/${gallery.id}`);
		} catch (failure) {
			setCreating(false);
			setError(failure.message);
		}
	};

	return (
		<section className='admin-section'>
			<header className='admin-section__header'>
				<div>
					<h1 className='admin-section__title'>Galeries</h1>
					<p className='admin-section__subtitle'>{galleries ? `${galleries.length} galerie${galleries.length > 1 ? "s" : ""}` : "Chargement…"}</p>
				</div>

				<form className='admin-create' onSubmit={handleCreate}>
					<input type='text' required placeholder='Titre de la nouvelle galerie' value={title} onChange={event => setTitle(event.target.value)} aria-label='Titre de la galerie' />
					<button className='button' type='submit' disabled={creating || title.trim().length === 0}>
						{creating ? "Création…" : "Créer"}
					</button>
				</form>
			</header>

			{error ?
				<p className='admin-error' role='alert'>
					{error}
				</p>
			:	null}

			{galleries?.length === 0 ?
				<p className='admin-empty'>Aucune galerie pour l’instant. Créez la première ci-dessus.</p>
			:	null}

			<ul className='admin-gallery-list'>
				{(galleries ?? []).map(gallery => (
					<li key={gallery.id}>
						<Link className='admin-gallery-card' to={`/admin/galleries/${gallery.id}`}>
							<span className='admin-gallery-card__thumb'>
								{gallery.cover ?
									<img src={gallery.cover} alt='' loading='lazy' />
								:	<span className='admin-gallery-card__placeholder'>—</span>}
							</span>

							<span className='admin-gallery-card__body'>
								<strong className='admin-gallery-card__title'>{gallery.title}</strong>
								<span className='admin-gallery-card__meta'>
									{[gallery.clientName, formatDate(gallery.shootDate), `${gallery.photoCount} photo${gallery.photoCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
								</span>
								<span className='admin-gallery-card__flags'>
									<span className={`admin-badge admin-badge--${gallery.status}`}>{STATUS_LABELS[gallery.status] ?? gallery.status}</span>
									{gallery.hasPassword ?
										<span className='admin-badge'>Protégée</span>
									:	null}
									{gallery.downloadsEnabled ?
										null
									:	<span className='admin-badge'>Téléchargements off</span>}
									{gallery.expiresAt ?
										<span className='admin-badge'>Expire le {formatDate(gallery.expiresAt)}</span>
									:	null}
								</span>
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
