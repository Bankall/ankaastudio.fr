// The messages the share panel sends, as the photographer reads them.
//
// Here rather than in the panel because the activity feed names them too — "a ouvert
// l’e-mail « Retouches terminées »" — and the two must not drift apart. Keys match
// SHARE_TEMPLATES in the API's routes/admin.mjs.
export const SHARE_TEMPLATE_LABELS = {
	online: "Galerie en ligne",
	delivery: "Retouches terminées",
	free: "Libre"
};

// The heading and preview line each message starts with in the panel, editable
// there. The same text as DEFAULT_HEADINGS / DEFAULT_PREVIEWS in the API's
// lib/emails.mjs, which is what an emptied field falls back on — change both.
// `free` starts blank: there is no studio copy to offer.
export const shareDefaults = (template, gallery) => {
	if (template === "online") {
		return { heading: "Votre galerie est en ligne", preview: `Vos photos vous attendent dans la galerie « ${gallery.title} ».` };
	}

	if (template === "delivery") {
		return { heading: "Vos photos sont prêtes", preview: "Les retouches sont terminées, et votre facture est en pièce jointe." };
	}

	return { heading: "", preview: "" };
};
