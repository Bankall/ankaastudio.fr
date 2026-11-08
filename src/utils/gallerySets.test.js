// node --test src/utils/gallerySets.test.js
import assert from "node:assert/strict";
import { test } from "node:test";

import { findSetBySegment, setPath } from "./gallerySets.js";

const sets = [
	{ id: null, slug: null, aliases: [], title: "Galerie" },
	{ id: "s_pcfgbjxhgn", slug: "retouches", aliases: ["brouillon"], title: "Retouches" }
];

test("a segment resolves by slug, then old slug, then id", () => {
	assert.equal(findSetBySegment(sets, "retouches"), sets[1]);
	assert.equal(findSetBySegment(sets, "brouillon"), sets[1]);
	assert.equal(findSetBySegment(sets, "s_pcfgbjxhgn"), sets[1]);
	assert.equal(findSetBySegment(sets, "inconnu"), null);
	assert.equal(findSetBySegment(sets, null), null);
});

test("the first tab is the plain gallery link, the others a path segment", () => {
	assert.equal(setPath("mantrailing-0711", sets, sets[0]), "/gallery/mantrailing-0711");
	assert.equal(setPath("mantrailing-0711", sets, null), "/gallery/mantrailing-0711");
	assert.equal(setPath("mantrailing-0711", sets, sets[1]), "/gallery/mantrailing-0711/retouches");
});

test("the old ?set= is dropped, any other query string kept", () => {
	assert.equal(setPath("m", sets, sets[1], "?set=s_pcfgbjxhgn"), "/gallery/m/retouches");
	assert.equal(setPath("m", sets, sets[1], "?set=s_pcfgbjxhgn&utm_source=mail"), "/gallery/m/retouches?utm_source=mail");
});

test("a manifest without slugs (API older than the site) links by id, and the id resolves", () => {
	const unslugged = [
		{ id: "s_1kdqh2hwc3", title: "Sakura" },
		{ id: "s_pcfgbjxhgn", title: "Tala" }
	];

	assert.equal(setPath("mantrailing-0711", unslugged, unslugged[0]), "/gallery/mantrailing-0711");
	assert.equal(setPath("mantrailing-0711", unslugged, unslugged[1]), "/gallery/mantrailing-0711/s_pcfgbjxhgn");
	assert.equal(findSetBySegment(unslugged, "s_pcfgbjxhgn"), unslugged[1]);
});
