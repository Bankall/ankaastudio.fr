#!/usr/bin/env bash
#
# Bundles the Lambdas into build/<name>/ ready for
# `aws cloudformation package`.
#
# gallery-api and gallery-zipper bundle to a single file — pure JS, so a small
# bundle and a fast cold start. gallery-processor keeps sharp external and
# installs the linux/arm64 prebuilt binary next to it, because a native addon
# cannot be bundled.
#
# Usage: ./build.sh [api|processor|zipper]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ESBUILD="$ROOT_DIR/node_modules/.bin/esbuild"

if [[ ! -x "$ESBUILD" ]]; then
	echo "✗ esbuild not found. Run 'npm install' in the repo root first." >&2
	exit 1
fi

ESBUILD_ARGS=(
	--bundle
	--platform=node
	--target=node22
	--format=cjs
	--minify
	--sourcemap=inline
)
#
# The AWS SDK is deliberately bundled rather than taken from the runtime. The
# runtime's copy floats, and this code depends on behaviour that is not optional:
# conditional writes (If-Match / If-None-Match on PutObject) are what prevent
# lost updates on the JSON database. An SDK old enough to drop those parameters
# silently would corrupt data rather than fail loudly. ~3 MB is worth that.

bundle() {
	local name="$1"
	shift
	local src="$ROOT_DIR/lambda/$name"
	local out="$BUILD_DIR/$name"

	echo "→ $name"
	rm -rf "$out"
	mkdir -p "$out"

	if [[ -f "$src/package.json" ]]; then
		(cd "$src" && npm install --silent --no-audit --no-fund --omit=dev)
	fi

	"$ESBUILD" "$src/src/index.mjs" "${ESBUILD_ARGS[@]}" "$@" --outfile="$out/index.js"

	# The repo root declares "type": "module", so without this marker Node walks up
	# and parses the CJS bundle as ESM — an empty namespace and "handler is
	# undefined". Lambda never sees the root package.json, but local verification
	# does, and a build you cannot test is a build you cannot trust.
	echo '{ "type": "commonjs" }' >"$out/package.json"

	echo "  ✓ $(du -h "$out/index.js" | cut -f1) → build/$name/index.js"
}

build_api() {
	bundle gallery-api
}

build_zipper() {
	bundle gallery-zipper
}

build_instagram() {
	bundle instagram-feed
}

build_processor() {
	bundle gallery-processor --external:sharp

	local out="$BUILD_DIR/gallery-processor"
	echo "  → installing sharp for linux/arm64 ..."
	# Lambda is arm64 (Graviton) and glibc-based. Without these flags npm would
	# fetch the binary for *this* machine, which then fails at runtime.
	(
		cd "$out"
		cat >package.json <<-'JSON'
			{ "name": "ankaa-gallery-processor-runtime", "private": true, "type": "commonjs", "dependencies": { "sharp": "^0.35.3" } }
		JSON
		npm install --silent --no-audit --no-fund \
			--cpu=arm64 --os=linux --libc=glibc \
			--include=optional
	)
	# Keep the file: sharp resolves through it, and its "type": "commonjs" is what
	# keeps the bundle above loadable.
	echo "  ✓ sharp installed ($(du -sh "$out/node_modules" | cut -f1))"
}

case "${1:-all}" in
	api) build_api ;;
	zipper) build_zipper ;;
	processor) build_processor ;;
	instagram) build_instagram ;;
	all)
		build_api
		build_zipper
		build_processor
		build_instagram
		;;
	*)
		echo "Usage: $0 [all|api|processor|zipper|instagram]" >&2
		exit 1
		;;
esac

echo "✓ Build complete → $BUILD_DIR"
