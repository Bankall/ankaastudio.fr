#!/usr/bin/env bash
#
# Publishes dist/ to the site bucket and invalidates the HTML entry points.
# Mirrors .github/workflows/deploy.yml for local one-off deploys.
#
# Usage: npm run build && ./sync-site.sh

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

BUCKET="$(stack_output SiteBucket)"
DIST_ID="$(stack_output DistributionId)"

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
	echo "✗ Could not read the SiteBucket output. Is stack $STACK_NAME deployed?" >&2
	exit 1
fi

if [[ ! -d "$ROOT_DIR/dist" ]]; then
	echo "✗ dist/ not found. Run 'npm run build' first." >&2
	exit 1
fi

echo "→ Uploading hashed assets (immutable) ..."
"${AWS[@]}" s3 sync "$ROOT_DIR/dist" "s3://$BUCKET" \
	--delete \
	--exclude "*.html" --exclude "robots.txt" --exclude "sitemap.xml" \
	--cache-control "public,max-age=31536000,immutable"

echo "→ Uploading entry files (revalidate) ..."
"${AWS[@]}" s3 cp "$ROOT_DIR/dist/index.html" "s3://$BUCKET/index.html" \
	--cache-control "public,max-age=0,must-revalidate" --content-type "text/html"
"${AWS[@]}" s3 cp "$ROOT_DIR/dist/404.html" "s3://$BUCKET/404.html" \
	--cache-control "public,max-age=0,must-revalidate" --content-type "text/html"
"${AWS[@]}" s3 cp "$ROOT_DIR/dist/robots.txt" "s3://$BUCKET/robots.txt" \
	--cache-control "public,max-age=86400" --content-type "text/plain"
"${AWS[@]}" s3 cp "$ROOT_DIR/dist/sitemap.xml" "s3://$BUCKET/sitemap.xml" \
	--cache-control "public,max-age=86400" --content-type "application/xml"

# Only the entry points — a wildcard would needlessly evict every cached photo.
echo "→ Invalidating entry points ..."
"${AWS[@]}" cloudfront create-invalidation \
	--distribution-id "$DIST_ID" \
	--paths /index.html /404.html /robots.txt /sitemap.xml \
	--query 'Invalidation.Id' --output text

echo "✓ Published to $BUCKET"
