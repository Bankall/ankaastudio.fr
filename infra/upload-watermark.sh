#!/usr/bin/env bash
#
# Installs the watermark the processor composites onto previews.
#
# Supply a PNG with a transparent background and light/white artwork, opaque: the
# processor fades it to WATERMARK_OPACITY itself, and any alpha baked in here is
# multiplied on top of that. It is stretched across most of the width of every
# derivative it marks, centred, so make it wide and short — 3000px or more on the
# long edge keeps it crisp on 2048px previews.
#
# Usage: ./upload-watermark.sh path/to/logo.png

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
	echo "Usage: $0 path/to/logo.png" >&2
	exit 1
fi

if [[ "$(file -b --mime-type "$SRC")" != "image/png" ]]; then
	echo "✗ $SRC is not a PNG. Transparency is required." >&2
	exit 1
fi

BUCKET="$(stack_output MediaBucket)"
if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
	echo "✗ Could not read the MediaBucket output. Is stack $STACK_NAME deployed?" >&2
	exit 1
fi

"${AWS[@]}" s3 cp "$SRC" "s3://$BUCKET/assets/watermark.png" --content-type image/png

echo "✓ Watermark installed. The processor re-reads it every 5 minutes, so galleries"
echo "  processed after that window use it."
echo "  To re-apply it to existing photos, use 'Retraiter la galerie' in the admin."
