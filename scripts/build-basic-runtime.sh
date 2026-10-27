#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PATH="${RUNTIME_PATH:-runtimes/basic/upstream}"
OUTPUT_PATH="${OUTPUT_PATH:-runtimes/basic/build}"
BASIC_DEFAULT_APPID="${BASIC_DEFAULT_APPID:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$OUTPUT_PATH"
mkdir -p "$OUTPUT_PATH"

copy_item() {
  local src="$1"
  local dst="$2"
  if [[ -e "$src" ]]; then
    cp -R "$src" "$dst"
  fi
}

copy_item "$RUNTIME_PATH/index.html" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/oauth-callback.html" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/js" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/css" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/font" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/images" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/resources" "$OUTPUT_PATH"
copy_item "$RUNTIME_PATH/config" "$OUTPUT_PATH"

node "$SCRIPT_DIR/../runtimes/basic/patches/social-font.mjs" "$OUTPUT_PATH"

defaults_file="$OUTPUT_PATH/config/defaults.js"
if [[ -f "$defaults_file" && -n "$BASIC_DEFAULT_APPID" ]]; then
  sed -i "s/\"appid\": \"\"/\"appid\": \"$BASIC_DEFAULT_APPID\"/" "$defaults_file"
fi

echo "Basic runtime output copied to $OUTPUT_PATH"
