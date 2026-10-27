#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SITE_BASE_PATH="${SITE_BASE_PATH:-}"
SITE_BASE_PATH="${SITE_BASE_PATH%/}"
node "$SCRIPT_DIR/apply-site-base-path.mjs" --validate

SRC_DIR="${SRC_DIR:-apps/classic-storymaps-site}"
OUT_DIR="${OUT_DIR:-publish/viewers}"
COMPAT_OUT_DIR_STORIES="${COMPAT_OUT_DIR_STORIES:-publish/templates/classic-stories}"
COMPAT_OUT_DIR_STORYMAPS="${COMPAT_OUT_DIR_STORYMAPS:-publish/templates/classic-storymaps}"
ROOT_PAGE_SRC="${ROOT_PAGE_SRC:-apps/classic-storymaps-site/archive-root.html}"
ROOT_PAGE_OUT="${ROOT_PAGE_OUT:-publish/index.html}"
ARCHIVE_ROOT_OUT="${ARCHIVE_ROOT_OUT:-publish/archive/index.html}"
ARCHIVE_PAGE_SRC="${ARCHIVE_PAGE_SRC:-classic-apps/2017-12-10/app-list/raw/index.raw.html}"
ARCHIVE_PAGE_OUT="${ARCHIVE_PAGE_OUT:-publish/archive/2017-12-10-app-list.html}"
ARCHIVE_PAGES_SRC="${ARCHIVE_PAGES_SRC:-classic-apps/2017-12-10/app-list/pages}"
ARCHIVE_PAGES_OUT="${ARCHIVE_PAGES_OUT:-publish/archive/2017-12-10-pages}"
SANITIZE_ARCHIVE_SOURCE_PAGES="${SANITIZE_ARCHIVE_SOURCE_PAGES:-0}"

# Keep this list aligned with scripts/build-classic-storymaps-runtime-publish.sh.
runtime_names=(maptour swipe mapjournal mapseries cascade shortlist crowdsource basic)
launcher_files=(maptour-launcher.html swipe-launcher.html mapjournal-launcher.html mapseries-launcher.html cascade-launcher.html shortlist-launcher.html crowdsource-launcher.html basic-launcher.html)

is_runtime_dir() {
  local candidate="$1"
  local runtime_name
  for runtime_name in "${runtime_names[@]}"; do
    if [[ "$runtime_name" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

sanitize_wayback_html() {
  local in_file="$1"
  local out_file="$2"
  local tmp_file
  local tmp_file_2
  tmp_file="$(mktemp)"
  tmp_file_2="$(mktemp)"

  # Remove the injected Wayback toolbar and head bootstrap while preserving the archived document shell.
  awk '
    /<!-- BEGIN WAYBACK TOOLBAR INSERT -->/ { skip=1; next }
    /<!-- END WAYBACK TOOLBAR INSERT -->/ { skip=0; next }
    /^[[:space:]]*<head><script type="text\/javascript" src="https:\/\/web-static\.archive\.org\/_static\/js\/bundle-playback\.js/ {
      sub(/<script.*/, "", $0)
      print
      skip=1
      next
    }
    /<!-- End Wayback Rewrite JS Include -->/ { skip=0; next }
    skip == 0 { print }
  ' "$in_file" > "$tmp_file"

  # Remove remaining Wayback helper scripts/styles and replay hooks outside toolbar markers.
  sed -E \
    -e '/RufflePlayer/d' \
    -e '/ruffle\.js/d' \
    -e '/^[[:space:]]*"[0-9]+"\);[[:space:]]*$/d' \
    -e '/bundle-playback\.js/d' \
    -e '/wombat\.js/d' \
    -e '/banner-styles\.css/d' \
    -e '/iconochive\.css/d' \
    -e '/__wm\./d' \
    -e '/FILE ARCHIVED ON/,/SECTION 108\(a\)\(3\)\)\./d' \
    -e '/playback timings \(ms\):/,$d' \
    "$tmp_file" > "$tmp_file_2"

  if grep -qi '^[[:space:]]*<meta charset=' "$tmp_file_2"; then
    {
      printf '<!DOCTYPE html>\n'
      printf '<html xml:lang="en" lang="en">\n'
      printf '  <head>\n'
      cat "$tmp_file_2"
    } > "$out_file"
  else
    mv "$tmp_file_2" "$out_file"
  fi

  rm -f "$tmp_file"
  rm -f "$tmp_file_2"
}

normalize_example_links() {
  local file_path="$1"
  node "$SCRIPT_DIR/refresh-archive-examples.mjs" "$file_path"
  perl -0pi -e '
    s{<a\b([^>]*\bhref="([^"]*)"[^>]*)>(.*?)</a>}{
      my ($attributes, $href, $body) = ($1, $2, $3);
      my $label = $body;
      $label =~ s/<[^>]*>//g;
      $label =~ s/^\s+|\s+$//g;
      if ($label =~ /^view (?:sample\b|a\b|this\b)/i || $href =~ m{/viewers/(?:maptour|swipe|mapjournal|mapseries|cascade|shortlist|crowdsource|basic)(?:[/?]|$)}) {
        my ($existing_rel) = $attributes =~ /\brel="([^"]*)"/;
        my %seen;
        my $rel = join " ", grep { length && !$seen{$_}++ } (split(/\s+/, $existing_rel || ""), "noopener", "noreferrer");
        $attributes =~ s/\s+(?:target|rel)="[^"]*"//g;
        $attributes .= " target=\"_blank\" rel=\"$rel\"";
      }
      "<a$attributes>$body</a>";
    }gse;
  ' "$file_path"
}

