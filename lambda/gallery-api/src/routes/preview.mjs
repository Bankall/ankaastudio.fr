// What a shared gallery link looks like inside a message.
//
// A gallery URL gets pasted into an RCS thread, an Instagram DM, WhatsApp — and
// every one of those fetches the page first and reads its meta tags to draw a card
// for it. None of them runs JavaScript, so the <Seo> component is invisible to
// them: all they ever saw was the static index.html, which is why every gallery
// unfurled as the same studio-wide sentence with no image at all.
//
// So /gallery/* is answered here rather than straight out of the site bucket: the
// very same shell, with that gallery's own Open Graph tags written into its head.
// The document is otherwise untouched — the app boots and fetches its manifest
// exactly as before — and the response is edge-cacheable, so this runs once per
// gallery per few minutes rather than once per visitor.
//
// Nothing here reads a session. A crawler holds none, and a response that varied by
// cookie could not be cached under the URL alone.

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { signedUrl } from "../lib/cfsign.mjs";
import { galleryKey, isExpired, readyCover, sharePreviewKey, webKey } from "../lib/galleries.mjs";
import { html, notFound, publicOrigin, redirect } from "../lib/http.mjs";
import { escapeHtml } from "../lib/mailer.mjs";
import { invokeProcessor } from "../lib/processor.mjs";
import { getSecrets } from "../lib/secrets.mjs";
import { getJson, objectExists, s3 } from "../lib/store.mjs";
import { readIndex } from "./client.mjs";

const SHELL_KEY = "index.html";
// A deploy replaces index.html with freshly hashed asset names, so a shell held for
// the life of the container would eventually boot a bundle that no longer exists.
const SHELL_CACHE_MS = 60 * 1000;
// What CloudFront may keep. Long enough that a burst of visitors is one render,
// short enough that a retitled gallery unfurls correctly a few minutes later.
const SHELL_S_MAXAGE_SECONDS = 300;
// Long enough for a crawler that queues its image fetches, short enough that the
// URL is worthless by the time it could be passed around.
const PREVIEW_URL_TTL_SECONDS = 60 * 60;

let shellCache = null;

/** The deployed SPA entry document, as the bucket holds it. */
async function siteShell() {
	if (shellCache && Date.now() < shellCache.expiresAt) {
		return shellCache.html;
	}

	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: process.env.SITE_BUCKET, Key: SHELL_KEY }));
		const body = await result.Body.transformToString();

		shellCache = { html: body, expiresAt: Date.now() + SHELL_CACHE_MS };

		return body;
	} catch (error) {
		// A stale shell is worth serving past its refresh: it is a minute old at most,
		// and the alternative is a gallery that does not open because S3 blinked.
		if (shellCache) {
			shellCache.expiresAt = Date.now() + SHELL_CACHE_MS;

			return shellCache.html;
		}

		throw error;
	}
}

/**
 * The index row for a gallery that may describe itself publicly, or null.
 *
 * Only a published, live one does: a draft is not public yet, and an archived or
 * expired gallery answers 410 to the visitor who follows the link, so announcing it
 * with a photo and a photo count would be a small lie. Both fall back to the
 * studio's own card.
 *
 * The index row carries everything a card needs — title, count, date, cover pid,
 * whether there is a password — so this costs no read of the gallery record.
 */
async function shareable(slug) {
	try {
		const index = await readIndex();
		const entry = index.galleries.find(row => row.slug === slug);

		return entry && entry.status === "published" && !isExpired(entry) ? entry : null;
	} catch (error) {
		console.warn("Share card index unavailable", { slug, error: error.message });

		return null;
	}
}

const dateText = value => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * The two lines of the card, addressed to the person the link was sent to.
 *
 * Short on purpose: a message bubble shows a headline and about two lines, and what
 * matters in them is that these are *their* photos, how many, and from when.
 */
function cardText(entry) {
	const count = entry.photoCount ?? 0;
	const scope =
		count > 0 ?
			`${count} photo${count > 1 ? "s" : ""}${entry.shootDate ? ` de la séance du ${dateText(entry.shootDate)}` : ""}`
		:	"Vos photos sont en ligne";
	// A gallery with downloads off is still there to be looked through and picked
	// from; promising a download it will refuse is worse than promising less.
	const invitation =
		entry.downloadsEnabled ? "Découvrez-les, choisissez vos préférées et téléchargez-les." : "Découvrez-les et choisissez vos préférées.";

	return {
		title: `${entry.title} — votre galerie photo`,
		description: `${scope}. ${invitation}${entry.hasPassword ? " Accès par mot de passe." : ""}`
	};
}

const meta = (attribute, name, content) => `<meta ${attribute}="${name}" content="${escapeHtml(content)}" />`;

/**
 * The head this gallery deserves.
 *
 * Deliberately without a robots directive, even though <Seo> sets noindex on this
 * page client-side: the crawlers drawing these cards are not search engines, several
 * of them refuse a page that says noindex, and a gallery whose link cannot be
 * previewed is the whole problem this exists to fix. Googlebot renders the app and
 * still finds the directive, so nothing is indexed that was not before.
 */
