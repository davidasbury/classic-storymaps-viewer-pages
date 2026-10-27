#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SITE_BASE_PATH="${SITE_BASE_PATH:-}"
SITE_BASE_PATH="${SITE_BASE_PATH%/}"
node "$SCRIPT_DIR/apply-site-base-path.mjs" --validate

PUBLISH_ROOT="${PUBLISH_ROOT:-publish/viewers}"

runtime_names=(maptour swipe mapjournal mapseries cascade shortlist crowdsource basic)

require_runtime_build() {
  local runtime_name="$1"
  local runtime_build="runtimes/$runtime_name/build"

  if [[ ! -d "$runtime_build" ]]; then
    echo "Runtime build directory not found: $runtime_build" >&2
    echo "Build the runtime first, for example: bash scripts/build-${runtime_name}-runtime.sh" >&2
    exit 1
  fi

  if [[ ! -f "$runtime_build/index.html" ]]; then
    echo "Runtime build is missing index.html: $runtime_build/index.html" >&2
    exit 1
  fi

}

copy_runtime_build() {
  local runtime_name="$1"
  local runtime_build="runtimes/$runtime_name/build"
  local runtime_publish_dir="$PUBLISH_ROOT/$runtime_name"

  rm -rf "$runtime_publish_dir"
  mkdir -p "$runtime_publish_dir"
  cp -R "$runtime_build"/. "$runtime_publish_dir"/
}

sanitize_runtime_publish() {
  local runtime_name="$1"
  local runtime_publish_dir="$PUBLISH_ROOT/$runtime_name"

  if [[ ! -d "$runtime_publish_dir" ]]; then
    return
  fi

  local tmp_file
  while IFS= read -r file_path; do
    tmp_file="$(mktemp)"
    awk '!/localhost:35729\/livereload\.js/ && !/localhost:8888\/livereload\.js/' "$file_path" > "$tmp_file"
    mv "$tmp_file" "$file_path"
  done < <(grep -IrlE 'localhost:35729/livereload\.js|localhost:8888/livereload\.js' "$runtime_publish_dir" || true)

  # Remove builder bundles from production publish output.
  find "$runtime_publish_dir/app" -maxdepth 1 -type f \( -iname '*builder*.js' -o -iname '*builder*.css' \) -delete 2>/dev/null || true
  find "$runtime_publish_dir/resources/tpl/builder" -depth ! -type d \
    ! -path "$runtime_publish_dir/resources/tpl/builder/icons/builder-help.png" -delete 2>/dev/null || true
  find "$runtime_publish_dir/resources/tpl/builder" -depth -type d -empty -delete 2>/dev/null || true

  # Neutralize builder query parameters in deployed viewers.
  local index_file="$runtime_publish_dir/index.html"
  if [[ -f "$index_file" ]] && ! grep -q 'classicstorymaps-builder-guard' "$index_file"; then
    tmp_file="$(mktemp)"
    awk '
      BEGIN { inserted = 0 }
      {
        print
        if (inserted == 0 && $0 ~ /<head[^>]*>/) {
          print "\t<script src=\"/viewers/assets/js/social-link-policy.js\"></script>"
          print "\t<script type=\"text/javascript\">"
          print "\t// classicstorymaps-builder-guard"
          print "\t(function () {"
          print "\t\tvar raw = (window.location.search || \"\").replace(/^\\?/, \"\");"
          print "\t\tif (!raw) return;"
          print "\t\tvar parts = raw.split(\"&\");"
          print "\t\tvar keep = [];"
          print "\t\tvar changed = false;"
          print "\t\tfor (var i = 0; i < parts.length; i++) {"
          print "\t\t\tif (!parts[i]) continue;"
          print "\t\t\tvar key = parts[i].split(\"=\")[0];"
          print "\t\t\tif (key === \"edit\" || key === \"fromScratch\" || key === \"fromscratch\") {"
          print "\t\t\t\tchanged = true;"
          print "\t\t\t}"
          print "\t\t\telse {"
          print "\t\t\t\tkeep.push(parts[i]);"
          print "\t\t\t}"
          print "\t\t}"
          print "\t\tif (!changed) return;"
          print "\t\tvar next = window.location.pathname + (keep.length ? \"?\" + keep.join(\"&\") : \"\") + (window.location.hash || \"\");"
          print "\t\twindow.location.replace(next);"
          print "\t})();"
          print "\t</script>"
          inserted = 1
        }
      }
    ' "$index_file" > "$tmp_file"
    mv "$tmp_file" "$index_file"
  fi
}

mkdir -p "$PUBLISH_ROOT"
mkdir -p "$PUBLISH_ROOT/assets/js"
cp "$SCRIPT_DIR/../apps/classic-storymaps-site/assets/js/social-link-policy.js" "$PUBLISH_ROOT/assets/js/social-link-policy.js"
cp "$SCRIPT_DIR/../apps/classic-storymaps-site/assets/js/arcgis-auth-helpers.js" "$PUBLISH_ROOT/assets/js/arcgis-auth-helpers.js"
cp "$SCRIPT_DIR/../apps/classic-storymaps-site/assets/js/arcgis-runtime-auth.js" "$PUBLISH_ROOT/assets/js/arcgis-runtime-auth.js"
for helper in classic-storymaps-config classic-story-gallery classic-story-input classic-story-discovery arcgis-basemap-compatibility classic-image-notice classic-story-url-fallback; do
  cp "$SCRIPT_DIR/../apps/classic-storymaps-site/assets/js/$helper.js" "$PUBLISH_ROOT/assets/js/$helper.js"
done

for runtime_name in "${runtime_names[@]}"; do
  require_runtime_build "$runtime_name"
  copy_runtime_build "$runtime_name"
  sanitize_runtime_publish "$runtime_name"
  node "$SCRIPT_DIR/secure-runtime-media.mjs" "$PUBLISH_ROOT/$runtime_name"
  node "$SCRIPT_DIR/patch-runtime-html-text.mjs" "$PUBLISH_ROOT/$runtime_name"
  node "$SCRIPT_DIR/stage-runtime-auth.mjs" "$runtime_name" "$PUBLISH_ROOT/$runtime_name"
  node "$SCRIPT_DIR/apply-site-base-path.mjs" "$PUBLISH_ROOT/$runtime_name"
  node "$SCRIPT_DIR/stage-runtime-notices.mjs" "$runtime_name" "$PUBLISH_ROOT/$runtime_name"
  node "$SCRIPT_DIR/stage-site-favicons.mjs" "$PUBLISH_ROOT/$runtime_name"
done

node "$SCRIPT_DIR/secure-runtime-media.mjs" --check "$PUBLISH_ROOT"
echo "Classic Storymaps runtime publish output copied to $PUBLISH_ROOT for: ${runtime_names[*]}"