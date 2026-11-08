import { mergeAttributes, Node } from "@tiptap/react";

/**
 * The gallery button: the big "Voir la galerie" of the studio's own mails, placed
 * by the photographer anywhere in their text.
 *
 * Holds a label and the set it opens on (null for the whole gallery) — never a URL.
 * The API builds the address from the gallery the message is sent about
 * (lib/richtext.mjs, routes/admin.mjs), so a button cannot be pointed anywhere else
 * and keeps working if the gallery's slug changes before the send. `setTitle` is for
 * the editor's own display only; the API ignores it.
 *
 * An atom: the label is edited through the toolbar's form, not typed into, so it
 * cannot pick up bold, a line break or a link the mail's button has no place for.
 */
export const GalleryButton = Node.create({
	name: "galleryButton",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			label: { default: "Voir la galerie", parseHTML: element => element.getAttribute("data-label") },
			setId: { default: null, parseHTML: element => element.getAttribute("data-set-id") || null },
			setTitle: { default: null, parseHTML: element => element.getAttribute("data-set-title") || null }
		};
	},

	parseHTML() {
		return [{ tag: "div[data-gallery-button]" }];
	},

	// What getText() gives for it, so the panel counts the label as the API does and a
	// message holding nothing but a button is not taken for an empty one.
	renderText({ node }) {
		return node.attrs.label;
	},

	renderHTML({ node, HTMLAttributes }) {
		const { label, setId, setTitle } = node.attrs;

		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-gallery-button": "",
				"data-label": label,
				"data-set-id": setId ?? "",
				"data-set-title": setTitle ?? "",
				class: "rich-editor__gallery-button",
				contenteditable: "false"
			}),
			["span", { class: "rich-editor__gallery-button-label" }, label],
			["span", { class: "rich-editor__gallery-button-target" }, setId ? `Catégorie « ${setTitle ?? setId} »` : "Toute la galerie"]
		];
	},

	addCommands() {
		return {
			setGalleryButton:
				attrs =>
				({ commands, editor }) =>
					editor.isActive(this.name) ? commands.updateAttributes(this.name, attrs) : commands.insertContent({ type: this.name, attrs })
		};
	}
});
