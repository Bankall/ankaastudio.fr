#!/usr/bin/env bash
#
# Deploy / update the Ankaa Studio contact-mailer Lambda.
#
# Usage:
#   ./deploy.sh deploy   # create the function (first time) or update if it exists
#   ./deploy.sh update   # update code only (fast path for iterating)
#
# Configuration is read from .env.deploy (gitignored). Copy .env.deploy.example
# to .env.deploy and fill it in first. See README.md.

set -euo pipefail

cd "$(dirname "$0")"

CMD="${1:-deploy}"
ENV_FILE=".env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "✗ Missing $ENV_FILE. Copy .env.deploy.example to $ENV_FILE and fill it in." >&2
	exit 1
fi

# Load config (KEY=value lines).
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${AWS_PROFILE:?Set AWS_PROFILE in $ENV_FILE}"
: "${AWS_REGION:?Set AWS_REGION in $ENV_FILE}"
: "${FUNCTION_NAME:?Set FUNCTION_NAME in $ENV_FILE}"

AWS=(aws --profile "$AWS_PROFILE" --region "$AWS_REGION")

package() {
	echo "→ Zipping index.mjs ..."
	rm -f function.zip
	zip -q function.zip index.mjs
}

# Write the SES/reCAPTCHA env-var map to a JSON file for --environment.
# JSON (not the Variables={..} shorthand) is required because values such as
# ALLOWED_ORIGINS contain commas, which the shorthand parser splits on.
ENV_JSON=""
runtime_env_file() {
	ENV_JSON="$(mktemp)"
	python3 - "$ENV_JSON" <<'PY'
import json, os, sys
keys = ["SENDER_EMAIL", "RECIPIENT_EMAIL", "ALLOWED_ORIGINS",
        "RECAPTCHA_PROJECT_ID", "RECAPTCHA_SITE_KEY", "RECAPTCHA_API_KEY",
        "RECAPTCHA_MIN_SCORE", "RECAPTCHA_ACTION"]
vars = {k: os.environ[k] for k in keys if os.environ.get(k, "")}
with open(sys.argv[1], "w") as f:
    json.dump({"Variables": vars}, f)
PY
}

function_exists() {
	"${AWS[@]}" lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1
}

do_create() {
	: "${ROLE_ARN:?Set ROLE_ARN in $ENV_FILE (the Lambda execution role)}"
	echo "→ Creating function $FUNCTION_NAME ..."
	runtime_env_file
	"${AWS[@]}" lambda create-function \
		--function-name "$FUNCTION_NAME" \
		--runtime nodejs22.x \
		--handler index.handler \
		--role "$ROLE_ARN" \
		--timeout 10 \
		--zip-file fileb://function.zip \
		--environment "file://$ENV_JSON"
	rm -f "$ENV_JSON"
	echo "✓ Created."
}

do_update_code() {
	echo "→ Updating code for $FUNCTION_NAME ..."
	"${AWS[@]}" lambda update-function-code \
		--function-name "$FUNCTION_NAME" \
		--zip-file fileb://function.zip
	echo "✓ Code updated."
}

do_update_config() {
	echo "→ Updating environment for $FUNCTION_NAME ..."
	runtime_env_file
	"${AWS[@]}" lambda update-function-configuration \
		--function-name "$FUNCTION_NAME" \
		--environment "file://$ENV_JSON"
	rm -f "$ENV_JSON"
	echo "✓ Environment updated."
}

case "$CMD" in
	deploy)
		package
		if function_exists; then
			echo "ℹ Function exists — updating code + config."
			do_update_code
			# Wait for the code update to settle before touching config.
			"${AWS[@]}" lambda wait function-updated --function-name "$FUNCTION_NAME"
			do_update_config
		else
			do_create
		fi
		;;
	update)
		package
		do_update_code
		;;
	*)
		echo "Usage: $0 {deploy|update}" >&2
		exit 1
		;;
esac
