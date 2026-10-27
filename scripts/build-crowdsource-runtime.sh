#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_PATH="${MANIFEST_PATH:-$SCRIPT_DIR/../runtimes/crowdsource/runtime-manifest.json}"
OUTPUT_PATH="${OUTPUT_PATH:-runtimes/crowdsource/build}"
source "$SCRIPT_DIR/lib/stage-official-release.sh"

rm -rf "$OUTPUT_PATH"
stage_official_release "$MANIFEST_PATH" "$OUTPUT_PATH"
node "$SCRIPT_DIR/patch-runtime-release.mjs" "$MANIFEST_PATH" "$OUTPUT_PATH"
test -f "$OUTPUT_PATH/app/main-app.min.js"
test -f "$OUTPUT_PATH/app/main-config.min.js"
node "$SCRIPT_DIR/patch-runtime-edit-controls.mjs" crowdsource "$OUTPUT_PATH"
node "$SCRIPT_DIR/secure-runtime-media.mjs" "$OUTPUT_PATH"
node "$SCRIPT_DIR/../runtimes/crowdsource/patches/jquery-security.mjs" "$OUTPUT_PATH"
echo "Crowdsource verified view-only release copied to $OUTPUT_PATH"
