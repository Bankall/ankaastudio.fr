// The photographer's formatted text — the note, and the whole body of a "Libre"
// message — as the share panel's editor (Tiptap) hands it over: a JSON tree, not
// HTML.
//
// A tree because this file then only has to know the handful of node types the
// toolbar offers, and anything else is refused rather than parsed: there is no HTML
// coming in to sanitise, and no way to smuggle a <script> or a style through it.
// From the checked tree it writes the two halves of a message, the inline-styled
// HTML an email client needs and the plain text that goes beside it.

import { emailLink, emailList, emailParagraph, emailQuote, escapeHtml } from "./mailer.mjs";
import { badRequest } from "./http.mjs";

// Which node may hold which. Mirrors the panel's editor (StarterKit without
// headings, code or rules, plus TextAlign on paragraphs).
const BLOCKS = ["paragraph", "bulletList", "orderedList", "blockquote"];
const CHILDREN = {
	doc: BLOCKS,
	blockquote: BLOCKS,
	bulletList: ["listItem"],
	orderedList: ["listItem"],
	listItem: ["paragraph", "bulletList", "orderedList"],
	paragraph: ["text", "hardBreak"]
};
const MARKS = ["bold", "italic", "underline", "strike", "link"];
const ALIGNMENTS = ["left", "center", "right"];

// Generous for anything typed by hand, small enough that a crafted payload cannot
// make the Lambda walk for long.
const MAX_NODES = 5000;
const MAX_DEPTH = 12;

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/**
 * The request's field, checked and rebuilt from known parts only.
 *
 * A plain string is still taken, and read the way the old textarea's was — a blank
 * line between paragraphs — so a request from before the editor still sends. Answers
 * null when there is no text in it at all: an editor emptied by hand still holds an
 * empty paragraph, and that is not a message.
 *
 * `max` counts the characters of text, not the size of the JSON around them.
 */
export function richDoc(value, field, { max, required = false }) {
	if (value === undefined || value === null || value === "") {
		return missing(field, required);
	}

	const tree = typeof value === "string" ? textToDoc(value) : value;
	const state = { nodes: 0, chars: 0 };
	const doc = clean(tree, "doc", 0, state, field);

	if (state.chars > max) {
		throw badRequest(`Le champ « ${field} » dépasse ${max} caractères.`);
	}

	doc.content = trimEmpty(doc.content);

	return doc.content.length ? doc : missing(field, required);
}

const missing = (field, required) => {
	if (required) {
		throw badRequest(`Le champ « ${field} » est obligatoire.`);
	}

	return null;
};

const invalid = field => badRequest(`Le champ « ${field} » contient une mise en forme non prise en charge.`);

/** A string as the old textarea meant it: a blank line between paragraphs, a single break kept. */
function textToDoc(text) {
	const paragraphs = String(text)
		.split(/\r?\n\s*\r?\n/)
		.map(paragraph => paragraph.trim())
		.filter(Boolean);

	return {
		type: "doc",
		content: paragraphs.map(paragraph => ({
			type: "paragraph",
			content: paragraph.split(/\r?\n/).flatMap((line, index) => [...(index ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])])
		}))
	};
}

function clean(node, expected, depth, state, field) {
	state.nodes += 1;

	if (!node || typeof node !== "object" || node.type !== expected || depth > MAX_DEPTH || state.nodes > MAX_NODES) {
		throw invalid(field);
	}

	if (expected === "text") {
		if (typeof node.text !== "string") {
			throw invalid(field);
		}

		state.chars += node.text.length;

		return { type: "text", text: node.text, marks: cleanMarks(node.marks, field) };
	}

	if (expected === "hardBreak") {
		return { type: "hardBreak" };
	}

	const content = node.content ?? [];

	if (!Array.isArray(content)) {
		throw invalid(field);
	}

	const allowed = CHILDREN[expected];
	const cleaned = {
		type: expected,
		content: content.map(child => {
			if (!allowed.includes(child?.type)) {
				throw invalid(field);
			}

			return clean(child, child.type, depth + 1, state, field);
		})
	};

	if (expected === "paragraph" && ALIGNMENTS.includes(node.attrs?.textAlign)) {
		cleaned.align = node.attrs.textAlign;
	}

	if (expected === "orderedList") {
		const start = Number(node.attrs?.start ?? 1);
		cleaned.start = Number.isInteger(start) && start >= 0 && start <= 10000 ? start : 1;
	}

	return cleaned;
}

