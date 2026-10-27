import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function lockfile(runtime) {
  return JSON.parse(readFileSync(new URL(`../../runtimes/${runtime}/upstream/package-lock.json`, import.meta.url), 'utf8'));
}

function versions(dependencies, name) {
  return Object.entries(dependencies || {}).flatMap(([dependency, entry]) => [
    ...(dependency === name ? [entry.version] : []),
    ...versions(entry.dependencies, name)
  ]);
}

function assertFixed(lock, name, minimum) {
  const installed = versions(lock.dependencies, name);
  assert.ok(installed.length, `${name} must remain covered by the lockfile`);
  const [minimumMajor, minimumMinor, minimumPatch] = minimum.split('.').map(Number);
  for (const version of installed) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    const [major, minor, patch] = version.split('.').map(Number);
    assert.equal(major, minimumMajor, `${name} major upgrades require compatibility review`);
    assert.ok(minor > minimumMinor || (minor === minimumMinor && patch >= minimumPatch), `${name}@${version} is below ${minimum}`);
  }
}

test('Cascade retains installable legacy lock metadata and targeted security fixes', () => {
  const lock = lockfile('cascade');
  assert.equal(lock.lockfileVersion, 1);
  assertFixed(lock, 'less', '3.13.1');
  assertFixed(lock, 'qs', '6.17.0');
  assert.deepEqual(versions(lock.dependencies, 'form-data'), []);
});

test('Crowdsource combines the Handlebars and JSON validation fixes', () => {
  const lock = lockfile('crowdsource');
  assert.equal(lock.lockfileVersion, 1);
  assertFixed(lock, 'handlebars', '4.7.10');
  assertFixed(lock, 'is-my-json-valid', '2.20.6');
  assertFixed(lock, 'jsonpointer', '5.0.1');
});

test('legacy compiler and lint majors remain pinned until their configurations migrate', () => {
  for (const [runtime, expected] of [
    ['cascade', { eslint: 4, 'grunt-eslint': 18, 'grunt-babel': 6 }],
    ['crowdsource', { eslint: 1, 'grunt-eslint': 17, 'grunt-babel': 5, 'grunt-sass': 2 }]
  ]) {
    const lock = lockfile(runtime);
    for (const [name, major] of Object.entries(expected)) {
      assert.equal(Number(lock.dependencies[name].version.split('.')[0]), major, `${runtime}: ${name} requires a coordinated toolchain migration`);
    }
  }
});