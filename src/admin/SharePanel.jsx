import { useRef, useState } from "react";
import { adminApi, uploadToS3 } from "../utils/galleryApi.js";
import { SHARE_TEMPLATE_LABELS, shareDefaults } from "../utils/shareTemplates.js";
import { RichTextEditor } from "./RichTextEditor.jsx";

/**
 * The messages the client gets: the gallery going online, the retouched set handed
 * over with its invoice, and a free one written whole here.
 *
 * One form for all, switched by the select at the top, because almost all of it is
 * shared — the recipient, the heading and preview line, the note, and the fact that
 * none can be sent before the gallery is published. What differs is what each
 * message needs to carry, and those fields appear with the template that uses them
 * rather than sitting greyed out.
 */
const TEMPLATES = [
	{
		id: "online",
		label: SHARE_TEMPLATE_LABELS.online,
		hint: "Le lien vers la galerie, le mot de passe s’il y en a un, et la date de fin d’accès."
	},
	{
		id: "delivery",
		label: SHARE_TEMPLATE_LABELS.delivery,
		hint: "Le lien vers la catégorie retouchée, la facture en pièce jointe et la demande d’avis Google."
	},
	{
		id: "free",
		label: SHARE_TEMPLATE_LABELS.free,
		hint: "Votre titre et votre texte dans la mise en page du studio, sans lien ni pièce jointe. Le titre sert aussi d’objet."
	}
];

// Characters of text, as the API counts them (MAX_NOTE / MAX_FREE_BODY in
// routes/admin.mjs): an aside in the first two messages, the whole body of the third.
const MAX_NOTE = 2000;
const MAX_FREE_BODY = 10000;

const formatDate = value => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const formatMoment = value => new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * `onRefresh` re-reads the gallery, which is how the list of sent messages learns
 * that one has been opened: the open lands on the record from the client's mail
 * client, with nothing to tell this panel about it.
 */
