#!/usr/bin/env bash
#
# Publishes the home page showreel to the media bucket, on the public /video/*
# behaviour.
#
# The video is served from here rather than from public/ because it is an order
# of magnitude larger than the entire site build: committing it would weigh on
# every clone, and shipping it through dist/ would re-upload it on every deploy.
# It changes on its own schedule, so it gets its own one-line command.
#
# Supply an H.264/AAC mp4 — the only combination every browser plays. Keep it
# short and web-sized; it autoplays on the home page, so a visitor on mobile data
# pays for every byte before they have chosen to watch anything.
#
# Usage: ./upload-video.sh path/to/montage.mp4

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

# Fixed key: src/data/siteData.js points at this exact path, so a new montage
# replaces the old one rather than orphaning it in the bucket.
KEY="video/showreel.mp4"

SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
	echo "Usage: $0 path/to/montage.mp4" >&2
	exit 1
fi

if [[ "$(file -b --mime-type "$SRC")" != "video/mp4" ]]; then
	echo "✗ $SRC is not an mp4." >&2
	exit 1
fi

BUCKET="$(stack_output MediaBucket)"
DIST_ID="$(stack_output DistributionId)"

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
	echo "✗ Could not read the MediaBucket output. Is stack $STACK_NAME deployed?" >&2
	exit 1
fi

echo "→ Uploading $(du -h "$SRC" | cut -f1) to s3://$BUCKET/$KEY ..."
# A day, not a year: the key never changes, so a browser that cached this file
# cannot be reached by the invalidation below. One day is the longest a stale
# showreel can outlive its replacement.
"${AWS[@]}" s3 cp "$SRC" "s3://$BUCKET/$KEY" \
	--content-type video/mp4 \
	--cache-control "public,max-age=86400"

echo "→ Invalidating /video/* ..."
"${AWS[@]}" cloudfront create-invalidation \
	--distribution-id "$DIST_ID" \
	--paths "/$KEY" \
	--query 'Invalidation.Id' --output text

echo "✓ Published. The home page reads it at /$KEY."
