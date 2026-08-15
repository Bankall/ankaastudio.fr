import { useEffect, useRef, useState } from "react";

/**
 * Asks for an email address before a download starts.
 *
 * The address is never verified — a client who types nonsense still gets their
 * photos. It is there so the photographer learns that a download happened, and so
 * an archive that takes minutes to build can be handed over by email instead of
 * by a page the client has to keep open.
 */
export function EmailPrompt({ title, message, submitLabel, defaultEmail = "", busy = false, onSubmit, onCancel }) {
	const inputRef = useRef(null);
	const [value, setValue] = useState(defaultEmail);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	useEffect(() => {
		const handleKey = event => {
			// While this is open it owns the keyboard: captured and stopped so the
			// lightbox underneath does not navigate on an arrow key typed into the
			// email field, nor close on the Escape meant for this prompt.
			event.stopPropagation();

			if (event.key === "Escape") {
				onCancel();
			}
		};

		window.addEventListener("keydown", handleKey, true);

		return () => window.removeEventListener("keydown", handleKey, true);
	}, [onCancel]);

	const handleSubmit = event => {
		event.preventDefault();
		const trimmed = value.trim();

		if (trimmed) {
			onSubmit(trimmed);
		}
	};

	return (
		<div className='email-prompt' role='presentation' onClick={onCancel}>
			<form
				className='email-prompt__panel'
				role='dialog'
				aria-modal='true'
				aria-labelledby='email-prompt-title'
				// The backdrop closes the prompt; a click inside it must not.
				onClick={event => event.stopPropagation()}
				onSubmit={handleSubmit}
			>
				<h2 className='email-prompt__title' id='email-prompt-title'>
					{title}
				</h2>
				<p className='email-prompt__text'>{message}</p>

				<div className='field'>
					<label htmlFor='email-prompt-input'>Votre email</label>
					<input
						ref={inputRef}
						id='email-prompt-input'
						type='email'
						required
						autoComplete='email'
						placeholder='vous@exemple.fr'
						value={value}
						onChange={event => setValue(event.target.value)}
					/>
				</div>

				<div className='email-prompt__actions'>
					<button className='button' type='submit' disabled={busy || value.trim() === ""}>
						{busy ? "Un instant…" : submitLabel}
					</button>
					<button className='button-secondary' type='button' onClick={onCancel}>
						Annuler
					</button>
				</div>
			</form>
		</div>
	);
}
