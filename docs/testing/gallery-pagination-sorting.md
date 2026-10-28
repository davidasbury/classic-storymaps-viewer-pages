# Gallery Pagination and Sorting

Updated 2026-10-28 with URL-only Classic admission and bounded candidate searches.
Publication of this follow-up remains pending; closure uses `[skip ci]`.

## Behavior

- Remote searches retrieve Web Mapping Applications within the selected scope,
  sharing level and title/advanced expression. Classic metadata is not required
  by the remote query. Locally, Classic metadata or a recognized URL path permits
  classification; the full classifier still rejects modern apps and ambiguous
  metadata. Owner, organization, sharing and app-type checks remain active.
- URL-only admission broadens candidate batches, not accepted app formats.
  Sparse searches may need additional pages within the existing limits below.
- Numbered page buttons show the current neighborhood and verified endpoints,
  with ellipses across gaps. The current button has `aria-current="page"`.
- Previously loaded pages are cached in memory. Filter, sort and account changes
  clear that cache and cancel old requests. No private result cache is persisted.
- Top and bottom show the current story range and either a completed filtered
  total or an explicitly incomplete "stories found so far" count. Raw ArcGIS
  totals are never presented as accepted-story totals. Unknown totals do not
  expose a distant last-page button.
- A single Previous / numbered pages / Next row replaces five-page jumps and
  the redundant page label. A 24 / 48 / 96 selector repaginates retained metadata
  around the current first story without resetting the sort or filters.
- My Content starts a metadata-only background count after its first page.
  Each pass permits at most 20 additional search requests and has a 30-second
  deadline. Pause aborts the active count; Continue starts another bounded pass.
  A failed or bounded pass retains its accepted results and an incomplete count.
  Foreground navigation can also pause counting when it needs network work.
  My Organization and ArcGIS Online do not start background enumeration.
- Foreground loading retains its three-request budget. The ArcGIS 10,000-result
  window remains enforced and reaching it does not claim a complete total.
- The pager retains ordered, deduplicated accepted metadata, independently of
  visible page slices. Counting does not consume pages or fetch off-page
  thumbnails. Empty/sparse scans do not accumulate empty numbered pages.
- Navigation returns focus to the gallery heading and scrolls the new results
  into view. Controls disable during loading, and failed jumps can be retried.
- Explicit ascending/descending direction applies server-side to modified date,
  created date, title, owner, number of views, average rating, number of ratings,
  number of comments and item completeness. Default remains modified descending.
  Unsupported values use safe defaults. Type sorting is omitted because all
  candidates are Web Mapping Applications.

## URL Admission Verification

All 36 focused Node tests and 13 existing gallery browser scenarios passed.
The advanced-search fixture included a Basic item without Classic metadata and
exercised My Content, organization, public Online, sharing and app-type filters
at desktop and two phone widths. A modern Instant URL containing a Classic path
in its query string remained excluded. Pagination/counting and synthetic-session
checks passed without changing their bounds.

An independent public REST title search returned Traffic Fatalities item
`13c5a58889604931a72c31387e5a4125`. Unmocked desktop/mobile gallery searches
displayed its one Basic card with the expected native viewer link. Both had no
page exceptions or horizontal overflow; screenshots were inspected. URL-field
wildcard probes were unsuitable: a deliberately false leading-wildcard pattern
still returned the item, while tested prefixed patterns missed the known match.
The implementation therefore does not depend on a URL-field query.
See [session 0074](../../session-logs/2026-10-28-0074-session-log.md).

## Pagination Verification

- All 230 Node tests passed on Node 24.22.1, including 32 gallery contracts.
- Ten browser scenarios passed on each of the root and project-prefix layouts:
  three counting cases, three pagination/sorting cases, three public-gallery
  cases and the synthetic authenticated-session workflow.
