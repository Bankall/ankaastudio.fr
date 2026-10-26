// The two messages the share panel sends, as the photographer reads them.
//
// Here rather than in the panel because the activity feed names them too — "a ouvert
// l’e-mail « Retouches terminées »" — and the two must not drift apart. Keys match
// SHARE_TEMPLATES in the API's routes/admin.mjs.
export const SHARE_TEMPLATE_LABELS = {
	online: "Galerie en ligne",
	delivery: "Retouches terminées"
};
