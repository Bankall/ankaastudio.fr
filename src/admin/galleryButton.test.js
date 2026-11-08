// node --test src/admin/galleryButton.test.js
import assert from "node:assert/strict";
import { test } from "node:test";

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { richDoc, richHtml } from "../../lambda/gallery-api/src/lib/richtext.mjs";
import { GalleryButton } from "./galleryButton.js";

// Headless: no element to mount on, which is all getJSON() and getText() need.
// Content as JSON, never HTML — parsing HTML needs a DOM, which node has not.
const editorWith = content => new Editor({ element: null, extensions: [StarterKit, GalleryButton], content });

test("the editor's button JSON is what the API accepts, and renders as a gallery link", () => {
	const editor = editorWith({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bonjour" }] }] });
	editor.commands.setTextSelection(editor.state.doc.content.size);
	editor.commands.setGalleryButton({ label: "Voir les retouches", setId: "s_ab12", setTitle: "Retouches" });

	const json = editor.getJSON();
	const button = json.content.find(node => node.type === "galleryButton");
	assert.deepEqual({ ...button.attrs }, { label: "Voir les retouches", setId: "s_ab12", setTitle: "Retouches" });

	const html = richHtml(richDoc(json, "message", { max: 1000 }), { galleryLink: setId => `https://a.fr/gallery/lea?set=${setId}` });
	assert.ok(html.includes('href="https://a.fr/gallery/lea?set=s_ab12"'));
	assert.ok(html.includes(">Voir les retouches</a>"));

	editor.destroy();
});

test("the label counts as text, so a message of only a button is not empty", () => {
	const editor = editorWith({ type: "doc", content: [{ type: "paragraph" }] });
	editor.commands.setGalleryButton({ label: "Voir", setId: null });

	assert.equal(editor.getText().trim(), "Voir");

	editor.destroy();
});

test("with the button selected, the command edits it instead of adding another", () => {
	const editor = editorWith({ type: "doc", content: [{ type: "galleryButton", attrs: { label: "Avant", setId: null } }] });
	editor.commands.setNodeSelection(0);
	editor.commands.setGalleryButton({ label: "Après", setId: null });

	const buttons = editor.getJSON().content.filter(node => node.type === "galleryButton");
	assert.equal(buttons.length, 1);
	assert.equal(buttons[0].attrs.label, "Après");

	editor.destroy();
});
