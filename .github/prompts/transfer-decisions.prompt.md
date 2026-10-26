---
description: "Owner decisions that unblock the GitHub ownership transfer of this viewer repository, the owner answer sheet for its next public release, and the ordered, safeguarded viewer transfer steps."
agent: agent
---

# Ownership Transfer Decisions

Recorded 2026-10-17 by Claude from David's instructions. Reconciled 2026-10-22
with the safeguards in the companion converter repository's plan, which were
checked against GitHub's documentation. This file **supersedes** every statement
in `STATUS.md`, the [resolution plan](../../docs/licenses/redistribution-resolution-plan.md)
and the [provenance audit](../../docs/testing/migration-provenance-audit.md)
that makes retained-content rights a gate for the repository transfer. Those
documents remain the evidence record; their transfer gates do not. This public
copy covers the viewer only.

**Order:** the converter transfers first and must be accepted before any step
below starts.

## Owner Decisions

| ID | Decision |
| --- | --- |
| D1 | **The transfer goes ahead.** Retained-content rights review moves to "before any new public release". It no longer gates moving this repository from `dasbury-esri` to `davidasbury`. |
| D2 | **This repository is hybrid (ADR-024)**, which is already in place: `extra.agents` lists `[claude, copilot-enterprise]`. Hybrid is not a `domain` value; the schema allows only `work` or `personal`. `domain: work` and `confidential: false` stay unchanged. |
| D3 | **Scoped exception to the "no personal GitHub" rule** in `.github/copilot-instructions.md`. This repository may record its own canonical location under the `davidasbury` GitHub account, `classicstorymaps.com` and its `convert` subdomain, and the converter's existing Netlify site. Everything else in that rule stands: no Nextcloud, machine paths, home-network hostnames or credentials. |
| D4 | **Hosting stays where it is.** The viewer stays on GitHub Pages, Cloudflare stays authoritative DNS, and the repository stays public. |
| D5 | **Unchanged from earlier decisions:** no history rewrite. The viewer's conversion integration stays gated. |

The transfer changes **who owns** the repository, not **what is public**. The
viewer is already public and served by Pages, so every open rights question is
exactly as open before the move as after it.

## Preflight Started, 2026-10-26

The owner accepted the converter prerequisite and instructed the agent to begin
viewer preflight. This record contains no private converter operational evidence.
No viewer transfer, workflow dispatch or hosting/account change was performed.
See [session 0012](../../session-logs/2026-10-26-0012-session-log.md).

- Fresh admin snapshot: [viewer-2026-10-26-before.txt](baselines/viewer-2026-10-26-before.txt), collected as source owner `dasbury-esri`, has no `UNKNOWN` fields. Against the October 22 snapshot, `main` advanced through documentation and the script now reports `main type=branch`; other captured settings are unchanged. The owner approved this comparison on 2026-10-26; see [session 0013](../../session-logs/2026-10-26-0013-session-log.md). This is approval of the before-baseline comparison, not a future post-transfer comparison or permission to bypass remaining preflight gates.
- Installed GitHub Apps: the owner supplied the source repository settings message, "There aren't any GitHub Apps installed on this repository." This closes the before-transfer inventory item as owner-observed evidence on 2026-10-26, not an agent API result. See [session 0014](../../session-logs/2026-10-26-0014-session-log.md). Recheck after transfer; no App installation or authorization was changed.
- At collection, local and remote `main` were `840b60fcd5ea29ccfc9de1ebc1e6e06179e7d476`. Ancestry and the exact allowed-path diff against `1ce19fd6532950b8333e49da4eca7cd009ed9195` passed. Subsequent documentation commits must pass again; this is not a frozen cutover SHA.
- Queued, in-progress, waiting, requested and pending workflow counts were all zero. Pages remains workflow-based with no custom domain, HTTPS enforced, and `SITE_BASE_PATH=/classic-storymaps-viewer-pages`.
- The latest successful run is `39900419606`, source `d05c215dd5fd58fcd6eef6d08377074074a2bcdb`. Repository-wide and run-specific artifact inventories both returned zero. The `github-pages` deployments query also returned an empty list. This does not prove the site is absent: the old root, catalog and eight runtime entry URLs returned HTTPS 200. These API records do not independently identify every deployed byte. The original Actions artifact remains unavailable; a local replacement recovery package was subsequently rebuilt and checked as recorded below.
- **Local recovery verified:** a fresh isolated checkout of that run's exact source, using Node `v24.22.1`, npm `11.20.0` and `SITE_BASE_PATH=/classic-storymaps-viewer-pages`, built all eight runtimes and passed 139 tests plus 68 published-link checks. The retained archive extracted with all 2,929 files unchanged and passed 42 browser checks on the extracted output. Forty of 42 selected live files matched exactly; the remaining two bundles differed only in timestamp comments and had identical JavaScript ASTs. [Session 0015](../../session-logs/2026-10-26-0015-session-log.md) records the local archive location, SHA-256, runtime coverage and limitations. The package is not uploaded or part of Git history. Hosted restore, private-content authentication and full eight-runtime acceptance were not performed; the existing recovery procedure's hosting/base-path/OAuth conditions still apply.
- Public DNS returned four GitHub Pages A and four AAAA records, `www` CNAME `davidasbury.github.io`, and the destination challenge TXT, with observed TTL 300 seconds. No apex CAA or source-account challenge answer was returned. These recursive DNS observations do not verify Cloudflare's configured proxy, TLS or redirect settings. Apex and `www` returned HTTPS 404. The destination account's current Pages Verified state remains owner-only.
- Catalog source constructs its callback from origin plus pathname. The registered callback list and runtime-specific login paths still need inventory. No OAuth setting was changed.

