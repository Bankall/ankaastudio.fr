// node --test lambda/gallery-api/src/lib/emails.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { shareDefaults } from "../../../../src/utils/shareTemplates.js";
import { DEFAULT_HEADINGS, DEFAULT_PREVIEWS, deliveryEmail, freeEmail, galleryOnlineEmail } from "./emails.mjs";
import { richDoc } from "./richtext.mjs";

const doc = value => richDoc(value, "message", { max: 10000 });

const gallery = { title: "Mariage <Léa>", clientName: "Léa", slug: "lea", expiresAt: null };
const origin = "https://ankaastudio.fr";

test("the panel's starting text is the API's fallback", () => {
	for (const template of ["online", "delivery"]) {
		assert.deepEqual(shareDefaults(template, gallery), { heading: DEFAULT_HEADINGS[template](gallery), preview: DEFAULT_PREVIEWS[template](gallery) });
	}

	assert.deepEqual(shareDefaults("free", gallery), { heading: "", preview: "" });
});

test("online and delivery fall back on their own heading and preview", () => {
	const online = galleryOnlineEmail({ gallery, link: "x", origin });
	assert.match(online.html, /<title>Votre galerie est en ligne<\/title>/);
	assert.ok(online.html.includes("Vos photos vous attendent dans la galerie « Mariage &lt;Léa&gt; »."));

	const delivery = deliveryEmail({ gallery, link: "x", origin });
	assert.match(delivery.html, /<title>Vos photos sont prêtes<\/title>/);
	assert.ok(delivery.html.includes("Les retouches sont terminées"));
});

test("online and delivery take an edited heading and preview", () => {
	for (const build of [galleryOnlineEmail, deliveryEmail]) {
		const message = build({ gallery, link: "x", origin, heading: "Titre <à moi>", preview: "Aperçu à moi" });
		assert.ok(message.html.includes("<title>Titre &lt;à moi&gt;</title>"));
		assert.ok(message.html.includes(">Aperçu à moi</div>"));
	}
});

test("free: heading is the subject, blank lines split paragraphs, text is escaped", () => {
	const message = freeEmail({ heading: "Un mot", body: doc("Bonjour <Léa>,\nligne deux\n\n\nSecond paragraphe"), origin, trackingUrl: "https://t/p" });

	assert.equal(message.subject, "Un mot");
	assert.equal(message.text, "Bonjour <Léa>,\nligne deux\n\nSecond paragraphe\n\nÀ très bientôt,\nAnkaa Studio");
	assert.ok(message.html.includes("Bonjour &lt;Léa&gt;,<br>ligne deux</p>"));
	assert.ok(message.html.includes(">Second paragraphe</p>"));
	assert.equal(message.html.match(/<p /g).length, 2);
	// No preview given: the inbox line is the heading.
	assert.ok(message.html.includes(">Un mot</div>"));
	assert.ok(message.html.includes('src="https://t/p"'));
});

test("free: an explicit preview wins over the heading", () => {
	const message = freeEmail({ heading: "Un mot", preview: "Petit aperçu", body: doc("Texte"), origin });
	assert.ok(message.html.includes(">Petit aperçu</div>"));
});

test("the note is rendered from the tree, in its frame, in both halves", () => {
	const note = doc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Merci", marks: [{ type: "bold" }] }] }] });

	for (const build of [galleryOnlineEmail, deliveryEmail]) {
		const message = build({ gallery, link: "x", origin, note });
		assert.ok(message.html.includes("<strong>Merci</strong>"));
		assert.ok(message.html.includes("border-left:2px solid"));
		assert.ok(message.text.includes("\nMerci\n"));
	}
});
