// node --test lambda/gallery-api/src/lib/mailer.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { SESv2Client } from "@aws-sdk/client-sesv2";
import { REPLY_TO, sendEmail } from "./mailer.mjs";

const sent = [];
SESv2Client.prototype.send = async command => {
	sent.push(command.input);
	return {};
};

process.env.SENDER_EMAIL = "contact@ankaastudio.fr";

const message = { to: "client@example.com", subject: "Votre galerie", text: "Bonjour", html: "<p>Bonjour</p>" };

test("replies go to Sophie's inbox", () => {
	assert.equal(REPLY_TO, "sophie.marache@gmail.com");
});

test("a simple message carries the Reply-To address", async () => {
	sent.length = 0;
	await sendEmail(message);

	assert.deepEqual(sent[0].ReplyToAddresses, [REPLY_TO]);
	assert.ok(sent[0].Content.Simple);
});

test("a raw message carries the Reply-To header in its bytes", async () => {
	sent.length = 0;
	await sendEmail({ ...message, attachments: [{ filename: "photo.jpg", contentType: "image/jpeg", content: Buffer.from("x") }] });

	const raw = Buffer.from(sent[0].Content.Raw.Data).toString("utf8");
	assert.match(raw, new RegExp(`^Reply-To: ${REPLY_TO}\r$`, "m"));
});
