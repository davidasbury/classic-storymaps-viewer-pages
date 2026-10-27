# Map Tour Archived Images

## First-Point Regression Follow-Up

At 2026-10-26 23:33:30-07:00[America/Los_Angeles], the owner reported a missing
Almond point and no additional recovery. The active tab was the older known-photo
preview without a discovery endpoint. Separately, the page default forced
`firstRecordAsIntro: true` even though the saved story did not request an intro.
That removed Almond from numbered stops; this was configuration, not an archive
URL-to-point index offset. The default is now false. Existing saved-story intro
settings still take effect through the unchanged runtime configuration logic.

The new `ARCHIVE_DISCOVERY_NATIVE=true` browser mode uses unmodified public story
data. Desktop and mobile both verified all source points remained in the tour,
Almond was point 1, Chabot was point 2, and Chabot's archive image decoded as both
thumbnail and full-size photo after consent. Reload persistence and revocation
checks passed, as did 21 image/discovery tests. The updated patch replayed
byte-exactly. Original ArcGIS app/map data compared unchanged before and after.
The earlier image-substitution fixture did not establish correct native ordering;
this follow-up closes that specific gap. Availability for every missing image
is not established. The owner's old tab was switched to the corrected separate
discovery preview without automatically enabling consent.

## Scope and Consent

Automatic discovery is disabled in the default static build. With an explicitly
configured same-origin relay and approved public image origins, a saved public
Map Tour exposes an archive-settings button in its desktop and mobile headers.
Both the app and web-map item must report public access. Builder mode, private
or unknown-access items and direct web-map launches do not enable discovery.

One checkbox covers eligible photos and thumbnails throughout the story.
Consent is stored under `maptour.wayback.v1.<story-id>` in browser local storage;
other story IDs remain opted out. Only the choice is stored, not image URLs.
If storage is unavailable, the dialog reports session-only consent. Revocation
cancels active/queued discovery, ignores late replies and removes automatically
restored images. It cannot retract URLs already sent to the relay/archive.

The earlier exact known-photo fallback remains available without automatic
discovery consent. It maps only the verified EBMUD image from session 0043.
The checkbox does not disable that explicit fallback or prevent a story's own
archive URLs from loading. No ArcGIS item is edited or saved.

## Eligibility and Limits

- Only exact, deployment-approved public origins and raster image paths qualify.
  Queries, fragments, credentials, explicit ports, encoded paths, IP/local hosts
  and SVG paths are rejected. An approved hostname is an operator assertion of
  public content, not proof that every path is public; do not approve hosts that
  mix sensitive URL paths with public photos without an additional path policy.
- Original photos load first. Missing photos retain the existing placeholder
  until discovery returns an eligible capture. Non-image replay responses and
  image load failures fall back to the placeholder; image attempts time out
  after ten seconds. An archive-source link appears after image decoding.
- The browser permits two active lookups and at most twenty per page lifetime,
  queues within that budget, deduplicates URLs, and uses seven-second request
  deadlines. It caches results in memory for one hour and misses for five minutes.
  The image registry retains at most 256 elements; additional elements are not
  automatically restored, so restored images cannot be evicted from revocation
  tracking. This makes large-tour recovery intentionally partial.
- The relay contacts only the fixed Internet Archive CDX endpoint, never the
  original host. It checks HTTP and HTTPS variants, requests at most fifty rows
  per variant, and chooses the valid capture closest to the story creation date
  among those bounded results. This is not a globally nearest-capture guarantee.
- Relay defaults: two active lookups, twenty per minute per process, five-second
  deadline per lookup, 64 KiB maximum upstream response, 4 KiB request body,
  128 cached results, one-hour positives and five-minute negatives. A 429 opens
  a ten-minute circuit breaker. Redirects and credential forwarding are disabled.
  The process-wide limits are not a distributed production abuse-control system.

## Local Preview and Hosting

Browser probes of the archive availability API failed CORS; an independent
availability request returned 429, while CDX returned JSON without CORS headers.
The implementation therefore uses a same-origin metadata relay, not JSONP or an
arbitrary image proxy. GitHub Pages alone cannot execute this Node service.
No production endpoint, hosting change or deployment was made or authorized.

For an already compiled runtime containing patches 0004 and 0005:

```sh
MAPTOUR_BUILD_ROOT=runtimes/maptour/build \
WAYBACK_PUBLIC_ORIGINS=https://www.ebmud.com,http://www.ebmud.com \
node scripts/preview-maptour-discovery.mjs
```

The script binds only to loopback and prints an unused local port. It injects
`waybackLookupUrl: "/api/wayback"` and the origin list into the served index
without changing the build files. Open the printed origin with
`?appid=10c62c6bd29f4175b26386aa46cf5a40`. The history icon opens the checkbox.
The earlier pilot photo remains an explicit fallback; the next stop, Chabot Dam
Upgrade, exercises discovery. The relay is reusable via `createWaybackHandler`,
but production integration requires separately approved hosting, timeouts and
abuse controls. Never set these options from story content or URL parameters.

## Verification

At 2026-10-26 23:11:08-07:00[America/Los_Angeles], twenty focused image/discovery
tests passed, including per-story isolation, persistence, revocation, queued work,
timeouts, negative caching, unsafe URL exclusions, HTTP origin rejection and
storage/network failure handling. The real Node 24 Grunt compilation passed
with the previously failing whole-runtime lint gate excluded. The new helper
modules passed the runtime's legacy JSHint configuration before compilation.

Two isolated Chrome scenarios at 1280 and 390 pixels verified no discovery
requests before opt-in, actual CDX recovery, decoded image dimensions, archive
provenance, persisted consent after reload and revocation. Screenshots were
inspected after correcting caption overlap and mobile attribution placement.
The public image was the second, non-hardcoded EBMUD photo:

`https://www.ebmud.com/files/cache/4a49ef657bce6f31f421d7719456f76e_f5432.png`

Its capture `20180724213440` decoded at 334 by 434 pixels. The browser fixture
temporarily assigned it to the intro photo/thumbnail in the intercepted map
response; original ArcGIS app/map data compared unchanged before and after.
Mutation guards observed no writes, and the scenarios had no page errors.
Cross-story isolation and private-story rejection were unit-tested, not tested
with a real authenticated private story. UI strings currently use English.

Repeat discovery scenarios with `ARCHIVE_DISCOVERY=true` using
`scripts/validate-maptour-archived-image-browser.mjs`. It requires a compiled
`MAPTOUR_BUILD_ROOT`, Playwright/Chrome and live public ArcGIS/Wayback access.
Without that flag, it runs the existing seven fixed-photo pilot scenarios.
Archive service availability remains external and recovery is best effort.

Final focused regression checks passed 39 tests on Node 24, including the
registry-pressure revocation case, web-map compatibility and reconstruction
unit tests. All seven existing fixed-photo browser cases also passed with the
new discovery UI/client present: desktop/mobile photos and thumbnails, return
navigation, unavailable archives and healthy originals. Together with the two
discovery scenarios, nine browser cases passed. The final registry-cap-only
change was covered by unit tests, lint and compilation; the preceding browser
screenshots remain the visual evidence for the unchanged UI.

Patches 0004 and 0005 applied over committed source and reproduced all ten
affected source files byte-for-byte. This does not resolve the pre-existing
full pinned-upstream reconstruction failure in patch 0001 or certify old
browsers. Map Tour only; other runtimes and the converter were not changed.