/** Marks in a fixed order, so the HTML nests the same way whatever order the editor kept. */
function cleanMarks(marks, field) {
	if (marks === undefined || marks === null) {
		return [];
	}

	if (!Array.isArray(marks) || marks.some(mark => !MARKS.includes(mark?.type))) {
		throw invalid(field);
	}

	return MARKS.filter(type => marks.some(mark => mark.type === type)).map(type => {
		if (type !== "link") {
			return { type };
		}

		const href = String(marks.find(mark => mark.type === "link").attrs?.href ?? "").trim();

		if (!SAFE_HREF.test(href) || href.length > 2000) {
			throw badRequest(`Le champ « ${field} » contient un lien invalide : seuls http, https et mailto sont acceptés.`);
		}

		return { type, href };
	});
}

const isEmptyParagraph = node => node.type === "paragraph" && !node.content.some(child => child.type === "text" && child.text.trim());

/** Blank paragraphs at either end are the editor's, not the photographer's. */
function trimEmpty(blocks) {
	let start = 0;
	let end = blocks.length;

	while (start < end && isEmptyParagraph(blocks[start])) {
		start += 1;
	}

	while (end > start && isEmptyParagraph(blocks[end - 1])) {
		end -= 1;
	}

	return blocks.slice(start, end);
}

// --- HTML ------------------------------------------------------------------

const WRAP = {
	bold: html => `<strong>${html}</strong>`,
	italic: html => `<em>${html}</em>`,
	underline: html => `<u>${html}</u>`,
	strike: html => `<s>${html}</s>`
};

/** One run of text with its marks. The link outermost, so the whole run is clickable. */
function inlineHtml(node) {
	if (node.type === "hardBreak") {
		return "<br>";
	}

	const marks = node.marks;
	const styled = marks.filter(mark => mark.type !== "link").reduce((html, mark) => WRAP[mark.type](html), escapeHtml(node.text));
	const link = marks.find(mark => mark.type === "link");

	return link ? emailLink(link.href, styled) : styled;
}

const paragraphHtml = node => node.content.map(inlineHtml).join("") || "&nbsp;";

/**
 * A list of blocks. `last` is the margin of the final one: none inside a frame or a
 * list item, so the spacing is the frame's and not an extra blank line in it.
 */
function blocksHtml(blocks, { last = "0 0 16px" } = {}) {
	return blocks
		.map((block, index) => {
			const margin = index === blocks.length - 1 ? last : "0 0 16px";

			if (block.type === "paragraph") {
				return emailParagraph(paragraphHtml(block), { align: block.align, margin });
			}

			if (block.type === "blockquote") {
				return emailQuote(blocksHtml(block.content, { last: "0" }), { margin });
			}

			return emailList(block.content.map(listItemHtml), { ordered: block.type === "orderedList", start: block.start, margin });
		})
		.join("");
}

/**
 * A list item's paragraphs run as lines rather than spaced paragraphs — a list is
 * tight in the editor too — and a nested list follows them.
 */
function listItemHtml(item) {
	return item.content
		.map((child, index) => {
			if (child.type === "paragraph") {
				return `${index ? "<br>" : ""}${paragraphHtml(child)}`;
			}

			return emailList(child.content.map(listItemHtml), { ordered: child.type === "orderedList", start: child.start, margin: "4px 0 0" });
		})
		.join("");
}

/** The email HTML of a checked tree. `last` as in blocksHtml: "0" when it sits in a frame. */
export const richHtml = (doc, { last } = {}) => blocksHtml(doc.content, { last });

// --- plain text --------------------------------------------------------------

function inlineText(node) {
	if (node.type === "hardBreak") {
		return "\n";
	}

	const link = node.marks.find(mark => mark.type === "link");
	const shown = link?.href.replace(/^mailto:/i, "");

	// The address beside its words, since a plain-text reader cannot click on them.
	return link && shown !== node.text ? `${node.text} (${shown})` : node.text;
}

const paragraphText = node => node.content.map(inlineText).join("");

/** Every line after an item's first is padded to its text, which is what indents a nested list. */
function listText(list) {
	return list.content
		.map((item, index) => {
			const bullet = list.type === "orderedList" ? `${list.start + index}. ` : "• ";
			const pad = " ".repeat(bullet.length);

			return item.content
				.map(child => (child.type === "paragraph" ? paragraphText(child) : listText(child)))
				.join("\n")
				.split("\n")
				.map((line, lineIndex) => `${lineIndex ? pad : bullet}${line}`.trimEnd())
				.join("\n");
		})
		.join("\n");
}

function blocksText(blocks) {
	return blocks
		.filter(block => !isEmptyParagraph(block))
		.map(block => {
			if (block.type === "paragraph") {
				return paragraphText(block);
			}

			if (block.type === "blockquote") {
				return blocksText(block.content)
					.split("\n")
					.map(line => `> ${line}`.trimEnd())
					.join("\n");
			}

			return listText(block);
		})
		.join("\n\n");
}

/** The plain-text half of a message: paragraphs apart, lists bulleted, quotes with "> ". */
export const richText = doc => blocksText(doc.content);
