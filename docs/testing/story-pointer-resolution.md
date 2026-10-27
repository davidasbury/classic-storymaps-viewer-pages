# Classic Story Pointer Resolution

Verified at `2026-10-27 00:02:56-07:00[America/Los_Angeles]`.
Implementation and local verification only; not deployed.

## Confirmed Failure

Public item `430123c37f694274b3e84250d70b3168` is a Web Mapping Application
named "Establishing Baselines on Fiji's Coral Reefs". Its data response is empty.
Its metadata URL points to a different app:

```text
https://projectbaseline.maps.arcgis.com/apps/Cascade/index.html?appid=6c1aabf8880b4af9abad4a6b28255535
```

The target currently returns an ArcGIS REST error with code 403 and message
"Subscription is canceled, the item is not accessible". That is an independent
access problem: following the pointer cannot recover the withdrawn target.
Both endpoints were checked anonymously with GET requests, without credentials.

Previously gallery links passed the catalog item's ID straight to the native
viewer. Classic-looking pointer metadata was enough to select a runtime even
when the wrapper contained no story data.

## Behavior

- The shared input resolver fetches metadata from the fixed ArcGIS Online REST
  origin. A different valid app ID in `item.url` is followed only after checking
  that the source item has an empty data body, JSON null or an empty container.
  Nonempty data wins over a stale URL, preserving real story copies.
- Self-referential URLs are ordinary app URLs, not pointer loops. Multi-item
  loops are rejected and chains are limited to five items. The final item must
  be a supported Classic Web Mapping Application.
- The target's metadata chooses the local runtime, including cross-runtime
  redirects. The deployment prefix, existing query settings and fragment are
  preserved. Explicit web-map overrides take precedence over pointer defaults.
- All eight native startup paths use the existing authentication hook as an
  asynchronous AMD plugin. Startup is withheld until resolution completes;
  redirects/errors explicitly prevent the wrapper's native app from starting.
  The main ID/URL form calls the same resolver.
- Gallery cards keep their original title, owner and ID. This is a viewing fix,
  not an ownership transfer or converter change. Existing gallery links and
  direct native viewer URLs both benefit without modifying ArcGIS items.
- Credentials stay in the authorization header on the fixed REST origin.
  Pointer pages are not fetched or scraped. Credential-bearing, ambiguous and
  invalid URLs are rejected. Only known local runtime routes are destinations.
- An inaccessible target displays a readable error and a link back to Viewers.
  Initial protected-item access failures still permit the native SDK's normal
  sign-in path; pointer targets do not bypass their own access requirements.
  Catalog sign-out, expiry and replacement handling remain intact.

## Verification

- All 197 tests passed under Node 24. Added cases cover target-first runtime
  selection, fixed-origin requests, token handling, cycles, inaccessible targets,
  empty REST responses, preservation of real data and the five-item bound.
  A native startup exception is not misclassified as a pointer failure or used
  to complete the AMD loader twice.
- Publication tests verify all eight startup gates, original callback arguments,
  blocked startup, idempotent staging and nested deployment prefixes.
- Eight actual Dojo startup tests redirected to a different local runtime. Each
  made exactly one wrapper data probe; none started the wrapper's native app.
- Six desktop/mobile checks covered a synthetic pointer to the real public
  Cascade story `f2e8448fef064238ace4f324ffc16fde`, inaccessible targets and loops.
  The actual public story rendered, and failure screens stayed on the wrapper
  URL. Screenshots were inspected. These 14 pointer checks had no page exceptions.
- All 24 existing native authentication cases passed across eight runtimes:
  anonymous, cookie-only control and catalog-session behavior, including sign-out.
  The main-input browser regression also passed its URL/ID, alias, web-map,
  credential-header and invalid-input checks: 39 browser cases total.
- Adding a preflight request exposed an authentication-fixture race: its initial
  metadata wait could complete before native loading. The sign-out check now
  waits for the actual native authenticated data response. All 24 auth cases
  passed again under that corrected readiness contract.
- The supplied real pointer produced the expected target-access error through
  the new resolver, agreeing with the independent REST response inspection.

Browser checks used a separate copy of the published-style tree with updated
startup staging and shared scripts. All remote mutation requests were blocked;
public item reads and synthetic authentication fixtures did not access the
owner's signed-in sessions or save ArcGIS content.

## Subscription Message And Gallery Status

Verified at `2026-10-27 00:19:22-07:00[America/Los_Angeles]`; not deployed.

The REST client preserves `messageCode`. Only the explicit combination of
ArcGIS code `403` and `SB_0006` is classified as an inactive subscription. The
native viewer and main input display:

> The source's ArcGIS Online subscription is no longer active.

A fresh anonymous GET to the supplied target independently returned HTTP 200
with ArcGIS error `403`, `messageCode: SB_0006`, and the original canceled
subscription message. Generic 403 errors are not classified as subscriptions;
direct protected items retain native sign-in behavior.

