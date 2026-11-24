// node --test src/gallery/scrollEdges.test.js
import assert from "node:assert/strict";
import { test } from "node:test";

import { scrollEdges } from "./scrollEdges.js";

test("a row that fits hides nothing", () => {
	assert.deepEqual(scrollEdges({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }), { start: false, end: false });
});

test("an overflowing row at rest hides its end only", () => {
	assert.deepEqual(scrollEdges({ scrollLeft: 0, clientWidth: 300, scrollWidth: 600 }), { start: false, end: true });
});

test("halfway along, both ends are hidden", () => {
	assert.deepEqual(scrollEdges({ scrollLeft: 150, clientWidth: 300, scrollWidth: 600 }), { start: true, end: true });
});

test("scrolled to the end, only the start is hidden", () => {
	assert.deepEqual(scrollEdges({ scrollLeft: 300, clientWidth: 300, scrollWidth: 600 }), { start: true, end: false });
});

test("a fractional stop just short of either end counts as the end", () => {
	assert.deepEqual(scrollEdges({ scrollLeft: 0.5, clientWidth: 300, scrollWidth: 600 }), { start: false, end: true });
	assert.deepEqual(scrollEdges({ scrollLeft: 299.5, clientWidth: 300, scrollWidth: 600 }), { start: true, end: false });
});
