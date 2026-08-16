import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { ApiError, galleryApi } from "../utils/galleryApi.js";

// Slower than the in-gallery poll: nobody is watching a progress bar here, they
// came back to a link and want the file.
const POLL_INTERVAL_MS = 5000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Where the emailed archive link lands.
 *
 * The token in the URL is the whole credential — the mail is usually opened on a
 * device that never saw the gallery — so this page asks for nothing. It signs
 * nothing either: the API re-signs the parts on every read, which is why the
 * emailed link can outlive the few minutes a signed URL is good for.
 */
export function ArchivePage() {
	const { token } = useParams();
	const [state, setState] = useState({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			for (;;) {
				try {
					const payload = await galleryApi.readArchive(token);

					if (cancelled) {
						return;
					}

					setState({ status: payload.status, archive: payload });

					if (payload.status === "done" || payload.status === "failed") {
						return;
					}
				} catch (failure) {
					if (cancelled) {
						return;
					}

					const status = failure instanceof ApiError ? failure.status : 0;

					setState({
						status: "error",
						message:
							status === 404 ? "Ce lien a expiré. Retournez dans votre galerie pour demander une nouvelle archive."
							: status === 403 ? "Les téléchargements ne sont plus autorisés pour cette galerie."
							: status === 410 ? failure.message
							: "Une erreur est survenue. Réessayez dans un instant."
					});

					return;
				}

				await sleep(POLL_INTERVAL_MS);
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, [token]);

	const { archive } = state;
	const building = state.status === "pending" || state.status === "running";
	const progress = building && archive?.total ? Math.round((archive.done / archive.total) * 100) : 0;

	return (
		<div className='gallery-view gallery-view--centered'>
			<Seo title='Votre archive photo | Ankaa Studio' description='Téléchargement de votre archive photo.' path={`/archive/${token}`} noIndex />

			<div className='gallery-view__empty archive-card'>
				<h1 className='gallery-view__title'>{archive?.title ? `Archive — ${archive.title}` : "Votre archive photo"}</h1>

				{/* Which set, when it was one: the same gallery can have sent several links. */}
				{archive?.setTitle ?
					<p className='gallery-view__status'>Ensemble « {archive.setTitle} »</p>
				:	null}

				{state.status === "loading" ?
					<p className='gallery-view__status'>Vérification du lien…</p>
				:	null}

				{building ?
					<div className='download-panel__progress'>
						<div className='download-panel__bar'>
							<span style={{ width: `${progress}%` }} />
						</div>
						<p className='download-panel__note'>
							Préparation en cours — {archive.done ?? 0} / {archive.total} photos. Cette page se met à jour toute seule.
						</p>
					</div>
				:	null}

				{state.status === "done" ?
					<div className='download-panel__ready'>
						{archive.parts.length === 1 ?
							<a className='button' href={archive.parts[0].url} download>
								Télécharger l’archive
							</a>
						:	<>
								<p className='download-panel__note'>L’archive est découpée en {archive.parts.length} fichiers. Téléchargez-les tous.</p>
								<ul className='download-panel__parts'>
									{archive.parts.map(part => (
										<li key={part.name}>
											<a className='button-secondary' href={part.url} download>
												{part.name}
											</a>
										</li>
									))}
								</ul>
							</>
						}
						<p className='download-panel__note'>
							Si un téléchargement échoue, rechargez cette page : les liens sont signés pour quelques minutes seulement.
						</p>
					</div>
				:	null}

				{state.status === "failed" ?
					<p className='gallery-view__status'>La préparation de l’archive a échoué. Demandez-en une nouvelle depuis votre galerie.</p>
				:	null}

				{state.status === "error" ?
					<p className='gallery-view__status'>{state.message}</p>
				:	null}

				{archive?.slug ?
					<a className='button-secondary' href={`/gallery/${archive.slug}`}>
						Retour à la galerie
					</a>
				:	null}
			</div>
		</div>
	);
}
