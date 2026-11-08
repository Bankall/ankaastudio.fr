// node --test lambda/gallery-api/src/lib/richtext.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { buttonSetIds, richDoc, richHtml, richText } from "./richtext.mjs";

const parse = (value, options = {}) => richDoc(value, "message", { max: 1000, ...options });
const text = (value, marks) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (content, attrs) => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content });
const item = (...content) => ({ type: "listItem", content });
const doc = (...content) => ({ type: "doc", content });

const status = error => error.statusCode ?? error.status;

test("absent or empty: null, or a 400 when required", () => {
	assert.equal(parse(undefined), null);
	assert.equal(parse(""), null);
	assert.equal(parse(doc(paragraph([]), paragraph([text("  ")]))), null);
	assert.throws(
		() => parse(undefined, { required: true }),
		error => status(error) === 400
	);
	assert.throws(
		() => parse(doc(paragraph([])), { required: true }),
		error => status(error) === 400
	);
});

test("a plain string reads as the old textarea did", () => {
	const parsed = parse("Un\ndeux\n\nTrois");

	assert.equal(richText(parsed), "Un\ndeux\n\nTrois");
	assert.ok(richHtml(parsed).includes(">Un<br>deux</p>"));
});

test("marks nest in a fixed order and the text is escaped", () => {
	const parsed = parse(doc(paragraph([text("<b>", [{ type: "underline" }, { type: "bold" }])])));

	assert.ok(richHtml(parsed).includes("<u><strong>&lt;b&gt;</strong></u>"));
});

test("unknown nodes, marks and misplaced children are refused", () => {
	const refused = [
		doc({ type: "heading", content: [text("x")] }),
		doc(paragraph([{ type: "image", attrs: { src: "x" } }])),
		doc(paragraph([text("x", [{ type: "textStyle", attrs: { color: "red" } }])])),
		doc({ type: "listItem", content: [paragraph([text("x")])] }),
		doc(paragraph([text(42)])),
		{ type: "paragraph", content: [] },
		"<p>x</p>".split("")
	];

	for (const value of refused) {
		assert.throws(
			() => parse(value),
			error => status(error) === 400,
			JSON.stringify(value)
		);
	}
});

test("links: http, https and mailto only, escaped, address shown in the text", () => {
	const linked = parse(doc(paragraph([text("le site", [{ type: "link", attrs: { href: 'https://a.fr/?q="x"' } }]), text(" "), text("a@b.fr", [{ type: "link", attrs: { href: "mailto:a@b.fr" } }])])));

	assert.ok(richHtml(linked).includes('<a href="https://a.fr/?q=&quot;x&quot;" target="_blank"'));
	assert.equal(richText(linked), 'le site (https://a.fr/?q="x") a@b.fr');

	for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.fr", ""]) {
		assert.throws(
			() => parse(doc(paragraph([text("x", [{ type: "link", attrs: { href } }])]))),
			error => status(error) === 400,
			href
		);
	}
});

test("alignment is kept for the three offered values only", () => {
	const parsed = parse(doc(paragraph([text("a")], { textAlign: "center" }), paragraph([text("b")], { textAlign: "justify;color:red" })));
	const html = richHtml(parsed);

	assert.ok(html.includes("text-align:center;"));
	assert.equal(html.match(/text-align/g).length, 1);
});

test("lists: bullets, numbering from start, nesting, in both halves", () => {
	const parsed = parse(
		doc({
			type: "bulletList",
			content: [item(paragraph([text("un")]), { type: "orderedList", attrs: { start: 3 }, content: [item(paragraph([text("trois")])), item(paragraph([text("quatre")]))] }), item(paragraph([text("deux")]))]
		})
	);

	assert.equal(richText(parsed), "• un\n  3. trois\n  4. quatre\n• deux");

	const html = richHtml(parsed);
	assert.ok(html.startsWith("<ul "));
	assert.ok(html.includes('<ol start="3"'));
	assert.equal(html.match(/<li /g).length, 4);
});

