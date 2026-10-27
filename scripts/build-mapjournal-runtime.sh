#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PATH="${RUNTIME_PATH:-runtimes/mapjournal/upstream}"
OUTPUT_PATH="${OUTPUT_PATH:-runtimes/mapjournal/build}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required on PATH." >&2
  exit 1
fi

if [[ ! -d "$RUNTIME_PATH" ]]; then
  echo "Runtime path not found: $RUNTIME_PATH" >&2
  exit 1
fi

rm -rf "$OUTPUT_PATH"
mkdir -p "$OUTPUT_PATH"

build_ok=true
pushd "$RUNTIME_PATH" >/dev/null
  if [[ -f "package-lock.json" || -f "npm-shrinkwrap.json" ]]; then
    npm ci --ignore-scripts || build_ok=false
  else
    npm install --ignore-scripts --no-package-lock --no-audit --no-fund || build_ok=false
  fi
  if [[ "$build_ok" == "true" ]]; then
    if [[ ! -x "node_modules/.bin/grunt" ]]; then
      npm install --ignore-scripts --no-save grunt-cli --no-audit --no-fund || build_ok=false
    fi
  fi
  if [[ "$build_ok" == "true" ]]; then
    ./node_modules/.bin/grunt --force || build_ok=false
  fi
popd >/dev/null

copy_item() {
  local src="$1"
  local dst="$2"
  if [[ -e "$src" ]]; then
    cp -R "$src" "$dst"
  fi
}

if [[ "$build_ok" == "true" && -d "$RUNTIME_PATH/deploy" ]]; then
  copy_item "$RUNTIME_PATH/deploy/index.html" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/deploy/app" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/deploy/resources" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/deploy/web.config" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/src/web.config" "$OUTPUT_PATH"
else
  if [[ "$build_ok" != "true" ]]; then
    echo "Map Journal grunt build failed on this toolchain; using source fallback output." >&2
  fi
  copy_item "$RUNTIME_PATH/src/index.html" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/src/app" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/src/resources" "$OUTPUT_PATH"
  copy_item "$RUNTIME_PATH/src/web.config" "$OUTPUT_PATH"
fi

node "$(dirname "${BASH_SOURCE[0]}")/../runtimes/mapjournal/patches/embedded-base-path.mjs" "$OUTPUT_PATH"
node "$(dirname "${BASH_SOURCE[0]}")/patch-runtime-edit-controls.mjs" mapjournal "$OUTPUT_PATH"

node "$(dirname "${BASH_SOURCE[0]}")/secure-runtime-media.mjs" "$OUTPUT_PATH"
node "$(dirname "${BASH_SOURCE[0]}")/patch-runtime-html-text.mjs" "$OUTPUT_PATH"
echo "Map Journal build output copied to $OUTPUT_PATH"