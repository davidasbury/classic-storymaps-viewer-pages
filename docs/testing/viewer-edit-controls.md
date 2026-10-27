# Viewer Owner Controls

Checked at `2026-10-26 23:33:07-07:00[America/Los_Angeles]`.
Implementation and verification only; not production publication.

## Finding And Correction

Removing builder assets and stripping builder query parameters did not prevent
owner-only Edit buttons. Public production Cascade still contained its original
eligibility and button-display path. The audit also found active owner gates in
Map Journal and Map Series, and Crowdsource's authenticated-editor admin banner.
David approved correcting all confirmed gaps across the eight viewers.

| Viewer | Owner-control result |
| --- | --- |
| Map Tour | Existing production viewer-only flag passes false to native header. |
| Swipe | Existing production viewer-only guard passes false to native header. |
| Map Journal | Source and generated Core eligibility now return false; alternate desktop header calls the gate instead of passing its function. |
| Map Series | Source and generated Core eligibility now return false. |
| Cascade | Source and generated Core eligibility now return false. |
| Shortlist | Existing generated eligibility restriction returns false. |
| Crowdsource | Source and generated layout no longer enable the owner/admin banner; authenticated/editor flags remain true in the test. |
| Basic | No native story-builder entry point in the inspected implementation or rendered desktop/mobile viewer. |

`scripts/patch-runtime-edit-controls.mjs` applies guarded transformations to the
four affected built bundles. Classic Core changes are scoped to their exact AMD
module and exported eligibility function; unknown targets fail. Grunt output
already returning false is accepted. Crowdsource requires its unique compiled
editor-banner decision. All four build scripts invoke the adapter, including
official-release fallbacks. Source edits mirror the generated behavior.

Permissions are not falsified or revoked. Existing sign-in, item ownership,
content loading, sharing and builder-URL/asset guards remain separate. This
change removes viewer editing entry points; it is not an ArcGIS authorization
boundary or a claim that arbitrary story links cannot point to authoring tools.

## Verification

- Four focused Node regressions evaluate source gates and transformed factories
  with owner/editor state both true and false. Tests cover module isolation,
  unknown/repeated targets, source-minified false gates, build-hook wiring and
  Journal's alternate header argument. Forced-release tests check actual
  Cascade and Series eligibility as well as Shortlist's existing restriction.
- The shared working tree passed all 192 Node tests under Node 24, including
  twenty-one concurrent Map Tour tests outside this change.
- Sixteen native Chrome cases passed: all eight apps at 1280 and 390 pixels.
  The test preserves native header instances and forces `app.userCanEdit` true
  locally. Crowdsource uses its actual Redux authentication action to retain
  `authenticated: true` and `editor: true` with `adminVisible: false`.
- The test checks actual Core/header decisions and rendered Edit/admin controls,
  not just absence of builder files. It waits for the runtime's readiness and
  rejects page exceptions, including late observations. Final run: sixteen
  passes and zero page exceptions. Representative screenshots were inspected.
- The same browser test rejected the four original affected bundles: Journal,
  Series and Cascade returned true; Crowdsource showed the admin banner. This
  independent failure control supplements the adapter's own assertions.
- Browser verification used an isolated copy of the existing published-style
  tree with the four adapters applied, not the owner's shared preview. No
  authenticated owner session or secret was read. All remote mutation requests
  were blocked; Crowdsource's public attachment-query POST was replayed as a GET.
  No ArcGIS content was saved.

## Empty Cascade Follow-Up

At `2026-10-27 01:05:33-07:00[America/Los_Angeles]`, the separate automatic
blank-story authoring path was also removed from source and the guarded release
adapter. An editor-capable empty story now shows the not-configured message
without calling `switchToBuilder()`. The release test rejects unknown redirect
shapes and checks idempotency; a native browser fixture kept edit capability
true and observed one navigation with no `edit` query. Existing permissions
remain unchanged. See [pointer verification](story-pointer-resolution.md#verified-mapping-and-empty-story-loop).
Run the browser runner with `RUNTIME_FILTER=blank-cascade` for this additional
case. The earlier owner-control checks remain distinct and unchanged.

## Run The Checks

With Node 24 and Playwright installed in a separate dependency directory:

```sh
node --test scripts/tests/runtime-release.test.mjs
PUBLISH_CHECK_ROOT="$ISOLATED_PUBLISH" SITE_BASE_PATH="$PREVIEW_BASE" \
  PLAYWRIGHT_NODE_MODULES="$TEST_DEPS/node_modules" PLAYWRIGHT_CHANNEL=chrome \
  RUNTIME_FILTER=owner-controls node scripts/validate-release-viewers-browser.mjs
```

`OWNER_RUNTIME_FILTER` optionally selects comma-separated runtimes;
`OWNER_WIDTH` selects a single width. The default tests all eight at both
widths. Use an isolated published site and its actual deployment base path.
The runner prints the temporary results/screenshot directory.

## Limits

This verifies synthetic authenticated-owner/editor UI state against actual
runtime code and public stories. It does not certify every private story,
permission combination, layout, browser or external embedded application.
Basic has no owner-specific editing path to activate; its result is an absence
check supported by source inspection, not a new authorization test.

Resource diagnostics were retained: the known Map Tour missing photo/thumbnail
requests, retired My Stories detector/logo requests, and intentionally blocked
OAuth metadata POSTs. None produced a page exception or invalidated the tested
eligibility/control checks. This is not a clean-media or whole-story rendering
certification. Full legacy source reconstruction/Grunt certification and
production acceptance were not added. No deployment was triggered.
