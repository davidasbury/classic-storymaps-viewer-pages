# Gallery Pagination and Sorting

Verified locally at `2026-10-27 00:45:57-07:00[America/Los_Angeles]`, followed
by an anonymous live-preview check. The owner subsequently authorized
commit/push closure with `[skip ci]`; deployment remains pending.

## Behavior

- Numbered page buttons show the current neighborhood and known endpoints,
  with ellipses across gaps. The current button has `aria-current="page"`.
- Previously loaded pages are cached in memory. Filter, sort and account changes
  clear that cache and cancel old requests. No private result cache is persisted.
- Buffered, accepted results expose additional page numbers before those pages
  are rendered. Raw ArcGIS totals are not treated as filtered gallery totals.
- Single-page and up-to-five-page arrows provide forward/backward navigation.
  Each action retains the existing maximum of three candidate search requests;
  sparse searches can advance fewer than five pages. There is no eager whole
  account scan or invented last-page count. The 10,000-result bound remains.
- Empty scans do not accumulate numbered empty pages. The initial empty scan
  is replaced when the first matching results arrive. A final total is shown
  only when the buffered results and remote cursor are exhausted.
- Navigation returns focus to the gallery heading and scrolls the new results
  into view. Controls disable during loading, and failed jumps can be retried.
- Explicit ascending/descending direction applies server-side to modified date,
  created date, title, owner, number of views, average rating, number of ratings,
  number of comments and item completeness. Default remains modified descending.
  Unsupported values use safe defaults. Type sorting is omitted because all
  candidates are Web Mapping Applications.

## Evidence

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
`RUNTIME_FILTER=gallery-pagination,gallery`, an isolated `PUBLISH_CHECK_ROOT`,
and the matching `SITE_BASE_PATH`. The runner prints its unique artifact folder.

## Scope and Limits

No OAuth configuration, hosted application, original ArcGIS item, or existing
shared preview was changed. A separate local anonymous preview was left running;
it reuses existing local runtime builds for story links rather than rebuilding
all eight runtimes. Actual private-account sign-in and private ArcGIS results
were not newly exercised. ArcGIS's live search index can change between requests;
deduplication and cached backward navigation do not provide a server snapshot.