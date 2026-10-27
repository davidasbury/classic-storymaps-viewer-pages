# Code-Scanning Remediation

Verified: `2026-10-27 16:17:59-07:00[America/Los_Angeles]`.

## Scope

The initial GitHub CodeQL snapshot contained 184 open alerts across 15 rules,
classified by the scanner as 138 high and 46 medium. The instances inspected
referenced `88b44c1937ec0fd5147452c683d23222a9f1e76b`. These are code-scanning
findings, not the separate Dependabot dependency inventory. Severity does not
establish visitor reachability or exploitability.

This first implementation batch repaired two root causes in tracked source and
delivered runtime code. It did not dismiss alerts, change scanning coverage,
upgrade legacy toolchains, deploy, write ArcGIS content or inspect owner sessions.
GitHub alert resolution requires a subsequent analysis; the initial count must
not be reduced merely by subtracting the locations edited here.

## Post-Push Analysis

GitHub's [completed CodeQL run](https://github.com/davidasbury/classic-storymaps-viewer-pages/actions/runs/40588150661)
for `84f7b2c2ae449e887ed21e2f2d8282d678ba70e6` marked all thirteen targeted
alerts fixed at `2026-10-27 14:38:55-07:00[America/Los_Angeles]`. However, the
JavaScript analysis and open-alert inventory still contained 184 findings:
thirteen new records, 185-197, replaced the thirteen closed records.

Twelve new records flagged innerHTML assignments to inert templates. The standard
and browser evidence below explain why these nodes do not execute. They initially
remained open for explicit review; the subsequent owner-approved disposition is
recorded below. The thirteenth, alert 193, exposed an additional
Map Tour output boundary and received the follow-up repair below. Closing the old
records alone is not a net reduction or a clean security audit.

## Reviewed False Positives

The owner authorized dismissal after a downstream review at
`970068553beb1112d92c85fb45d511779a777e3e`. All twelve records were changed to
`dismissed` with reason `false positive`, and each state, reason and scoped comment
was verified by a separate GitHub API read. The last readback followed dismissal at
`2026-10-27 16:03:09-07:00[America/Los_Angeles]`.

| Path under each viewer's common modules | Journal | Series | Shortlist | Final consumer |
| --- | ---: | ---: | ---: | --- |
| Core.js | 185 | 189 | 194 | document.title text setter |
| ui/share/ShareDialog.js | 186 | 190 | 195 | Twitter text query parameter through encodeURIComponent |
| utils/HeaderHelper.js, Facebook handler | 187 | 191 | 196 | Facebook function ignores extracted title/subtitle arguments |
| utils/HeaderHelper.js, Twitter handler | 188 | 192 | 197 | Twitter text query parameter through encodeURIComponent |

The temporary template and its contents are never attached. None of these
extracted values returns to an HTML sink in the traced application paths. Journal's
common-Core title assignment is also disabled by its default configuration; its
boundary was exercised explicitly, not claimed as a normal startup path.

Six isolated Chrome cases exercised current source and retained release-candidate
modules: 48 title checks and 192 captured sharing calls passed. Tests included raw
and encoded image/SVG markup, closing-title text, entities, quotes, empty values,
and query/fragment delimiters. No candidate resource request, active element or
execution occurred; live-HTML positive controls executed in every case. Sharing
destinations were captured, not opened. Unrelated UI dependencies and URL parsing
were stubbed; these were boundary checks, not fresh full-viewer acceptance.

This disposition applies only to these twelve reviewed alert records. No query,
directory, file or scanning rule was excluded. Inert extraction is not a general
HTML sanitizer, and other uses of the original title or subtitle remain separate
review targets. The adjacent HTTP Facebook sharer URL remains unresolved.

## Map Series Mobile Title

Alert 48 identified a separate live HTML insertion in mobile Header.init. The
repair sanitizes the title immediately before insertion using the existing
vendored ArcGIS sanitizer with a separate, non-extended allowlist: b, strong, i,
em, u, s, sub, sup, br and span. All attributes are removed. Unsupported tags are
stripped, with script, style, iframe, object, SVG and MathML bodies removed.
Links become text; encoded markup remains literal. The broader application
sanitizer, raw story data, subtitles and menu-entry rendering are unchanged.

