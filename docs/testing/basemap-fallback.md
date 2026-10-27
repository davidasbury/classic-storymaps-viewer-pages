# Unavailable Vector Basemap Fallback

## Behavior

The shared runtime-auth startup module installs
`apps/classic-storymaps-site/assets/js/arcgis-basemap-compatibility.js` after
catalog credentials have been registered. It wraps the native
`esri/arcgis/utils.createMap` path used by Map Tour, Swipe, Journal, Series,
Cascade, Shortlist, Crowdsource and Basic.

- Only visible vector basemap layers are examined. Operational layers are not
  candidates. Eligible references are HTTPS ArcGIS Online item-resource style
  URLs on `www.arcgis.com` or an organization `*.maps.arcgis.com` host, without
  embedded credentials, query strings, fragments or custom ports.
- At most eight unique style references are checked per map, with four-second
  request timeouts. Existing unexpired SDK credentials use the authorization
  header, never a token query parameter. No login prompt or redirect is followed.
- HTTP/ArcGIS 401, 403, 404, 498 and 499, plus ArcGIS 400/CONT_0001, qualify as
  unavailable. Offline requests, timeouts, 429, 5xx and generic 400 do not.
- A replacement is used only after its public metadata, Esri ownership, service
  URL and nonempty version-8 style are checked. The entire basemap is replaced
  in a cloned web map, avoiding mismatched old reference labels. Operational
  content, source objects and saved ArcGIS items remain unchanged.
- The dismissible notice names the map, explains that appearance may differ,
  and says the change is temporary. Owner guidance links the exact web map in
  Map Viewer and ArcGIS Assistant. Only one notice is visible at a time; each
  map is announced once per page. Narrow-screen placement leaves room for
  Crowdsource's bottom navigation.

Replacement: [World Topographic Map](https://www.arcgis.com/home/item.html?id=7dc6cea0b1764a1f9af2e679f642f0f5),
owned by `esri_vector`, public, type `Vector Tile Service`, using
`https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer`.
Live metadata and the style independently agreed on that service; the observed
style had 398 layers.

## Supplied Story

The public Crowdsource item `38e18b052b9440a0927a5adb524c2c4a` uses web map
`18af4863d44d45968360795e547cc5d1`, titled
"Ayudanos a Mejorar Nuestro Distrito". Its two operational layers remained
available: the district boundary and the contribution feature layer.

Original light-gray base/reference style items
`c3351e2f481e4362976faf0dc1f238e0` and
`5262b76c6c424f7a95e94d86806ac252` both returned ArcGIS
`403 / GWM_0003` in HTTP-200 JSON responses. This establishes that they were
inaccessible to the anonymous viewer, not that they were definitively deleted.
The notice therefore says "unavailable with the current access."

## Verification

Verified on 2026-10-27 with Node 24.22.1 and installed Chrome:

| Check | Result and scope |
| --- | --- |
| Full Node suite | 221 passed |
| Focused policy/wrapper tests | Five cases covering missing/access-denied styles, transient/healthy preservation, replacement validation, URL boundaries, authenticated headers, cloning, native responses/errors and cancellation |
| Existing authentication matrix | 24 passed: anonymous, cookie-only and catalog/sign-out behavior for all eight runtimes |
| Shared SDK integration | Eight passed using each runtime's real loader, shared startup module and native createMap with the supplied web map |
| Native Crowdsource | Desktop 1440px and mobile 390px passed; actual Explore/Map controls reached the settled map |
| Visual inspection | Basemap streets and labels, green district boundary and contribution markers visible at both widths; contribution gallery visible on desktop; notice fit and mobile navigation remained unobstructed |
| Read-only guard | No mutation requests; the exact contribution-layer POST queryAttachments endpoint was permitted and recorded separately as a read-only query |
| Editor diagnostics | No errors in the five implementation/test files |

The eight SDK cases deliberately stopped native story startup before creating a
map through the actual SDK. They are integration checks, not eight complete
native-story walkthroughs. Each checked the fallback layer's loaded state,
unchanged operational IDs/URLs, repair link, notice bounds and dismissal.
The supplied Crowdsource additionally exercised its real native application.
An isolated production-origin script override independently rendered the same
Crowdsource map without changing the hosted site.

Reproduce the browser checks against an isolated staged build:

```sh
RUNTIME_FILTER=basemap-fallback node scripts/validate-release-viewers-browser.mjs
RUNTIME_FILTER=auth node scripts/validate-release-viewers-browser.mjs
node --test scripts/tests/*.test.mjs
```

The validator accepts `PUBLISH_CHECK_ROOT`, `SITE_BASE_PATH`,
`PLAYWRIGHT_NODE_MODULES` and `PLAYWRIGHT_CHANNEL`. This verification used the
project-prefix preview layout; the production-origin override used `/viewers/`.
It refreshed shared assets and staged current startup gates into a separate
copy of the pinned runtime output. It did not rebuild all native runtimes or
modify the existing shared preview. Browser evidence is temporary local output,
not a committed source asset.

## Limits

No Enterprise/custom-host recovery, token-bearing style URLs, hidden layers,
direct service failures or invalid-but-accessible style content are covered.
Private-style availability was not tested with an owner's real credentials;
header handling and existing authentication behavior have synthetic coverage.
Map Tour's earlier specialized Streets (Night) repair remains unchanged and
authoritative, including any guard that stops before createMap. Other native
startup failures cannot be recovered by this wrapper.

Publication requires separate authorization. No original ArcGIS item, hosting
configuration, shared preview or signed-in owner session was changed.