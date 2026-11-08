// node --test lambda/gallery-api/src/lib/galleries.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { clientProjection, ensureSetSlugs, findSetBySegment, freshSetSlug, newSet, renameSetSlug, setSlugs } from "./galleries.mjs";

const gallery = sets => ({ id: "g_x", slug: "mantrailing-0711", title: "Mantrailing", sets, photos: [] });
const legacy = (id, title) => ({ id, title, downloadsEnabled: true, hdEnabled: true, watermark: null });

test("older sets get slugs derived from their titles, deduplicated in tab order", () => {
	const record = gallery([legacy("s_a", "Séance d'été"), legacy("s_b", "Séance d’été"), legacy("s_c", "📸")]);

	assert.deepEqual([...setSlugs(record).values()], ["seance-d-ete", "seance-d-ete-2", "categorie"]);
	// The same every time: it is what a mailed link was built from.
	assert.deepEqual([...setSlugs(record).values()], [...setSlugs(record).values()]);
});

test("a stored slug wins, and a derived one steps around it", () => {
	const record = gallery([legacy("s_a", "Retouches"), { ...legacy("s_b", "Autre"), slug: "retouches" }]);

	assert.deepEqual([...setSlugs(record).entries()], [["s_a", "retouches-2"], ["s_b", "retouches"]]);
});

test("a new set is checked against every slug and alias in use", () => {
	const record = gallery([{ ...legacy("s_a", "Portraits"), slug: "portraits", slugAliases: ["retouches"] }]);
	ensureSetSlugs(record);

	assert.equal(freshSetSlug(record, "Retouches"), "retouches-2");
	assert.equal(freshSetSlug(record, "Extérieur"), "exterieur");
	assert.equal(newSet({ id: "s_n", title: "X", slug: "x" }).slug, "x");
});

test("rename: new slug, old one kept as an alias, old links still resolve", () => {
	const record = gallery([legacy("s_a", "Brouillon")]);
	const [set] = record.sets;

	renameSetSlug(record, set, "Retouches finales");
	assert.equal(set.slug, "retouches-finales");
	assert.deepEqual(set.slugAliases, ["brouillon"]);

	assert.equal(findSetBySegment(record, "retouches-finales"), set);
	assert.equal(findSetBySegment(record, "brouillon"), set);
	assert.equal(findSetBySegment(record, "s_a"), set);
	assert.equal(findSetBySegment(record, "nope"), null);
	assert.equal(findSetBySegment(record, ""), null);
});

test("rename back reclaims the old slug; a case or accent change keeps it", () => {
	const record = gallery([legacy("s_a", "Brouillon")]);
	const [set] = record.sets;

	renameSetSlug(record, set, "Retouches");
	renameSetSlug(record, set, "Brouillon");
	assert.equal(set.slug, "brouillon");
	assert.deepEqual(set.slugAliases, ["retouches"]);

	renameSetSlug(record, set, "BROUILLÔN");
	assert.equal(set.slug, "brouillon");
	assert.deepEqual(set.slugAliases, ["retouches"]);
});

test("aliases are capped", () => {
	const record = gallery([legacy("s_a", "Titre 0")]);
	const [set] = record.sets;

	for (let index = 1; index <= 15; index += 1) {
		renameSetSlug(record, set, `Titre ${index}`);
	}

	assert.equal(set.slug, "titre-15");
	assert.equal(set.slugAliases.length, 10);
	assert.equal(set.slugAliases[0], "titre-14");
});

test("the client manifest carries each tab's slug and aliases; the ungrouped one has none", () => {
	const record = gallery([{ ...legacy("s_a", "Retouches"), slug: "retouches", slugAliases: ["brouillon"] }]);
	record.photos = [
		{ pid: "p_1", status: "ready", setId: null, sortIndex: 0, rev: 1, w: 1, h: 1 },
		{ pid: "p_2", status: "ready", setId: "s_a", sortIndex: 1, rev: 1, w: 1, h: 1 }
	];

	const sets = clientProjection(record).sets.map(({ id, slug, aliases }) => ({ id, slug, aliases }));

	assert.deepEqual(sets, [
		{ id: null, slug: null, aliases: [] },
		{ id: "s_a", slug: "retouches", aliases: ["brouillon"] }
	]);
});