test("quotes: framed in HTML, prefixed in text", () => {
	const parsed = parse(doc({ type: "blockquote", content: [paragraph([text("un")]), paragraph([text("deux")])] }));

	assert.equal(richText(parsed), "> un\n>\n> deux");
	assert.ok(richHtml(parsed).includes("border-left:2px solid"));
});

test("blank paragraphs: trimmed at the ends, kept as space in between", () => {
	const parsed = parse(doc(paragraph([]), paragraph([text("a")]), paragraph([]), paragraph([text("b")]), paragraph([])));

	assert.equal(parsed.content.length, 3);
	assert.ok(richHtml(parsed).includes("&nbsp;"));
	assert.equal(richText(parsed), "a\n\nb");
});

test("the limit counts text, not JSON; size and depth are bounded", () => {
	assert.ok(parse(doc(paragraph([text("x".repeat(1000), [{ type: "bold" }])]))));
	assert.throws(
		() => parse(doc(paragraph([text("x".repeat(1001))]))),
		error => status(error) === 400
	);

	let deep = paragraph([text("x")]);
	for (let level = 0; level < 20; level += 1) {
		deep = { type: "blockquote", content: [deep] };
	}
	assert.throws(
		() => parse(doc(deep)),
		error => status(error) === 400
	);

	const many = doc(...Array.from({ length: 6000 }, () => paragraph([])));
	assert.throws(
		() => parse(many),
		error => status(error) === 400
	);
});

test("the last block in a frame has no bottom margin", () => {
	const parsed = parse(doc(paragraph([text("a")]), paragraph([text("b")])));

	assert.match(richHtml(parsed, { last: "0" }), /margin:0 0 16px;.*>a<\/p><p style="margin:0;/);
});

const button = attrs => ({ type: "galleryButton", attrs });
const galleryLink = setId => `https://a.fr/gallery/lea${setId ? `?set=${setId}` : ""}`;

test("gallery button: rendered with the gallery's own link, never one from the tree", () => {
	const parsed = parse(doc(paragraph([text("Bonjour")]), button({ label: "Voir <tout>", setId: null, href: "https://evil.fr" }), button({ label: "Retouches", setId: "s_ab12" })));

	const html = richHtml(parsed, { galleryLink });
	assert.ok(html.includes('href="https://a.fr/gallery/lea"'));
	assert.ok(html.includes('href="https://a.fr/gallery/lea?set=s_ab12"'));
	assert.ok(html.includes(">Voir &lt;tout&gt;</a>"));
	assert.ok(!html.includes("evil"));

	assert.equal(richText(parsed, { galleryLink }), "Bonjour\n\nVoir <tout> :\n👉 https://a.fr/gallery/lea\n\nRetouches :\n👉 https://a.fr/gallery/lea?set=s_ab12");
	assert.deepEqual(buttonSetIds(parsed), ["s_ab12"]);
});

test("gallery button: a message of nothing but a button is not empty", () => {
	assert.ok(parse(doc(paragraph([]), button({ label: "Voir" })), { required: true }));
});

test("gallery button: label required and bounded, set id a short string or null", () => {
	const refused = [button({ label: "" }), button({ label: "   " }), button({ label: "x".repeat(81) }), button({ label: "x", setId: 3 }), button({ label: "x", setId: "" }), button({ label: "x", setId: "s".repeat(61) })];

	for (const value of refused) {
		assert.throws(
			() => parse(doc(value)),
			error => status(error) === 400,
			JSON.stringify(value)
		);
	}
});

test("gallery button: not allowed inside a list, allowed in a quote", () => {
	assert.throws(
		() => parse(doc({ type: "bulletList", content: [item(button({ label: "x" }))] })),
		error => status(error) === 400
	);
	assert.ok(richHtml(parse(doc({ type: "blockquote", content: [button({ label: "x" })] })), { galleryLink }).includes(">x</a>"));
});

test("gallery button: rendering without galleryLink is a programming error, not a broken link", () => {
	assert.throws(() => richHtml(parse(doc(button({ label: "x" })))), /galleryLink/);
});
