#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_PATH="${MANIFEST_PATH:-$SCRIPT_DIR/../runtimes/shortlist/runtime-manifest.json}"
source "$SCRIPT_DIR/lib/stage-official-release.sh"
RUNTIME_PATH="${RUNTIME_PATH:-runtimes/shortlist/upstream}"
OUTPUT_PATH="${OUTPUT_PATH:-runtimes/shortlist/build}"
case "${CLASSIC_RUNTIME_SOURCE:-auto}" in auto|release) ;; *) echo 'Invalid CLASSIC_RUNTIME_SOURCE' >&2; exit 1 ;; esac

rm -rf "$OUTPUT_PATH"
mkdir -p "$OUTPUT_PATH"

build_ok=false
if [[ "${CLASSIC_RUNTIME_SOURCE:-auto}" != "release" ]]; then
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
fi

if [[ "$build_ok" == "true" && -f "$RUNTIME_PATH/deploy/index.html" && -f "$RUNTIME_PATH/deploy/app/viewer-min.js" ]]; then
  cp -R "$RUNTIME_PATH/deploy"/. "$OUTPUT_PATH"/
  printf 'grunt\n' > "$OUTPUT_PATH/BUILD_SOURCE"
else
  echo "Shortlist staging verified official release." >&2
  stage_official_release "$MANIFEST_PATH" "$OUTPUT_PATH"
  node "$SCRIPT_DIR/patch-runtime-release.mjs" "$MANIFEST_PATH" "$OUTPUT_PATH" "$RUNTIME_PATH/src/index.html"
fi
test -f "$OUTPUT_PATH/index.html"
test -f "$OUTPUT_PATH/app/viewer-min.js"
test -f "$OUTPUT_PATH/app/main-config.js"

node "$SCRIPT_DIR/../runtimes/shortlist/patches/viewer-only.mjs" "$OUTPUT_PATH"

node "$SCRIPT_DIR/secure-runtime-media.mjs" "$OUTPUT_PATH"
echo "Shortlist build output copied to $OUTPUT_PATH"
