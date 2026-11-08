import { Fragment, Slice } from "@tiptap/pm/model";

/**
 * Plain text pasted into the share editor, read the way it was laid out.
 *
 * ProseMirror's own reading turns every line into a paragraph and drops the blank
 * lines between them, so a pasted letter loses both its line breaks (each becomes
 * a paragraph gap) and its paragraph gaps (they all look alike). Here a blank line
 * starts a paragraph and a single line break stays a line break — the rule the
 * API's lib/richtext.mjs applies to a plain string — and every blank line beyond
 * the first is kept as an empty paragraph, which is the space it made in the source.
 *
 * Open at both ends, so a paste with no blank line in it joins the paragraph the
 * cursor is in rather than splitting it, and text around the cursor is kept.
 */
export function plainTextSlice(text, schema, marks = []) {
	const paragraphs = [];
	let lines = [];
	let blanks = 0;

	const close = () => {
		if (lines.length) {
			paragraphs.push(lines);
		}

		lines = [];
	};

	for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
		if (line.trim()) {
			// Blank lines past the first that ended the paragraph before: kept as space,
			// but never ahead of the first paragraph, where there is nothing to space.
			for (let extra = 1; extra < blanks && paragraphs.length; extra += 1) {
				paragraphs.push([]);
			}

			blanks = 0;
			lines.push(line);
			continue;
		}

		close();
		blanks += 1;
	}

	close();

	const nodes = paragraphs.map(paragraph =>
		schema.nodes.paragraph.create(
			null,
			paragraph.flatMap((line, index) => [...(index ? [schema.nodes.hardBreak.create()] : []), schema.text(line, marks)])
		)
	);

	return new Slice(Fragment.from(nodes.length ? nodes : [schema.nodes.paragraph.create()]), 1, 1);
}
