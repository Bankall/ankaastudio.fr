import { useState } from "react";
import { adminApi } from "../utils/galleryApi.js";

/**
 * Sends the gallery link to the client.
 *
 * The password is typed here rather than read from the record on purpose — it is
 * stored only as a hash, so this is the one moment it can be included in the
 * email, and only because the photographer just typed it.
 */
export function SharePanel({ gallery, publicUrl }) {
	const [to, setTo] = useState(gallery.clientEmail ?? "");
	const [password, setPassword] = useState("");
	const [note, setNote] = useState("");
	const [status, setStatus] = useState("idle");
	const [message, setMessage] = useState("");
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(publicUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setMessage("Copie impossible, sélectionnez le lien manuellement.");
		}
	};

	const handleSubmit = async event => {
		event.preventDefault();
		setStatus("sending");
		setMessage("");

		try {
			const result = await adminApi.share(gallery.id, { to, password: password || undefined, note: note || undefined });
			setStatus("sent");
			setMessage(`Email envoyé à ${result.sentTo}.`);
			setPassword("");
		} catch (failure) {
			setStatus("idle");
			setMessage(failure.message);
		}
	};

	return (
		<div className='admin-share'>
			<div className='admin-share__link'>
				<label htmlFor='share-link'>Lien client</label>
				<div className='admin-share__link-row'>
					<input id='share-link' type='text' readOnly value={publicUrl} onFocus={event => event.target.select()} />
					<button type='button' className='button-secondary' onClick={handleCopy}>
						{copied ? "Copié" : "Copier"}
					</button>
					<a className='button-secondary' href={publicUrl} target='_blank' rel='noreferrer'>
						Ouvrir
					</a>
				</div>
			</div>

			<form className='admin-share__form' onSubmit={handleSubmit}>
				<div className='field'>
					<label htmlFor='share-to'>Envoyer à</label>
					<input id='share-to' type='email' required value={to} onChange={event => setTo(event.target.value)} placeholder='client@exemple.fr' />
				</div>

				<div className='field'>
					<label htmlFor='share-password'>Mot de passe à rappeler (optionnel)</label>
					<input id='share-password' type='text' value={password} onChange={event => setPassword(event.target.value)} placeholder='Laisser vide pour ne pas l’inclure' />
				</div>

				<div className='field'>
					<label htmlFor='share-note'>Message (optionnel)</label>
					<textarea id='share-note' rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
				</div>

				<button className='button' type='submit' disabled={status === "sending" || gallery.status !== "published"}>
					{status === "sending" ? "Envoi…" : "Envoyer le lien"}
				</button>

				{gallery.status !== "published" ?
					<p className='admin-hint'>Publiez la galerie pour pouvoir l’envoyer.</p>
				:	null}

				{message ?
					<p className='admin-hint' role='status'>
						{message}
					</p>
				:	null}
			</form>
		</div>
	);
}
