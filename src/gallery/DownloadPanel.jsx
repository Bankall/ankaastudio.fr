import { useEffect, useRef, useState } from "react";
import { galleryApi } from "../utils/galleryApi.js";

const POLL_INTERVAL_MS = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Batch download controls.
 *
 * A ZIP is built asynchronously, so this owns the whole job lifecycle: request,
 * poll, then hand over signed links. Archives are content-addressed server-side,
 * so asking twice for the same set is answered from cache instantly.
 */
export function DownloadPanel({ slug, downloads, photoCount, selection }) {
	const [job, setJob] = useState(null);
	const [error, setError] = useState("");
	const [scope, setScope] = useState(null);
	const liveRef = useRef(true);

	// A build takes minutes; if the visitor leaves the page mid-way, stop polling
	// rather than keep setting state on a gone component.
	useEffect(
		() => () => {
			liveRef.current = false;
		},
		[]
	);

	const start = async (pids, label) => {
		setError("");
		setScope(label);
		setJob({ status: "pending", done: 0, total: pids?.length ?? photoCount });

		try {
			const response = await galleryApi.requestZip(slug, pids ?? []);

			// Cache hit: the archive already exists and came back signed.
			if (response.status === "done") {
				setJob(response);

				return;
			}

			// Otherwise follow the job until it settles.
			for (;;) {
				await sleep(POLL_INTERVAL_MS);

				if (!liveRef.current) {
					return;
				}

				const next = await galleryApi.readJob(response.jobId);
				setJob(next);

				if (next.status === "done") {
					return;
				}

				if (next.status === "failed") {
					setError("La préparation de l’archive a échoué. Réessayez dans un instant.");

					return;
				}
			}
		} catch (failure) {
			if (!liveRef.current) {
				return;
			}

			setJob(null);
			setError(failure.status === 403 ? "Les téléchargements sont désactivés pour cette galerie." : "Impossible de préparer l’archive.");
		}
	};

	if (!downloads.enabled) {
		return (
			<div className='download-panel'>
				<p className='download-panel__note'>Les téléchargements sont désactivés pour cette galerie. Contactez le studio si vous avez besoin des fichiers.</p>
			</div>
		);
	}

	const busy = job?.status === "pending" || job?.status === "running";
	const progress = busy && job.total ? Math.round((job.done / job.total) * 100) : 0;

	return (
		<div className='download-panel'>
			<div className='download-panel__actions'>
				{downloads.zip ?
					<button className='button' type='button' onClick={() => start([], "toutes les photos")} disabled={busy || photoCount === 0}>
						Tout télécharger ({photoCount})
					</button>
				:	null}

				{downloads.zip && selection.length > 0 ?
					<button className='button-secondary' type='button' onClick={() => start(selection, "votre sélection")} disabled={busy}>
						Télécharger ma sélection ({selection.length})
					</button>
				:	null}
			</div>

			{busy ?
				<div className='download-panel__progress'>
					<div className='download-panel__bar'>
						<span style={{ width: `${progress}%` }} />
					</div>
					<p className='download-panel__note'>
						Préparation de {scope} — {job.done ?? 0} / {job.total ?? photoCount} photos. Vous pouvez laisser cette page ouverte.
					</p>
				</div>
			:	null}

			{job?.status === "done" ?
				<div className='download-panel__ready'>
					{job.parts.length === 1 ?
						<a className='button' href={job.parts[0].url} download>
							Télécharger l’archive
						</a>
					:	<>
							<p className='download-panel__note'>L’archive est découpée en {job.parts.length} fichiers. Téléchargez-les tous.</p>
							<ul className='download-panel__parts'>
								{job.parts.map(part => (
									<li key={part.key ?? part.name}>
										<a className='button-secondary' href={part.url} download>
											{part.name}
										</a>
									</li>
								))}
							</ul>
						</>
					}
					{/* Links are signed for a few minutes only, so say so rather than let
					    a stale tab produce a mystifying 403. */}
					<p className='download-panel__note'>Ces liens restent valables quelques minutes. Relancez la préparation si nécessaire.</p>
				</div>
			:	null}

			{error ?
				<p className='download-panel__error' role='alert'>
					{error}
				</p>
			:	null}
		</div>
	);
}
