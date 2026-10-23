// The messages themselves: subject, plain text and HTML, one function per moment.
//
// Apart from mailer.mjs — which knows how a message is assembled and sent — because
// what these two say is the thing that gets edited, and they only stay coherent if
// changing one means reading the other. They are the same job twice: the gallery
// going online, and the retouched set handed over with its invoice.
//
// Every one returns what sendEmail takes, so a route gathers the facts and sends;
// nothing about SES or MIME reaches this file.

import { emailButton, emailButtonGhost, emailLayout, emailNote, emailParagraph, emailQuote, emailValue, escapeHtml } from "./mailer.mjs";

// The studio's Google Business page, which the delivery mail asks for a review on.
// A constant rather than a parameter: it is the same page in every message, and the
// short share.google form is the one Google itself hands out for exactly this.
const GOOGLE_REVIEW_URL = "https://share.google/nsVhMRrOLPBKb0n6m";

const frenchDate = value => new Date(value).toLocaleDateString("fr-FR");

/**
 * "Your gallery is online": the link, the password if one was just typed, and the
 * date it stops working.
 */
export function galleryOnlineEmail({ gallery, link, password, note, origin }) {
	const text = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		`Votre galerie « ${gallery.title} » est en ligne :`,
		link,
		...(password ? ["", `Mot de passe : ${password}`] : []),
		...(note ? ["", note] : []),
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
			heading: "Votre galerie est en ligne",
			preview: `Vos photos vous attendent dans la galerie « ${gallery.title} ».`,
			origin,
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph(`Vos photos vous attendent dans la galerie <strong>${escapeHtml(gallery.title)}</strong>.`),
				note ? emailQuote(note) : "",
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
export function deliveryEmail({ gallery, link, note, origin }) {
	const text = [
		`Bonjour ${gallery.clientName || ""}`.trim() + ",",
		"",
		"Bonne nouvelle, vos photos sont prêtes !",
		"",
		`👉 ${link}`,
		...(note ? ["", note] : []),
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
			heading: "Vos photos sont prêtes",
			preview: `Les retouches sont terminées, et votre facture est en pièce jointe.`,
			origin,
			// The copy's own last line is the goodbye, so the card signs off with the
			// studio's name alone rather than saying "à bientôt" twice.
			signoff: "Ankaa Studio",
			inner: [
				emailParagraph(`Bonjour ${escapeHtml(gallery.clientName || "")},`),
				emailParagraph("Bonne nouvelle, vos photos sont prêtes&nbsp;!"),
				note ? emailQuote(note) : "",
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
