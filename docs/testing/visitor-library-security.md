# Visitor Library Security: First Pass

## Result and Scope

The first artifact-first pass identified vulnerable browser libraries, including
code missed by the static artifact scan. Crowdsource's pinned release now replaces
its verified jQuery 3.3.1 expression with the official jQuery 3.7.1 expression.
The real AMD-loaded item reducer reproduced prototype pollution before replacement
and rejected the same input afterward. Normal state values and native rendering
were retained. This fix is not deployed by this session.

**This is not a clean security audit or a claim that every advisory is resolved.**
Version applicability, vulnerable operation, attacker-controlled input reachability,
and demonstrated exploitation are separate findings. Remaining unknowns below are
suspect, not safe. Broader compiler, linter and Sass modernization remains separate.

## Production Baseline

- Owner-dispatched [run 40572400125](https://github.com/davidasbury/classic-storymaps-viewer-pages/actions/runs/40572400125)
  successfully deployed `4a9b4615d053bb050750556be843862c59e4a8e5`.
- Downloaded artifact ID: `12766335433`. GitHub's ZIP digest:
  `14b44cd242eb700c3ae6feebcdd5e44cc2cabcfe091a03fe9675744b2074167b`.
  The extracted artifact was inspected; its ZIP digest was not independently recomputed.
- Four live response bodies matched that artifact: the catalog, Cascade bundle,
  Crowdsource bundle and Map Tour entry page. This is sampled equality, not
  whole-site equivalence. The older accepted transfer artifact was not current.
- The concurrent image-notice commit `0fb1091` was retained, not reverted or
  included as part of this security implementation.

The [machine-readable inventory](visitor-library-inventory.json) retains sanitized
response URLs, SHA-256 values, component matches, primary advisory metadata and
coverage limitations. No response bodies, credentials or local paths are included.

## Observed Delivery

Fresh anonymous production sessions captured 365 script responses with 170 unique
available bodies across eight representative stories. Versions below were observed
in the running pages, not inferred from source dependency ranges.

| Viewer | jQuery | Other observed globals | ArcGIS JS / Dojo |
| --- | --- | --- | --- |
| Map Tour | 1.9.1 | No additional version asserted | 3.31 / 1.14.2 |
| Swipe | 1.9.1 | No additional version asserted | 3.31 / 1.14.2 |
| Map Journal | 1.11.0 | Lodash 4.17.21; Bootstrap tooltip 3.3.5 | 3.41 / 1.16.4 |
| Map Series | 1.11.0 | Lodash 4.17.21; Bootstrap tooltip 3.3.5 | 3.41 / 1.16.4 |
| Cascade | 2.2.4 | Bootstrap tooltip 3.3.6 | 3.41 / 1.16.4 |
| Shortlist | 1.11.0 | Lodash 2.4.1; Bootstrap tooltip 3.3.5 | 3.31 / 1.14.2 |
| Crowdsource | 3.3.1 | Bootstrap tooltip 3.3.7 | 3.25 / 1.13.0 |
| Basic | Not established | No additional version asserted | 3.27 / 1.14.0 |

Response origins included the site, `js.arcgis.com`, `jsdev.arcgis.com`,
`clarity.maptiles.arcgis.com` and `s.ytimg.com`. Basic loaded its SDK from
`jsdev.arcgis.com`; this is recorded without assuming that changing only its host
would be safe. JSONP and nested-frame script responses are included in counts;
they are not all independent libraries or same-origin application code.

Retire.js 6.1.0 scanned both the extracted artifact and captured bodies with empty
scanner-error arrays. The static scan additionally recognized Shortlist jQuery UI
1.10.4 and Swiper 3.3.1, archive jQuery 1.9.1, Journal print jQuery 1.11.0, and
Cascade DOMPurify 3.4.17. No advisory was reported for that DOMPurify copy.
Recognition is incomplete: the scanner missed some versions independently visible
in the browser. Unrecognized code is not certified clean.

## Advisory Disposition

Primary records are linked by GHSA ID in the inventory, including affected ranges.
The following is a scoped triage, not exhaustive data-flow analysis.

| Family | Applicability and behavior evidence | Disposition |
| --- | --- | --- |
| jQuery `GHSA-6c3j-c64m-qhgq` | Deep `extend` with an enumerable `__proto__` is affected before 3.4.0. The shipped Crowdsource item reducer reproduced pollution in its real AMD environment. | Crowdsource operation fixed with 3.7.1; older copies remain open. |
| jQuery `GHSA-jpcq-cgw6-v4j6`, `GHSA-gxr4-xjj5-5px2` | HTML/option manipulation advisories apply to 3.3.1; 3.7.1 is outside the affected ranges. | Version-level remediation in Crowdsource. No story-to-XSS exploit was demonstrated; other applicable copies remain open. |
| jQuery `GHSA-rmxg-73gg-4p98`, parseHTML and EOL findings | Older copies remain delivered. Cross-origin AJAX response execution requires the relevant request/data-type conditions; HTML insertion requires the relevant untrusted input. | Input-to-sink review remains open, including archive/print routes. |
| Bootstrap 3.3.5 / 3.3.6 / 3.3.7 | Advisory families cover tooltip viewport/container/template, affix target, collapse parent, scrollspy target and button loading text. Cascade's inspected header tooltip uses a scoped element and literal/localized options. | That caller does not establish a hostile option path. Other callers and story HTML remain unproven; not dismissed as editor-only. Even 3.4.1 remains in the loading-text advisory range. |
| Lodash 4.17.21 | `GHSA-xxjr-mmjv-4gpg` and `GHSA-f23m-r3pf-42rh` require crafted unset/omit paths; `GHSA-r5fr-rjxr-66jc` concerns template imports keys and inherited pollution. Primary records identify 4.18.0 for the latter two. | Inspected upload helper omits literal `dataUrl`; template loader supplies no imports options. These callers do not prove the attack preconditions. Full shipped-code and inherited-pollution paths remain open. Shortlist 2.4.1 needs separate assessment. |
| jQuery UI 1.10.4 | Findings concern datepicker options, position `of`, and checkboxradio refresh. | Exact shipped widget presence and input reachability remain unverified; version detection alone is insufficient, especially for optional widgets. |
| Swiper 3.3.1 | Scanner/primary record report prototype pollution before 6.5.1. Inspected mobile and desktop Shortlist constructors supply literal option objects. | No hostile options path demonstrated at those callers. Other paths remain open; no major replacement attempted. |
| Dojo 1.13.0 / 1.14.x / 1.16.4 | Captured SDK bodies match deepCopy, setObject, DataGrid or test-harness advisory ranges. These are not all vulnerabilities in the same module. Crowdsource migration's inspected setObject paths are fixed strings. | Public input reachability through the full SDK remains open. DataGrid/test harness delivery was not established by the version match. No blanket SDK upgrade or claim of safe external code. |

The native item-response interception experiment was inconclusive: it did not
establish that an attacker-controlled property survived the entire request and
normalization pipeline. The successful reducer test supplies its action directly
in an isolated native page. It proves vulnerable shipped application behavior,
not a complete remote exploit or a compromise of this site.

## Guarded Crowdsource Replacement

[The patch](../../runtimes/crowdsource/patches/jquery-security.mjs) parses the bundle
with Acorn and requires one expression containing both the version and named AMD
`jquery` registration. It verifies the original expression SHA-256
`097258ff45a423c027a7e0601215f6f9d08d1ddc84abde928a5e9a2eaddb58b3`.
Unrelated occurrences of the same version string cannot select another library.

The replacement was obtained from official `jquery@3.7.1` with install scripts
disabled; the npm distribution exactly matched the official CDN response.
Independent `shasum` verified the pinned files:

- JavaScript: `fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a`.
- MIT license: `d4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d`.
- Sources: <https://code.jquery.com/jquery-3.7.1.min.js>,
  <https://www.npmjs.com/package/jquery/v/3.7.1>.

Only that library expression changes; surrounding application and authentication
adapter bytes are retained. The vendor header is preserved and the license and
attribution are indexed by the existing runtime-notices system. Changed vendor
bytes, an unknown release expression, a non-0.10.0 build or an upstream source
destination fail closed. The patch expects fresh generated output, not repeated
application to an already patched bundle.

## Verification and Reproduction

- All 248 repository Node tests passed on Node 24, including five new guard tests.
- The actual Crowdsource release builder and notice staging passed. This was a
  release-artifact build, not a restored legacy source build.
- Independent Retire.js recognized jQuery 3.7.1 with zero reported advisories in
  that replacement. This says nothing about other retained libraries.
- Native baseline: AMD jQuery 3.3.1, actual reducer polluted, normal values kept.
  Native candidate: AMD jQuery 3.7.1, no pollution, normal values kept.
- The existing settled-map acceptance passed at 1440 and 390 pixels with no page
  exceptions or content writes. Inspected screenshots showed basemap and district
  markers on both, and contribution photos/titles in the desktop gallery.
- Three synthetic Crowdsource authentication cases passed: anonymous and cookie-only
  denial, catalog credential handoff, cookie masking and subsequent sign-out denial.
- An early gallery wait omitted the introductory-screen interaction. It failed on
  baseline and candidate; the existing acceptance workflow resolved the harness
  error. Early transition screenshots were not accepted as visual evidence.

Run the focused tests with `node --test scripts/tests/crowdsource-jquery-security.test.mjs`.
Against a complete locally served publication tree, run:

```sh
PUBLISH_CHECK_ROOT=<publication-root> SITE_BASE_PATH='' \
  RUNTIME_FILTER=crowdsource-jquery PLAYWRIGHT_CHANNEL=chrome \
  node scripts/validate-release-viewers-browser.mjs
```

Playwright must be installed or located via the existing `PLAYWRIGHT_NODE_MODULES`
override. This validator starts its own temporary HTTPS server, uses isolated
contexts and permits only the fixture's exact read-only attachment POST. It does
not edit ArcGIS items or use owner sessions. The production inventory blocked
`oauth2/platformSelf` POSTs in three viewers; their coverage is therefore limited
to that anonymous request policy, not complete authenticated acceptance.

## Remaining Work

Complete input-to-sink review of the remaining version-applicable findings before
choosing additional runtime replacements. Prioritize other deep-merge/HTML sinks
and SDK data paths; include archive, print, private, mobile-only and dynamic widget
routes absent from this startup sample. Do not infer full coverage from network
idle or zero page exceptions. Full authentication and eight-viewer visual
acceptance were not repeated for this single-runtime patch.

Publication requires a separately authorized release and live-byte verification.
Legacy toolchain modernization remains deferred and is not a prerequisite for
this pinned-bundle fix.
