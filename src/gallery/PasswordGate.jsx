import { useState } from "react";

/**
 * The lock screen a client sees before a protected gallery loads.
 *
 * Deliberately says as little as possible about what is behind it: the title and
 * the client name only, both of which the recipient already knows.
 */
export function PasswordGate({ title, clientName, onUnlock }) {
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState("idle");
	const [error, setError] = useState("");

	const handleSubmit = async event => {
		event.preventDefault();
		setStatus("sending");
		setError("");

		try {
			await onUnlock(password);
		} catch (failure) {
			setStatus("idle");
			setError(failure.status === 401 ? "Mot de passe incorrect." : "Impossible d’ouvrir la galerie pour le moment.");
		}
	};

	return (
		<div className='gallery-gate'>
			<form className='gallery-gate__panel' onSubmit={handleSubmit}>
				<span className='gallery-gate__eyebrow'>Galerie privée</span>
				<h1 className='gallery-gate__title'>{title || "Galerie protégée"}</h1>
				<p className='gallery-gate__text'>{clientName ? `Bonjour ${clientName}, saisissez le mot de passe reçu par email.` : "Saisissez le mot de passe reçu par email."}</p>

				<div className='field'>
					<label htmlFor='gallery-password'>Mot de passe</label>
					<input
						id='gallery-password'
						name='password'
						type='password'
						autoComplete='current-password'
						required
						autoFocus
						value={password}
						onChange={event => setPassword(event.target.value)}
					/>
				</div>

				<button className='button' type='submit' disabled={status === "sending" || password.length === 0}>
					{status === "sending" ? "Ouverture…" : "Ouvrir la galerie"}
				</button>

				{error ?
					<p className='gallery-gate__error' role='alert'>
						{error}
					</p>
				:	null}
			</form>
		</div>
	);
}
