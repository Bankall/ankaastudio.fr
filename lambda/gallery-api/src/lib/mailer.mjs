// Outbound email.
//
// One SES client and one visual wrapper for the whole system, so the messages it
// sends — "your gallery is online", "your archive is ready" — cannot drift apart
// as they are edited one at a time.

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

export const escapeHtml = value =>
	String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

/**
 * The frame every message shares: a warm page, a white card, the wordmark above
 * a serif title, and the studio's footer under it.
 *
 * Tables and inline styles only: Outlook ignores modern layout and most clients
 * strip <style>. `label` is the caption over the card — which kind of message
 * this is — and `preview` the line an inbox shows beside the subject.
 */
export const emailLayout = ({ label, heading, preview = heading, inner, origin = SITE_URL }) => `<!doctype html>
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
					<tr><td style="padding:22px 32px 34px;font-family:${SANS};font-size:16px;line-height:26px;color:${BODY};">À très bientôt,<br>Ankaa Studio</td></tr>
				</table>
			</td></tr>
			<tr><td align="center" style="padding:20px 16px 0;font-family:${SANS};font-size:12px;line-height:20px;color:${MUTED};">
				<a href="${escapeHtml(origin)}" style="color:${MUTED};text-decoration:none;">${escapeHtml(origin.replace(/^https?:\/\//, ""))}</a><br>
				Une question&nbsp;? Répondez simplement à cet e-mail.
			</td></tr>
		</table>
	</td></tr>
</table>
</body></html>`;

/** Body copy. Styled per block: a <td> hands nothing down to its children in Outlook. */
export const emailParagraph = html =>
	`<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${BODY};">${html}</p>`;

/** The aside that follows the main copy — validity, expiry, the small print. */
export const emailNote = html =>
	`<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">${html}</p>`;

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
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 6px;"><tr>
		<td align="center" bgcolor="${INK}" style="border-radius:4px;">
			<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:12px;line-height:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#fffdfa;text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a>
		</td>
	</tr></table>`;

export async function sendEmail({ to, subject, text, html }) {
	await ses.send(
		new SendEmailCommand({
			FromEmailAddress: process.env.SENDER_EMAIL,
			Destination: { ToAddresses: [to] },
			Content: {
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
