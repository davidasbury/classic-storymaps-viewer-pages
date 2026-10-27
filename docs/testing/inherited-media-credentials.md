# Inherited Media Credential Cleanup

Recorded: 2026-10-27 12:11:15-07:00[America/Los_Angeles].

## Scope

The owner confirmed that the Flickr and Google credentials in GitHub secret
scanning alerts 3, 2 and 1 were inherited from upstream, and required preservation
of viewer features. Their validity and provider ownership were not independently
verified. All three alerts remained open with unknown validity at the recorded
check. No provider was contacted using those values.

The three alerted values were removed from nine tracked files, including the
retained Bee Tour configuration, runtime defaults, Flickr connector override,
and Cascade print/authoring code. An additional inherited Unsplash default in
Cascade was also removed. Credential values are not recorded here or in tests.

## Implementation

- Empty optional media keys no longer block Map Tour, Journal, Series or Shortlist
  startup. Other required configuration checks remain intact.
- Map Tour does not initialize its unused authoring Flickr connector without a
  key. Stored Flickr image URLs are unchanged; the mobile list does not consume
  the previously supplied key argument.
- Cascade print uses its existing public YouTube thumbnail, embed URL and
  printable link without a Data API call. The credentialed high-resolution
  thumbnail lookup is not used. Vimeo handling is unchanged.
- `scripts/secure-runtime-media.mjs` strips the four known inherited values by
  SHA-256 fingerprint, applies the corresponding legacy bundle fixes, and rejects
  unexpected nonempty provider defaults or Google-key-shaped values.
- All eight runtime builders invoke the sanitizer after their existing adapters.
  Publication sanitizes copied builds again and checks its final output, so stale
  builds and pinned upstream downloads cannot restore these known literals.
- A tracked-source test prevents reintroduction into runtime/application source.
  This targeted media check is not a comprehensive credential audit.

Authoring is already disabled in this distribution. No replacement provider
account, credentialed backend, hosting service, or frontend environment secret
was introduced. A build-time environment variable would not hide a value in
public JavaScript.

## Verification

- Node 24.22.1: all 240 tests passed, including ten new media regressions.
- The real publication script assembled all eight viewers from existing build
  inputs without modifying shared build or preview directories.
- An independent byte scan, using GitHub alert values held only in memory and
  the prior Unsplash default, found zero exact matches across 2,657 assembled
  files. A fresh checksum-verified Cascade release also had zero matches across
  329 files. These scans did not use the sanitizer's matching implementation.
- After refreshing all five affected runtimes and supplying landing assets,
  independent final scans found zero matches across 3,154 fixture files and
  2,334 fresh-build files.
- Actual source and fresh release Cascade video methods passed at desktop and
  mobile widths: empty keys, public thumbnail, embed and printable link, and no
  credentialed request. Unused image-layout children were isolated in this
  component test; it was not full native video-page rendering.
- Existing print security and formatting assertions passed at both widths with
  no page errors or external requests. The mobile formatting screenshot was
  inspected.
- All 34 native browser cases passed: ten desktop/mobile story-loading and
  owner-control cases across the five affected viewers, and 24 authentication
  cases across all eight viewers. There were no native page exceptions. Inspected
  Map Tour mobile and Series desktop screenshots showed rendered maps and controls.
  The run recorded 190 non-page error entries, including failed external
  resources and intentionally blocked non-GET requests; none targeted Flickr,
  YouTube Data API or Unsplash API paths. This is not complete media availability
  certification, nor authenticated private-story rendering acceptance.

The first native fixture run passed only eight cookie-only cases: it skipped
the landing-assets stage, leaving a required sign-in dependency absent, and
used older runtime bundles. Supplying the current assets immediately passed
all three Map Tour authentication cases. Fresh builds then passed the same
34-case suite. The initial failed fixture is not acceptance evidence.

## Remaining Exposure

This is current-source and future-build remediation, not credential revocation.
The upstream key owners must determine whether to revoke or rotate the exposed
credentials. Do not resolve alerts as revoked without provider evidence.

Git history, other branches/clones, upstream releases and the existing production
deployment can still contain the values. No history rewrite, force push, alert
resolution, production deployment, ArcGIS content write or owner-session access
was performed. The existing no-history-rewrite decision remains in force.
Publication requires separate owner approval and the repository's release gates.

References:

- [GitHub sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Google API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
