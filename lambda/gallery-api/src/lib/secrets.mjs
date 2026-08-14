// SSM Parameter Store reads, cached in module scope so a warm container pays
// nothing. Standard parameters are free; the KMS decrypt is the only cost and
// it is per cold start.

import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const PREFIX = process.env.SSM_PREFIX || "/ankaa/gallery";

const NAMES = {
	adminPassword: "admin-password",
	adminJwtSecret: "admin-jwt-secret",
	galleryJwtSecret: "gallery-jwt-secret",
	cfPrivateKey: "cf-private-key"
};

let cache = null;
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
	if (cache) {
		return cache;
	}

	// Collapse concurrent cold-start callers onto one SSM round trip.
	inFlight ??= load()
		.then(loaded => {
			cache = loaded;

			return loaded;
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}
