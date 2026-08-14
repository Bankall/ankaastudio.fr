# Shared config loader for the infra scripts. Sourced, not executed.
# Mirrors the pattern used by lambda/contact-mailer/deploy.sh.

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$INFRA_DIR/.." && pwd)"
ENV_FILE="$INFRA_DIR/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "✗ Missing infra/.env.deploy. Copy .env.deploy.example to .env.deploy and fill it in." >&2
	exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${AWS_PROFILE:?Set AWS_PROFILE in infra/.env.deploy}"
: "${AWS_REGION:?Set AWS_REGION in infra/.env.deploy}"
: "${STACK_NAME:?Set STACK_NAME in infra/.env.deploy}"

# Every AWS call in this project goes through this array — there is no path that
# can accidentally reach a different profile.
AWS=(aws --profile "$AWS_PROFILE" --region "$AWS_REGION")

account_id() {
	"${AWS[@]}" sts get-caller-identity --query Account --output text
}

stack_output() {
	"${AWS[@]}" cloudformation describe-stacks \
		--stack-name "$STACK_NAME" \
		--query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
		--output text 2>/dev/null
}
