import { useRef, useState } from "react";
import { adminApi, uploadToS3 } from "../utils/galleryApi.js";

/**
 * The two messages the client gets, in the order they are sent: the gallery going
 * online, and the retouched set handed over with its invoice.
 *
 * One form for both, switched by the select at the top, because almost all of it is
 * shared — the recipient, the note, and the fact that neither can be sent before the
 * gallery is published. What differs is what each message needs to carry, and those
 * fields appear with the template that uses them rather than sitting greyed out.
 */
const TEMPLATES = [
	{
		id: "online",
		label: "Galerie en ligne",
		hint: "Le lien vers la galerie, le mot de passe s’il y en a un, et la date de fin d’accès."
	},
	{
		id: "delivery",
		label: "Retouches terminées",
		hint: "Le lien vers la catégorie retouchée, la facture en pièce jointe et la demande d’avis Google."
	}
];

const formatDate = value => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function SharePanel({ gallery, publicUrl }) {
	const [template, setTemplate] = useState("online");
	const [to, setTo] = useState(gallery.clientEmail ?? "");
	// Typed here rather than read from the record on purpose — it is stored only as a
	// hash, so this is the one moment it can be included in the email, and only
	// because the photographer just typed it.
	const [password, setPassword] = useState("");
	const [note, setNote] = useState("");
	// Which tab the delivery link opens on. Starts on the one the last delivery used:
	// a second message about the same shoot is nearly always about the same set.
	const [setId, setSetId] = useState(gallery.delivery?.setId ?? "");
	const [invoice, setInvoice] = useState(null);
	// What the last send from this panel attached, which the record only learns on the
	// next read of the gallery: without it, sending a delivery and then sending it
	// again to a second address would ask for the PDF a second time.
	const [sent, setSent] = useState("");
	const [status, setStatus] = useState("idle");
	const [message, setMessage] = useState("");
	const [copied, setCopied] = useState(false);
	// A file input holds its own value, so clearing the state after a send is not what
	// empties the control — the name of a PDF that has already gone out would sit
	// there next to the line saying it was sent.
	const invoiceRef = useRef(null);

	const sets = gallery.sets ?? [];
	// The invoice the last delivery went out with, still in the bucket. It is what
	// makes a re-send — a wrong address, a client who lost the mail — a matter of
	// pressing the button again rather than finding the PDF a second time.
	const storedInvoice = sent || (gallery.delivery?.invoiceName ?? "");
	const busy = status === "sending" || status === "uploading";
	const unpublished = gallery.status !== "published";
	const missingInvoice = template === "delivery" && !invoice && !storedInvoice;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(publicUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setMessage("Copie impossible, sélectionnez le lien manuellement.");
		}
	};

	/** Straight to S3 like a photo, then the share call names the key it answers with. */
	const uploadInvoice = async file => {
		setStatus("uploading");
		const upload = await adminApi.requestInvoiceUpload(gallery.id, file);
		await uploadToS3({ url: upload.url, fields: upload.fields, file });

		return upload.key;
	};

	const handleSubmit = async event => {
		event.preventDefault();
		setStatus("sending");
		setMessage("");

		try {
			// Undefined rather than null for everything optional: the API reads an absent
			// field as "nothing to say", and on the invoice that is what means "send the
			// one the last delivery used". Checked against the template too, so a PDF
			// picked and then left behind by a switch back to the first message is not
			// uploaded for a mail that cannot carry it.
			const invoiceKey = template === "delivery" && invoice ? await uploadInvoice(invoice) : undefined;

			setStatus("sending");
			const result = await adminApi.share(gallery.id, {
				template,
				to,
				...(template === "online" ? { password: password || undefined } : { setId: setId || undefined, invoiceKey }),
				note: note || undefined
			});

			setStatus("sent");
			setMessage(result.invoiceName ? `Email envoyé à ${result.sentTo}, facture ${result.invoiceName} en pièce jointe.` : `Email envoyé à ${result.sentTo}.`);
			setPassword("");
			setInvoice(null);

			if (invoiceRef.current) {
				invoiceRef.current.value = "";
			}

			if (result.invoiceName) {
				setSent(result.invoiceName);
			}
		} catch (failure) {
			setStatus("idle");
			setMessage(failure.message);
		}
	};

	const chosen = TEMPLATES.find(candidate => candidate.id === template) ?? TEMPLATES[0];

	return (
		<div className='admin-share'>
			<div className='admin-share__form'>
				<div className='field'>
					<label htmlFor='share-link'>Lien client</label>
					<div className='admin-share__link-col'>
						<input id='share-link' type='text' readOnly value={publicUrl} onFocus={event => event.target.select()} />

						<div className='admin-share__link-actions'>
							<button type='button' className='button-secondary' onClick={handleCopy}>
								{copied ? "Copié" : "Copier"}
							</button>
							<a className='button-secondary' href={publicUrl} target='_blank' rel='noreferrer'>
								Ouvrir
							</a>
						</div>
					</div>
				</div>

				<div className='field'>
					<label htmlFor='share-template'>Message</label>
					<select id='share-template' value={template} disabled={busy} onChange={event => setTemplate(event.target.value)}>
						{TEMPLATES.map(item => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
					<p className='admin-hint'>{chosen.hint}</p>
				</div>
			</div>

			<form className='admin-share__form' onSubmit={handleSubmit}>
				<div className='field'>
					<label htmlFor='share-to'>Envoyer à</label>
					<input id='share-to' type='email' required value={to} onChange={event => setTo(event.target.value)} placeholder='client@exemple.fr' />
				</div>

				{template === "online" ?
					<div className='field'>
						<label htmlFor='share-password'>Mot de passe à rappeler (optionnel)</label>
						<input id='share-password' type='text' value={password} onChange={event => setPassword(event.target.value)} placeholder='Laisser vide pour ne pas l’inclure' />
					</div>
				:	<>
						{/* Only when there is a choice to make: a gallery that was never split
						    into tabs is delivered whole, and the link goes to all of it. */}
						{sets.length > 0 ?
							<div className='field'>
								<label htmlFor='share-set'>Catégorie retouchée</label>
								<select id='share-set' value={setId} disabled={busy} onChange={event => setSetId(event.target.value)}>
									<option value=''>Toute la galerie</option>
									{sets.map(set => (
										<option key={set.id} value={set.id}>
											{set.title}
										</option>
									))}
								</select>
								<p className='admin-hint'>Le lien du mail ouvre la galerie sur cette catégorie.</p>
							</div>
						:	null}

						<div className='field'>
							<label htmlFor='share-invoice'>Facture (PDF)</label>
							<input
								ref={invoiceRef}
								id='share-invoice'
								type='file'
								accept='application/pdf,.pdf'
								disabled={busy}
								onChange={event => setInvoice(event.target.files?.[0] ?? null)}
							/>
							{/* Said only when no new file is chosen: with one picked, that is what
							    goes out, and naming the old one beside it reads as a choice. */}
							{storedInvoice && !invoice ?
								<p className='admin-hint'>
									Dernière facture envoyée : {storedInvoice}
									{/* Only the record's date, never one from this session: after a send
									    from here the message above has just said so, and the record's
									    stamp belongs to the delivery before it. */}
									{!sent && gallery.delivery?.sentAt ? ` (${formatDate(gallery.delivery.sentAt)})` : ""}. Elle sera renvoyée telle quelle si vous n’en choisissez pas une autre.
								</p>
							:	null}
						</div>
					</>
				}

				<div className='field'>
					<label htmlFor='share-note'>Message (optionnel)</label>
					<textarea id='share-note' rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
				</div>

				<button className='button' type='submit' disabled={busy || unpublished || missingInvoice}>
					{status === "uploading" ?
						"Envoi de la facture…"
					: status === "sending" ?
						"Envoi…"
					: template === "delivery" ?
						"Envoyer les retouches"
					:	"Envoyer le lien"}
				</button>

				{unpublished ?
					<p className='admin-hint'>Publiez la galerie pour pouvoir l’envoyer.</p>
				:	null}

				{missingInvoice ?
					<p className='admin-hint'>Choisissez la facture à joindre.</p>
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
