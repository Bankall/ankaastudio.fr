// SSM Parameter Store reads, cached in module scope so a warm container pays
// nothing. Standard parameters are free; the KMS decrypt is the only cost and
// it is one per cache refresh, not one per request.

import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const PREFIX = process.env.SSM_PREFIX || "/ankaa/gallery";

const NAMES = {
	adminPassword: "admin-password",
	adminJwtSecret: "admin-jwt-secret",
	galleryJwtSecret: "gallery-jwt-secret",
	cfPrivateKey: "cf-private-key"
};

// Caching for the container's whole life would make password rotation a lie: a
// warm container would keep accepting the old admin password, and reject the new
// one, until Lambda happened to recycle it. Five minutes bounds that window at
// the cost of one GetParameters + KMS decrypt per container per five minutes.
const CACHE_TTL_MS = 5 * 60 * 1000;
// Long enough that an SSM outage cannot turn into one call per request.
const FAILED_REFRESH_BACKOFF_MS = 30 * 1000;

let cache = null;
let expiresAt = 0;
let inFlight = null;

async function load() {
	const keys = Object.keys(NAMES);
	const names = keys.map(key => `${PREFIX}/${NAMES[key]}`);

	const result = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));

	if (result.InvalidParameters?.length) {
		throw new Error(`Missing SSM parameters: ${result.InvalidParameters.join(", ")}. Run infra/bootstrap.sh.`);
	}

	const byName = new Map(result.Parameters.map(parameter => [parameter.Name, parameter.Value]));

	return Object.fromEntries(keys.map(key => [key, byName.get(`${PREFIX}/${NAMES[key]}`)]));
}

export async function getSecrets() {
	if (cache && Date.now() < expiresAt) {
		return cache;
	}

	// Collapse concurrent callers onto one SSM round trip.
	inFlight ??= load()
		.then(loaded => {
			cache = loaded;
			expiresAt = Date.now() + CACHE_TTL_MS;

			return loaded;
		})
		.catch(error => {
			// A failed refresh must not take the container down with it: the previous
			// values are still valid, and SSM being briefly unreachable is not a
			// reason to reject every request.
			if (cache) {
				console.warn("Secret refresh failed; keeping the cached values.", { error: error.message });
				expiresAt = Date.now() + FAILED_REFRESH_BACKOFF_MS;

				return cache;
			}

			throw error;
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}
