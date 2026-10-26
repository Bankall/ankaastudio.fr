// Outbound email: how a message is built and sent.
//
// One SES client and one visual wrapper for the whole system, so the messages it
// sends — "your gallery is online", "your archive is ready" — cannot drift apart
// as they are edited one at a time. The two the photographer sends by hand — the
// link, and the finished edits — are written out in emails.mjs.

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

export const escapeHtml = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The site's tokens, spelled out: an email cannot read a stylesheet, and the
// warm sand of the gallery is most of what makes these messages ours.
const PAGE = "#efebe3";
const CARD = "#fffdfa";
const LINE = "#e4dcd0";
const TEXT = "#353535";
const BODY = "#4a423b";
const MUTED = "#7a6d64";
const ACCENT = "#cfb0aa";
const INK = "#353535";

// Crimson Pro and Fredoka are web fonts, which mail clients do not load; these
// are the closest stacks that every client already has.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";

const SITE_URL = "https://ankaastudio.fr";

// The studio's name in front of the address. Inboxes show the name, and a bare
// address in a list where every other sender has one is a mark against a message
// before it is read — by the reader and by the filter in front of them.
const SENDER_NAME = "Ankaa Studio";

/**
 * The open pixel: a 1×1 image whose URL names the message, so that loading it is
 * what tells the share panel the message was opened.
 *
 * Sized and bordered inline because a client that renders it as a broken 16×16
 * placeholder would show a mark where nothing should be. At the very end of the
 * body, after the layout, so a client that truncates a long message — Gmail clips
 * past ~100 kB — drops the pixel rather than a line of the copy.
 */
const emailPixel = url => `<img src="${escapeHtml(url)}" width="1" height="1" alt="" aria-hidden="true" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;">`;

/**
 * The frame every message shares: a warm page, a white card, the wordmark above
 * a serif title, and the studio's footer under it.
 *
 * Tables and inline styles only: Outlook ignores modern layout and most clients
 * strip <style>. `label` is the caption over the card — which kind of message
 * this is — and `preview` the line an inbox shows beside the subject.
 *
 * `signoff` is the farewell under the rule, overridable because a message whose own
 * last line already says goodbye would otherwise say it twice.
 *
 * `trackingUrl` is the open pixel's URL, for the messages whose opening is worth
 * knowing about — the ones the photographer sends by hand. Null means no pixel.
 */
export const emailLayout = ({ label, heading, preview = heading, inner, origin = SITE_URL, signoff = "À très bientôt,<br>Ankaa Studio", trackingUrl = null }) => `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(preview)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAGE};">
	<tr><td align="center" style="padding:26px 12px 34px;">
		<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
			<tr><td align="center" style="padding:0 0 14px;font-family:${SANS};font-size:10px;line-height:14px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td></tr>
			<tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:8px;">
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
					<tr><td align="center" style="padding:34px 32px 0;font-family:${SERIF};font-size:12px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${TEXT};">Ankaa Studio</td></tr>
					<tr><td align="center" style="padding:16px 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="40"><tr><td height="1" style="height:1px;background:${ACCENT};line-height:1px;font-size:0;">&nbsp;</td></tr></table></td></tr>
					<tr><td style="padding:26px 32px 0;font-family:${SERIF};font-size:26px;line-height:34px;color:${TEXT};">${escapeHtml(heading)}</td></tr>
					<tr><td style="padding:18px 32px 26px;">${inner}</td></tr>
					<tr><td style="padding:0 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;background:${LINE};line-height:1px;font-size:0;">&nbsp;</td></tr></table></td></tr>
					<tr><td style="padding:22px 32px 34px;font-family:${SANS};font-size:16px;line-height:26px;color:${BODY};">${signoff}</td></tr>
				</table>
			</td></tr>
			<tr><td align="center" style="padding:20px 16px 0;font-family:${SANS};font-size:12px;line-height:20px;color:${MUTED};">
				<a href="${escapeHtml(origin)}" style="color:${MUTED};text-decoration:none;">${escapeHtml(origin.replace(/^https?:\/\//, ""))}</a><br>
				Une question&nbsp;? Répondez simplement à cet e-mail.
			</td></tr>
		</table>
	</td></tr>
</table>
${trackingUrl ? emailPixel(trackingUrl) : ""}
</body></html>`;

/** Body copy. Styled per block: a <td> hands nothing down to its children in Outlook. */
export const emailParagraph = html => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${BODY};">${html}</p>`;

/** The aside that follows the main copy — validity, expiry, the small print. */
export const emailNote = html => `<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">${html}</p>`;

/**
 * The photographer's own words, set off by an accent rule.
 *
 * Line breaks become <br>: the clients that drop `white-space` would otherwise
 * run a hand-typed note into one paragraph.
 */
export const emailQuote = text =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;"><tr>
		<td style="padding:2px 0 2px 16px;border-left:2px solid ${ACCENT};font-family:${SANS};font-size:15px;line-height:24px;color:${BODY};font-style:italic;">${escapeHtml(text).replace(/\r?\n/g, "<br>")}</td>
	</tr></table>`;

/** A value the client has to read off and retype, so it gets its own frame. */
export const emailValue = (label, value) =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;"><tr>
		<td align="center" style="padding:14px 18px;background:${PAGE};border-radius:6px;">
			<div style="font-family:${SANS};font-size:10px;line-height:14px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
			<div style="padding-top:6px;font-family:${SANS};font-size:18px;line-height:24px;letter-spacing:1px;color:${TEXT};"><strong>${escapeHtml(value)}</strong></div>
		</td>
	</tr></table>`;

