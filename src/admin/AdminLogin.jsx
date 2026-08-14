import { useState } from "react";
import { adminApi } from "../utils/galleryApi.js";

export function AdminLogin({ onAuthenticated }) {
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState("idle");
	const [error, setError] = useState("");

	const handleSubmit = async event => {
		event.preventDefault();
		setStatus("sending");
		setError("");

		try {
			await adminApi.login(password);
			onAuthenticated();
		} catch (failure) {
			setStatus("idle");
			setPassword("");
			setError(failure.status === 401 ? "Mot de passe incorrect." : "Connexion impossible pour le moment.");
		}
	};

	return (
		<div className='admin-login'>
			<form className='admin-login__panel' onSubmit={handleSubmit}>
				<span className='admin-login__eyebrow'>Ankaa Studio</span>
				<h1 className='admin-login__title'>Administration des galeries</h1>

				<div className='field'>
					<label htmlFor='admin-password'>Mot de passe</label>
					<input
						id='admin-password'
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
					{status === "sending" ? "Connexion…" : "Se connecter"}
				</button>

				{error ?
					<p className='admin-login__error' role='alert'>
						{error}
					</p>
				:	null}
			</form>
		</div>
	);
}