When resolution discovers this condition after reading a public wrapper's
metadata, its gallery card shows a **Source subscription inactive** pill. The
original card identity and usable link remain intact. This is learned on open
or main-input submission, not by scanning every gallery item. Same-origin tabs
update through browser storage events, including links opened with `noopener`.

The cache stores only public wrapper IDs and expiry timestamps, at most 100
entries for 30 minutes. Successful resolution or a different observed target
failure clears the prior subscription status. Focus/visibility checks and a
one-minute timer remove expired visible pills. No credentials, source URLs,
titles, target IDs or private-wrapper IDs are persisted. Private wrappers still
receive the viewer message, but do not get a persistent cross-tab badge.
If storage is unavailable, the viewer message still works and no badge is
retained. Status is local to this browser/origin, not an organization-wide audit.

The follow-up passed 46 focused resolver/gallery/auth tests and all 202 tests
in the shared worktree, which included concurrent Map Tour work. Two new
desktop/mobile browser cases covered the real native startup error screen,
cross-tab badge appearance, reload persistence, generic-denial clearing,
successful-retry clearing, main-input feedback, expiry and blocked storage.
All four existing gallery browser cases passed, including 320px layout and
synthetic authentication/account isolation. Screenshots at 1280px and 390px
were inspected; the pill and error text fit. The new cases had no page
exceptions. An initial test-only input-selector typo was corrected and the
same two cases passed on rerun.

## Verified Mapping And Empty-Story Loop

Verified at `2026-10-27 01:05:33-07:00[America/Los_Angeles]`; not deployed.

Public wrapper `6f336f5b90594c7fbdb204a9268c925b` has empty data and points to
`https://web.tplgis.org/Storymaps/national/willrogers/cascade/index.html`.
Its exact URL alias now resolves to `a4a39ad4d78b40d9887bf4f19f2fef59`, the
live public Cascade item. Nonempty copies still win over their URL aliases.
The owner supplied the archived configuration; anonymous live REST reads and
native rendering independently confirmed the target. A real Wayback lookup
also returned that exact ID from capture `20210923074832` with HTTP 200.

The Danajon placeholder `e51d80835b774c95b30195bcbf28e968` exposed a second
authoring path: empty Cascade stories with edit capability called
`switchToBuilder()`, while the viewer guard stripped the resulting `&edit`.
Both source and the guarded official-release adapter now show the normal
not-configured error instead. This does not alter access permissions. A native
release test forced edit capability true at the blank-story decision and
observed one navigation, the error message and no builder query parameter.

## Explicit Archive Discovery

Empty external pointers without a known ID stop before native startup. The
native error screen and main input retain the source link and can offer archive
discovery when a same-origin relay and source origin have been configured.
Consent is explicit, per lookup/page, and not persisted. Cancel, consent
revocation, changed input and stale identity prevent late results from opening
a story. Success offers a dated archive-source link and a separate **Open live
story** link; it never automatically navigates or embeds archived HTML.

The implementation reuses the photo-discovery transport, caches, limits and
HTTP boundary in `scripts/wayback-discovery.mjs`. The new relay independently
reads the wrapper anonymously from the fixed ArcGIS REST origin, requires a
public Web Mapping Application with empty data, and accepts only approved
public HTML origins without queries, fragments, credentials or custom ports.
The browser sends only the item ID and explicit consent; it sends no ArcGIS
token to the relay or Internet Archive. Live external websites are not fetched.

Exact CDX lookups inspect HTTP and HTTPS variants, at most 50 rows each, and
select the nearest returned capture to the item's modified date. CDX/REST
responses are capped at 64 KiB; the one selected HTML capture is capped at
1 MiB. Redirects fail closed. Relay concurrency is two and its budget is 20
requests per minute; archive results have bounded positive/negative caching
and a 429 circuit breaker. Metadata and archive phases each have a 15-second
deadline; the browser cancels its request after 25 seconds. Browser cancellation
does not guarantee an already-running bounded server lookup stops immediately.

Pinned parse5 and Acorn parse HTML and JavaScript inertly. Only a top-level
literal `configOptions` object containing one literal 32-hex `appid` is
supported. Dynamic values, conflicting configurations, computed properties,
spreads and observed mutations fail closed. External scripts and template
contents are not executed or loaded. The extracted ID is only a hint: the
browser validates the live target through the normal bounded Classic resolver,
rejects cycles and checks capture provenance before offering a local viewer.

Default static configuration has an empty endpoint and origin list. The local
preview can enable the relay with `WAYBACK_STORY_ORIGINS`; production hosting
is not implemented or authorized. GitHub Pages alone cannot run it. This is
not general recovery of arbitrary pages, dynamic applications or private items.

