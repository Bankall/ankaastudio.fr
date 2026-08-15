import { useEffect, useRef, useState } from "react";
import { galleryApi } from "../utils/galleryApi.js";
import { readDownloadEmail, storeDownloadEmail } from "./downloadEmail.js";
import { EmailPrompt } from "./EmailPrompt.jsx";

const POLL_INTERVAL_MS = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Batch download controls.
 *
 * A ZIP is built asynchronously, so this owns the whole job lifecycle: ask for an
 * email, request, poll, then hand over signed links. Archives are content-addressed
 * server-side, so asking twice for the same set is answered from cache instantly.
 *
 * The email is asked for every time rather than reused silently: it is the address
 * the link is sent to, and a client who wants it somewhere else must be able to say
 * so. It is only prefilled with whatever was typed last.
 */
export function DownloadPanel({ slug, downloads, photoCount, selection }) {
	const [job, setJob] = useState(null);
	const [error, setError] = useState("");
	const [scope, setScope] = useState(null);
	// The download waiting on an address: { pids, label }.
	const [pending, setPending] = useState(null);
	const [recipient, setRecipient] = useState("");
	const [emailFailed, setEmailFailed] = useState(false);
	const liveRef = useRef(true);

	// A build takes minutes; if the visitor leaves the page mid-way, stop polling
	// rather than keep setting state on a gone component.
	//
	// Raised on every mount, not just initialised once: StrictMode mounts, unmounts
	// and remounts in development, so a cleanup-only effect would lower this flag
	// and never raise it again — leaving every poll below convinced the component
	// was gone.
	useEffect(() => {
		liveRef.current = true;

		return () => {
			liveRef.current = false;
		};
	}, []);

	const start = async ({ pids, label }, address) => {
		setError("");
		setScope(label);
		setRecipient(address);
		setEmailFailed(false);
		// `||`, not `??`: "tout télécharger" passes an empty list, which means the
		// whole gallery — a count of nothing would read as "0 / 0 photos".
		setJob({ status: "pending", done: 0, total: pids?.length || photoCount });

		try {
			const response = await galleryApi.requestZip(slug, pids ?? [], address);

			if (!liveRef.current) {
				return;
			}

			setEmailFailed(response.emailed === false);

			// Cache hit: the archive already exists and came back signed.
			if (response.status === "done") {
				setJob(response);

				return;
			}

			// The server counted the photos it actually queued; show that rather than
			// wait a poll for it.
			setJob(current => ({ ...current, total: response.total ?? current?.total }));

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

	const confirm = address => {
		const request = pending;
		setPending(null);
		storeDownloadEmail(address);
		start(request, address);
	};

	if (!downloads.enabled) {
		return null;
	}

	const busy = job?.status === "pending" || job?.status === "running";
	const progress = busy && job.total ? Math.round((job.done / job.total) * 100) : 0;

	return (
		<div className='download-panel'>
			<div className='download-panel__actions'>
				{downloads.zip ?
					<button
						className='button'
						type='button'
						onClick={() => setPending({ pids: [], label: "toutes les photos" })}
						disabled={busy || photoCount === 0}
					>
						Tout télécharger ({photoCount})
					</button>
				:	null}

				{downloads.zip && selection.length > 0 ?
					<button
						className='button-secondary'
						type='button'
						onClick={() => setPending({ pids: selection, label: "votre sélection" })}
						disabled={busy}
					>
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
						Préparation de {scope} — {job.done ?? 0} / {job.total ?? photoCount} photos.
						{emailFailed ?
							" Gardez cette page ouverte : le lien s’affichera ici."
						:	` Le lien sera envoyé à ${recipient} dès que l’archive est prête, vous pouvez fermer cette page.`}
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
					    a stale tab produce a mystifying 403. The emailed one is not: it
					    points at a page that re-signs on arrival. */}
					<p className='download-panel__note'>
						Ces liens restent valables quelques minutes. Relancez la préparation si nécessaire.
						{emailFailed || !recipient ? "" : ` Un lien valable 7 jours a aussi été envoyé à ${recipient}.`}
					</p>
					{emailFailed ?
						<p className='download-panel__note'>L’email n’a pas pu être envoyé — utilisez les liens ci-dessus.</p>
					:	null}
				</div>
			:	null}

			{error ?
				<p className='download-panel__error' role='alert'>
					{error}
				</p>
			:	null}

			{pending ?
				<EmailPrompt
					title='Recevoir votre archive'
					message={`Indiquez votre email : le lien de téléchargement de ${pending.label} vous y sera envoyé dès que l’archive est prête.`}
					submitLabel='Préparer mon archive'
					defaultEmail={readDownloadEmail()}
					onSubmit={confirm}
					onCancel={() => setPending(null)}
				/>
			:	null}
		</div>
	);
}
