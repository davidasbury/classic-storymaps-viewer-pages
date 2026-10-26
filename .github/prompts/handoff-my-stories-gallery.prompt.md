---
description: "Continue or validate the Classic Viewers story gallery and launcher redesign, including owned/public browsing, advanced tools, and gated conversion."
agent: "agent"
---

# Handoff: My Stories Gallery for Classic Story Maps

## Goal and Scope

Maintain and validate the Viewers story gallery and redesigned launchers so users can browse owned or curated public Classic Story Maps without copying an item ID. The sibling `ArcGIS-StoryMaps-Health-Reporter` gallery informed the interaction pattern; do not port its scanner or replace this site's static architecture.

The owner subsequently requested implementation and authorized committing, pushing, and deploying this release. The target now has a browser-only gallery, shared curated examples, whole-card catalog links, and launcher screenshot galleries with collapsed Advanced tools. Inspect the current worktree, [README](../../README.md), and [release verification notes](../../docs/testing/archive-examples-audit.md) before continuing; implementation does not imply production deployment or real-account acceptance. Production Convert remains disabled because its locked deployment predates the required ownership and prefill changes. Future commits, pushes, domain changes, and remote ArcGIS changes require their own authorization.

Read current target instructions and preserve the other agent's working-tree changes. Source gallery changes were uncommitted during handoff preparation: inspect the sibling working tree, not an assumed release or commit. No authentication secrets, private item payloads, or saved reports belong in fixtures or this handoff.

## Owner-confirmed Placement

