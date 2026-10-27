---
schema_version: 1
id: classic-storymaps-viewer-pages
name: Classic StoryMaps Viewer Pages
domain: work
confidential: false
state: active
health: green
priority: 2
next_action: "link converter and viewer pages"
updated: 2026-10-26
extra:
  agents: [claude, copilot-enterprise]
  phase: Gallery scope/sharing and URL input implemented locally; owner acceptance and versioned release pending
---

# Classic StoryMaps Viewer Pages

This repository hosts the Classic StoryMaps viewers and their GitHub Pages
publication workflow. Its stable tracking ID is `classic-storymaps-viewer-pages`.

## Current state

**Gallery scope, sharing and URL input implemented locally, 2026-10-26.**

Signed-in users now start at My Content / Public. The gallery also supports
My Organization and public-only ArcGIS Online, with Public, My Organization,
and Private sharing choices. Private includes group-shared items. Organization
searches allow accessible other-owner items returned by ArcGIS without a
client-side role gate; Convert remains restricted to owned items. Signed-out
browsing uses ArcGIS Online / Public instead of the curated launcher examples.

The omni-input accepts IDs, explicit app-ID URLs and exact indexed Classic app
URLs, plus verified aliases for the two supplied self-hosted examples. Web-map
overrides survive; credentials and arbitrary parameters do not. This is not a
general self-hosted configuration scraper. Unknown or ambiguous URLs require
the app ID. The supplied Cascade item was inaccessible or absent anonymously;
its actual authorized rendering remains unverified.

All 148 Node tests passed under Node 24, and five isolated browser scenarios
passed: three public-gallery widths, signed-in filter/session transitions, and
URL routing. Screenshots were inspected at desktop and narrow-phone widths.
Public service responses independently confirmed the two legacy app IDs and
the Map Tour URL. Private access checks used synthetic sessions, not the owner's
credentials; real permission and full story-rendering acceptance remain pending.
Only catalog output was refreshed in the existing local preview. The transparent
favicon hash, runtime outputs, OAuth registrations, account settings and production
were preserved. No release, version bump or deployment was performed. See
[session 0032](session-logs/2026-10-26-0032-session-log.md).

**Catalog sign-in reuse implemented locally for all eight apps, 2026-10-26.**

At David's request, runtime startup now registers the valid catalog session with
the ArcGIS IdentityManager before loading content. This applies to Map Tour,
Swipe, Journal, Series, Cascade, Shortlist, Crowdsource and Basic. The existing
cookie alone did not authenticate native item requests in isolated controls;
registration removed that gap. Credentials are scoped to the fixed HTTPS ArcGIS
Online sharing endpoint, never added to story navigation URLs. Malformed or
expired cookies are rejected. An open runtime clears inherited SDK credentials
and reloads when the catalog cookie is removed, expires or changes.

All 145 Node tests passed under Node 24. All 48 isolated native-browser auth
cases passed across root and prefixed deployment paths, including cookie-only
controls, authenticated private-item requests and loss of access after sign-out.
These used synthetic credentials and intercepted responses, not owner sessions
or a full private-story rendering certification. The existing local preview now
includes the fix for all apps; owner acceptance with actual private stories is
pending. Upstream sources, OAuth registrations, account settings and production
remain unchanged. No version bump or deployment was performed. See
[session 0031](session-logs/2026-10-26-0031-session-log.md).

**Edited tab favicon preserved in source, 2026-10-26.**

David requested promotion of his background-removed ICO from generated
`publish/viewers/assets/images/favicon.ico` into both tracked source copies:
`apps/classic-storymaps-site/favicon.ico` and
`apps/classic-storymaps-site/assets/images/favicon.ico`. Independent byte and
SHA-256 comparisons matched his edited image:
`2fac548f1a962e4f31fad61a62a75f3e844fbeead4b0709350a98c68aac9c7f1`.
The generated favicon cache key is now `folded-map-transparent`; the existing
focused Node 24 regression passed against an isolated build, including source/
output equality and repeat-staging idempotence. The owner's preview was not rebuilt.

