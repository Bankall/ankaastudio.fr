import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = process.env.AWS_REGION || "eu-west-1";
const RECIPIENT = process.env.RECIPIENT_EMAIL || "sophie.marache@gmail.com";
// Sender must be a verified identity (address or domain) in SES.
const SENDER = process.env.SENDER_EMAIL || "contact@ankaastudio.fr";
// Comma-separated list of allowed origins for CORS (e.g. "https://ankaastudio.fr,https://www.ankaastudio.fr").
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://ankaastudio.fr")
	.split(",")
	.map(origin => origin.trim())
	.filter(Boolean);

// Google reCAPTCHA Enterprise. Leave RECAPTCHA_API_KEY (or RECAPTCHA_PROJECT_ID /
// RECAPTCHA_SITE_KEY) unset to disable the check entirely — handy for local dev.
//   RECAPTCHA_PROJECT_ID : Google Cloud project id that owns the reCAPTCHA key.
//   RECAPTCHA_SITE_KEY   : the reCAPTCHA Enterprise key (same value used client-side).
//   RECAPTCHA_API_KEY    : a Google Cloud API key authorized for the
//                          reCAPTCHA Enterprise API, used to call createAssessment.
// Score ranges 0.0 (very likely a bot) .. 1.0 (very likely human).
const RECAPTCHA_PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID || "";
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || "";
const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY || "";
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || "0.5");
const RECAPTCHA_EXPECTED_ACTION = process.env.RECAPTCHA_ACTION || "contact";

const RECAPTCHA_ENABLED = Boolean(RECAPTCHA_PROJECT_ID && RECAPTCHA_SITE_KEY && RECAPTCHA_API_KEY);

const ses = new SESv2Client({ region: REGION });

// Verify a token by creating a reCAPTCHA Enterprise assessment.
// Docs: https://cloud.google.com/recaptcha/docs/create-assessment
async function verifyRecaptcha(token, remoteIp, userAgent) {
	// Not fully configured -> checks are disabled.
	if (!RECAPTCHA_ENABLED) {
		return { ok: true, skipped: true };
	}

	if (!token) {
		return { ok: false, reason: "missing-token" };
	}

	const endpoint = `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_PROJECT_ID}/assessments?key=${encodeURIComponent(RECAPTCHA_API_KEY)}`;

	const body = {
		event: {
			token,
			siteKey: RECAPTCHA_SITE_KEY,
			expectedAction: RECAPTCHA_EXPECTED_ACTION,
			userIpAddress: remoteIp || undefined,
			userAgent: userAgent || undefined
		}
	};

	let data;
	try {
		const res = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		});
		data = await res.json();
		if (!res.ok) {
			return { ok: false, reason: "assessment-http-error", detail: data?.error?.message || res.status };
		}
	} catch (err) {
		console.error("reCAPTCHA assessment request failed:", err);
		return { ok: false, reason: "assessment-request-failed" };
	}

	// tokenProperties tells us whether the token itself was usable.
	const tokenProps = data.tokenProperties || {};
	if (!tokenProps.valid) {
		return { ok: false, reason: "invalid-token", detail: tokenProps.invalidReason };
	}

	if (tokenProps.action !== RECAPTCHA_EXPECTED_ACTION) {
		return { ok: false, reason: "action-mismatch", detail: tokenProps.action };
	}

	const score = data.riskAnalysis?.score;
	if (typeof score === "number" && score < RECAPTCHA_MIN_SCORE) {
		return { ok: false, reason: "low-score", detail: score };
	}

	return { ok: true, score };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Echo back the caller's origin only if it's allow-listed. The browser rejects
// a response that lists more than one origin, so we emit exactly one value and
// add `Vary: Origin` since the header depends on the request.
function corsHeaders(origin) {
	const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
	return {
		"Access-Control-Allow-Origin": allowed,
		"Access-Control-Allow-Methods": "POST,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		Vary: "Origin",
		"Content-Type": "application/json"
	};
}