**Not ready for transfer:** Cloudflare/account verification, OAuth preparation
and a viewer-specific quiet window/recovery deadline remain open. Do not inherit
another repository's maintenance window or treat entry-page HTTP success as
eight-runtime acceptance. The following October 22 table is historical evidence.

## Verified State, 2026-10-22

Recorded by Claude. Each item names its evidence; re-check before acting.

| Item | State | Evidence |
| --- | --- | --- |
| `classicstorymaps.com` Pages verification | Held by `davidasbury` | Owner's view of `davidasbury` → Settings → Pages |
| Challenge TXT | `_github-pages-challenge-davidasbury` present; no `dasbury-esri` record | `dig` against the authoritative nameservers |
| `www` | CNAME to `davidasbury.github.io` | `dig` |
| Apex | A records to GitHub's four Pages addresses; returns GitHub's 404 (no site bound) | `dig`, `curl` |
| Live viewer | Served at `dasbury-esri.github.io/classic-storymaps-viewer-pages/` (200) from `d05c215`: the approved `1ce19fd` content plus a baseline text file the build doesn't read. Two baseline commits without `[skip ci]` deployed at 21:25 and 21:27 PDT, replacing `9910cd3`. Only HTTP status checked; the eight runtimes have not been loaded. | `curl`, Actions runs API |
| Refs | `main` moves with documentation commits after `1ce19fd`; `validation/batch-d-releases` `2b8c572` | `git ls-remote` |
| Pages environment | `github-pages` deploys from branch `main` only | Anonymous GitHub API, and the updated baseline script |
| Branch protection | Neither branch protected; no rulesets | GitHub API, anonymous and authenticated |

GitHub verification is held by one account at a time, so the verification
handoff is **already complete**. Because the domain is verified by `davidasbury`,
no other account can bind it while it serves a 404. Keep the `davidasbury`
challenge record permanently.

## What Gates What

| Action | Gate |
| --- | --- |
| Transfer; bind the custom domain; deploy the pinned revision below | The steps below, run by the owner after converter acceptance. No rights clearance needed. |
| **New public release:** new third-party content, the fonts or images named below, or enabling the conversion integration | The answer sheet below, the open attribution checks in the resolution plan, and owner acceptance |

