# Cascade Print Security Verification

Verified locally at `2026-10-26 22:57:08-07:00[America/Los_Angeles]`.
This change was not deployed. The existing successful owner-dispatched Pages
run was `40453530823`, source `dfb470f0a206acaef3e85251adacbe4ea397d6a3`.

## Finding And Data Path

Cascade's `main-config.js` selects print mode from the URL. `main-app.js`
initializes `PrintViewWrapper`; `Core.loadWebMappingAppStep3` assigns the item
and item-data response to `app.data.appItem`. The wrapper passes its `values`
sections/settings to `PrintViewReact`. Sequence, immersive and credit text,
plus media captions, reach `print/media/Text.jsx`.

The inspected path had no general HTML sanitizer before those text/caption
sinks. Its literal script-tag replacement left inline event attributes intact.
The separate theme style sink also interpolated unvalidated settings as HTML.
This establishes an inadequate local rendering boundary, not a demonstrated
exploit against a hosted story or a finding about ArcGIS server sanitization.

The deployed Cascade used official fallback `release:1.23.0`, not a freshly
compiled source tree. Its original `app/print-min.js` SHA-256 matched both the
local release and independently downloaded live file:

```text
72069ea46e51f2e1e6915f2859a60377811f22f3be62c701892efca0ef45363d
```

## React-Node Rendering Follow-Up

Verified at `2026-10-26 23:53:06-07:00[America/Los_Angeles]`.
The original sanitizer fix left two `react/no-danger` warnings because it still
used HTML-injection properties. Those properties have now been removed from
both the text-block and caption branches, including the actual release bundle.

The existing DOMPurify policy returns a filtered DOM fragment directly to a
React-node converter. Text becomes React text children; elements become
`React.createElement` calls. Explicit mappings preserve classes, table spans,
boolean list attributes and camel-cased style properties. Void elements receive
no children. There is no sanitized-HTML serialization/reparse step.

- Cascade's installed legacy ESLint reproduced the two original warnings at
  lines 40 and 44 from the committed previous source. The changed Text and
  PrintSanitizer files have zero lint errors and zero warnings. `react/no-danger`
  is now an error for Text, not disabled or suppressed.
- The release adapter requires both exact old render calls and transforms them
  into React children. Its Grunt-output guard rejects either remaining HTML
  sink. Unit checks verify both branches and the rejection behavior.
- Source and release passed 72 unsafe-markup renders at 1280 and 390 pixels,
  plus formatting/theme checks and new entity, whitespace, class, title,
  direction, language, style, list, table-span, void-element and empty-input
  checks. The React trees themselves contain no HTML-injection props. There
  were no page exceptions or external requests in this scoped browser suite.
- An independent comparison loaded the committed previous sanitized-HTML
  component and policy alongside the new code in the actual bundled React.
  Both branches at both widths had identical DOM semantics, computed styles,
  element bounds and screenshot bytes for a representative formatted fixture.
  React bookkeeping attributes were excluded from semantic comparison.
- All 192 Node tests passed under Node 24, including release-fallback builds.
  This follow-up did not rerun native private-story or print-dialog/PDF
  acceptance. The shared preview and production were not changed.

See `session-logs/2026-10-26-0049-session-log.md`.

## Implementation

- Source text/caption content is sanitized after the existing print color
  adjustment and rendered as React nodes. The HTML-injection properties are
  absent; `react/no-danger` remains enforced as an error for this component.
- Theme font families and background colors pass through the browser's CSS
  property parser. React renders the resulting stylesheet as text, not raw HTML.
- `runtimes/cascade/patches/print-security.mjs` adapts the exact pinned release
  modules, verifies the original bundle hash and unique replacement anchors,
  and fails closed on unknown output. Grunt output must contain both security
  calls; unsupported build sources and upstream destinations are rejected.
- The build stages the shared policy and vendored DOMPurify. Generated vendor
  output uses an explicit AMD wrapper with a newline after the unchanged vendor
  code. Native Dojo otherwise misidentifies the UMD export; the trailing
  source-map comment also requires separation from Dojo's evaluation wrapper.