sanitize_archive_html_file() {
  local file_path="$1"

  perl -0pi -e '
    s{href="https?://(?:www\.)?classicstorymaps\.com/viewers/}{href="/viewers/}gi;
    s{(<nav\b[^>]*class="(?:site-nav|drawer-nav)\b[^>]*>)(.*?)(</nav>)}{
      my ($opening, $content, $closing) = ($1, $2, $3);
      $content =~ s{<(?:a|span)([^>]*\bdata-langlabel="nav_gallery"[^>]*)>.*?</(?:a|span)>}{
        my $attributes = $1;
        $attributes =~ s/\s+href="[^"]*"//g;
        $attributes =~ s/nav_gallery/nav_viewers/;
        "<a$attributes href=\"/viewers/\">Viewers</a>";
      }gse;
      $content =~ s{<(?:a|span)([^>]*\bdata-langlabel="nav_mystories"[^>]*)>.*?</(?:a|span)>}{
        my $attributes = $1;
        $attributes =~ s/\s+href="[^"]*"//g;
        $attributes =~ s/nav_mystories/nav_faq/;
        "<a$attributes href=\"/archive/2017-12-10-pages/en__faq.html\">FAQs</a>";
      }gse;
      "$opening$content$closing";
    }gse;
    s{(<div class="app-text">)(.*?)(</div>)}{
      my ($opening, $content, $closing) = ($1, $2, $3);
      $content =~ s{<(a|span)\b[^>]*>\s*GALLERY\s*</\1>}{}gi;
      "$opening$content$closing";
    }gse;
    s{<(a|div)\b[^>]*\bclass="esri-logo(?:-footer)?"[^>]*>.*?</\1>}{}gs;
    s{\s*<script>window\.RufflePlayer=.*?</script>\s*}{}gs;
    s{\s*<script[^>]+ruffle\.js[^>]*></script>\s*}{}gs;
    s{\s*<script type="text/javascript">\s*"\d+"\);\s*</script>\s*<!-- End Wayback Rewrite JS Include -->\s*}{}gs;
    s{\s*<script>\s*var _gaq = _gaq \|\| \[\];.*?</script>\s*}{}gs;
    s{\s*<!-- Google Tag Manager -->.*?<!-- End Google Tag Manager -->\s*}{}gs;
    s{\s*<noscript><iframe[^>]*googletagmanager\.com/ns\.html[^>]*></iframe></noscript>\s*}{}gs;
    s{<!-- Adobe Analytics -->}{}g;
    s{<!-- Pardot -->}{}g;
    s{<!-- Adobe Analytics start -->}{}g;
    s{^[ \t]*<!-- Adobe Analytics -->\s*$\n?}{}mg;
    s{^[ \t]*<!-- Pardot -->\s*$\n?}{}mg;
    s{^[ \t]*<!-- Adobe Analytics start -->\s*$\n?}{}mg;
    s{^[ \t]*<script[^>]+src="[^"]*assets\.adobedtm\.com[^"]*"[^>]*></script>\s*$\n?}{}mg;
    s{^[ \t]*<script[^>]+src="[^"]*go\.pardot\.com[^"]*"[^>]*></script>\s*$\n?}{}mg;
    s{^[ \t]*<script[^>]+src="[^"]*go\.esri\.com[^"]*"[^>]*></script>\s*$\n?}{}mg;
    s{^[ \t]*<script[^>]+src="[^"]*google-analytics\.com[^"]*"[^>]*></script>\s*$\n?}{}mg;
    s{^[ \t]*<script[^>]*>_satellite\.pageBottom\(\);</script>\s*$\n?}{}mg;
    s{\s*<a[^>]+class="back-to-top[^"]*"[^>]*>.*?</a>\s*}{}gs;
    s{\s*<script[^>]+back-to-top\.js[^>]*></script>\s*}{}gs;
    s{\s*<link[^>]+signIn\.css[^>]*>\s*}{}gs;
    s{\s*<script[^>]+l10NStrings\.js[^>]*></script>\s*}{}gs;
    s{\s*<script[^>]+langSelector\.js[^>]*></script>\s*}{}gs;
    s{\s*<script[^>]+my-stories-config/config\.js[^>]*></script>\s*}{}gs;
    s{\s*<nav[^>]+id="logged-out-navigation"[^>]*>.*?</nav>\s*}{}gs;
    s{\s*<div[^>]+id="logged-in-navigation"[^>]*>.*?</div>\s*}{}gs;
    s{\s*<div[^>]+id="sign-in-container"[^>]*>.*?</div>\s*}{}gs;
    s{href="[^"]*go\.esri\.com[^"]*"}{href="#"}g;
    s{href="[^"]*storymaps\.arcgis\.com/assets/images/favicon\.ico[^"]*"}{href="/viewers/assets/images/favicon.ico"}g;
    s{href="[^"]*storymaps\.arcgis\.com/assets/images/apple-touch-icon\.png[^"]*"}{href="/viewers/assets/images/apple-touch-icon.png"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/screen\.css[^"]*"}{href="/viewers/assets/css/archive/screen.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/arcgis-storymaps-my-stories-utils/assets/css/my-stories-utils\.css[^"]*"}{href="/viewers/assets/css/archive/my-stories-utils.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/features/features-page\.css[^"]*"}{href="/viewers/assets/css/archive/features-page.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/features\.css[^"]*"}{href="/viewers/assets/css/archive/features-page.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/applist\.css[^"]*"}{href="/viewers/assets/css/archive/applist.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/create-story\.css[^"]*"}{href="/viewers/assets/css/archive/create-story.css"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/css/steps\.css[^"]*"}{href="/viewers/assets/css/archive/steps.css"}g;
    s{href="/?https?://storymaps\.arcgis\.com/assets/css/newfeature\.css[^"]*"}{href="/viewers/assets/css/archive/newfeature.css"}g;
    s{/?https?://storymaps\.arcgis\.com/assets/images/images/(boat\.jpg|people\.png|people_dim\.jpg|collage\.png|tapestry2\.jpg|simple\.png)}{/viewers/assets/images/archive/five-principles/$1}g;
    s{src="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/js/libs/jquery-1\.9\.1\.min\.js[^"]*"}{src="/viewers/assets/js/archive/jquery-1.9.1.min.js"}g;
    s{src="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/assets/js/tailcoat/tailcoat\.js[^"]*"}{src="/viewers/assets/js/archive/tailcoat.js"}g;
    s{src="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/img/([^"?]+)(?:\?[^"]*)?"}{src="/viewers/assets/images/$1"}g;
    s{src="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/([^"/]+)/img/([^"?]+)(?:\?[^"]*)?"}{src="/viewers/assets/images/archive/app-list/$1/$2"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/(map-tour|map-journal|cascade|map-series|crowdsource|shortlist|swipe-spyglass|basic)/tutorial/?"}{href="/archive/2017-12-10-pages/en__app-list__$1__tutorial.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/(map-tour|map-journal|cascade|map-series|crowdsource|shortlist|swipe-spyglass|basic)/?"}{href="/archive/2017-12-10-pages/en__app-list__$1.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/?"}{href="/archive/2017-12-10-pages/en__app-list.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/resources/?"}{href="/archive/2017-12-10-pages/en__resources.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/my-stories/?"}{href="/archive/2017-12-10-pages/en__my-stories.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/how-to/?"}{href="/archive/2017-12-10-pages/en__how-to.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/faq/?(#?[^"]*)?"}{href="/archive/2017-12-10-pages/en__faq.html$1"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/?"}{href="/archive/2017-12-10-pages/en.html"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/?"}{href="/archive/"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/app-list/[^"/]+/gallery[^\"]*"}{href="#"}g;
    s{href="/(?:web/\d+(?:im_|js_|cs_)?/)?https?://storymaps\.arcgis\.com/en/gallery/[^\"]*"}{href="#"}g;
    s{\s*<link[^>]+fast\.fonts\.net/cssapi[^>]*>\s*}{}gs;
    s{href="[^"]*blogs\.esri\.com/esri/arcgis/category/story-maps/"}{href="/archive/2017-12-10-pages/en__archive-blog.html"}g;
    s{href="https?://links\.esri\.com/storymaps/blogs_[^"]*"}{href="/archive/2017-12-10-pages/en__archive-blog.html"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_basic_zip"}{href="https://github.com/Esri/storymap-basic/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_cascade_zip"}{href="https://github.com/Esri/storymap-cascade/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_crowdsource_zip"}{href="https://github.com/Esri/storymap-crowdsource/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/map_journal_template_zip"}{href="https://github.com/Esri/storymap-journal/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_template_zip"}{href="https://github.com/Esri/storymap-series/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/shortlist_template_zip"}{href="https://github.com/Esri/storymap-shortlist/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/swipe_template_zip"}{href="https://github.com/Esri/storymap-swipe/archive/refs/heads/master.zip"}g;
    s{href="https?://links\.esri\.com/storymaps/developers_corner/?"}{href="#"}g;
    s{href="https?://links\.esri\.com/storymaps/learn_arcgis_[^"]*"}{href="#"}g;
    s{href="https?://links\.esri\.com/storymaps/agol_help_map_creation"}{href="https://doc.arcgis.com/en/arcgis-online/create-maps/make-your-first-map.htm"}g;
    s{href="https?://links\.esri\.com/storymaps/how_to_cascade_sections"}{href="https://nation.maps.arcgis.com/apps/Cascade/index.html?appid=5cd671a4cf1844b7854220979574b927"}g;
    s{href="https?://links\.esri\.com/storymaps/how_to_cascade_media"}{href="https://nation.maps.arcgis.com/apps/Cascade/index.html?appid=c4ed68ecb9d54d398dbf46dcde881471"}g;
    s{href="https?://links\.esri\.com/storymaps/how_to_cascade_immersive_transitions"}{href="https://nation.maps.arcgis.com/apps/Cascade/index.html?appid=7a0c165e7b404073b686f95ef98d6241"}g;
    s{href="https?://links\.esri\.com/storymaps/how_to_cascade_immersive_maps"}{href="https://nation.maps.arcgis.com/apps/Cascade/index.html?appid=a644a02894d246b59ecad16fae25b767"}g;
    s{href="https?://links\.esri\.com/storymaps/how_to_cascade_immersive_legends"}{href="https://nation.maps.arcgis.com/apps/Cascade/index.html?appid=954145df6cf84e2d8bbea996438c99fb"}g;
    s{href="https?://links\.esri\.com/storymaps/tips_cascade"}{href="https://www.esri.com/arcgis-blog/products/arcgis-online/uncategorized/tips-for-creating-a-great-cascade-story-map"}g;
    s{href="https?://links\.esri\.com/storymaps/tips_crowdsource"}{href="https://www.esri.com/arcgis-blog/products/arcgis-online/uncategorized/how-to-create-a-great-crowdsource-story-map"}g;
    s{href="https?://links\.esri\.com/storymaps/map_journal_example_main_stage_action_popups"}{href="/viewers/mapjournal/?appid=dc91db9f6409462b887ebb1695b9c201"}g;
    s{href="https?://links\.esri\.com/storymaps/blog_intro_to_hosting/?"}{href="https://medium.com/story-maps-developers-corner/an-introduction-to-hosting-your-own-story-map-e2450181ad2f"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_basic_overview_1"}{href="/viewers/basic/?appid=2e1974b8769f4752ab411676011ba7e1"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_basic_overview_2"}{href="/viewers/basic/?appid=0481a28bf0614473ba5770dc0a84d2ca"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_basic_overview_3"}{href="/viewers/basic/?appid=a0a12caf5025441497d49d35b01a07f8"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_basic_overview_4"}{href="http://www.esrinl.nl/storymaps/Flitsmeister/Flitsrisico/index.html"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_cascade_overview_1"}{href="https://storymaps.arcgis.com/stories/7d1db2f4802a46f5ba785c651f81053a"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_cascade_overview_2"}{href="/viewers/cascade/?appid=9497dbc933bc46efacc5236722cebde6"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_cascade_overview_4"}{href="https://storymaps.esri.com/stories/2017/the-uprooted/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_crowdsource_overview_1"}{href="https://storymaps.esri.com/stories/2016/national-park-memories/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_crowdsource_overview_2"}{href="https://storymaps.esri.com/stories/2016/national-park-memories/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_crowdsource_overview_4"}{href="https://storymaps.esri.com/stories/honoring-our-veterans/index.html"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_journal_overview_1"}{href="/viewers/mapjournal/?appid=d14f53dcaf7b4542a8c9110eeabccf1c"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_journal_overview_2"}{href="/viewers/mapjournal/?appid=d6635d5602b04c05a445058f53da5cb5"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_journal_overview_4"}{href="https://storymaps.arcgis.com/stories/749af21064e34f029bdd53946d9d941a"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_overview_1"}{href="/viewers/mapseries/?appid=6aab740eb5f146d0bbc073185aa726cb"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_overview_2"}{href="/viewers/mapseries/?appid=ef703d9454bb4e4e8a9c1b086b5b66b5"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_overview_4"}{href="https://www.staridasgeography.gr/web-gis/story-maps/map-series/footpaths-of-erissos/en/"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_example_tabbed"}{href="/viewers/mapseries/?appid=6aab740eb5f146d0bbc073185aa726cb"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_example_side_accordion"}{href="/viewers/mapseries/?appid=ef703d9454bb4e4e8a9c1b086b5b66b5"}g;
    s{href="https?://links\.esri\.com/storymaps/map_series_example_bullets"}{href="/viewers/mapseries/?appid=50aea84a9853491f994f775cb989ea92"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_collection_shortlists"}{href="https://collections.storymaps.esri.com/shortlists/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_shortlist_overview_1"}{href="https://storymaps.esri.com/stories/shortlist-sandiego/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_shortlist_overview_2"}{href="https://storymaps.esri.com/stories/shortlist-sandiego"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_shortlist_overview_4"}{href="https://storymaps.esri.com/stories/2017/flw/buildings/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_swipe_overview_1"}{href="https://storymaps.esri.com/stories/diabetes/"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_swipe_overview_2"}{href="/viewers/swipe/?appid=97ab135daee04ee7bac9dac34f65277f"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_swipe_overview_3"}{href="/viewers/swipe/?appid=97ae55e015774b7ea89fd0a52ca551c2"}g;
    s{href="https?://links\.esri\.com/storymaps/story_map_swipe_overview_4"}{href="/viewers/swipe/?appid=716b6277db404a5aaf2406f7bb444295"}g;
    s{href="[^"]*links\.esri\.com/storymaps/story_maps_geonet"}{href="/archive/2017-12-10-pages/en__archive-forum.html"}g;
    s{href="[^"]*links\.esri\.com/storymaps/story_maps_geonet_ideas"}{href="/archive/2017-12-10-pages/en__archive-feedback.html"}g;
    s{href="[^"]*storymaps\.arcgis\.com/feedback/"}{href="/archive/2017-12-10-pages/en__archive-feedback.html"}g;
    s{<!--\[if\b.*?<!\[endif\]-->}{}gs;
    s{src="/viewers/assets/images/map-tour\.jpg"}{src="/viewers/assets/images/map-tour.png"}g;
    s{src="/viewers/assets/images/(tabbed-viewer|side-accordion)\.jpg"}{src="/viewers/assets/images/map-series-$1.jpg"}g;
    s{src="/viewers/assets/images/bulleted\.jpg"}{src="/viewers/assets/images/map-series-bulleted.png"}g;
    s{src="/viewers/assets/images/custom\.jpg"}{src="/viewers/assets/images/custom.png"}g;
    s{((?:href|src)=")(/web/\d+[^" ]*)"}{$1https://web.archive.org$2"}g;
  ' "$file_path"
  normalize_example_links "$file_path"
}

add_archive_banner_to_page() {
  local file_path="$1"

  if grep -q 'class="archive-banner"' "$file_path"; then
    return 0
  fi

  perl -0pi -e '
    s{</head>}{{STYLE_BLOCK}</head>}s;
    s{<body([^>]*)>}{<body$1><div class="archive-banner" role="note" aria-label="Archive snapshot notice"><div class="container">This is an archive of the Classic Story Maps website from 2017-12-10.</div></div>}s;
  ' "$file_path"

  perl -0pi -e '
    s/\{STYLE_BLOCK\}/\n    <style>\n      .archive-banner {\n        background: #fbf4df;\n        border-bottom: 1px solid #d8c79a;\n        color: #4a3b1f;\n        font-size: 15px;\n        line-height: 1.45;\n        padding: 10px 0;\n      }\n\n      .archive-banner .container {\n        font-weight: 600;\n      }\n    <\/style>\n/;
  ' "$file_path"
}

add_archive_header_to_page() {
  local file_path="$1"

  if grep -q 'id="header"' "$file_path"; then
    return 0
  fi

  perl -0pi -e '
    s{<div class="page sticky-footer">}{<div class="page sticky-footer">\n<header id="header">\n  <div class="container">\n    <div class="row">\n      <div class="column-24">\n        <div class="site-brand">\n          <a class="drawer-toggle toggle-site-navigation icon-navigation tablet-show" data-direction="active-left" href="#"></a>\n          <a class="site-logo phone-hide" data-langlabel="sm-site-title" href="/archive/">Story Maps</a>\n        </div>\n        <nav class="site-nav tablet-hide">\n          <ul>\n            <li><a data-langlabel="nav_apps" href="/archive/">Apps</a></li>\n            <li><a data-langlabel="nav_viewers" href="/viewers/">Viewers</a></li>\n            <li><a data-langlabel="nav_resources" href="/archive/2017-12-10-pages/en__resources.html">Resources</a></li>\n            <li><a data-langlabel="nav_blogs" href="/archive/2017-12-10-pages/en__archive-blog.html">Blog</a></li>\n            <li><a data-langlabel="nav_faq" href="/archive/2017-12-10-pages/en__faq.html">FAQs</a></li>\n          </ul>\n        </nav>\n      </div>\n    </div>\n  </div>\n</header>}s;
  ' "$file_path"
}

write_compat_redirect_stub() {
  local out_file="$1"
  local from_prefix="$2"
  mkdir -p "$(dirname "$out_file")"

  cat > "$out_file" <<EOF
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting...</title>
  <script>
    (function() {
      var fromPrefix = '${SITE_BASE_PATH}${from_prefix}';
      var toPrefix = '${SITE_BASE_PATH}/viewers';
      var path = String(window.location.pathname || '');
      var lowerPath = path.toLowerCase();
      var lowerFrom = fromPrefix.toLowerCase();
      var targetPath = toPrefix + '/';

      if (lowerPath === lowerFrom || lowerPath === lowerFrom + '/') {
        targetPath = toPrefix + '/';
      } else if (lowerPath.indexOf(lowerFrom + '/') === 0) {
        targetPath = toPrefix + path.substring(fromPrefix.length);
      }

      var destination = targetPath + window.location.search + window.location.hash;
      window.location.replace(destination);
    })();
  </script>
</head>
<body>
  Redirecting to the canonical Classic Story Maps route...
</body>
</html>
EOF
}

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source landing app directory not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Refresh only landing-managed files while preserving runtime publish folders.
shopt -s dotglob nullglob
for target_path in "$OUT_DIR"/*; do
  target_name="$(basename "$target_path")"
  if is_runtime_dir "$target_name"; then
    continue
  fi
  rm -rf "$target_path"
done
shopt -u dotglob nullglob

cp -R "$SRC_DIR"/. "$OUT_DIR"/

# Keep canonical /viewers/index.html even when source is named viewers.html.
if [[ -f "$OUT_DIR/viewers.html" && ! -f "$OUT_DIR/index.html" ]]; then
  cp "$OUT_DIR/viewers.html" "$OUT_DIR/index.html"
fi

if [[ -n "$ROOT_PAGE_SRC" && -f "$ROOT_PAGE_SRC" ]]; then
  mkdir -p "$(dirname "$ROOT_PAGE_OUT")"
  cp "$ROOT_PAGE_SRC" "$ROOT_PAGE_OUT"
  mkdir -p "$(dirname "$ARCHIVE_ROOT_OUT")"
  cp "$ROOT_PAGE_SRC" "$ARCHIVE_ROOT_OUT"
fi

if [[ -f "$ARCHIVE_PAGE_SRC" ]]; then
  mkdir -p "$(dirname "$ARCHIVE_PAGE_OUT")"
  sanitize_wayback_html "$ARCHIVE_PAGE_SRC" "$ARCHIVE_PAGE_OUT"
  sanitize_archive_html_file "$ARCHIVE_PAGE_OUT"
  add_archive_banner_to_page "$ARCHIVE_PAGE_OUT"
  add_archive_header_to_page "$ARCHIVE_PAGE_OUT"
fi

if [[ "$SANITIZE_ARCHIVE_SOURCE_PAGES" == "1" && -d "$ARCHIVE_PAGES_SRC" ]]; then
  while IFS= read -r archive_source_page; do
    sanitize_archive_html_file "$archive_source_page"
    add_archive_banner_to_page "$archive_source_page"
    add_archive_header_to_page "$archive_source_page"
  done < <(find "$ARCHIVE_PAGES_SRC" -type f -name '*.html' | sort)
fi

if [[ -d "$ARCHIVE_PAGES_SRC" ]]; then
  rm -rf "$ARCHIVE_PAGES_OUT"
  mkdir -p "$ARCHIVE_PAGES_OUT"
  cp -R "$ARCHIVE_PAGES_SRC"/. "$ARCHIVE_PAGES_OUT"/

  while IFS= read -r archive_page; do
    sanitize_archive_html_file "$archive_page"
    add_archive_banner_to_page "$archive_page"
    add_archive_header_to_page "$archive_page"
  done < <(find "$ARCHIVE_PAGES_OUT" -type f -name '*.html' | sort)
fi

while IFS= read -r standalone_archive_page; do
  sanitize_archive_html_file "$standalone_archive_page"
  add_archive_banner_to_page "$standalone_archive_page"
  add_archive_header_to_page "$standalone_archive_page"
done < <(find "$(dirname "$ARCHIVE_PAGE_OUT")" -maxdepth 1 -type f -name '*.html' | sort)

compat_specs=(
  "$COMPAT_OUT_DIR_STORIES:/templates/classic-stories"
  "$COMPAT_OUT_DIR_STORYMAPS:/templates/classic-storymaps"
)

for compat_spec in "${compat_specs[@]}"; do
  compat_out_dir="${compat_spec%%:*}"
  compat_prefix="${compat_spec#*:}"

  rm -rf "$compat_out_dir"
  mkdir -p "$compat_out_dir"

  write_compat_redirect_stub "$compat_out_dir/index.html" "$compat_prefix"

  for runtime_name in "${runtime_names[@]}"; do
    write_compat_redirect_stub "$compat_out_dir/$runtime_name/index.html" "$compat_prefix"
  done

  for launcher_file in "${launcher_files[@]}"; do
    write_compat_redirect_stub "$compat_out_dir/$launcher_file" "$compat_prefix"
  done
done

for root_page in "$ROOT_PAGE_OUT" "$ARCHIVE_ROOT_OUT"; do
  if [[ -f "$root_page" ]]; then
    normalize_example_links "$root_page"
  fi
done

while IFS= read -r landing_page; do
  normalize_example_links "$landing_page"
done < <(find "$OUT_DIR" -maxdepth 1 -type f -name '*.html' | sort)

node "$SCRIPT_DIR/apply-site-base-path.mjs" "$OUT_DIR" "$COMPAT_OUT_DIR_STORIES" "$COMPAT_OUT_DIR_STORYMAPS" "$ROOT_PAGE_OUT" "$(dirname "$ARCHIVE_PAGE_OUT")"
node "$SCRIPT_DIR/stage-site-favicons.mjs" "$OUT_DIR" "$COMPAT_OUT_DIR_STORIES" "$COMPAT_OUT_DIR_STORYMAPS" "$ROOT_PAGE_OUT" "$(dirname "$ARCHIVE_PAGE_OUT")"
cp "$SRC_DIR/favicon.ico" "$(dirname "$ROOT_PAGE_OUT")/favicon.ico"

echo "Classic Storymaps canonical landing build output copied to $OUT_DIR"
