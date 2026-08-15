#!/usr/bin/env bash
#
# One-time bootstrap for the Ankaa gallery stack.
#
# Creates the things CloudFormation either cannot hold or must never hold:
#   1. the deploy artifacts bucket
#   2. the CloudFront signing key pair (public key + key group in CloudFront,
#      private key in SSM) — CFN parameters cannot carry a PEM cleanly
#   3. the JWT signing secrets
#   4. the admin password hash
#
# Safe to re-run: every step checks for an existing resource first.
#
# Usage:
#   ./bootstrap.sh              # create anything missing
#   ./bootstrap.sh password     # only reset the admin password

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

CMD="${1:-all}"
ACCOUNT="$(account_id)"
SSM_PREFIX="${SSM_PREFIX:-/ankaa/gallery}"

echo "→ AWS account $ACCOUNT as profile '$AWS_PROFILE' in $AWS_REGION"

# --- helpers ---------------------------------------------------------------

param_exists() {
	"${AWS[@]}" ssm get-parameter --name "$1" >/dev/null 2>&1
}

put_secret() {
	local name="$1" value="$2"
	"${AWS[@]}" ssm put-parameter \
		--name "$name" \
		--type SecureString \
		--value "$value" \
		--overwrite >/dev/null
	echo "  ✓ $name"
}

# --- 1. admin password (also the `password` subcommand) --------------------