export const emailButton = (href, label) =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto;"><tr>
		<td align="center" bgcolor="${INK}" style="border-radius:4px;">
			<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:12px;line-height:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#fffdfa;text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a>
		</td>
	</tr></table>`;

/**
 * The second thing a message asks for, which must not look like the first.
 *
 * An outlined button rather than a filled one: a mail with two solid buttons offers
 * no main action, and the one that matters is always the photographs.
 */
export const emailButtonGhost = (href, label) =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto;"><tr>
		<td align="center" style="border:1px solid ${LINE};border-radius:4px;">
			<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${SANS};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${TEXT};text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a>
		</td>
	</tr></table>`;

/**
 * A header value that may hold something outside ASCII, in RFC 2047 encoded words.
 *
 * Only the raw path needs this: SES encodes the headers of a Simple message itself,
 * but a raw message is taken as given, and `Subject: Votre galerie « … »` sent as
 * bare UTF-8 bytes is what turns a subject line into mojibake.
 *
 * Chunked at 45 bytes because an encoded word may be 75 characters all in: base64
 * turns 45 bytes into 60, and `=?UTF-8?B?` plus `?=` is the other 12. Iterating the
 * string gives whole code points, so no chunk ends mid-character, and the words are
 * folded onto their own lines to stay inside the line-length limit — a decoder drops
 * the whitespace between two adjacent encoded words, so the value survives intact.
 */
function encodeHeader(value) {
	const text = String(value);

	if (!/[^\x20-\x7e]/.test(text)) {
		return text;
	}

	const words = [];
	let chunk = "";

	for (const character of text) {
		if (Buffer.byteLength(chunk + character, "utf8") > 45) {
			words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`);
			chunk = "";
		}

		chunk += character;
	}

	if (chunk) {
		words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`);
	}

	return words.join("\r\n ");
}

/** Base64, wrapped at 76 characters: longer lines are not valid in a MIME body. */
const base64Body = content =>
	(
		Buffer.from(content)
			.toString("base64")
			.match(/.{1,76}/g) ?? [""]
	).join("\r\n");

/** A boundary nothing in the parts can collide with. */
const boundary = label => `--=_ankaa_${label}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * The whole message as RFC 5322 bytes, which is the only form an attachment can go
 * out in — SES's Simple content has no field for one.
 *
 * multipart/mixed holding a multipart/alternative and then the files: the nesting is
 * what keeps "the text or the HTML, whichever you can show" separate from "and these
 * are attached", which a flat multipart would leave a client to guess at.
 */
function rawMessage({ from, to, subject, text, html, attachments }) {
	const mixed = boundary("mixed");
	const alternative = boundary("alt");

	const lines = [
		`From: ${from}`,
		`To: ${to}`,
		`Subject: ${encodeHeader(subject)}`,
		// SES stamps a Simple message with the date itself; a raw one goes out as
		// given, and a message with no Date header is one of the oldest spam-filter
		// rules there is. RFC 5322 wants a numeric zone, not the "GMT" Node prints.
		`Date: ${new Date().toUTCString().replace(/GMT$/, "+0000")}`,
		"MIME-Version: 1.0",
		`Content-Type: multipart/mixed; boundary="${mixed}"`,
		"",
		`--${mixed}`,
		`Content-Type: multipart/alternative; boundary="${alternative}"`,
		"",
		`--${alternative}`,
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64Body(text),
		`--${alternative}`,
		"Content-Type: text/html; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64Body(html),
		`--${alternative}--`
	];

	for (const file of attachments) {
		// The filename is interpolated into two headers, so it is reduced to plain
		// ASCII without quotes or backslashes — the callers already sanitise, this is
		// so that a header cannot be broken out of even if one day one does not.
		const filename = String(file.filename)
			.replace(/[^\x20-\x7e]/g, "_")
			.replace(/["\\]/g, "");

		lines.push(`--${mixed}`, `Content-Type: ${file.contentType}; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", base64Body(file.content));
	}

	lines.push(`--${mixed}--`, "");

	return Buffer.from(lines.join("\r\n"), "utf8");
}

/**
 * Sends one message, with or without files attached.
 *
 * Both content types rather than raw for everything: a Simple message lets SES do
 * its own header encoding and MIME assembly, which is one less thing of ours to be
 * wrong, so only the messages that actually carry a file take the raw path.
 */
export async function sendEmail({ to, subject, text, html, attachments = [] }) {
	const address = process.env.SENDER_EMAIL;
	// Left alone if the deployment already put a name on it.
	const from = address.includes("<") ? address : `${SENDER_NAME} <${address}>`;

	await ses.send(
		new SendEmailCommand({
			FromEmailAddress: from,
			Destination: { ToAddresses: [to] },
			Content:
				attachments.length > 0 ?
					{ Raw: { Data: rawMessage({ from, to, subject, text, html, attachments }) } }
				:	{
						Simple: {
							Subject: { Data: subject, Charset: "UTF-8" },
							Body: {
								Text: { Data: text, Charset: "UTF-8" },
								Html: { Data: html, Charset: "UTF-8" }
							}
						}
					}
		})
	);
}