All 212 Node tests passed on Node 24, including existing photo discovery and
new extraction, consent, ambiguity, size, MIME, rate-limit and provenance
checks. Three browser cases covered the real Will Rogers pointer plus desktop
and mobile fixture-driven discovery: no lookup before consent, cancellation,
ambiguous results, dated provenance, explicit opening of the real live story,
revocation and main-input changes. The additional blank-editor loop case and
all 39 existing pointer/input/authentication cases passed: 43 browser cases,
with no page exceptions. Desktop/mobile screenshots were inspected. The live
Wayback capture check was separate from the deterministic browser fixtures.
Checks used isolated output and disposable browser contexts, not shared owner
previews or signed-in sessions. No ArcGIS content or hosting was changed.

## Repeat The Browser Checks

Against an isolated published site using its actual base path:

```sh
PUBLISH_CHECK_ROOT="$ISOLATED_PUBLISH" SITE_BASE_PATH="$PREVIEW_BASE" \
  PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" PLAYWRIGHT_CHANNEL=chrome \
  RUNTIME_FILTER=pointers,input,auth node scripts/validate-release-viewers-browser.mjs
PUBLISH_CHECK_ROOT="$ISOLATED_PUBLISH" SITE_BASE_PATH="$PREVIEW_BASE" \
  PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" PLAYWRIGHT_CHANNEL=chrome \
  RUNTIME_FILTER=source-status,gallery node scripts/validate-release-viewers-browser.mjs
  PUBLISH_CHECK_ROOT="$ISOLATED_PUBLISH" SITE_BASE_PATH="$PREVIEW_BASE" \
    PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" PLAYWRIGHT_CHANNEL=chrome \
    RUNTIME_FILTER=archive-discovery,blank-cascade node scripts/validate-release-viewers-browser.mjs
node --test scripts/tests/*.test.mjs
```

## Strict Classification And Crowdsource Errors

Verified at `2026-10-27 09:50:47-07:00[America/Los_Angeles]`; this follow-up
is not deployed.

Public item `6d580febadc04c7b896568bfaadbcdbf`, "Great Lakes Bay Region Trail
Finder", is an Instant Apps Nearby application. Its metadata URL names
`/apps/instant/nearby/`; its data identifies `InstantAppsHomePage` and contains
`values` without Crowdsource's `values.settings`. Its Story Maps/Crowdsource
tags previously overrode that conflicting evidence. An independent anonymous
browser reproduced four production navigations alternating between the viewer
and `&edit`, without any mutation request or owner session.

The gallery now uses the same classifier as native startup and the main input.
Only Web Mapping Applications qualify. Known non-Classic URL paths for Instant
Apps, Dashboards, Experience Builder and Web AppBuilder, plus modern StoryMaps
and Experience hosts, cannot be overridden by tags. URL matching uses the parsed
pathname, not query text; invalid schemes, credentials and malformed URLs fail.
Conflicting Classic runtime metadata is rejected. Unambiguous Classic metadata
still takes priority over a stale Classic URL, and supported Classic tags,
custom-host paths and empty-pointer resolution remain available. This is not
exhaustive identification of every third-party application from metadata alone.

Crowdsource's separate item-loader branch no longer adds `edit`, rewrites the
URL or reloads when a viewer receives `values` without settings. It displays the
existing localized loading error, rejects the load and returns before sign-in
or further item loading. The component hides its loader while an error exists.
Both changes are mirrored in exact patches for the checksum-pinned 0.10.0
release; missing or repeated targets stop the build. No item data, permissions
or owner controls are changed.

All 215 Node tests passed on Node 24, including source/release failure behavior,
classification regressions and a fresh verified Crowdsource release build.
Four desktop/mobile browser cases verified direct rejection of the actual
Nearby item, gallery exclusion, main-input refusal, and the native error path
using the actual public payload with only metadata replaced in the browser.
The native cases stayed on one URL, rendered fully opaque unobscured errors,
and had no loader or page exceptions. Screenshots were inspected.

The existing pointer, input, authentication and gallery cases passed. The first
owner-control run found that the reused isolated snapshot lacked the earlier
Crowdsource admin-banner patch. That snapshot was replaced with a fresh pinned
release carrying all current patches. All nine affected error, owner-control
and authentication cases then passed, including genuine public Crowdsource
rendering at desktop/mobile widths. Across the retained and repeated checks,
49 distinct browser cases passed; the stale-snapshot failure is not counted as
acceptance. The original opacity/overlay-only test was also corrected after
visual inspection exposed the loader behind the entering error.

Repeat the focused browser checks with `RUNTIME_FILTER=crowdsource-invalid`.
Use the fresh runtime build, not a reused snapshot lacking prior patches.
Existing shared previews, production hosting and ArcGIS content were untouched.

## Limits

Resolution is for ArcGIS Online Classic app IDs, including supported URL forms
and existing verified aliases. Arbitrary external HTML, Enterprise portals,
modern StoryMaps and non-app targets are not newly supported. Nonempty wrapper
payloads are not guessed to be pointers. The older advanced-launcher metadata
inspection and conversion workflows are not redesigned; the shared native gate
resolves IDs when they enter a local viewer.

Synthetic private-session checks do not certify every real private story or
permission combination. Public rendering remains subject to each story's own
media/services availability. No publication or shared-preview rebuild occurred.
