# Code-Scanning Remediation

Verified: `2026-10-27 14:30:19-07:00[America/Los_Angeles]`.

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

1. Reconcile GitHub's next CodeQL analysis with these source changes. Do not use
   suppression or source-only fixes as a substitute for delivered-code evidence.
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