The gallery belongs on the existing [Viewers page](https://classicstorymaps.com/viewers/) in [viewers.html](../../apps/classic-storymaps-site/viewers.html), not on a new page or the archived My Stories page. These decisions supersede the original signed-in-only handoff.

- Initially show eight whole-card launcher links for everyone. Browse Stories opens the gallery; Hide Stories restores the cards. Preserve an explicitly opened gallery through a validated OAuth round trip, but do not automatically open it merely because a session exists.
- Story cards remain fully clickable. When conversion is enabled and eligible, show green View and blue Convert buttons together; otherwise omit the action row. Shortlist's staged viewer-only patch suppresses Edit even for owners and disables its builder-transition helper.
- Signed-in browsing shows owned Classic Web Mapping Applications identified by tags or typeKeywords. Signed-out browsing uses the curated archive examples until `gallery.publicGroupId` is configured. Never show Convert to signed-out users.
- Logout, expiry, and account replacement clear private cards, abort requests, and revoke thumbnail object URLs before an open gallery switches to public content.
- Keep the landing page's manual app-ID form. Launcher pages use their catalog image/description and two to eight linked screenshots first, with existing manual launch and download/export controls retained inside closed Advanced tools. This later owner choice supersedes the earlier proposal to remove launcher forms.
- Reuse the Viewers page's existing authentication handling, including `setAuthUi`, OAuth return processing, and logout cleanup. Do not restore the retired archive's My Stories navigation links.

## Source Implementation Map

Paths below link to the sibling source repository from this file's location.

| Source | What to reuse or inspect |
| --- | --- |
| [gallery.py](../../../ArcGIS-StoryMaps-Health-Reporter/src/arcgis_storymap_health_reporter/gallery.py) | `owned_stories`, `_read`, `story_thumbnail`: query construction, safe metadata projection, transport bounds, thumbnail sanitization. |
| [service.py](../../../ArcGIS-StoryMaps-Health-Reporter/src/arcgis_storymap_health_reporter/service.py) | `/api/stories`, `/api/stories/{item_id}/thumbnail`, `/api/history`; `JobController.start` running-job deduplication. |
| [auth.py](../../../ArcGIS-StoryMaps-Health-Reporter/src/arcgis_storymap_health_reporter/auth.py) | `BrowserSession.gallery_items`, session lifetime and cleanup. |
| [app.tsx](../../../ArcGIS-StoryMaps-Health-Reporter/frontend/src/app.tsx) | `Story`, `SavedJob`, `StoryThumbnail`, `MyStories`, and `selectStory`; explicit selection versus scan actions. |
| [app.css](../../../ArcGIS-StoryMaps-Health-Reporter/frontend/src/app.css) | Gallery toolbar, responsive grid, stable thumbnail frames, badges and pagination. |
| [ADR-002](../../../ArcGIS-StoryMaps-Health-Reporter/docs/decisions/ADR-002-session-story-gallery.md) | Source gallery boundaries, credential handling, evidence dates and session-only history. |
| [test_gallery.py](../../../ArcGIS-StoryMaps-Health-Reporter/tests/test_gallery.py) | Query constraints, result validation, image/path safety and bounded requests. |
| [test_service.py](../../../ArcGIS-StoryMaps-Health-Reporter/tests/test_service.py) | Authentication, manifest/context isolation, history and running-job deduplication. |
| [app.spec.ts](../../../ArcGIS-StoryMaps-Health-Reporter/frontend/tests/app.spec.ts) | Desktop/mobile gallery workflow, saved-report reopening without a scan, retry and account switching. |

## How the Source Gallery Works

1. Once signed in, the browser requests `/api/stories` and then `/api/history`. The owner comes from the authenticated service session, not a browser-supplied username.
2. `owned_stories` searches `https://www.arcgis.com/sharing/rest/search` with `owner:<JSON-quoted username> AND type:"StoryMap"`. Optional title search appends `AND title:<JSON-quoted search>`. It uses `f=json`, `num=24`, `start`, `sortField=modified|title`, and `sortOrder=desc|asc` respectively.
3. Every result is checked again: valid 32-character lowercase hex ID, exact owner, and exact `StoryMap` type. A bad result fails the page. Safe output contains only ID, bounded title, modified timestamp, allowlisted access, and a validated relative thumbnail name. The service replaces that name with a same-origin thumbnail URL.
4. `MyStories` debounces input by 300 ms and cancels obsolete requests with `AbortController`. Search/sort reset pagination. A stack of REST start offsets supports Previous/Next; `nextStart`, not displayed card count, controls continuation. The route limits search to 100 characters and start to 1 through 10,000.
5. Cards show a thumbnail or icon fallback, title, sharing state, and available result evidence. Images have stable 3:2 frames; the grid changes from three to two to one column. Loading, empty, error, retry, and disabled/busy states are explicit.
6. Selecting an unchecked story fills its ID for the existing workflow. Selecting running work opens progress; selecting completed work opens the saved report. Selection itself never starts a scan. Full rescan and Recheck links are explicit commands.
7. Account replacement, logout and session expiry clear account-bound content and results. Async responses are checked against the current session before being returned; aborted old UI requests cannot populate the next account's gallery.

The source uses React and Lucide with its existing styles, not a packaged Esri gallery widget or the Calcite runtime. Esri's OAuth portal-query sample informed the pattern, but the implementation calls REST through its own service.

## Adapt the Filter at Both Boundaries

The target must browse **Web Mapping Applications with Classic Story Maps metadata**, not modern `StoryMap` items and not every Web Mapping Application.

- Change both the query's item type and the post-query type predicate. Changing only the query leaves the source validator rejecting every Classic result.
- Keep the owner constraint mandatory for signed-in browsing. Public group browsing instead requires the configured group and public-access constraints. Quote/escape all user-controlled search text. Parenthesize any OR clauses so a keyword/tag alternative cannot escape scope/type filters.
- Do not treat `tags` and `typeKeywords` as interchangeable REST fields. Inspect both before projecting the card model. The target already has related but different classifiers; align them deliberately instead of adding a third conflicting classifier.
- [classic-story-loader.js](../../apps/classic-storymaps-site/assets/js/classic-story-loader.js) has `getItemMetadataTerms`, which combines tags and typeKeywords; `termsContainAny`, which normalizes punctuation and checks fragments; and `validateAppMetadata`, which requires Web Mapping Application type, a Story Map term, and a runtime-specific term.
- [classic-storymaps-config.js](../../apps/classic-storymaps-site/assets/js/classic-storymaps-config.js) exports `classifyClassicRuntimeFromItem` and `appRegistry`. Its runtime classifier now checks tags, typeKeywords and URL fragments; some runtime matches occur before its fallback type check. Therefore, it is not sufficient by itself as the gallery's owner/type/Classic membership gate. [classic-story-gallery.js](../../apps/classic-storymaps-site/assets/js/classic-story-gallery.js) applies the stricter membership gate and rejects ambiguous runtime metadata before rendering.
- The registry supplies variants for Tour, Swipe/Spyglass, Journal, Series, Cascade, Shortlist, Crowdsource, and Basic. Reuse those runtime mappings rather than hard-coding a second list. Keep unsupported or unknown Classic entries distinct from launchable ones; do not invent a runtime destination.

The current implementation searches the signed-in owner's `type:"Web Mapping Application"` items, then applies an explicit Classic tag/keyword predicate locally. This avoids assuming that a narrow search phrase has the same matching semantics as the target's punctuation-normalized fragment classifier. Non-Classic, wrong-owner, invalid-identity and unlaunchable candidates are excluded; buffered pagination follows `nextStart` with at most three candidate requests per action.

Follow ArcGIS `nextStart` even when filtering leaves a short or empty page. Do not announce that the account has no stories merely because the first candidate page has no Classic matches. Either show bounded candidate pages with continuation or fetch a bounded number of additional pages to fill the view. Never scan an entire account eagerly. Report counts as displayed/loaded results unless a true Classic-only total is available.

After verifying REST search behavior against representative metadata, a grouped `typekeywords`/`tags` search clause may reduce candidate volume. Verify its recall for tag-only, keyword-only, punctuation variants, and every supported runtime before relying on it. Do not present an untested search expression as equivalent to the local classifier.

## Target Architecture and Authentication

The target [README](../../README.md) describes a static GitHub Pages build, deployment base paths, and an existing browser-based OAuth arrangement. Start with [arcgis-auth-helpers.js](../../apps/classic-storymaps-site/assets/js/arcgis-auth-helpers.js) and the catalog/loader integration. Reuse the current authenticated account and launch behavior. Keep manual ID/URL entry available as a fallback.

The source is a Python FastAPI service with service-held OAuth tokens and an HttpOnly session cookie. Its private-thumbnail proxy cannot simply be copied into static Pages. Do not claim that browser-held tokens become service-held by reusing the gallery UI. Introducing a backend, changing OAuth flow, or changing hosting origin requires a separate decision.

Source safeguards to understand when choosing the target equivalent:

- ArcGIS requests use a fixed origin and `X-Esri-Authorization` header; redirects and environment proxies are disabled. Reads are bounded to 2 MiB with connection/read limits and a streamed deadline. Errors are sanitized.
- A session manifest holds at most 240 gallery items. Thumbnail access requires the session cookie, matching context, and an item in that manifest; context alone is not authorization.
- The proxy validates relative paths, rejects traversal/arbitrary URLs, decodes only PNG/JPEG/GIF/WebP, caps images at four million pixels, resizes within 480x320, and returns re-encoded PNG. It never forwards active SVG/HTML bytes to the browser.
- The target must use its existing auth architecture for private metadata/images without introducing token-bearing links, logs, persistent caches, or arbitrary authenticated fetch destinations. Verify browser CORS and private-image behavior; do not assume a service proxy exists. Revoke object URLs on cleanup if blob-based image loading is used.
- The target README explicitly records a JavaScript-readable `esri_auth` cookie with `Path=/` and shared-origin exposure to other Pages projects and authored story HTML. Preserve the documented owner decision; this gallery does not resolve that risk.
- Use registered OAuth callback URLs. A source preview on port 8767 failed with `Invalid redirect_uri`; the original registered callback on 8765 worked. Do not copy either source port or source client configuration into this target. Avoid restarting an existing service without approval because it may destroy session results.

Build gallery/launch URLs through the target's existing base-path configuration and route registry. Test both root hosting and `/classic-storymaps-viewer-pages`; do not hard-code a root-only path. Edit source under `apps/`, not generated `publish/` or imported runtime trees.

## Health Results Are Optional, Not Native ArcGIS Metadata

The source matches history by submitted item ID or resolved replacement ID, prefers running work for the action, and uses completed evidence for badges. It shows nonzero To fix / Couldn't verify / Info counts, scan date and scope, access context, a changed-source warning when modified timestamps differ, and a 24-hour recheck reminder based on the original health-check date.

These are Health Reporter concepts, not fields supplied by ArcGIS Search. Do not label cards healthy merely because they load, or add fabricated scan badges to the viewer. A viewer-only adaptation can stop at selection and launch. Integrating actual health results is separate scope unless explicitly requested.

If results are integrated later, retain these constraints:

- Opening a saved report does not issue a scan request. There is no general completed-result cache that guarantees freshness.
- Changed item timestamps are only a warning signal. Search indexing can lag, and external dependencies can change without an item modification. Missing modification evidence does not prove unchanged content.
- Link/embedded follow-ups retain the base health-check date; a new follow-up timestamp must not make old evidence look new.
- History is session-only: up to eight hours, with one active worker and 20 retained jobs service-wide. Logout/account replacement/expiry clears owned jobs; restart loses history. No cross-login persistence exists.
- Running-job reuse requires the same session, item, operation, base report, and authenticated boolean. It is not deduplication across accounts or proof of equivalent tokens/permissions.

## Implementation and Acceptance Checklist

1. Inspect the current target catalog, auth helpers, registry, metadata validation and tests. Preserve ongoing work. Choose the smallest gallery integration and document how tags and typeKeywords determine inclusion versus runtime routing.
2. Add owner-constrained candidate queries and Classic filtering with synthetic fixtures: keyword-only, tag-only, punctuation variants, unrelated Web Mapping Application, modern StoryMap, wrong owner, invalid ID, missing metadata, and unsupported Classic runtime.
3. Test title escaping, sort direction, search-reset pagination, sparse/empty filtered pages with remaining results, the result-window bound, and request cancellation/account changes.
4. Test signed-out behavior, expiry, logout cleanup, old-account response races, private thumbnail access, image fallback, and absence of credentials in rendered links/logs. Users authenticate directly through ArcGIS; never request tokens in chat.
5. Verify desktop and phone layouts, keyboard access, stable image/card dimensions, long titles, loading/error/empty states, and retry. Selection must use the existing launch flow without automatically running health checks or fetching every story's data.
6. Reuse the target's [scripts/tests](../../scripts/tests) and built-in Node test runner. Run focused new tests first, then `node --test scripts/tests/*.test.mjs` from the target root. Follow the README's build/link checks when changing deployed assets or routing; keep generated output untracked.
7. Verify a real signed-in account's owned Classic content, sorting/search, private thumbnails, and runtime launch on the target deployment. Synthetic browser tests alone do not establish live ArcGIS acceptance. Record unverified cases honestly.

Source tests cover the modern gallery and session workflow and were inspected, not rerun here. Target tests now include [gallery contracts](../../scripts/tests/classic-story-gallery.test.mjs) and the `gallery,launchers` modes of [the browser runner](../../scripts/validate-release-viewers-browser.mjs). The release passed 137 Node tests, ten workflow builds, 68 publish checks, and 32 gallery/launcher/Shortlist browser scenarios. These verify local/synthetic behavior, not live private-gallery acceptance. The owner confirmed development Viewers sign-in and previously confirmed converter sign-in preserves the incoming item ID. The preview-only converter override also passed an actual local handoff without sign-in or conversion. Private thumbnails/runtime launches and readiness of the deployed converter remain separate acceptance gates; do not describe the previously confirmed sign-in/prefill behavior as untested.

## References and Instruction Availability

- [Esri OAuth portal item query sample](https://developers.arcgis.com/javascript/latest/sample-code/identity-oauth-basic/): reference pattern, not a required SDK dependency.
- [ArcGIS REST Search](https://developers.arcgis.com/rest/users-groups-and-items/search/): verify field syntax, sort behavior and pagination before tightening Classic search clauses.
- [Target deployment plan](../../.github/prompts/plan-storymapsSiteDeploy.prompt.md) and current README: the older plan includes IIS-era details; use current source and README to verify today's deployment contract.
- At handoff preparation, target `AGENTS.md`, `.github/copilot-instructions.md`, and `STATUS.md` were absent. Recheck for instructions or decisions introduced by the receiving agent before implementation.
