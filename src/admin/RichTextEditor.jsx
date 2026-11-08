import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { plainTextSlice } from "./pasteText.js";

/**
 * The share panel's text box, with the formatting an email can carry and nothing
 * more: bold, italic, underline, strike, lists, quote, alignment and links.
 *
 * Exactly the node types the API's lib/richtext.mjs accepts — it refuses anything
 * else — so a format added here has to be added there too. No headings, code or
 * rules: StarterKit ships them, the mail has no style for them.
 *
 * Hands its content up as Tiptap's JSON tree, not HTML: the API renders the email
 * from the tree, which is why nothing the editor holds can reach the client as raw
 * markup.
 */
const EXTENSIONS = [
	StarterKit.configure({
		heading: false,
		code: false,
		codeBlock: false,
		horizontalRule: false,
		link: { openOnClick: false, autolink: true, defaultProtocol: "https" }
	}),
	TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"] })
];

/** What a typed address becomes: a scheme added when missing, mailto: for an email. */
const toHref = typed => {
	const value = typed.trim();

	if (!value || /^(https?:\/\/|mailto:)/i.test(value)) {
		return value;
	}

	return value.includes("@") && !value.includes("/") ? `mailto:${value}` : `https://${value}`;
};

const MARK_BUTTONS = [
	// The French letters, as Word and Google Docs show them in French: Gras, Italique, Souligné.
	{ mark: "bold", label: "Gras", glyph: "G", style: { fontWeight: 700 }, run: chain => chain.toggleBold() },
	{ mark: "italic", label: "Italique", glyph: "I", style: { fontStyle: "italic" }, run: chain => chain.toggleItalic() },
	{ mark: "underline", label: "Souligné", glyph: "S", style: { textDecoration: "underline" }, run: chain => chain.toggleUnderline() },
	{ mark: "strike", label: "Barré", glyph: "ab", style: { textDecoration: "line-through" }, run: chain => chain.toggleStrike() }
];

const BLOCK_BUTTONS = [
	{ node: "bulletList", label: "Liste à puces", glyph: "•≡", run: chain => chain.toggleBulletList() },
	{ node: "orderedList", label: "Liste numérotée", glyph: "1≡", run: chain => chain.toggleOrderedList() },
	{ node: "blockquote", label: "Citation", glyph: "❝", run: chain => chain.toggleBlockquote() }
];

const ALIGN_BUTTONS = [
	{ align: "left", label: "Aligner à gauche", glyph: "⇤" },
	{ align: "center", label: "Centrer", glyph: "↔" },
	{ align: "right", label: "Aligner à droite", glyph: "⇥" }
];

/**
 * `value` is only read on mount: the editor holds the text from then on and reports
 * every change through `onChange({ doc, text })`, `text` being what the panel counts
 * against `maxLength` and checks for emptiness.
 */
export function RichTextEditor({ id, labelId, value = null, onChange, disabled = false, maxLength, tall = false }) {
	const editor = useEditor({
		extensions: EXTENSIONS,
		content: value ?? "",
		editable: !disabled,
		editorProps: {
			attributes: {
				id,
				class: "rich-editor__content",
				role: "textbox",
				"aria-multiline": "true",
				...(labelId ? { "aria-labelledby": labelId } : {})
			},
			// Plain-text pastes only (from a text editor, a terminal, a textarea): a paste
			// that carries HTML keeps its own <p> and <br>, which ProseMirror reads as is.
			clipboardTextParser: (text, $context, plain, view) => plainTextSlice(text, view.state.schema, $context.marks())
		},
		onUpdate: ({ editor: current }) => onChange?.({ doc: current.getJSON(), text: current.getText() })
	});

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	// Re-rendered only when one of these changes, not on every keystroke.
	const state = useEditorState({
		editor,
		selector: ({ editor: current }) =>
			current ?
				{
					marks: Object.fromEntries(MARK_BUTTONS.map(button => [button.mark, current.isActive(button.mark)])),
					nodes: Object.fromEntries(BLOCK_BUTTONS.map(button => [button.node, current.isActive(button.node)])),
					align: ALIGN_BUTTONS.find(button => current.isActive({ textAlign: button.align }))?.align ?? "left",
					link: current.isActive("link"),
					length: current.getText().length
				}
			:	null
	});

	if (!editor || !state) {
		return null;
	}

	const run = action => () => action(editor.chain().focus()).run();

	const handleLink = () => {
		if (state.link) {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}

		const href = toHref(window.prompt("Adresse du lien (https://… ou e-mail)", "") ?? "");

		if (!href) {
			return;
		}

		// No selection: the address itself becomes the linked text.
		if (editor.state.selection.empty) {
			editor
				.chain()
				.focus()
				.insertContent({ type: "text", text: href.replace(/^mailto:/i, ""), marks: [{ type: "link", attrs: { href } }] })
				.run();
			return;
		}

		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
	};

	const over = maxLength ? state.length > maxLength : false;

	return (
		<div className={`rich-editor${tall ? " rich-editor--tall" : ""}${disabled ? " is-disabled" : ""}`}>
			<div className='rich-editor__toolbar' role='toolbar' aria-label='Mise en forme'>
				<div className='rich-editor__group'>
					{MARK_BUTTONS.map(button => (
						<button
							key={button.mark}
							type='button'
							className='rich-editor__button'
							style={button.style}
							title={button.label}
							aria-label={button.label}
							aria-pressed={state.marks[button.mark]}
							disabled={disabled}
							onClick={run(button.run)}>
							{button.glyph}
						</button>
					))}
				</div>

				<div className='rich-editor__group'>
					{BLOCK_BUTTONS.map(button => (
						<button
							key={button.node}
							type='button'
							className='rich-editor__button'
							title={button.label}
							aria-label={button.label}
							aria-pressed={state.nodes[button.node]}
							disabled={disabled}
							onClick={run(button.run)}>
							{button.glyph}
						</button>
					))}
				</div>

				<div className='rich-editor__group'>
					{ALIGN_BUTTONS.map(button => (
						<button
							key={button.align}
							type='button'
							className='rich-editor__button'
							title={button.label}
							aria-label={button.label}
							aria-pressed={state.align === button.align}
							disabled={disabled}
							onClick={run(chain => chain.setTextAlign(button.align))}>
							{button.glyph}
						</button>
					))}
				</div>

				<div className='rich-editor__group'>
					<button
						type='button'
						className='rich-editor__button'
						title={state.link ? "Retirer le lien" : "Ajouter un lien"}
						aria-label={state.link ? "Retirer le lien" : "Ajouter un lien"}
						aria-pressed={state.link}
						disabled={disabled}
						onClick={handleLink}>
						🔗
					</button>
				</div>
			</div>

			<EditorContent editor={editor} />

			{maxLength ?
				<p className={`rich-editor__count${over ? " is-over" : ""}`} aria-live='polite'>
					{state.length} / {maxLength}
				</p>
			:	null}
		</div>
	);
}
