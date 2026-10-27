# Dependency Security Review

Reviewed on 2026-10-27 against baseline
`39d824d2a7d6a7fe988cd5ed524be977e9d73af7`, using Node 24.22.1 and npm 11.20.0.
Four targeted Dependabot fixes were consolidated without the generated v3
lockfiles or unrelated major toolchain upgrades. This is not a clean security
audit or certification of the legacy source builds.

## PR Disposition

| PR | Scope | Disposition |
| --- | --- | --- |
| [#11](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/11) | Cascade form-data/Less | Incorporated: Less 3.13.1 removes the form-data dependency. |
| [#13](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/13) | Cascade qs/Less | Incorporated with #11: qs 6.17.0 and Less 3.13.1. |
| [#22](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/22) | Crowdsource JSON validation | Incorporated: is-my-json-valid 2.20.6 and jsonpointer 5.0.1. |
| [#23](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/23) | Crowdsource Handlebars | Incorporated with #22: Handlebars 4.7.10. |
| [#14](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/14) | Cascade tmp/ESLint | Not incorporated: ESLint 10 removes CLIEngine, which grunt-eslint 18 still requires. |
| [#20](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/20) | Grouped major upgrades | Not incorporated: coordinated lint/compiler configuration migration is required. |
| [#21](https://github.com/davidasbury/classic-storymaps-viewer-pages/pull/21) | Overlapping grouped upgrades | Not incorporated for the same reason as #20; do not merge both overlapping lockfile replacements. |

Pinned reviewed heads, in PR-number order:

```text
11 d8ac82b7ad135fd9e48909925a1eb2f65d14bec0
13 982c1734456e2c497f68d319526caa2c0715998b
14 a2c48002c08e0d9623b1c0ae4de9fec955774f61
20 089809d057a3168c6dc3895faff4fa223f92dcee
21 af0e140b6f95167f1ba6de289b985dcad93f6c3f
22 75ff269615910e7f8b14aaa3f2c3f457b77e43e9
23 f21c85cf1a681fbe075076c472e90a0cbd9bcf90
```

## Installation and Compatibility

- Both consolidated packages passed ordinary `npm ci --ignore-scripts --no-audit --no-fund`
  from their package directories, without a legacy peer override.
- The original Cascade v1 lockfile also installed. All five reviewed Cascade PR
  lockfiles failed ordinary installation with the old grunt-execute peer range
  `grunt ~0.4.1`. Retaining v1 avoids introducing that resolution regression.
- Lockfile generation used targeted `npm update` commands with
  `--package-lock-only --lockfile-version=1 --legacy-peer-deps --ignore-scripts`.
  The generation-only peer flag was not made a repository or user npm setting.
- Compared with baseline, Cascade changed only the existing Less and qs
  versions and their dependency closure. Crowdsource changed Handlebars,
  is-my-json-valid, jsonpointer, minimist and Handlebars' source-map dependency,
  with supporting additions/removals. No compiler or linter major was upgraded.
- Existing ESLint and Babel tasks passed for both runtime candidates and the
  untouched baseline. Their 193 Cascade and 144 Crowdsource generated
  JavaScript files were byte-identical.
- Handlebars rendering/escaping, JSON pointer read/write and JSON schema
  valid/invalid cases passed with the installed updated packages.
- Of 103 actual Cascade stylesheets compared with both Less versions, 48
  produced byte-identical CSS. The other 55 failed with both versions and remain
  unverified; no baseline-successful stylesheet failed or changed output.

## Runtime Preservation and Limits

The actual runtime staging scripts ran in separate baseline and candidate
checkouts. Both selected the checksum-verified official releases:
Cascade 1.23.0 and Crowdsource 0.10.0. SHA-256 inventories matched for every
emitted file: 329 Cascade files and 115 Crowdsource files. This establishes
unchanged deployable artifacts for this dependency-only update, not a new native
browser acceptance run or remediation of dependencies inside release bundles.

Cascade's full source build, without `--force` or release fallback, failed in
both checkouts at the missing calcite-bootstrap CSS asset. Crowdsource's
unchanged node-sass 4.8.3 cannot load on the tested Node/macOS arm64 environment.
The passing lint/Babel tasks do not certify either full source build.

For #14, the existing ESLint CLIEngine/config initialization passed on baseline
and failed with `TypeError: eslint.CLIEngine is not a constructor` on the PR.
For #20/#21, a diagnostic grunt-eslint task failed with
`chalk.magenta is not a function`. Their unchanged Gruntfiles also still use
the old `configFile` option and Babel 5 `modules` options, and do not supply the
Sass implementation expected by the new plugin. Green Pages checks can fall
back to releases and do not establish compatibility of those toolchains.

## Remaining Security Work

Independent `npm audit --json --package-lock-only` results reported vulnerable
package entries changing from 85 to 77 in Cascade and 203 to 156 in Crowdsource.
These are npm's dependency-tree counts, not distinct CVEs or GitHub alert counts.
The targeted advisories disappeared: Less/qs/form-data in Cascade and
Handlebars/is-my-json-valid/jsonpointer in Crowdsource.

Many advisories remain, including critical ones. Cascade still has old JSON
validation dependencies; Crowdsource still has old qs/form-data chains. Neither
the source dependency trees nor the shipped release bundles are declared free
of vulnerabilities. The grouped PRs require a deliberate legacy build-toolchain
migration with updated configuration, source-build acceptance and native viewer
regressions before integration. Do not disable peer checks globally, use
`npm audit fix --force`, or infer browser exposure solely from build-tool audits.

## Regression Check

```sh
node --test scripts/tests/dependency-security.test.mjs
node --test scripts/tests/*.test.mjs
```

The three focused tests guard the combined fixed versions, compatible lockfile
format and current lint/compiler majors. Update those guards only with evidence
for a coordinated toolchain migration. All 243 Node tests passed in the shared
checkout and an independently reconstructed exact staged tree, including the
separately committed media-security work in the parent. Lifecycle scripts, deployments, ArcGIS
writes and owner browser sessions were not used for this review.
