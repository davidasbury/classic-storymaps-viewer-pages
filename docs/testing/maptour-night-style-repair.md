# Map Tour Night Style Repair

Verified locally at `2026-10-27 00:24:43-07:00[America/Los_Angeles]`.
The owner subsequently authorized commit/push closure with `[skip ci]`.
Deployment remains pending; these checks did not change production.

## Public Evidence

- Story: `32d02fa456ee4c68a931efa55a5cb314`, A Family Weekend in New York, March 2016.
- Web map: `840e90e3a9c44cdf95132ef2c418bb5f`, version `1.9`, 46 embedded tour points.
- Its Streets (Night) style references `f96366254a564adda1dc468b447ed956`.
  The style resource with `f=json` returns ArcGIS `400 / CONT_0001`, meaning
  the item does not exist or is inaccessible. This is not proof of deletion.
- The referenced public Streets (Night) basemap item
  `7e2b9be8a9c94e45b7f87857d8d168d6` now points to style item
  `86f556a2d1fd468181855a35e344567f`, World Street Map (Night).
- The replacement resource independently returns style version 8, 904 layers
  and the Esri World_Basemap_v2 vector source. Native ArcGIS JS 3.31 rendered it.
- Earlier read-only controls showed that changing version alone did not resolve
  loading; replacing the broken basemap while keeping version 1.9 did.

## Repair Contract

Only the exact approved old HTTP/HTTPS style URL on a VectorTileLayer is
eligible. Both style probes are prioritized before generic media probes and
request structured JSON. The old resource must return 404 or the specific
ArcGIS unavailable-item response; a generic failure or 403 cannot authorize
replacement. The target must have a valid style version, nonempty layer array
and the exact approved Esri vector source. Existing probe limits still apply.

Only `styleUrl` and `itemId` change in the cloned layer. Layer settings, tour
data and version remain intact. Independently verified HTTPS upgrades from the
existing compatibility helper remain possible. No save API is called.

After the native tour becomes ready, a modal notice explains the necessary
temporary substitution and possible appearance difference. It identifies the
web map and provides Map Viewer and ArcGIS Assistant links, backup instructions,
exact JSON repair values, and guidance for viewers who cannot edit the item.
It is dismissible and repeats on reload while repair remains necessary.
Unverified known-style repairs stop before native createMap and show owner
guidance rather than silently substituting an unverified style.

## Verification

- All 202 Node tests passed on Node 24, including 17 compatibility tests.
  The shared worktree included unrelated concurrent tests.
- Tests covered cloning, settings preservation, unchanged version/points,
  idempotence, healthy old styles, generic errors, access denial, missing
  replacement evidence and credential-bearing URLs.
- Isolated legacy Grunt production compilation passed. Touched sources added
  no JSHint diagnostics against HEAD; editor diagnostics were clear.
- Native browser checks passed at widths 1280, 390 and 320, with French locale
  at 320. All 46 points loaded; Night vector tiles returned 200 and settled
  screenshots showed the basemap. Dialog bounds, wrapped instructions, links
  and Continue behavior passed. Screenshots were inspected independently.
- A separate native browser run waited for network idle and observed 13
  successful vector tile responses, a loaded layer and no console errors.
  Its screenshot showed the first original point and photograph over the map.
- A blocked replacement at width 390 produced actionable failure guidance.
- Existing Ocean desktop/mobile rendering and desktop/mobile failure checks
  passed without displaying the Night repair notice: eight accumulated browser
  scenarios total. The Ocean mobile test was updated to reflect the previously
  committed no-implicit-intro behavior, not a new runtime change.
- Browser write guards observed no writes. Fresh original web-map JSON reads
  before and after each Night case were equal.
- Patch `0006-streets-night-style-repair.patch` independently replayed over
  committed source and reproduced all four touched runtime files byte-for-byte.

Run the browser checks with `scripts/validate-maptour-compatibility-browser.mjs`
and an isolated compiled `MAPTOUR_BUILD_ROOT`; `COMPAT_CASE=night-style` or
`night-style-unavailable` selects the new cases. Use a unique `COMPAT_OUTPUT`.

## Limits

These are public-content local-preview checks, not production or private-content
acceptance. The main Night browser matrix deliberately blocks Flickr requests
to isolate basemap behavior; photo availability is not certified by that matrix.
The separate visual run displayed the original first photograph. Root English
repair text falls back in French; no new translation was supplied. Whole-runtime
legacy lint and full reconstruction from the pinned upstream still have their
previously recorded baseline limitations; incremental replay does not clear them.
Other basemap styles and original ArcGIS items were not edited.