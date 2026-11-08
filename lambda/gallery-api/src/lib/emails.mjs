// The messages themselves: subject, plain text and HTML, one function per moment.
//
// Apart from mailer.mjs — which knows how a message is assembled and sent — because
// what these two say is the thing that gets edited, and they only stay coherent if
// changing one means reading the other. They are the same job twice: the gallery
// going online, and the retouched set handed over with its invoice.
//
// Every one returns what sendEmail takes, so a route gathers the facts and sends;
// nothing about SES or MIME reaches this file.
//
// `note` and the free message's `body` are the editor's checked tree (richtext.mjs),
// never a string: they are rendered here, once as HTML and once as plain text.

import { emailButton, emailButtonGhost, emailLayout, emailNote, emailParagraph, emailQuote, emailValue, escapeHtml } from "./mailer.mjs";
import { richHtml, richText } from "./richtext.mjs";

// The studio's Google Business page, which the delivery mail asks for a review on.
// A constant rather than a parameter: it is the same page in every message, and the
// short share.google form is the one Google itself hands out for exactly this.
const GOOGLE_REVIEW_URL = "https://www.google.com/search?q=ankaastudio.fr&sei=Q2rfaoeIDZepkdUPo9iF4Q4";

const frenchDate = value => new Date(value).toLocaleDateString("fr-FR");

/**
 * The title over the card and the inbox preview line of each message, when the
 * photographer leaves them as they are. The share panel offers the same values as
 * its starting text (src/utils/shareTemplates.js), so the two have to move together;
 * these are what a request without them — or with a field emptied — falls back on.
 */
export const DEFAULT_HEADINGS = {
	online: () => "Votre galerie est en ligne",
	delivery: () => "Vos photos sont prêtes"
};

export const DEFAULT_PREVIEWS = {
	online: gallery => `Vos photos vous attendent dans la galerie « ${gallery.title} ».`,
	delivery: () => "Les retouches sont terminées, et votre facture est en pièce jointe."
};

/**
 * "Your gallery is online": the link, the password if one was just typed, and the
 * date it stops working.
 */
export function galleryOnlineEmail({ gallery, link, password, note, heading, preview, origin, trackingUrl = null }) {
	const text = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		`Votre galerie « ${gallery.title} » est en ligne :`,
		link,
		...(password ? ["", `Mot de passe : ${password}`] : []),
		...(note ? ["", richText(note)] : []),
		...(gallery.expiresAt ? ["", `La galerie reste accessible jusqu'au ${frenchDate(gallery.expiresAt)}.`] : []),
		"",
		"À très bientôt,",
		"Ankaa Studio"
	].join("\n");

	return {
		subject: `Votre galerie « ${gallery.title} » est en ligne`,
		text,
		html: emailLayout({
			label: "Galerie en ligne",
			heading: heading || DEFAULT_HEADINGS.online(gallery),
			preview: preview || DEFAULT_PREVIEWS.online(gallery),
			origin,
			trackingUrl,
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph(`Vos photos vous attendent dans la galerie <strong>${escapeHtml(gallery.title)}</strong>.`),
				note ? emailQuote(richHtml(note, { last: "0" })) : "",
				password ? emailValue("Mot de passe", password) : "",
				emailButton(link, "Voir la galerie"),
				gallery.expiresAt ? emailNote(`Galerie accessible jusqu'au ${escapeHtml(frenchDate(gallery.expiresAt))}.`) : ""
			].join("")
		})
	};
}

/**
 * "The edits are done": the link to the retouched set, the invoice attached, and the
 * review.
 *
 * `link` already points at the set, so the copy never has to name which one — the
 * client lands on it. The invoice is not named either: mailer.mjs carries the bytes,
 * and "en pièce jointe" is what the reader needs to be told.
 *
 * The two 👉 lines of the plain text are the two things the message asks for, and in
 * the HTML they are the two buttons — the filled one for the photographs, the
 * outlined one for the review, in that order, because only one of them is the reason
 * this email was sent.
 */
export function deliveryEmail({ gallery, link, note, heading, preview, origin, trackingUrl = null }) {
	const text = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		"Bonne nouvelle, vos photos sont prêtes !",
		"",
		`👉 ${link}`,
		...(note ? ["", richText(note)] : []),
		"",
		"Vous trouverez également en pièce jointe la facture de votre séance photo.",
		"",
		"Encore un grand merci pour votre confiance ! J'espère que les photos vous plaisent et que vous garderez un joli souvenir de cette séance.",
		"",
		"Si vous avez quelques minutes, n'hésitez pas à me laisser un petit avis sur ma page Google. Cela m'aiderait beaucoup à faire connaître Ankaa Studio et à développer mon activité.",
		"",
		`👉 ${GOOGLE_REVIEW_URL}`,
		"",
		"Merci encore et à bientôt, peut-être, pour une prochaine séance !",
		...(gallery.expiresAt ? ["", `La galerie reste accessible jusqu'au ${frenchDate(gallery.expiresAt)}.`] : []),
		"",
		"Ankaa Studio"
	].join("\n");

	return {
		subject: `Vos photos sont prêtes`,
		text,
		html: emailLayout({
			label: "",
			heading: heading || DEFAULT_HEADINGS.delivery(gallery),
			preview: preview || DEFAULT_PREVIEWS.delivery(gallery),
			origin,
			trackingUrl,
			// The copy's own last line is the goodbye, so the card signs off with the
			// studio's name alone rather than saying "à bientôt" twice.
			signoff: "Ankaa Studio",
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph("Bonne nouvelle, vos photos sont prêtes&nbsp;!"),
				note ? emailQuote(richHtml(note, { last: "0" })) : "",
				emailButton(link, "Voir mes photos"),
				emailParagraph("Vous trouverez également en pièce jointe la facture de votre séance photo."),
				emailParagraph("Encore un grand merci pour votre confiance&nbsp;! J'espère que les photos vous plaisent et que vous garderez un joli souvenir de cette séance."),
				emailParagraph("Si vous avez quelques minutes, n'hésitez pas à me laisser un petit avis sur ma page Google. Cela m'aiderait beaucoup à faire connaître Ankaa Studio et à développer mon activité."),
				emailButtonGhost(GOOGLE_REVIEW_URL, "Laisser un avis"),
				emailParagraph("Merci encore et à bientôt, peut-être, pour une prochaine séance&nbsp;!"),
				gallery.expiresAt ? emailNote(`Galerie accessible jusqu'au ${escapeHtml(frenchDate(gallery.expiresAt))}.`) : ""
			].join("")
		})
	};
}

/**
 * "Libre": the layout with nothing of the studio's copy in it — the heading and the
 * body are the photographer's, and the heading doubles as the subject.
 *
 * The body is the editor's tree as typed: paragraphs, lists, quotes and alignment
 * come out in the card the way the panel showed them. No preview given means the
 * inbox shows the heading, as emailLayout does by default.
 */
export function freeEmail({ heading, preview, body, origin, trackingUrl = null }) {
	return {
		subject: heading,
		text: [richText(body), "", "À très bientôt,", "Ankaa Studio"].join("\n"),
		html: emailLayout({
			label: "",
			heading,
			preview: preview || heading,
			origin,
			trackingUrl,
			inner: richHtml(body)
		})
	};
}