export function SharePanel({ gallery, publicUrl, onRefresh }) {
	const [template, setTemplate] = useState("online");
	// Start on the template's own text and go back to it on a switch: an edit is
	// about one message, and carrying it to another would put the wrong title on it.
	const [heading, setHeading] = useState(() => shareDefaults("online", gallery).heading);
	const [preview, setPreview] = useState(() => shareDefaults("online", gallery).preview);
	const [to, setTo] = useState(gallery.clientEmail ?? "");
	// Typed here rather than read from the record on purpose — it is stored only as a
	// hash, so this is the one moment it can be included in the email, and only
	// because the photographer just typed it.
	const [password, setPassword] = useState("");
	// The editor's JSON tree, which is what is sent, and its text, which is what is
	// counted and checked for emptiness — an emptied editor still holds a paragraph.
	const [note, setNote] = useState({ doc: null, text: "" });
	// Which tab the delivery link opens on. Starts on the one the last delivery used:
	// a second message about the same shoot is nearly always about the same set.
	const [setId, setSetId] = useState(gallery.delivery?.setId ?? "");
	const [invoice, setInvoice] = useState(null);
	// What the last send from this panel attached, which the record only learns on the
	// next read of the gallery: without it, sending a delivery and then sending it
	// again to a second address would ask for the PDF a second time.
	const [sent, setSent] = useState("");
	// The sends made from this panel, for the same reason: the record's list catches
	// up on the next read, and until then the message that just left would be missing
	// from a list that says what has been sent.
	const [justSent, setJustSent] = useState([]);
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
	const free = template === "free";
	const hasNote = note.text.trim() !== "";
	const missingFreeContent = free && (!heading.trim() || !hasNote);
	const noteMax = free ? MAX_FREE_BODY : MAX_NOTE;
	const noteTooLong = note.text.length > noteMax;
	// The record's list, newest first, with this session's sends ahead of it until the
	// record has them too — matched by id, so a refresh does not list one twice.
	const recorded = gallery.shares ?? [];
	const shares = [...justSent.filter(share => !recorded.some(known => known.id === share.id)), ...recorded];

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

	const handleTemplateChange = next => {
		const defaults = shareDefaults(next, gallery);
		setTemplate(next);
		setHeading(defaults.heading);
		setPreview(defaults.preview);
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
				heading: heading.trim() || undefined,
				preview: preview.trim() || undefined,
				...(template === "online" ? { password: password || undefined }
				: template === "delivery" ? { setId: setId || undefined, invoiceKey }
				: {}),
				note: hasNote ? note.doc : undefined
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

			if (result.share) {
				setJustSent(current => [result.share, ...current]);
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
					<select id='share-template' value={template} disabled={busy} onChange={event => handleTemplateChange(event.target.value)}>
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

				<div className='field'>
					<label htmlFor='share-heading'>Titre{free ? " (et objet)" : ""}</label>
					<input id='share-heading' type='text' required={free} maxLength={200} value={heading} onChange={event => setHeading(event.target.value)} />
				</div>

				<div className='field'>
					<label htmlFor='share-preview'>Aperçu (optionnel)</label>
					<input id='share-preview' type='text' maxLength={300} value={preview} onChange={event => setPreview(event.target.value)} placeholder={free ? "Laisser vide pour reprendre le titre" : ""} />
					<p className='admin-hint'>La ligne que la messagerie affiche à côté de l’objet.</p>
				</div>

				{template === "online" ?
					<div className='field'>
						<label htmlFor='share-password'>Mot de passe à rappeler (optionnel)</label>
						<input id='share-password' type='text' value={password} onChange={event => setPassword(event.target.value)} placeholder='Laisser vide pour ne pas l’inclure' />
					</div>
				: template === "delivery" ?
					<>
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
							<input ref={invoiceRef} id='share-invoice' type='file' accept='application/pdf,.pdf' disabled={busy} onChange={event => setInvoice(event.target.files?.[0] ?? null)} />
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
				:	null}

				{/* One editor for every template, so a note half-written before a switch
				    of template is still there after it. Labelled by id: a contenteditable
				    is not something a <label for> can point at. */}
				<div className='field'>
					<label id='share-note-label'>{free ? "Contenu du message" : "Message (optionnel)"}</label>
					<RichTextEditor id='share-note' labelId='share-note-label' value={note.doc} onChange={setNote} disabled={busy} maxLength={noteMax} tall={free} />
				</div>

				<button className='button' type='submit' disabled={busy || unpublished || missingInvoice || missingFreeContent || noteTooLong}>
					{status === "uploading" ?
						"Envoi de la facture…"
					: status === "sending" ?
						"Envoi…"
					: template === "delivery" ?
						"Envoyer les retouches"
					: free ?
						"Envoyer le message"
					:	"Envoyer le lien"}
				</button>

				{unpublished ?
					<p className='admin-hint'>Publiez la galerie pour pouvoir l’envoyer.</p>
				:	null}

				{missingInvoice ?
					<p className='admin-hint'>Choisissez la facture à joindre.</p>
				:	null}

				{noteTooLong ?
					<p className='admin-hint'>Le message dépasse {noteMax} caractères.</p>
				:	null}

				{message ?
					<p className='admin-hint' role='status'>
						{message}
					</p>
				:	null}
			</form>

			{/* Every message sent, newest first, and whether the client has opened it. The
			    open is detected by a pixel in the mail, so the state is only as reliable as
			    the client's mail client lets it be — said under the list, once. */}
			{shares.length > 0 ?
				<div className='admin-share__history'>
					<div className='admin-share__history-header'>
						<h3 className='admin-share__history-title'>Messages envoyés</h3>
						{onRefresh ?
							<button type='button' className='button-secondary' onClick={onRefresh}>
								Actualiser
							</button>
						:	null}
					</div>

					<ul className='admin-share__history-list'>
						{shares.map(share => (
							<li key={share.id}>
								<strong>{SHARE_TEMPLATE_LABELS[share.template] ?? share.template}</strong>
								<span className='admin-share__history-meta'>
									à {share.to}, le {formatMoment(share.sentAt)}
								</span>
								{share.openedAt ?
									<span className='admin-share__opened'>
										Ouvert le {formatMoment(share.openedAt)}
										{share.opens > 1 ? ` (${share.opens} fois)` : ""}
									</span>
								:	<span className='admin-share__unopened'>Pas encore ouvert</span>}
							</li>
						))}
					</ul>

					<p className='admin-hint'>
						L’ouverture est détectée par une image invisible dans le message : une messagerie qui bloque les images ne la signalera jamais, et certaines (Apple Mail notamment) la chargent dès la réception. Un
						indice, pas une preuve.
					</p>
				</div>
			:	null}
		</div>
	);
}
