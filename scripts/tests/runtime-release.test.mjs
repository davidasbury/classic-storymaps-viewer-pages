import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const repo = fileURLToPath(new URL('../../', import.meta.url));

test('Basic build replaces social glyphs with licensed Font Awesome without changing upstream', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-basic-font-'));
  const sourceCss = path.join(repo, 'runtimes/basic/upstream/css/main.css');
  const originalCss = readFileSync(sourceCss);
  try {
    const result = spawnSync('bash', ['scripts/build-basic-runtime.sh'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, OUTPUT_PATH: temporary, BASIC_DEFAULT_APPID: '' }
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const css = readFileSync(path.join(temporary, 'css/main.css'), 'utf8');
    assert.match(css, /font-family: 'FontAwesome'/);
    assert.doesNotMatch(css, /font-family:\s*["']social["']|font\/social\./);
    assert.ok(css.includes('.toggle-icon {\n  font-family: "FontAwesome";'));
    for (const [name, code] of [['facebook', 'f082'], ['twitter', 'f099'], ['link', 'f0c1'], ['up', 'f077'], ['down', 'f078']]) {
      assert.ok(css.includes(`.icon-${name}:before {\n  content: "\\${code}";`), name);
    }
    for (const extension of ['eot', 'svg', 'ttf', 'woff']) {
      assert.equal(existsSync(path.join(temporary, `font/social.${extension}`)), false);
      assert.deepEqual(readFileSync(path.join(temporary, `font/fontawesome-webfont.${extension}`)),
        readFileSync(path.join(repo, `runtimes/maptour/upstream/MapTour/src/resources/icons/font-awesome-4.7.0/fonts/fontawesome-webfont.${extension}`)));
    }
    assert.deepEqual(readFileSync(sourceCss), originalCss);
    const { replaceBasicSocialFont } = await import('../../runtimes/basic/patches/social-font.mjs');
    replaceBasicSocialFont(temporary);
    assert.equal(readFileSync(path.join(temporary, 'css/main.css'), 'utf8'), css);
    writeFileSync(path.join(temporary, 'css/main.css'), css.replace('"\\f078"', '"\\ffff"'));
    assert.throws(() => replaceBasicSocialFont(temporary), /Unrecognized Basic social font CSS/);
    writeFileSync(path.join(temporary, 'css/main.css'), css);
    assert.throws(() => replaceBasicSocialFont(path.join(repo, 'runtimes/basic/upstream')), /Cannot patch Basic upstream/);
    const { stageRuntimeNotices } = await import('../stage-runtime-notices.mjs');
    stageRuntimeNotices('basic', temporary);
    assert.match(readFileSync(path.join(temporary, 'notices/supplemental/OFL-1.1.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
    assert.match(readFileSync(path.join(temporary, 'notices/supplemental/FontAwesome-4.7.0-attribution.txt'), 'utf8'), /Copyright.*Dave Gandy.*2016/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('runtime publishing preserves root, font and editor license documents verbatim', async () => {
  const { stageRuntimeNotices } = await import('../stage-runtime-notices.mjs');
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-runtime-notices-'));
  try {
    for (const runtime of ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic']) {
      const output = path.join(temporary, runtime);
      mkdirSync(output);
      writeFileSync(path.join(output, 'index.html'), '<html><head></head><body></body></html>');
      const retiredFonts = ['icomoon', 'fontelloIcons'].flatMap(family => ['eot', 'svg', 'ttf', 'woff'].map(extension => `resources/tpl/viewer/font/font/${family}.${extension}`));
      if (runtime === 'shortlist') {
        for (const filename of retiredFonts) {
          mkdirSync(path.dirname(path.join(output, filename)), { recursive: true });
          writeFileSync(path.join(output, filename), 'stale build asset');
        }
      }
      const notices = stageRuntimeNotices(runtime, output);
      assert.ok(notices.length > 0);
      assert.ok(existsSync(path.join(output, 'LICENSE.txt')));
      const manifest = JSON.parse(readFileSync(path.join(output, 'notices/manifest.json'), 'utf8'));
      assert.equal(manifest.runtime, runtime);
      assert.deepEqual(manifest.documents, notices);
      assert.equal(new Set(notices).size, notices.length);
      const noticeIndex = readFileSync(path.join(output, 'notices/index.html'), 'utf8');
      assert.match(noticeIndex, /<p>Powered by <a href="https:\/\/www\.esri\.com\/">Esri<\/a>\.<\/p>/);
      for (const document of notices) {
        assert.ok(existsSync(path.join(output, 'notices', document)), document);
        assert.ok(noticeIndex.includes(`href="${document}"`), document);
      }
      const rootLicense = notices.find(document => /^upstream\/license[^/]*$/i.test(document));
      assert.ok(rootLicense);
      assert.deepEqual(readFileSync(path.join(output, 'LICENSE.txt')), readFileSync(path.join(repo, 'runtimes', runtime, rootLicense)));
      for (const document of notices.filter(filename => filename.startsWith('upstream/'))) {
        assert.deepEqual(readFileSync(path.join(output, 'notices', document)), readFileSync(path.join(repo, 'runtimes', runtime, document)));
      }
      if (['mapjournal', 'mapseries'].includes(runtime)) assert.ok(notices.includes('upstream/src/lib-app/ckeditor/LICENSE.md'));
      assert.match(readFileSync(path.join(output, 'notices/supplemental/OFL-1.1.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
      if (runtime === 'shortlist') {
        for (const filename of retiredFonts) assert.equal(existsSync(path.join(output, filename)), false);
        assert.ok(notices.includes('supplemental/Ionicons-2.0.1-LICENSE.txt'));
        assert.deepEqual(readFileSync(path.join(output, 'notices/supplemental/Ionicons-2.0.1-LICENSE.txt')), readFileSync(path.join(repo, 'docs/licenses/ionicons-2.0.1-LICENSE.txt')));
        assert.match(readFileSync(path.join(output, 'notices/supplemental/Ionicons-2.0.1-LICENSE.txt'), 'utf8'), /Copyright \(c\) 2014 Drifty/);
        assert.match(readFileSync(path.join(output, 'notices/supplemental/Ionicons-attribution.txt'), 'utf8'), /Google.*CC BY 4\.0/);
      }
      if (['mapjournal', 'mapseries'].includes(runtime)) {
        assert.match(readFileSync(path.join(output, 'resources/lib/ckeditor/legal.txt'), 'utf8'), /6c70c820595044f78fb39ee72410b806164fe448/);
        assert.deepEqual(readFileSync(path.join(output, 'resources/lib/ckeditor/LICENSE.md')), readFileSync(path.join(repo, 'runtimes', runtime, 'upstream/src/lib-app/ckeditor/LICENSE.md')));
        assert.deepEqual(readFileSync(path.join(output, 'notices/supplemental/bundled-editor-source/src/lib-app/ckeditor/ckeditor.js.txt')), readFileSync(path.join(repo, 'runtimes', runtime, 'upstream/src/lib-app/ckeditor/ckeditor.js')));
      }
      assert.equal(stageRuntimeNotices(runtime, output).length, notices.length);
      assert.equal(readFileSync(path.join(output, 'index.html'), 'utf8').split('rel="license"').length - 1, 1);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('runtime notice CLI stages documents when invoked through a linked directory', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-notice-cli-'));
  try {
    const linkedScripts = path.join(temporary, 'scripts');
    symlinkSync(path.join(repo, 'scripts'), linkedScripts, 'junction');
    const output = path.join(temporary, 'output');
    mkdirSync(output);
    writeFileSync(path.join(output, 'index.html'), '<html><head></head><body></body></html>');
    const result = spawnSync(process.execPath, [path.join(linkedScripts, 'stage-runtime-notices.mjs'), 'basic', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /basic: \d+ upstream notice documents preserved/);
    assert.ok(existsSync(path.join(output, 'LICENSE.txt')));
    assert.equal(JSON.parse(readFileSync(path.join(output, 'notices/manifest.json'), 'utf8')).runtime, 'basic');
    assert.match(readFileSync(path.join(output, 'index.html'), 'utf8'), /rel="license" href="notices\/index.html"/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Map Journal staged embedded routes preserve deployment base and Swipe parameters', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-journal-embedded-'));
  const sourcePath = 'app/storymaps/tpl/ui/MainStage.js';
  const source = readFileSync(path.join(repo, 'runtimes/mapjournal/upstream/src', sourcePath), 'utf8');
  const normalizer = source.slice(source.indexOf('function normalizeLegacyStorytellingSwipeUrl('), source.indexOf('function normalizeSecureArcGisEmbedUrl('));
  const minified = 'function getBasePath(){var marker="/templates/classic-storymaps",pathname=String(window.location.pathname||"").toLowerCase(),index=pathname.indexOf(marker);return index>=0?(window.location.pathname.substring(0,index)+marker).replace(/\\/+$/,""):marker}';
  try {
    mkdirSync(path.dirname(path.join(temporary, sourcePath)), { recursive: true });
    writeFileSync(path.join(temporary, sourcePath), normalizer);
    for (const filename of ['viewer-min.js', 'builder-min.js']) writeFileSync(path.join(temporary, 'app', filename), minified);
    const patch = () => spawnSync('node', [path.join(repo, 'runtimes/mapjournal/patches/embedded-base-path.mjs'), temporary], { encoding: 'utf8' });
    const result = patch();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const patchedSource = readFileSync(path.join(temporary, sourcePath), 'utf8');
    for (const [pathname, expected] of [
      ['/classic-storymaps-viewer-pages/viewers/mapjournal/index.html', '/classic-storymaps-viewer-pages/viewers'],
      ['/viewers/mapjournal/', '/viewers'],
      ['/nested/site/viewers/mapjournal/index.html', '/nested/site/viewers'],
      ['/prefix/templates/classic-storymaps/mapjournal/', '/prefix/templates/classic-storymaps'],
      ['/templates/classic-storymaps/mapjournal/', '/templates/classic-storymaps']
    ]) {
      const window = { URL, location: { pathname, origin: 'https://example.org', hostname: 'example.org' } };
      for (const filename of ['viewer-min.js', 'builder-min.js']) {
        const bundle = readFileSync(path.join(temporary, 'app', filename), 'utf8');
        assert.equal(vm.runInNewContext(bundle + ';getBasePath()', { window }), expected);
      }
      const normalize = vm.runInNewContext(patchedSource + ';normalizeLegacyStorytellingSwipeUrl', {
        window, $: { each: (items, callback) => { for (const [index, item] of items.entries()) if (callback(index, item) === false) break; } }
      });
      for (const itemId of ['6b58de911fa44d309431d8b3cf7bba6c', 'd96143b7a084446ebb0417a111c38016']) {
        const suffix = '?appid=' + itemId + '&embed&classicEmbedMode#section';
        assert.equal(normalize('https://story.maps.arcgis.com/apps/StorytellingSwipe/index.html' + suffix), 'https://example.org' + expected + '/swipe/index.html' + suffix);
        assert.equal(normalize('https://example.org/templates/classic-storymaps/swipe/index.html' + suffix), 'https://example.org' + expected + '/swipe/index.html' + suffix);
      }
      assert.equal(normalize('https://example.org/unrelated'), 'https://example.org/unrelated');
    }
    assert.notEqual(patch().status, 0, 'Repeated patch must fail closed');
    const build = readFileSync(path.join(repo, 'scripts/build-mapjournal-runtime.sh'), 'utf8');
    assert.match(build, /node .*patches\/embedded-base-path\.mjs.*"\$OUTPUT_PATH"/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Map Series staged embedded routes respect viewer and legacy deployment bases', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-series-embedded-'));
  const original = 'function getBasePath(){var marker="/templates/classic-storymaps",pathname=String(window.location.pathname||"").toLowerCase(),index=pathname.indexOf(marker);return index>=0?(window.location.pathname.substring(0,index)+marker).replace(/\\/+$/,""):marker}';
  try {
    mkdirSync(path.join(temporary, 'app'));
    writeFileSync(path.join(temporary, 'BUILD_SOURCE'), 'grunt\n');
    for (const filename of ['viewer-min.js', 'builder-min.js']) writeFileSync(path.join(temporary, 'app', filename), original);
    const patch = () => spawnSync('node', [path.join(repo, 'runtimes/mapseries/patches/embedded-base-path.mjs'), temporary], { encoding: 'utf8' });
    const result = patch();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const filename of ['viewer-min.js', 'builder-min.js']) {
      const bundle = readFileSync(path.join(temporary, 'app', filename), 'utf8');
      for (const [pathname, expected] of [
        ['/classic-storymaps-viewer-pages/viewers/mapseries/index.html', '/classic-storymaps-viewer-pages/viewers'],
        ['/viewers/mapseries/', '/viewers'],
        ['/nested/site/viewers/mapseries/index.html', '/nested/site/viewers'],
        ['/prefix/templates/classic-storymaps/mapseries/', '/prefix/templates/classic-storymaps'],
        ['/templates/classic-storymaps/mapseries/', '/templates/classic-storymaps'],
        ['/elsewhere/mapseries/', '/templates/classic-storymaps']
      ]) {
        assert.equal(vm.runInNewContext(bundle + ';getBasePath()', { window: { location: { pathname } } }), expected);
      }
    }
    assert.notEqual(patch().status, 0, 'Repeated Grunt patch must fail closed');
    writeFileSync(path.join(temporary, 'BUILD_SOURCE'), 'release:test\n');
    writeFileSync(path.join(temporary, 'app/viewer-min.js'), 'official release without custom rewriter');
    assert.equal(patch().status, 0, 'Official release has no custom legacy-base function to patch');
    assert.equal(readFileSync(path.join(temporary, 'app/viewer-min.js'), 'utf8'), 'official release without custom rewriter');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('official release helper rejects a wrong checksum before staging files', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-release-checksum-'));
  try {
    const archive = path.join(temporary, 'release.zip');
    writeFileSync(archive, 'corrupt release');
    const manifest = path.join(temporary, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ release: { url: pathToFileURL(archive).href, sha256: '0'.repeat(64), version: 'test' } }));
    const output = path.join(temporary, 'build');
    const result = spawnSync('bash', ['-c', 'source "$1"; stage_official_release "$2" "$3"', '--', path.join(repo, 'scripts/lib/stage-official-release.sh'), manifest, output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /FAILED|did not match/);
    assert.equal(existsSync(path.join(output, 'index.html')), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

for (const runtime of ['cascade', 'shortlist', 'mapseries']) {
  test(runtime + ' forced release preserves source configuration and records provenance', () => {
    const manifest = JSON.parse(readFileSync(path.join(repo, 'runtimes', runtime, 'runtime-manifest.json'), 'utf8'));
    assert.ok(manifest.release, 'Release provenance is required');
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-forced-release-'));
    try {
      const output = path.join(temporary, 'build');
      const result = spawnSync('bash', ['scripts/build-' + runtime + '-runtime.sh'], {
        cwd: repo, encoding: 'utf8', env: { ...process.env, CLASSIC_RUNTIME_SOURCE: 'release', OUTPUT_PATH: output }
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(readFileSync(path.join(output, 'BUILD_SOURCE'), 'utf8').trim(), 'release:' + manifest.release.version);
      for (const filename of ['index.html', 'app/viewer-min.js', 'app/main-config.js']) assert.ok(existsSync(path.join(output, filename)));
      assert.equal(existsSync(path.join(output, '__MACOSX')), false);
      const source = readFileSync(path.join(repo, 'runtimes', runtime, 'upstream/src/index.html'), 'utf8');
      const html = readFileSync(path.join(output, 'index.html'), 'utf8');
      for (const expression of [/\bappid:\s*("[^"]*")/, /\bauthorizedOwners:\s*(\[[^\]]*\])/]) {
        assert.deepEqual(JSON.parse(html.match(expression)[1]), JSON.parse(source.match(expression)[1]));
      }
      const bundle = readFileSync(path.join(output, 'app/viewer-min.js'), 'utf8');
      if (runtime === 'shortlist') {
        const gateName = bundle.match(/hasSwitchBuilderButton:([\w$]+)/)?.[1];
        assert.ok(gateName, 'Shortlist edit-button eligibility must be identifiable');
        const gates = [...bundle.matchAll(new RegExp('function ' + gateName.replace(/\$/g, '\\$') + '\\(\\)\\{([^{}]*)\\}', 'g'))];
        const gate = gates.find(candidate => candidate[1].includes('app.userCanEdit') || candidate[1] === 'return false;');
        assert.ok(gate, 'Shortlist edit-button eligibility function must be present');
        assert.doesNotMatch(gate[1], /app\.userCanEdit/, 'Ownership must not enable Edit in the local viewer');
        for (const userCanEdit of [true, false]) {
          const eligible = vm.runInNewContext('(' + gate[0] + ')', { app: { userCanEdit, isInBuilder: false } });
          assert.equal(eligible(), false);
        }
        const switchFunction = bundle.match(/switchToBuilder:(function\(\)\{[^{}]*\}),isArcGISHosted/);
        assert.ok(switchFunction, 'Builder transition helper must be identifiable');
        const switchToBuilder = vm.runInNewContext('(' + switchFunction[1] + ')', {
          document: { get location() { throw new Error('Viewer-only helper must not access navigation'); } }
        });
        assert.equal(switchToBuilder(), false);
      }
      const start = bundle.indexOf('getAppID:function');
      const end = bundle.indexOf('},get', start);
      assert.ok(start >= 0 && end > start);
      const defaultId = JSON.parse(source.match(/\bappid:\s*("[^"]*")/)[1]);
      const context = vm.createContext({ app: { indexCfg: { appid: defaultId, authorizedOwners: ['*'] } } });
      const getAppID = vm.runInContext('(' + bundle.slice(start + 'getAppID:'.length, end + 1) + ')', context);
      const selectedId = 'ABCDEF0123456789abcdef0123456789';
      for (const candidate of [selectedId, undefined, '', 'bad-id', 'a'.repeat(31), 'g'.repeat(32)]) {
        const selected = getAppID.call({ getUrlParams: () => ({ appid: candidate }), isArcGISHosted: () => false }, true);
        assert.equal(selected, candidate === selectedId ? selectedId : defaultId, runtime + ': URL/default ID precedence');
      }
      for (const patch of manifest.patches || []) {
        assert.equal(bundle.split(patch.find).length - 1, 0);
        assert.equal(bundle.split(patch.replace).length - 1, 1);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test(runtime + ' fails when Grunt and the verified release both fail', () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-release-failure-'));
    try {
      const upstream = path.join(temporary, 'upstream');
      mkdirSync(path.join(upstream, 'src'), { recursive: true });
      writeFileSync(path.join(upstream, 'src/index.html'), '<html>raw source</html>');
      const commands = path.join(temporary, 'bin');
      mkdirSync(commands);
      writeFileSync(path.join(commands, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      const archive = path.join(temporary, 'bad.zip');
      writeFileSync(archive, 'corrupt release');
      const manifest = path.join(temporary, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({ release: { url: pathToFileURL(archive).href, sha256: '0'.repeat(64), version: 'test' } }));
      const result = spawnSync('bash', ['scripts/build-' + runtime + '-runtime.sh'], {
        cwd: repo, encoding: 'utf8', env: { ...process.env, CLASSIC_RUNTIME_SOURCE: 'auto', RUNTIME_PATH: upstream, OUTPUT_PATH: path.join(temporary, 'build'), MANIFEST_PATH: manifest, PATH: commands + path.delimiter + process.env.PATH }
      });
      assert.notEqual(result.status, 0, runtime + ' must not succeed with raw source or cached history');
      assert.match(result.stdout + result.stderr, /FAILED|did not match/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}

test('Crowdsource release patches are exact, view-only, and published with one builder guard', () => {
  const manifestPath = path.join(repo, 'runtimes/crowdsource/runtime-manifest.json');
  assert.ok(existsSync(manifestPath), 'Crowdsource must declare its verified release and patches');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-crowdsource-release-'));
  const output = path.join(temporary, 'runtimes/crowdsource/build');
  try {
    const build = spawnSync('bash', ['scripts/build-crowdsource-runtime.sh'], {
      cwd: repo, env: { ...process.env, OUTPUT_PATH: output }, encoding: 'utf8'
    });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    for (const patch of manifest.patches) {
      const content = readFileSync(path.join(output, patch.file), 'utf8');
      assert.equal(content.split(patch.find).length - 1, 0, patch.name + ': original removed');
      assert.equal(content.split(patch.replace).length - 1, 1, patch.name + ': replacement occurs once');
    }
    for (const filename of manifest.removeFiles) assert.equal(existsSync(path.join(output, filename)), false);
    assert.equal(readFileSync(path.join(output, 'BUILD_SOURCE'), 'utf8').trim(), 'release:0.10.0');
    const repeat = spawnSync('node', ['scripts/patch-runtime-release.mjs', manifestPath, output], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(repeat.status, 0, 'Missing original targets must stop the patch step');
    assert.match(repeat.stderr, /exactly once/);
    for (const runtime of ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'basic']) {
      const buildPath = path.join(temporary, 'runtimes', runtime, 'build');
      mkdirSync(buildPath, { recursive: true });
      writeFileSync(path.join(buildPath, 'index.html'), '<!doctype html>\n<html>\n<head>\n</head><body></body></html>');
      if (runtime === 'basic') {
        writeFileSync(path.join(buildPath, 'index.html'), '<!doctype html>\n<html>\n<head>\n</head><body><script>require([], function() {});</script></body></html>');
      } else {
        mkdirSync(path.join(buildPath, 'app'), { recursive: true });
        writeFileSync(path.join(buildPath, 'app/main-app.js'), 'require([], function() {});');
      }
    }
    const publish = spawnSync('bash', [path.join(repo, 'scripts/build-classic-storymaps-runtime-publish.sh')], {
      cwd: temporary, env: { ...process.env, PUBLISH_ROOT: path.join(temporary, 'publish/viewers') }, encoding: 'utf8'
    });
    assert.equal(publish.status, 0, publish.stdout + publish.stderr);
    const html = readFileSync(path.join(temporary, 'publish/viewers/crowdsource/index.html'), 'utf8');
    assert.equal(html.split('classicstorymaps-builder-guard').length - 1, 1);
    assert.doesNotMatch(html, /<%/);
    for (const filename of manifest.removeFiles) assert.equal(existsSync(path.join(temporary, 'publish/viewers/crowdsource', filename)), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
