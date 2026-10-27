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

## Repeat The Browser Checks

Against an isolated published site using its actual base path:

```sh
PUBLISH_CHECK_ROOT="$ISOLATED_PUBLISH" SITE_BASE_PATH="$PREVIEW_BASE" \
  PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" PLAYWRIGHT_CHANNEL=chrome \
  RUNTIME_FILTER=pointers,input,auth node scripts/validate-release-viewers-browser.mjs
node --test scripts/tests/*.test.mjs
```

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
