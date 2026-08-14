// Password hashing shared by the Lambda (verify) and infra/bootstrap.sh (hash),
// so the stored format can never drift between the two.
//
// Format: scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// ~100ms on Lambda arm64 at 512MB. Deliberately slow: this guards the admin
// panel and every client gallery.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

export async function hashPassword(password) {
	const salt = randomBytes(SALT_BYTES);
	const derived = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P });

	return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
	if (typeof stored !== "string" || typeof password !== "string") {
		return false;
	}

	const parts = stored.split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") {
		return false;
	}

	const [, n, r, p, saltB64, hashB64] = parts;
	const salt = Buffer.from(saltB64, "base64");
	const expected = Buffer.from(hashB64, "base64");

	let derived;
	try {
		derived = await scryptAsync(password, salt, expected.length, {
			N: Number(n),
			r: Number(r),
			p: Number(p),
			// scrypt at these parameters needs more than the default 32MB ceiling.
			maxmem: 128 * 1024 * 1024
		});
	} catch {
		return false;
	}

	// Lengths already match by construction, but timingSafeEqual throws otherwise.
	return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// CLI: `ANKAA_PASSWORD=… node passwords.mjs hash` — used by infra/bootstrap.sh.
if (process.argv[1] && process.argv[1].endsWith("passwords.mjs")) {
	const command = process.argv[2];

	if (command === "hash") {
		const password = process.env.ANKAA_PASSWORD;

		if (!password) {
			console.error("Set ANKAA_PASSWORD in the environment.");
			process.exit(1);
		}

		// Not a top-level await: the bundler emits CJS, which cannot express one.
		hashPassword(password).then(hash => console.log(hash));
	} else {
		console.error("Usage: ANKAA_PASSWORD=… node passwords.mjs hash");
		process.exit(1);
	}
}
