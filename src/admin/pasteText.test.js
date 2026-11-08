// node --test src/admin/pasteText.test.js
import assert from "node:assert/strict";
import { test } from "node:test";

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { plainTextSlice } from "./pasteText.js";

const schema = getSchema([StarterKit]);

/** The slice as lines: one string per paragraph, "\n" where a hard break sits. */
const read = text => {
	const paragraphs = [];

	plainTextSlice(text, schema).content.forEach(paragraph => {
		assert.equal(paragraph.type.name, "paragraph");
		let line = "";
		paragraph.forEach(child => {
			line += child.type.name === "hardBreak" ? "\n" : child.text;
		});
		paragraphs.push(line);
	});

	return paragraphs;
};

test("a single line break stays a line break", () => {
	assert.deepEqual(read("Bonjour Léa,\nligne deux"), ["Bonjour Léa,\nligne deux"]);
});

test("a blank line starts a paragraph", () => {
	assert.deepEqual(read("Un\n\nDeux"), ["Un", "Deux"]);
});

test("every blank line beyond the first is kept as an empty paragraph", () => {
	assert.deepEqual(read("Un\n\n\nDeux"), ["Un", "", "Deux"]);
	assert.deepEqual(read("Un\n\n\n\nDeux"), ["Un", "", "", "Deux"]);
});

test("Windows and old Mac line endings read the same", () => {
	assert.deepEqual(read("Un\r\ndeux\r\n\r\nTrois\rquatre"), ["Un\ndeux", "Trois\nquatre"]);
});

test("a line of spaces counts as blank; blank lines at the edges are dropped", () => {
	assert.deepEqual(read("\n\n  Un\n \t \nDeux\n\n\n"), ["  Un", "Deux"]);
});

test("the slice is open at both ends, so a one-line paste joins the current paragraph", () => {
	const slice = plainTextSlice("mot", schema);

	assert.equal(slice.openStart, 1);
	assert.equal(slice.openEnd, 1);
});

test("nothing but blank lines still gives a valid slice", () => {
	assert.deepEqual(read("\n\n"), [""]);
});
