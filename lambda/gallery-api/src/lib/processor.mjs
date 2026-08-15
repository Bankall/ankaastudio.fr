// The one way the API asks for derivatives.

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({});

/** Fire-and-forget: the browser does not wait for derivatives. */
export async function invokeProcessor(payload) {
	await lambda.send(
		new InvokeCommand({
			FunctionName: process.env.PROCESSOR_FUNCTION,
			InvocationType: "Event",
			Payload: Buffer.from(JSON.stringify(payload))
		})
	);
}
