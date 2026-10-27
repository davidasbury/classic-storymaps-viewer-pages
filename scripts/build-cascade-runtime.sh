#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
MANIFEST_PATH="${MANIFEST_PATH:-$SCRIPT_DIR/../runtimes/cascade/runtime-manifest.json}"
source "$SCRIPT_DIR/lib/stage-official-release.sh"

RUNTIME_PATH="${RUNTIME_PATH:-runtimes/cascade/upstream}"
OUTPUT_PATH="${OUTPUT_PATH:-runtimes/cascade/build}"
case "${CLASSIC_RUNTIME_SOURCE:-auto}" in auto|release) ;; *) echo 'Invalid CLASSIC_RUNTIME_SOURCE' >&2; exit 1 ;; esac

has_required_cascade_viewer_files() {
  local candidate_path="$1"

  [[ -f "$candidate_path/index.html" ]] || return 1
  [[ -f "$candidate_path/app/main-config.js" ]] || return 1
  [[ -f "$candidate_path/app/main-app.js" ]] || return 1
  [[ -f "$candidate_path/app/viewer-min.js" ]] || return 1
  [[ -f "$candidate_path/resources/styles/calcite/colors-default.less" ]] || return 1
  [[ -f "$candidate_path/resources/styles/calcite/variables.less" ]] || return 1
}

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

if [[ "$build_ok" == "true" && -d "$RUNTIME_PATH/deploy" ]] && has_required_cascade_viewer_files "$RUNTIME_PATH/deploy"; then
  cp -R "$RUNTIME_PATH/deploy"/. "$OUTPUT_PATH"/
  printf 'grunt\n' > "$OUTPUT_PATH/BUILD_SOURCE"
else
  echo "Cascade staging verified official release." >&2
  stage_official_release "$MANIFEST_PATH" "$OUTPUT_PATH"
  node "$SCRIPT_DIR/patch-runtime-release.mjs" "$MANIFEST_PATH" "$OUTPUT_PATH" "$RUNTIME_PATH/src/index.html"
fi
has_required_cascade_viewer_files "$OUTPUT_PATH"
node "$SCRIPT_DIR/patch-runtime-edit-controls.mjs" cascade "$OUTPUT_PATH"
node "$SCRIPT_DIR/../runtimes/cascade/patches/print-security.mjs" "$OUTPUT_PATH"

node "$SCRIPT_DIR/secure-runtime-media.mjs" "$OUTPUT_PATH"
node "$SCRIPT_DIR/patch-runtime-html-text.mjs" "$OUTPUT_PATH"
echo "Cascade build output copied to $OUTPUT_PATH"