- The counting fixture returned 245 valid stories, 15 rejected items and a
  duplicate, with an intentionally misleading raw total of 10,000. The completed
  gallery count was 245. A held count was paused and resumed without replacing
  the visible cards; thumbnail requests stayed at 24 while counting completed.
- Verified first-story preservation through 24 / 48 / 96 page sizes, cached
  last-page navigation, matching top/bottom ranges, background error/retry,
  the 20-additional-request cap, continuation to 3,000 stories, and account
  replacement while a count response was held. Organization scope stayed
  on-demand. Existing logout, expiry, filter/sort cancellation and ownership
  checks passed without real credentials or content writes.
- Inspected toolbar, range and navigation screenshots at desktop and phone
  widths. Three-digit page numbers fit the 320px viewport. Browser checks
  reported no page errors; editor diagnostics were clear.
- A separate anonymous live preview loaded 24 then 48 stories from 78 accepted
  results, retaining the incomplete-count label and on-demand behavior. It had
  no page errors or mutation requests. The served gallery script matched the
  reviewed source exactly. Existing runtime builds were copied only into the
  separate preview for story links; shared output was not changed.

The deadline is implemented with cancellation; the deterministic browser bound
assertion exercises the request cap rather than waiting 30 seconds. Real
private-account enumeration was not performed. Returning from a story opened
in its normal separate tab retains gallery state; reloading the gallery or
restoring it from the back/forward cache still starts a fresh search.

## Initial Verification

The following records the earlier page-shortcut/sorting implementation, before
the progressive-count follow-up replaced its five-page arrows.

The official [ArcGIS Search documentation](https://developers.arcgis.com/rest/users-groups-and-items/search/)
lists these sort fields, both directions, 100-result candidate batches and the
10,000-result search window. Independent read-only public requests succeeded for
all nine fields in both directions. Each returned eight results; all seven
numeric fields were independently checked for monotonic order. Title/owner
requests succeeded, but ArcGIS text collation was not independently recreated.

- All 205 Node tests passed on Node 24, including 25 gallery contracts.
- Isolated landing builds succeeded for root and project-prefix URL layouts.
- Seven browser scenarios passed on each layout: three new pagination/sorting
  scenarios at 1440, 390 and 320 pixels, plus three existing public-gallery
  checks and the existing synthetic authenticated-session workflow.
- Fixtures exercised 245 stories over eleven pages, buffered shortcuts, cached
  backward navigation, final partial pages, keyboard activation, all eighteen
  sort combinations, page reset, a failed jump/retry, and cancellation of a held
  request by a newer direction change. Sparse fixtures verified three-request
  budgets and absence of accumulated empty pages despite a raw total of 10,000.
- Existing checks preserved scope/sharing constraints, account replacement,
  stale-response rejection, logout/expiry cleanup, thumbnail blobs and ownership
  gating. These authenticated tests used synthetic credentials only.
- Screenshots were inspected at desktop and mobile widths. A clipped mobile
  sort label was fixed; all selected sort labels now pass a measured text-fit
  assertion. Numbered buttons and toolbar layouts do not overflow the viewport.
- The separate live anonymous preview loaded 24 stories and page buttons 1-4,
  accepted view-count sorting in both directions, and reported no page errors
  or ArcGIS writes. Editor diagnostics were clear.

Run `scripts/validate-release-viewers-browser.mjs` with
`RUNTIME_FILTER=gallery-counting,gallery-pagination,gallery`, an isolated `PUBLISH_CHECK_ROOT`,
and the matching `SITE_BASE_PATH`. The runner prints its unique artifact folder.

## Scope and Limits

No OAuth configuration, hosted application, original ArcGIS item, or existing
shared preview was changed. A separate local anonymous preview was left running;
it reuses existing local runtime builds for story links rather than rebuilding
all eight runtimes. Actual private-account sign-in and private ArcGIS results
were not newly exercised. ArcGIS's live search index can change between requests;
deduplication and cached backward navigation do not provide a server snapshot.