- Full Apache-2.0 terms and source/modification attribution accompany output.
- Both Actions jobs use `ubuntu-24.04`. A pre-artifact Chromium gate installs
  pinned Playwright 1.64.1 and esbuild 0.28.2 and runs the browser regressions.
  Existing trigger, deploy-branch and permission rules remain unchanged.

DOMPurify 3.4.17 was installed from npm with scripts disabled. The vendored
JavaScript matched the official tagged GitHub distribution byte-for-byte:

```text
purify.min.js: cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31
LICENSE: cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30
```

Primary sources: [DOMPurify tag](https://github.com/cure53/DOMPurify/tree/3.4.17),
[npm package](https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz),
and [runner migration notice](https://github.com/actions/runner-images/issues/14748).

## Policy And Compatibility

The explicit tag/attribute policy retains ordinary paragraphs, headings,
emphasis, lists, tables, links and images. Event attributes, IDs/names,
embedded executable elements, SVG/MathML, forms and arbitrary data attributes
are removed. HTTP(S) and relative links/images are accepted; links additionally
allow `mailto:` and `tel:`. Data/blob URLs are not accepted, including inline
images. New-window links receive `noopener noreferrer`.

Only the enumerated text-formatting CSS properties survive; positioning,
background images and arbitrary declarations do not. This deliberately changes
unusual custom HTML/CSS and inline-data-image content. Native media components,
the ordinary viewer, builder, map popups and embedded third-party applications
are outside this print text/caption review. Unsupported sanitizer environments
fail closed rather than rendering unsanitized content.

## Verification

- Node 24 adapter tests evaluated both transformed module factories and both
  HTML branches, rejected repeated/mismatched patches and unknown/checksum-
  changed outputs, and tested the generated AMD export and Dojo wrapper syntax.
- All 167 tests passed before concurrent Map Tour additions; the later shared
  working-tree suite passed all 175 tests, including eight unrelated tests.
- An isolated build verified the official release ZIP checksum and applied the
  adapter without modifying the owner's shared preview.
- The browser suite exercised actual release React modules and independently
  compiled source components at 1280 and 390 pixels: nine attack fixtures in
  each text/caption branch, 72 attack renders total, eight formatting checks,
  plus valid/invalid/missing theme-setting checks. Page-error and external-
  request lists were empty. Desktop/mobile screenshots were inspected.
- The identical suite rejected the original release with `release unsafe
  attribute`; it passed the final secured bundle under Node 24.
- A separate normal-loader test used the public default story
  `f2e8448fef064238ace4f324ffc16fde` in fresh anonymous Chrome. One text block
  was replaced only in the local response with a benign execution probe.
  The normal `?print` path rendered 129 text blocks, loaded the actual AMD
  sanitizer, removed both event attributes and the JavaScript link, left the
  execution counter at zero, and reported no page errors. The screenshot
  showed the sentinel inside the native story. All non-GET/OPTIONS requests
  were blocked, including OAuth `platformSelf`; no story data was saved.
- Independent tagged-source comparison, actual browser DOM/rendering, the
  original-release failure control, and byte-exact packaged license checks
  supplement the repository's own test assertions.

Run the browser gate against a newly built output:

```sh
npm install --prefix "$TEST_DEPS" --ignore-scripts --no-audit --no-fund --save-exact playwright@1.64.1 esbuild@0.28.2
node "$TEST_DEPS/node_modules/playwright/cli.js" install chromium
CASCADE_BUILD_ROOT="$CASCADE_OUTPUT" PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" node scripts/validate-cascade-print-browser.mjs
node --test scripts/tests/*.test.mjs
```

Use absolute temporary directories for `TEST_DEPS` and `CASCADE_OUTPUT`.
`PLAYWRIGHT_CHANNEL=chrome` selects installed Chrome instead of bundled Chromium.
Results/screenshots are written to the temporary directory printed by the tool.

## Limits

No production deployment, authenticated private-story test, print-dialog/PDF
acceptance, other-browser certification or whole-application security audit was
performed. Full legacy Grunt compilation was not newly certified; source
component parity and the Grunt output rejection/staging guards were tested.
The new Ubuntu CI/browser gate awaits its first authorized workflow run.
Existing release, private-content and attribution acceptance gates remain.