The shared-icon normalization introduced in
[session 0029](session-logs/2026-10-26-0029-session-log.md) remains in place for
landing, archive, compatibility, runtime, print and notice pages, with a root
fallback. Upstream sources remain untouched. This promotion is source-only,
not deployment or integration approval; font-specific findings remain open.
See [session 0030](session-logs/2026-10-26-0030-session-log.md).

**Viewer cutover accepted by the owner, 2026-10-26.**

- The public canonical repository is [davidasbury/classic-storymaps-viewer-pages](https://github.com/davidasbury/classic-storymaps-viewer-pages). Production is [classicstorymaps.com](https://classicstorymaps.com/), hosted by GitHub Pages with Cloudflare authoritative DNS. The owner performed the transfer, binding, variable removal and workflow dispatch; the agent performed read-only verification.
- The owner approved the restored post-transfer comparison, retained `dasbury-esri` write access and confirmed no destination GitHub Apps. Secret scanning and push protection initially became disabled after transfer; the owner restored both and the agent independently verified restoration before binding. Branches, visibility and the remaining captured controls were preserved.
- Accepted deployment: run `40416446662`, source `cc5af80ba15216dad86ed2d982e3d670cd51cdb4`, a verified documentation-only descendant of approved `1ce19fd6532950b8333e49da4eca7cd009ed9195`. All 139 tests and 68 published-link checks passed. The Pages-specific deployment API returned `succeed`; the downloaded artifact matched GitHub's SHA-256, and twelve sampled live files matched the artifact byte-for-byte, including the disabled conversion configuration. This is sampled byte verification, not a whole-site equality claim.
- Pages binds `classicstorymaps.com`, uses GitHub Actions and enforces HTTPS. `SITE_BASE_PATH` was removed before the build; the workflow log confirms its empty value. Both authoritative nameservers and a public resolver matched the approved DNS records, so no DNS change was required. HTTPS and `www` redirects preserved the tested path and query. The old GitHub Pages root and catalog returned 404; saved links to those addresses require updating.
- The owner reported successful catalog sign-in/return/sign-out at both `/viewers/` and `/viewers/index.html`, visual checks for all eight runtimes, private-content rendering, and loss of private access after sign-out and reload. These are owner-observed results, not agent-authenticated browser tests. The later local session-reuse fix is described above; hosted behavior and previously accepted conditional OAuth limitations remain unchanged pending release.
- At `2026-10-26 16:13:55-07:00[America/Los_Angeles]`, remote `main`, the successful run and Pages deployment still matched the accepted SHA, all five outstanding queue counts were zero, and published conversion integration was disabled. The owner subsequently accepted the cutover and authorized documentation-only `[skip ci]` commits/pushes, canonical-link updates and this clone's remote update. No application changes, new deployment, directory move, cleanup or restricted registry access were authorized.
- The existing viewer registry entry now records the destination owner. David set the project to active, green, priority 2, with next action "link converter and viewer pages". Other-clone updates remain a separate handoff. This tracking update does not implement linking or authorize deployment; retained-content rights and new-release gates remain in force. Preserve recovery packages, the validation branch, deploy key, old callbacks and destination verification TXT.

This clone's origin now targets the destination repository through the existing
`github.com-davidasbury` SSH alias; authenticated read access verified both branch
refs. After acceptance and closure, the owner separately requested relocation of
the existing local clone. That move preserved Git state and recovery archive
hashes; the old directory is absent and shared SSH configuration is unchanged.
The authorized tracking update is recorded in
[session 0027](session-logs/2026-10-26-0027-session-log.md).
See [session 0026](session-logs/2026-10-26-0026-session-log.md),
[session 0025](session-logs/2026-10-26-0025-session-log.md) and
[transfer decisions](.github/prompts/transfer-decisions.prompt.md) for the execution
record and unchanged release gates.

The [joint closure record](session-logs/2026-10-26-0028-session-log.md) consolidates
the accepted transfer, local move and concurrent tracking update without
repeating private converter evidence. Establishing `convert.classicstorymaps.com`
before linking was recommended, but no domain setup or integration was performed
by this closure. The existing next action and separate release gates remain.

## Historical Preflight Snapshot

The following describes the state before transfer; the accepted cutover above supersedes its pending execution and acceptance statements.

**Viewer V3 complete, 2026-10-26; owner-operated transfer is next after final checks.**

- The owner accepted the converter prerequisite and authorized viewer preflight. No viewer transfer, workflow dispatch, Pages or DNS change was performed. The owner subsequently added the catalog OAuth callbacks recorded below; the agent made no account-setting changes.
- The [fresh source-admin baseline](.github/prompts/baselines/viewer-2026-10-26-before.txt) has no `UNKNOWN` results. Compared with the October 22 baseline, only documentation-only `main` advancement and the script-added `main` deployment-policy detail differ. The owner approved this comparison on 2026-10-26; see [session 0013](session-logs/2026-10-26-0013-session-log.md).
- The owner reported that the source viewer repository's Installed GitHub Apps page shows no installed Apps. This closes the before-transfer Apps inventory item as owner-observed evidence, not an API inventory; see [session 0014](session-logs/2026-10-26-0014-session-log.md).
- `840b60fcd5ea29ccfc9de1ebc1e6e06179e7d476` passed ancestry and the exact documentation-path allowlist against approved `1ce19fd6532950b8333e49da4eca7cd009ed9195`. Documentation closure advances `main` again; select and recheck the final full SHA before dispatch. The validation branch remains `2b8c572ec7038372c3130a3e9715bd61d09b0460`.
- Deployment queues were empty. The latest successful Pages run remains `39900419606` at `d05c215dd5fd58fcd6eef6d08377074074a2bcdb`. Its original Actions artifact is unavailable; the live site remains accessible. A local replacement recovery package has now been rebuilt and checked, as described below.
- The isolated recovery build from that exact source passed 139 tests and 68 published-link checks. Its archive contains 2,929 files and extracted byte-for-byte identically. All 42 browser checks passed on the extracted copy: eight launchers at three widths and four runtimes on desktop/mobile. Of 42 selected live files, 40 matched exactly; Journal and Series bundles differed only in build-timestamp comments, with identical parsed JavaScript. See [session 0015](session-logs/2026-10-26-0015-session-log.md) for the retained local archive, checksum and limits. This is local recovery evidence, not a hosted rollback or full eight-runtime/private-content acceptance.
- Both Cloudflare authoritative nameservers agree on the GitHub Pages apex A/AAAA records, `www` CNAME `davidasbury.github.io`, and the destination challenge TXT, with observed TTL 300 seconds. The owner confirmed apex and `www` are gray-cloud/DNS-only with configured TTL `Auto`; no DNS change was made. No apex CAA record was returned. See [session 0016](session-logs/2026-10-26-0016-session-log.md). The owner subsequently confirmed encryption mode `Full (strict)` and Always Use HTTPS `On`; see [session 0017](session-logs/2026-10-26-0017-session-log.md) and [session 0018](session-logs/2026-10-26-0018-session-log.md). The owner also confirmed there are no Redirect Rules, Bulk Redirects or legacy Page Rules; see [session 0019](session-logs/2026-10-26-0019-session-log.md). This completes the requested Cloudflare settings inventory, not live redirect acceptance. The last HTTPS checks returned 404 for apex and `www`; the viewer custom domain remains unset in the recorded baseline.
- The owner confirmed that `classicstorymaps.com` shows Verified in the destination `davidasbury` account's Pages settings. The destination challenge TXT was independently rechecked on both authoritative nameservers. See [session 0020](session-logs/2026-10-26-0020-session-log.md). This records current verification ownership, not a repository domain binding or live-service acceptance.
- The owner established the viewer quiet window starting now, captured at `2026-10-26 15:00:01-07:00[America/Los_Angeles]`, with recovery decision at `2026-10-26 17:00:00-07:00[America/Los_Angeles]` and final deadline at `2026-10-26 21:00:00-07:00[America/Los_Angeles]`. The owner confirmed no viewer authoring or automation until transfer completion, then explicitly authorized this transfer-tracking-only `[skip ci]` documentation commit. All five outstanding workflow status counts were zero at the start check. See [session 0021](session-logs/2026-10-26-0021-session-log.md). The deadline does not automatically end the pause or authorize an extension.
- The owner identified existing client `4ZanYdCYK0mWsFLz` and confirmed adding both catalog path forms under the destination domain and current GitHub Pages site while retaining existing callbacks. The separate Dev client was not selected for production. An isolated browser check independently observed both current-site callback paths, intercepting authorization before ArcGIS; it did not authenticate. See [session 0022](session-logs/2026-10-26-0022-session-log.md) for the exact registration inventory and evidence limits.
- From the current `/viewers/` catalog, the owner reported successful sign-in/return/sign-out, private Map Tour and Shortlist viewing, and loss of private access after sign-out and reload. Viewing required a second username/password sign-in despite catalog authentication. Investigation was explicitly deferred until after transfer; session reuse or credential forwarding is a hypothesis, not a verified cause. See [deferred finding](.github/prompts/transfer-decisions.prompt.md#deferred-second-sign-in-finding).
- The runtime inventory found pre-existing conditional OAuth limitations: Map Tour, Swipe, Journal, Series, Cascade and Shortlist use the built-in `storymaps` client in item-access paths; their default popup callback files return 404 on the current site, and ArcGIS rejects those callback URLs at both current and destination origins. All four catalog callbacks validate successfully for `4ZanYdCYK0mWsFLz`. Crowdsource and Basic publish callback files but can depend on separately configured clients whose registrations were not verified. See [session 0023](session-logs/2026-10-26-0023-session-log.md) for the source, SDK and public-service evidence and its limits.
- The owner explicitly accepted these authentication limitations for transfer, retained the pinned application content, deferred repairs and authorized this tracking-only `[skip ci]` commit and progression to V3. V2 is dispositioned by that scoped acceptance, not by a claim that every runtime login works. Destination-domain authentication, private viewing, sign-out access loss and eight-runtime acceptance remain required after cutover. The second-sign-in cause remains unverified.
- V3 is complete: the owner reconfirmed that `classicstorymaps.com` still shows Verified under `davidasbury` Settings > Pages, after both authoritative nameservers independently returned agreeing destination challenge TXT records with TTL 300 seconds. Account-level status is owner-observed; DNS does not establish it alone. The owner authorized one final pre-transfer tracking-only `[skip ci]` commit; see [session 0024](session-logs/2026-10-26-0024-session-log.md).
- Recheck refs, deployment queues and the quiet window after this commit is pushed, before the owner transfers the viewer. Keep the name and public visibility, then stop for the before/after comparison before Pages binding or base-path changes. The final deployment SHA still requires selection and verification before dispatch. A hosted restore has not been exercised; recovery must preserve compatible hosting, base-path and OAuth settings. See [transfer decisions](.github/prompts/transfer-decisions.prompt.md). Rights and conversion-integration gates are unchanged; normal authoring and automation remain paused.

See [session 0010](session-logs/2026-10-22-0010-session-log.md), [follow-up session 0009](session-logs/2026-10-22-0009-session-log.md) and the
[earlier reconciliation](session-logs/2026-10-22-0008-session-log.md).

**Transfer approved, 2026-10-17.** David approved transferring this repository
to `davidasbury` now, with retained-content rights review moved to "before any
new public release". The repository stays hybrid (`extra.agents`); `domain: work`
and `confidential: false` are unchanged. The
[transfer decisions](.github/prompts/transfer-decisions.prompt.md) record the
decisions, a two-question answer sheet for the next release, and the ordered
viewer steps. Older text below that makes rights a transfer gate is superseded.
At that October 17 decision, no transfer, Pages, DNS or OAuth change had been made. See
[session 0007](session-logs/2026-10-17-0007-session-log.md).

Execution of the [resolution/defer plan](docs/licenses/redistribution-resolution-plan.md)
produced a [release membership report](docs/testing/release-content-membership.json):
282 candidate paths have 350 exact output copies, independently byte-compared.
All eight unresolved font files ship. Bounded public-source checks did not
establish their exact glyph provenance. The owner was unavailable for new
rights decisions; specific replacement proposals are recorded, not implemented.
No font or image was removed, changed or newly accepted.

All eight generated runtime notice pages now display Powered by Esri, verified
in sixteen desktop/mobile browser checks. In-app discoverability, map-provider
expansion and actual layer-credit coverage remain open; notice-page checks are
not blanket compliance. Closure uses CI-skip markers, with no Pages deployment
or transfer. See the [execution log](session-logs/2026-10-17-0006-session-log.md).

The [current inventory](docs/testing/remaining-content-inventory.json) records
5,345 tracked, present files: 827 review candidates and 4,518 runtime import or
local-patch context entries preserving earlier evidence. Independent Git
enumeration and external SHA-256 checks matched all paths and bytes. These are
not counts of unlicensed works. The [updated audit](docs/testing/migration-provenance-audit.md)
separates current decisions from historical findings and completed notices.
All four Tailcoat and four Basic social font files have exact hashes and direct
CSS consumers recorded in the [font inventory](docs/licenses/runtime-font-provenance.md#tailcoat-and-basic-social-font-inventory).
Independent binary metadata identifies Basic's font as Fontello, correcting
the older IcoMoon description. Font-specific permission remains unresolved;
no file was removed or replaced. See the [inventory log](session-logs/2026-10-17-0004-session-log.md).

The owner designated this project as hybrid: both Claude and Copilot Enterprise
may work on its non-confidential content. Work-domain reporting remains unchanged;
hybrid designation is recorded by `extra.agents`, not a new domain value.

Superseded 2026-10-17 by the transfer decisions above: retained-content rights now gate the next public release, not migration. The
[migration handoff](https://github.com/davidasbury/ArcGIS-StoryMaps-Classic-Converter-App/blob/main/docs/runbooks/migration-handoff.md)
is the continuation guide and requires access to the converter repository.
No transfer, new deployment or rights clearance is implied by onboarding.

Fresh local notice/font packaging passed all 139 viewer tests under Node 24 and
68 published-link checks against the assembled release. An isolated checkout
started with no runtime build directories: Map Tour, Swipe, Journal and Series
used Grunt; Cascade, Shortlist and Crowdsource used pinned verified releases;
Basic used its static-copy build. All 297 referenced notice documents existed.
External byte comparisons verified the 43 upstream documents, root licenses and
210 bundled editor-source copies. Seven compiled viewer bundles passed syntax
parsing. Ionicons binary fonts matched their previously verified source exactly;
SVG matched after line-ending normalization. All eight retired fonts were absent.

The fresh build exposed a notice CLI bug that silently skipped staging through a
symlinked directory. Resolving the invoked file's real path fixed it, and a new
regression plus the fresh artifact checks passed. Map Tour retained its legacy
JSHint warning; Cascade and Shortlist used their intended verified-release
fallbacks after source-build errors. No unrelated build-system repairs were made.

The owner authorized inclusion of these changes in the scoped no-deployment
checkpoint. This verification established a fresh local artifact, not full
browser/hosted acceptance or rights for other copied
assets. The previously separate provenance audit is now explicitly updated as
part of the owner's requested inventory work, not as a blanket clearance.
Publication approval remains separate; the Pages workflow can deploy from a
main-branch push without the required skip marker. See the
[fresh release log](session-logs/2026-10-17-0003-session-log.md).

## Done

- [x] Updated the existing registry owner and applied David's current tracking values.
- [x] Owner approved hybrid designation and initial tracking values.
- [x] Created STATUS with a pointer to the existing migration handoff.
- [x] Verified fresh notice/font packaging with the full Node 24 suite, published-link checks and independent artifact comparisons.

## Next

- [ ] link converter and viewer pages
- [ ] Complete any remaining other-clone updates on their authorized surfaces.
- [ ] Investigate the deferred second sign-in only under separate authorization.
- [ ] Resolve retained-content rights before any new public release.
- [ ] Execute the resolution/defer plan and complete attribution coverage before release approval.
- [ ] Obtain separate approval before new production publication or enabling conversion integration.

See `session-logs/` for session outcomes.
