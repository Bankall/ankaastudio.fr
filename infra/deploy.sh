#!/usr/bin/env bash
#
# Packages and deploys the Ankaa gallery stack.
#
# Uses `aws cloudformation package` + `deploy`, which apply the SAM transform
# server-side — so no SAM CLI is required. Run ./build.sh first (or pass --build).
#
# Usage:
#   ./deploy.sh              # package + deploy
#   ./deploy.sh --build      # build, then package + deploy
#   ./deploy.sh --changeset  # show the change set and stop, without executing

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

: "${ARTIFACTS_BUCKET:?Set ARTIFACTS_BUCKET in infra/.env.deploy (run ./bootstrap.sh first)}"
: "${KEY_GROUP_ID:?Set KEY_GROUP_ID in infra/.env.deploy (run ./bootstrap.sh first)}"
: "${CF_KEY_PAIR_ID:?Set CF_KEY_PAIR_ID in infra/.env.deploy (run ./bootstrap.sh first)}"

DO_BUILD=0
EXTRA_ARGS=()
for arg in "$@"; do
	case "$arg" in
		--build) DO_BUILD=1 ;;
		--changeset) EXTRA_ARGS+=(--no-execute-changeset) ;;
		*)
			echo "Unknown flag: $arg" >&2
			exit 1
			;;
	esac
done

if (( DO_BUILD )); then
	"$INFRA_DIR/build.sh"
fi

for fn in gallery-api gallery-processor gallery-zipper; do
	if [[ ! -f "$ROOT_DIR/build/$fn/index.js" ]]; then
		echo "✗ build/$fn/index.js missing. Run ./build.sh first." >&2
		exit 1
	fi
done

PACKAGED="$INFRA_DIR/.packaged.yaml"

echo "→ Packaging (uploading Lambda zips to $ARTIFACTS_BUCKET) ..."
"${AWS[@]}" cloudformation package \
	--template-file "$INFRA_DIR/template.yaml" \
	--s3-bucket "$ARTIFACTS_BUCKET" \
	--s3-prefix "$STACK_NAME" \
	--output-template-file "$PACKAGED" >/dev/null

echo "→ Deploying stack $STACK_NAME ..."
"${AWS[@]}" cloudformation deploy \
	--template-file "$PACKAGED" \
	--stack-name "$STACK_NAME" \
	--capabilities CAPABILITY_IAM \
	--no-fail-on-empty-changeset \
	"${EXTRA_ARGS[@]}" \
	--parameter-overrides \
	"DomainName=${DOMAIN_NAME:-ankaastudio.fr}" \
	"SiteBucketName=${SITE_BUCKET:-ankaa-site}" \
	"MediaBucketName=${MEDIA_BUCKET:-ankaa-media}" \
	"CertificateArn=${CERTIFICATE_ARN:-}" \
	"KeyGroupId=$KEY_GROUP_ID" \
	"CloudFrontKeyPairId=$CF_KEY_PAIR_ID" \
	"SenderEmail=${SENDER_EMAIL:-contact@ankaastudio.fr}" \
	"SsmPrefix=${SSM_PREFIX:-/ankaa/gallery}" \
	"DevUploadOrigin=${DEV_UPLOAD_ORIGIN-http://localhost:5173}" \
	"ProcessorReservedConcurrency=${PROCESSOR_RESERVED_CONCURRENCY:-0}"

DIST_ID="$(stack_output DistributionId)"
DIST_DOMAIN="$(stack_output DistributionDomain)"

cat <<EOF

✓ Deployed.

    Distribution   $DIST_ID
    Test URL       https://$DIST_DOMAIN
    Site bucket    $(stack_output SiteBucket)
    Media bucket   $(stack_output MediaBucket)

Next:
  · upload the watermark:  ./upload-watermark.sh <path-to-logo.png>
  · publish the site:      npm run build && ./sync-site.sh
  · GitHub Actions secrets: S3_BUCKET_NAME=$(stack_output SiteBucket)
                            CLOUDFRONT_DISTRIBUTION_ID=$DIST_ID
EOF

if [[ -z "${CERTIFICATE_ARN:-}" ]]; then
	cat <<EOF

ℹ No certificate attached yet, so the stack is live only on the CloudFront
  domain above. To move ankaastudio.fr across:
    1. aws acm request-certificate --domain-name ${DOMAIN_NAME:-ankaastudio.fr} \\
         --subject-alternative-names www.${DOMAIN_NAME:-ankaastudio.fr} \\
         --validation-method DNS --region us-east-1 --profile $AWS_PROFILE
    2. add the CNAME validation records at OVH, wait for status ISSUED
    3. put the ARN in CERTIFICATE_ARN and re-run ./deploy.sh
    4. only then repoint the OVH DNS records at $DIST_DOMAIN
EOF
fi