set_admin_password() {
	local pw pw2
	read -r -s -p "New admin password (min 12 chars): " pw
	echo
	read -r -s -p "Confirm: " pw2
	echo

	if [[ "$pw" != "$pw2" ]]; then
		echo "✗ Passwords do not match." >&2
		exit 1
	fi
	if (( ${#pw} < 12 )); then
		echo "✗ Too short — use at least 12 characters." >&2
		exit 1
	fi

	# Hashed by the same module the Lambda verifies with, so the format can
	# never drift between bootstrap and runtime.
	local hash
	hash="$(ANKAA_PASSWORD="$pw" node "$ROOT_DIR/lambda/gallery-api/src/lib/passwords.mjs" hash)"
	put_secret "$SSM_PREFIX/admin-password" "$hash"
}

if [[ "$CMD" == "password" ]]; then
	set_admin_password
	echo "✓ Admin password updated. No redeploy needed — the API re-reads SSM every"
	echo "  5 minutes, so the old password stops working within that window."
	exit 0
fi

# --- 2. artifacts bucket ---------------------------------------------------

ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET:-}"
if [[ -z "$ARTIFACTS_BUCKET" ]]; then
	ARTIFACTS_BUCKET="ankaa-deploy-artifacts-$ACCOUNT"
fi

if "${AWS[@]}" s3api head-bucket --bucket "$ARTIFACTS_BUCKET" >/dev/null 2>&1; then
	echo "→ Artifacts bucket $ARTIFACTS_BUCKET already exists."
else
	echo "→ Creating artifacts bucket $ARTIFACTS_BUCKET ..."
	"${AWS[@]}" s3api create-bucket \
		--bucket "$ARTIFACTS_BUCKET" \
		--create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
	"${AWS[@]}" s3api put-public-access-block \
		--bucket "$ARTIFACTS_BUCKET" \
		--public-access-block-configuration \
		"BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null
	# Packaged zips are disposable once deployed.
	"${AWS[@]}" s3api put-bucket-lifecycle-configuration \
		--bucket "$ARTIFACTS_BUCKET" \
		--lifecycle-configuration '{"Rules":[{"ID":"expire-artifacts","Status":"Enabled","Filter":{},"Expiration":{"Days":30}}]}' >/dev/null
	echo "  ✓ created"
fi

# --- 3. CloudFront signing key pair ---------------------------------------

KEY_NAME="${STACK_NAME}-signing-key"

existing_key_id="$("${AWS[@]}" cloudfront list-public-keys \
	--query "PublicKeyList.Items[?Name=='$KEY_NAME'].Id | [0]" --output text 2>/dev/null || true)"

if [[ -n "$existing_key_id" && "$existing_key_id" != "None" ]]; then
	echo "→ CloudFront public key $KEY_NAME already exists ($existing_key_id)."
	CF_KEY_PAIR_ID="$existing_key_id"
else
	echo "→ Generating RSA-2048 signing key pair ..."
	TMP_DIR="$(mktemp -d)"
	trap 'rm -rf "$TMP_DIR"' EXIT

	openssl genrsa -out "$TMP_DIR/private.pem" 2048 2>/dev/null
	openssl rsa -pubout -in "$TMP_DIR/private.pem" -out "$TMP_DIR/public.pem" 2>/dev/null

	# JSON-encode the PEM (embedded newlines) rather than fight CLI shorthand.
	python3 - "$TMP_DIR/public.pem" "$KEY_NAME" "$TMP_DIR/pk.json" <<'PY'
import json, sys
pem = open(sys.argv[1]).read()
config = {
    "CallerReference": f"{sys.argv[2]}-1",
    "Name": sys.argv[2],
    "EncodedKey": pem,
    "Comment": "Ankaa gallery signed cookies and URLs",
}
json.dump({"PublicKeyConfig": config}, open(sys.argv[3], "w"))
PY

	CF_KEY_PAIR_ID="$("${AWS[@]}" cloudfront create-public-key \
		--cli-input-json "file://$TMP_DIR/pk.json" \
		--query 'PublicKey.Id' --output text)"
	echo "  ✓ public key $CF_KEY_PAIR_ID"

	put_secret "$SSM_PREFIX/cf-private-key" "$(cat "$TMP_DIR/private.pem")"
	rm -rf "$TMP_DIR"
	trap - EXIT
fi

KEY_GROUP_NAME="${STACK_NAME}-key-group"
# Unlike list-public-keys, list-key-groups wraps each item in a KeyGroup object —
# querying the config directly silently matches nothing and the re-run then dies
# on KeyGroupAlreadyExists.
existing_group_id="$("${AWS[@]}" cloudfront list-key-groups \
	--query "KeyGroupList.Items[?KeyGroup.KeyGroupConfig.Name=='$KEY_GROUP_NAME'].KeyGroup.Id | [0]" --output text 2>/dev/null || true)"

if [[ -n "$existing_group_id" && "$existing_group_id" != "None" ]]; then
	echo "→ Key group $KEY_GROUP_NAME already exists ($existing_group_id)."
	KEY_GROUP_ID="$existing_group_id"
else
	echo "→ Creating key group $KEY_GROUP_NAME ..."
	KEY_GROUP_ID="$("${AWS[@]}" cloudfront create-key-group \
		--key-group-config "Name=$KEY_GROUP_NAME,Items=$CF_KEY_PAIR_ID,Comment=Ankaa gallery" \
		--query 'KeyGroup.Id' --output text)"
	echo "  ✓ key group $KEY_GROUP_ID"
fi

# --- 4. JWT secrets --------------------------------------------------------

echo "→ Session secrets ..."
for secret in admin-jwt-secret gallery-jwt-secret; do
	if param_exists "$SSM_PREFIX/$secret"; then
		echo "  · $SSM_PREFIX/$secret already set (leaving alone — rotating it logs everyone out)"
	else
		put_secret "$SSM_PREFIX/$secret" "$(openssl rand -base64 48 | tr -d '\n')"
	fi
done

# --- 5. admin password -----------------------------------------------------

if param_exists "$SSM_PREFIX/admin-password"; then
	echo "→ Admin password already set. Run './bootstrap.sh password' to change it."
else
	echo "→ Admin password ..."
	set_admin_password
fi

# --- done ------------------------------------------------------------------

cat <<EOF

✓ Bootstrap complete. Put these into infra/.env.deploy:

    ARTIFACTS_BUCKET=$ARTIFACTS_BUCKET
    KEY_GROUP_ID=$KEY_GROUP_ID
    CF_KEY_PAIR_ID=$CF_KEY_PAIR_ID

Then: ./build.sh && ./deploy.sh
EOF