The transfer exception covers revision `1ce19fd6532950b8333e49da4eca7cd009ed9195`
only, not whatever `main` happens to be. Its changes since the previous live
deploy (`9910cd3`, 2026-10-14; replaced on 2026-10-22 by `d05c215`, which
serves `1ce19fd`'s content) are tracking documents, notice tooling and attribution,
the Ionicons license, and the removal of eight unused fonts. Any other revision
needs a scoped diff review and owner approval before it uses this exception.
**One exception:** a descendant qualifies without additional content review only
after `git merge-base --is-ancestor 1ce19fd6532950b8333e49da4eca7cd009ed9195 <revision>`
succeeds and `git diff --name-only 1ce19fd6532950b8333e49da4eca7cd009ed9195 <revision>`
lists only paths under `session-logs/` or `.github/prompts/`, or exactly
`STATUS.md`. Run both checks in this repository; a failed command is not an
empty, passing diff. Resolve and record the selected full commit SHA before
dispatch, whether it is the original revision, a qualifying descendant or a
separately reviewed and owner-approved revision. The build never reads the
allowed documentation paths. Note that `docs/licenses/` **is** read by the
notice staging, so changes there need review.

## Owner Answer Sheet (Gates the Next Public Release Only)

Ask these as **one message**, and record each answer under its exact paths and
hashes. Do not start new audits; refresh the inventory only for a selected
release candidate.

1. **Four Tailcoat and four Basic Fontello font files:** keep (owner accepts the documented risk) / replace with Font Awesome or Ionicons glyphs, after the owner approves how they look.
2. **Unresolved archive images and other candidates with no recorded basis:** keep under their existing runtime and archive basis unless a specific file is flagged / continue tracing.

## Viewer Transfer Steps

Agents do not change GitHub, Cloudflare or ArcGIS settings; the owner does.
Authorized documentation commits and read-only checks are separate. Record
results and unknowns in an attributed session log. Never record tokens, private
keys, recovery codes or credential-bearing URLs.

1. **Snapshot (agent-collected; the owner approves the comparison):**
   - **Settings baseline:** Copilot runs [`transfer-baseline.sh`](transfer-baseline.sh) on the work Mac, with `gh` signed in as an **admin** of the repository. Every call is read-only. Save the output under `.github/prompts/baselines/` and commit it with `[skip ci]`; on 2026-10-22, two baseline commits without it deployed Pages:

     ```sh
     bash .github/prompts/transfer-baseline.sh dasbury-esri/classic-storymaps-viewer-pages > .github/prompts/baselines/viewer-before.txt
     ```

     It covers refs, branch protection and rulesets in full, collaborators, deploy-key fingerprints, webhook hostnames, Actions permissions, secret and variable names, the `SITE_BASE_PATH` value, environments and their deployment branch policies, Pages, and runs that could still publish. It never prints secret values, private keys, webhook URL credentials, paths or queries, or deploy-key titles. Each result is one of:
     - output or `(none)`: settled;
     - `NONE (404)`: GitHub says none is configured;
     - `NOT AVAILABLE`: the plan can't have the feature here;
     - `UNKNOWN`: not settled. Re-run as an admin, or the owner looks in Settings.
   - **Owner-only item:** installed GitHub Apps can't be listed with a user token. The owner notes the app names under Settings → GitHub Apps.
   - **Also record:** a known-good deploy that can be restored, and the Cloudflare apex and `www` records with their TTL, proxy mode and TLS settings, plus any CAA records. Mark anything unavailable as unknown.
   - **Complete** when the before file has no `UNKNOWN` lines, or the owner accepts each remaining one in the session log. Do not treat the dated "Verified State" table as a fresh snapshot.
   - **Before baseline collected, 2026-10-22 21:24 PDT,** by the owner as an admin: [`baselines/viewer-before.txt`](baselines/viewer-before.txt), with no `UNKNOWN` lines. Still open: the installed GitHub Apps (owner), the Cloudflare records, and a known-good deploy. `d05c215` is a candidate but has been checked by HTTP status only.
   - **Refreshed 2026-10-26:** use [`baselines/viewer-2026-10-26-before.txt`](baselines/viewer-2026-10-26-before.txt) for the current comparison; retain the older file as history. Recheck before cutover if refs or settings change. The new snapshot already includes the deployment branch policy, so that section is no longer an expected addition when comparing against it.
   - **After step 4,** re-run the script against `davidasbury/classic-storymaps-viewer-pages` and diff the two files. Expected differences:
     - `main` advanced by commits made after the before run;
     - `davidasbury` as the admin, with `dasbury-esri` added as a collaborator;
     - a new `deployment branch policies: github-pages` section, added to the script after the before run. Its before value, read anonymously on 2026-10-22, was `main type=branch`.

     The owner approves the diff; anything else stops the cutover for review.
   - **Drain the deploy queue:** before the transfer, and before any change to Pages or `SITE_BASE_PATH`, the script's last section must show 0 for every status. The workflow doesn't cancel runs in progress (`cancel-in-progress: false`), so stopping pushes doesn't drain runs already queued. The owner cancels them or lets them finish, then re-runs the check.
   - Keep `validation/batch-d-releases` unless the owner approves deleting it.
   - Set a quiet window with a recovery deadline. DNS and certificates can take up to 24 hours.
2. **Exact sign-in callbacks:**
   - On ArcGIS client `4ZanYdCYK0mWsFLz`, list the registered redirect URIs.
   - The catalog builds its redirect from the page's own address (origin plus path), so `/viewers/` and `/viewers/index.html` are different callbacks. Work out every production page that signs in, including runtime-specific ones.
   - **Add** the exact `https://classicstorymaps.com/...` callbacks for those pages; do not rely on `/` alone. Keep the old callbacks until acceptance.
3. **Confirm verification:** `davidasbury` still shows `classicstorymaps.com` as Verified, and its challenge record still resolves. If either has changed, stop.
4. **Transfer:**
   - Move the repository to `davidasbury`, keeping its name and public visibility, and accept the invitation. It expires after one day.
   - Compare refs, access and settings with step 1. GitHub keeps deploy keys and secrets, and adds the former owner as a collaborator; review that access.
5. **Bind:** in Settings → Pages, set the source to GitHub Actions and the custom domain to `classicstorymaps.com`. Clear `SITE_BASE_PATH` before the cutover build. Actions deploys ignore `publish/CNAME`; the Settings field is what binds the domain.
6. **DNS check:** the apex A records and the `www` CNAME (to `davidasbury.github.io`) already match GitHub's documented setup. Re-check them on the authoritative nameservers. Record "no change needed" if they still match, and do not touch unrelated records.
7. **Pinned deployment:**
   - Select and record the full SHA using "What Gates What," including ancestry and allowed-path checks for a documentation-only descendant. Immediately before dispatch, confirm remote `main` equals that selected SHA and recheck that no older deployment run is outstanding; otherwise stop.
   - The workflow deploys on every push to `main`, so push nothing during the cutover.
   - Verify the dispatched run's actual `head_sha` equals the selected SHA, then independently verify the deployed revision equals it before acceptance. A mismatch triggers owner cancellation or recovery, not an automatic retry or broader release approval.
   - Record the run ID, `head_sha`, build and link-test results, artifact identity and deployment outcome. Turn on Enforce HTTPS once the certificate is issued.
8. **Acceptance, using tools independent of this repository:**
   - The apex returns 200 with a valid certificate; `www` redirects; a path with a query string survives.
   - All eight runtime entry points load visibly with known examples: Map Tour, Swipe, Journal, Series, Cascade, Shortlist, Crowdsource and Basic. A 200 response alone is not enough.
   - The owner tests sign-in, viewing private content, and sign-out (private access is lost afterwards).
   - The conversion integration is still disabled.
   - Record what the old `dasbury-esri.github.io` URL now returns. GitHub does not redirect Pages URLs after a transfer, so old bookmarks may break.
9. **Close:** update `origin` in every clone and the links that name `dasbury-esri`, in no-deploy documentation commits (`[skip ci]`). Record the Pages, DNS and sign-in results, the deployed revision and owner acceptance before normal work resumes.

`classic-story-search.netlify.app`, linked from the launchers, is a separate
site and is not part of this transfer.

## Recovery

- **Triggers:** stop on a ref, visibility or access mismatch; failed TLS or sign-in; or an expired quiet window. The owner chooses whether to repair or roll back, and records the choice.
- **Restoring service:** use the recorded known-good revision, and restore a working combination of Pages binding, `SITE_BASE_PATH`, sign-in callbacks and DNS.
  - A custom-domain build and a project-path build are not interchangeable.
  - Before falling back to the new owner's default Pages URL, confirm its base path and callbacks.
  - Never leave DNS pointing at an unbound site without verification held.
- **Transferring back** is possible only if GitHub has not retired the old name. GitHub retires a name when the repository had more than 100 clones or Actions uses in the week before the transfer, or contains a Marketplace action. Check this before relying on it. Never create a placeholder repository under the old name. Transferring back does not restore DNS, verification or sign-in settings.