The tracked source declares the sanitizer dependency. Two exact-match manifest
patches protect official release 1.27.0 without changing its archive checksum.
The release registers Header before the sanitizer, so its adapter obtains the
already-loaded sanitizer through local AMD require at Header construction.
MainView's existing dependency completes before that construction. An eager
dependency caused a missing-file request in the first native check; the corrected
release passed the same check without that request.

Verification included eight source/release policy cases using the actual vendor
sanitizer, a fresh checksum-verified release build, and native Map Series checks
at 1280 and 390 pixels. Each native case exercised six title payloads, rejected
active elements and attributes, preserved expected text/bold formatting, and
opened, navigated and closed the mobile menu. Existing extraction/sharing checks
and their execution positive controls also passed. Both screenshots were inspected.
Blocked OAuth platformSelf requests, an external portal-detector image failure,
and the intentional positive-control 404 were recorded; no page exceptions occurred.

All 262 Node 24 tests passed in an isolated HEAD-plus-scoped-changes snapshot.
The exact staged snapshot subsequently passed all 263 discovered Node tests.
An earlier shared-worktree run saw a concurrent Basic classification test failure;
those unrelated edits were not repaired or reverted here. Full legacy source-build,
private-content and all-layout acceptance remain unverified. Publication requires
separate owner authorization.