// Resolve the request origin: prefer the Origin header, else derive it from the
// Referer (scheme://host[:port]). Returns "" when neither is usable.
function resolveOrigin(headers = {}) {
	const origin = headers.origin || headers.Origin;
	if (origin) {
		return origin;
	}

	const referer = headers.referer || headers.Referer;
	if (referer) {
		try {
			return new URL(referer).origin;
		} catch {
			return "";
		}
	}

	return "";
}

function response(statusCode, body, origin) {
	return {
		statusCode,
		headers: corsHeaders(origin),
		body: JSON.stringify(body)
	};
}

function escapeHtml(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const handler = async event => {
	// Origin comes from the Origin header, falling back to the Referer.
	const origin = resolveOrigin(event?.headers);
	const method = event?.requestContext?.http?.method || event?.httpMethod || "POST";

	if (method === "OPTIONS") {
		return response(204, {}, origin);
	}

	if (method !== "POST") {
		return response(405, { error: "Method not allowed" }, origin);
	}

	let payload;
	try {
		const raw = event?.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event?.body;
		payload = typeof raw === "string" ? JSON.parse(raw) : raw || {};
	} catch {
		return response(400, { error: "Corps de requête invalide." }, origin);
	}

	const name = (payload.name || "").trim();
	const email = (payload.email || "").trim();
	const service = (payload.service || "").trim();
	const message = (payload.message || "").trim();

	// Honeypot: bots fill hidden fields. Silently accept without sending.
	if ((payload.website || payload.company || "").trim()) {
		return response(200, { ok: true }, origin);
	}

	if (!name || !email || !message) {
		return response(400, { error: "Nom, email et message sont obligatoires." }, origin);
	}

	if (!EMAIL_REGEX.test(email) || email.length > 254) {
		return response(400, { error: "Adresse email invalide." }, origin);
	}

	if (name.length > 200 || service.length > 200 || message.length > 5000) {
		return response(400, { error: "Un des champs dépasse la taille autorisée." }, origin);
	}

	// reCAPTCHA Enterprise anti-abuse check. Client IP/UA come from the proxy event.
	const remoteIp = event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || "";
	const userAgent = event?.headers?.["user-agent"] || event?.headers?.["User-Agent"] || "";
	const captcha = await verifyRecaptcha(payload.recaptchaToken || payload.captchaToken, remoteIp, userAgent);
	if (!captcha.ok) {
		console.warn("reCAPTCHA rejected:", captcha.reason, captcha.detail ?? "");
		return response(400, { error: "Échec de la vérification anti-spam. Réessayez." }, origin);
	}

	const subject = `Demande de réservation${service ? ` - ${service}` : ""}`;

	const textBody = [`Nom: ${name}`, `Email: ${email}`, `Prestation: ${service || "Non précisée"}`, "", "Message:", message].join("\n");

	const htmlBody = `
		<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5;">
			<h2 style="margin:0 0 16px;">Nouvelle demande depuis ankaastudio.fr</h2>
			<p><strong>Nom :</strong> ${escapeHtml(name)}</p>
			<p><strong>Email :</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
			<p><strong>Prestation :</strong> ${escapeHtml(service || "Non précisée")}</p>
			<p><strong>Message :</strong></p>
			<p style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;">${escapeHtml(message)}</p>
		</div>
	`;

	try {
		await ses.send(
			new SendEmailCommand({
				FromEmailAddress: SENDER,
				Destination: { ToAddresses: [RECIPIENT] },
				ReplyToAddresses: [email],
				Content: {
					Simple: {
						Subject: { Data: subject, Charset: "UTF-8" },
						Body: {
							Text: { Data: textBody, Charset: "UTF-8" },
							Html: { Data: htmlBody, Charset: "UTF-8" }
						}
					}
				}
			})
		);
	} catch (err) {
		console.error("SES send failed:", err);
		return response(502, { error: "L'envoi du message a échoué. Réessayez plus tard." }, origin);
	}

	return response(200, { ok: true }, origin);
};