function cardTags(entry, origin) {
	const { title, description } = cardText(entry);
	const url = `${origin}/gallery/${entry.slug}`;
	// No cover photo yet means no card image: the studio's own, from index.html,
	// beats a link to something that would answer 404.
	const image = entry.coverPid ? `${origin}/api/g/${entry.slug}/preview` : null;

	return [
		`<title>${escapeHtml(title)}</title>`,
		meta("name", "description", description),
		meta("property", "og:type", "website"),
		meta("property", "og:site_name", "Ankaa Studio"),
		meta("property", "og:locale", "fr_FR"),
		meta("property", "og:title", title),
		meta("property", "og:description", description),
		meta("property", "og:url", url),
		...(image ?
			[
				meta("property", "og:image", image),
				// Some readers only look for the secure variant, and every URL here is https.
				meta("property", "og:image:secure_url", image),
				meta("property", "og:image:alt", `Photo de couverture de la galerie ${entry.title}`)
			]
		:	[]),
		meta("name", "twitter:card", image ? "summary_large_image" : "summary"),
		meta("name", "twitter:title", title),
		meta("name", "twitter:description", description),
		...(image ? [meta("name", "twitter:image", image)] : [])
	];
}

// Everything the injected block replaces: index.html carries the studio's own card,
// which is the right answer for every page except this one.
const REPLACED = /[\t ]*<title>[\s\S]*?<\/title>\n?|[\t ]*<meta\s+(?:name="(?:description|twitter:[^"]*)"|property="og:[^"]*")[^>]*>\n?/g;
const CHARSET = /<meta[^>]*charset[^>]*>/i;

/** Rewrites the shell's head for one gallery. */
function withCard(shell, tags) {
	const block = tags.map(tag => `\t\t${tag}`).join("\n");
	const stripped = shell.replace(REPLACED, "");

	// After the charset declaration rather than before it: that one has to stay within
	// the first bytes of the document, and a parser that has not read it yet would be
	// guessing at the encoding of the French sitting in these tags. Replacements go
	// through functions so a title containing `$&` stays a title.
	return CHARSET.test(stripped) ?
			stripped.replace(CHARSET, match => `${match}\n\n${block}`)
		:	stripped.replace("</head>", () => `${block}\n\t</head>`);
}

/**
 * The gallery page, shell and card together.
 *
 * Every failure short of losing the shell itself degrades to the plain document:
 * this is the page a client opens to see their photos, and a missing preview card is
 * nothing next to a gallery that will not load.
 */
async function galleryShell({ request, params }) {
	let shell;

	try {
		shell = await siteShell();
	} catch (error) {
		// Nothing left to serve — there is no application without it. 404.html's own
		// bridge is the way out: the app reads ?route= and puts the URL back, so the
		// visitor still lands in their gallery.
		console.error("Site shell unavailable", { slug: params.slug, error: error.message });

		return redirect(`/?route=${encodeURIComponent(`/gallery/${params.slug}`)}`);
	}

	let document = shell;

	try {
		const entry = await shareable(params.slug);

		if (entry) {
			document = withCard(shell, cardTags(entry, publicOrigin(request)));
		}
	} catch (error) {
		console.warn("Share card not written", { slug: params.slug, error: error.message });
	}

	return html(200, document, { sMaxAge: SHELL_S_MAXAGE_SECONDS });
}

/**
 * The card's image: a 302 to a signed URL of the cover.
 *
 * A crawler holds no signed cookies, so it cannot fetch anything under v/ — and a
 * signature written into the tag itself would be dead by the time the message is
 * forwarded. Signing per fetch answers both: the URL in the message never expires,
 * and each fetch of it mints one that lives an hour.
 *
 * The JPEG is derived on demand, so the very first scrape of a gallery nobody has
 * shared yet may still be answered with the watermarked web preview. That is the
 * right fallback — an image every time, the better one from then on.
 */
async function previewImage({ request, params }) {
	const entry = await shareable(params.slug);

	if (!entry) {
		throw notFound("Galerie introuvable.");
	}

	// The record, this time: the index row knows which photo is the cover but not
	// which revision of it, nor whether that photo is finished.
	const gallery = (await getJson(galleryKey(entry.id)))?.data;
	const cover = gallery ? readyCover(gallery) : null;

	if (!cover) {
		throw notFound("Cette galerie n'a pas encore d'image.");
	}

	const preview = sharePreviewKey(gallery.id, cover.pid, cover.rev);
	let ready = Boolean(await objectExists(preview));

	if (!ready) {
		try {
			await invokeProcessor({ gid: gallery.id, pid: cover.pid, extension: cover.extension, rev: cover.rev, variant: "share" });
		} catch (error) {
			// Cosmetic, and the fallback below is already an image.
			console.warn("Share preview not queued", { gid: gallery.id, error: error.message });
			ready = false;
		}
	}

	const { cfPrivateKey } = await getSecrets();

	return redirect(
		signedUrl({
			url: `${publicOrigin(request)}/${ready ? preview : webKey(gallery.id, cover.pid, cover.rev)}`,
			expiresAt: Math.floor(Date.now() / 1000) + PREVIEW_URL_TTL_SECONDS,
			keyPairId: process.env.CF_KEY_PAIR_ID,
			privateKey: cfPrivateKey
		})
	);
}

export const previewRoutes = [
	["GET", "/gallery/:slug", galleryShell],
	["GET", "/api/g/:slug/preview", previewImage]
];