The [successful CodeQL run](https://github.com/davidasbury/classic-storymaps-viewer-pages/actions/runs/40600777169)
for implementation commit `348ba0c5ddfda21bb7136e5fa4d840f1909ddb4c` marked alert 48
fixed at `2026-10-27 16:17:59-07:00[America/Los_Angeles]`. All twelve reviewed
dismissals remained in place. GitHub reported 171 open alerts, including the
separate URL-fallback warning 198, which was not changed or dismissed here.
No Pages deployment was recorded for the implementation commit.

## Map Tour Description Follow-Up

The carousel inserted its extracted screen-reader description back into an HTML
string. Encoded markup in the description could therefore become active again.
The repair uses a text setter followed by HTML serialization at that output
boundary. It preserves literal description text rather than treating it as markup.
The build patch handles both the original expression and the previously emitted
inert-reader form; a second pass makes no changes.

Both native Map Tour browser cases passed after the repair. The expression taken
from the actual delivered bundle received encoded image and SVG markup, and its
result was inserted into a live test container. The container retained the exact
literal text and contained zero image or SVG elements; no candidate event or
resource request occurred. All 254 Node 24 tests passed, including original/cached
output parity and idempotency. The remaining five viewers were unchanged from the
earlier twelve-case run. This follow-up does not change the carousel's separately
supported rich-text title rendering or claim to fix all remaining HTML sinks.

## Inert Text Extraction

Legacy code constructed a jQuery HTML fragment solely to read its text. A detached
fragment can still request an image and execute its error handler. The replacement
parses in a temporary HTML template and returns only its content's textContent.
Neither the template nor its contents are inserted into the live document.
This is text extraction, not a sanitizer for HTML that will subsequently be rendered.

The [HTML standard's template-owner document model](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element)
specifies inert contents without a browsing context. Independent Chrome checks
confirmed the relevant behavior against each viewer's actual jQuery version:
the old expression executed a harmless marker; the replacement preserved ordinary
text, formatting removal and entity decoding without events or resource requests.

The structural patch matches only wrapped jQuery fragment calls followed by a
zero-argument text read. It leaves selectors, HTML rendering and text setters
unchanged. It parses candidate output before writing, rejects upstream output
destinations and symlinks, and is idempotent for the inspected artifacts.
The six builders and publication staging enforce the replacement.

| Runtime | Source expressions | Publication expressions | Browser coverage |
| --- | ---: | ---: | --- |
| Map Tour | 2 | 2 | Native desktop/mobile and extraction probes |
| Swipe | 1 | 1 | Native desktop/mobile and extraction probes |
| Map Journal | 12 | 10 | Native desktop/mobile, extraction and sharing handlers |
| Map Series | 6 | 5 | Native desktop/mobile, extraction and sharing handlers |
| Cascade | 2 | 3 | Native desktop/mobile and extraction probes |
| Shortlist | 6 | 5 | Native desktop/mobile, extraction and sharing handlers |
| Total | 29 | 26 | Twelve passing browser cases |

The source total includes copied builder helpers. Publication totals include one
Journal print expression and one Cascade print expression. Crowdsource and Basic
had no matches in the inspected publication and were not changed by this rule.
The previously completed Crowdsource jQuery repair remains separate.

The edited source locations correspond to existing DOM-XSS alerts 34, 36, 37, 38,
43, 45, 46, 47, 58, 60, 61 and 62. This mapping is not a claim that all DOM-XSS
findings, or even those GitHub alert records, are closed.

## Cascade Share URLs

Alert [182](https://github.com/davidasbury/classic-storymaps-viewer-pages/security/code-scanning/182)
identified nested repetition in the Controller's query-removal regex. The old
sequence could also consume unrelated query parameters. URL and URLSearchParams
now remove every exact edit and locale parameter while preserving other parameter
values and the fragment. Optional final URL encoding remains supported.

Source builds use the updated Controller. The verified official release uses an
exact-match manifest replacement. The print adapter reuses that replacement only
after verifying its original whole-bundle SHA-256 and applying the existing print
security changes. An unknown target fails staging; the checksum was not relaxed.

Node tests covered duplicate parameters, bare parameters, similarly named
parameters, encoded delimiters, fragments and a 100,000-character value. Chrome
called the actual storymaps-react/tpl/core/Controller module on both desktop and
mobile. The long input returned the expected URL in 0.5-0.6 milliseconds in the
recorded runs; this is measured evidence, not a universal performance guarantee.

## Verification

- All 253 Node tests passed under Node 24.22.1, including release-fallback staging.
- Twelve Chrome cases passed at 1280 and 390 pixels across the six affected viewers.
- Native Facebook/Twitter handlers in Journal, Series and Shortlist returned the
  expected text for hostile markup, with original methods restored afterward.
- Two additional native Cascade cases passed against a fresh official-release
  build with the URL repair. A subsequent build adding the print repair preserved
  the browser-tested viewer bytes exactly; print contained the replacement once.
- Screenshots from all six viewers were inspected separately from DOM assertions.
  The sampled maps, images, navigation and text rendered. Existing missing source
  photos and failed external logo requests were not repaired by this batch.
- Editor diagnostics were clear for the new patcher and changed test files.

The isolated publication candidate was based on retained publication artifacts
with the prior shared fallback and Crowdsource security changes. Cascade was
additionally rebuilt from its checksum-verified official release. This was not a
fresh successful source build of all six legacy toolchains.

The tests blocked non-read requests, including native OAuth platformSelf attempts.
Those blocked attempts and external asset failures were retained as observations;
no native page exceptions occurred in the passing runs. The positive control's
local 404 image request was intentional. Tests used fresh contexts, public story
fixtures and in-memory synthetic owner eligibility, not a real owner session.

Full hostile item-response-to-every-sink traversal, all story layouts, native
printed-report workflows and authenticated private-story acceptance were not
established. Other rich-HTML sinks remain open. The extracted-expression probes
do not replace the separately recorded native sharing-handler checks.

Reproduce the focused browser checks against a complete candidate publication:

```sh
PUBLISH_CHECK_ROOT=<candidate-publication> SITE_BASE_PATH='' \
RUNTIME_FILTER=html-text-security PLAYWRIGHT_CHANNEL=chrome \
PLAYWRIGHT_NODE_MODULES=<playwright-node-modules> \
node scripts/validate-release-viewers-browser.mjs
```

## Remaining Work

1. Continue reviewing remaining alerts, including URL-fallback warning 198.
   Preserve the scope of the twelve false-positive dispositions; do not use
   source-only fixes as a substitute for delivered-code evidence.
2. Trace remaining visitor DOM-XSS sinks, beginning with mobile titles and detail
   panels. Preserve intentional story formatting through an explicit safe policy.
3. Repair URL/hostname validation by comparing parsed components and test deceptive
   hosts, paths and credentials at the actual consuming boundary.
4. Continue third-party plugin and prototype-handling review against delivered
   versions, keeping library fixes separate from toolchain modernization.
5. Review test-only, build-only and retained archived-page findings individually.
   A directory name alone is not evidence that a finding is harmless or unpublished.

Publication remains pending separate owner authorization. These tests do not
certify the repository or production site as free of vulnerabilities.
