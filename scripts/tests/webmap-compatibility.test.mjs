import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = new URL('../../runtimes/maptour/upstream/MapTour/src/app/storymaps/utils/WebMapCompatibility.js', import.meta.url);
let compatibility;
vm.runInNewContext(readFileSync(source, 'utf8'), { window: { URL, Promise }, setTimeout, clearTimeout, define: (dependencies, factory) => { compatibility = factory(); } });
const plain = value => JSON.parse(JSON.stringify(value));
const feature = 'https://services.arcgis.com/example/arcgis/rest/services/Tour/FeatureServer/0';
const oceanBase = 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer';
const oceanReference = 'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer';
const tileInfo = { rows: 256, cols: 256, dpi: 96, spatialReference: { wkid: 102100, latestWkid: 3857 }, origin: { x: -20037508, y: 20037508 }, lods: [{ level: 0, resolution: 156543 }] };
const evidence = { [feature]: { ok: true, data: { type: 'Feature Layer' } }, [oceanBase]: { ok: true, data: { singleFusedMapCache: true, tileInfo } }, [oceanReference]: { ok: true, data: { singleFusedMapCache: true, tileInfo } } };
function fixture() {
  return { item: { id: '6b1e4f428ffa411b96b0e49d214ed17f' }, itemData: { version: '1.9', operationalLayers: [{ id: 'tour', url: feature.replace('https:', 'http:') }], baseMap: { baseMapLayers: [{ id: 'ocean', url: 'http://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer', opacity: 0.7, visibility: false, baseMapLayer: true }] } } };
}

test('repairs legacy Ocean and types in a clone, preserving settings and adding reference once', () => {
  const original = fixture();
  const baseline = structuredClone(original);
  const result = compatibility.normalize(original, evidence);
  assert.deepEqual(original, baseline);
  assert.equal(result.itemInfo.itemData.version, '2.0');
  assert.equal(result.itemInfo.itemData.operationalLayers[0].layerType, 'ArcGISFeatureLayer');
  assert.equal(result.itemInfo.itemData.operationalLayers[0].url, feature);
  const layers = result.itemInfo.itemData.baseMap.baseMapLayers;
  assert.equal(layers[0].baseMapLayer, true);
  assert.equal(layers[0].url, oceanBase);
  assert.equal(layers[1].url, oceanReference);
  assert.equal(layers[1].isReference, true);
  assert.equal(layers[1].visibility, false);
  assert.equal(layers[1].opacity, 0.7);
  assert.deepEqual(plain(result.issues), []);
  assert.deepEqual(plain(compatibility.normalize(result.itemInfo, evidence).itemInfo), plain(result.itemInfo));
});

test('requests both Ocean targets before scheme normalization and accepts the HTTPS source variant', () => {
  const input = fixture();
  input.itemData.baseMap.baseMapLayers[0].url = input.itemData.baseMap.baseMapLayers[0].url.replace('http:', 'https:');
  assert.ok(compatibility.requests(input).includes(oceanBase));
  assert.ok(compatibility.requests(input).includes(oceanReference));
  assert.equal(compatibility.normalize(input, evidence).itemInfo.itemData.baseMap.baseMapLayers.length, 2);
});

test('rejects unknown basemap settings and incompatible target tiling without losing source layers', () => {
  const input = fixture();
  input.itemData.baseMap.baseMapLayers[0].minScale = 1000;
  const rejected = compatibility.normalize(input, evidence);
  assert.equal(rejected.itemInfo.itemData.baseMap.baseMapLayers.length, 1);
  assert.equal(rejected.itemInfo.itemData.version, '1.9');
  assert.ok(rejected.issues.some(issue => issue.code === 'basemap_structure'));
  const mismatched = structuredClone(evidence);
  mismatched[oceanReference].data.tileInfo = { ...mismatched[oceanReference].data.tileInfo, rows: 512 };
  assert.ok(compatibility.normalize(fixture(), mismatched).issues.some(issue => issue.code === 'basemap_unverified'));
});

test('URL upgrading preserves markup, parameters and fragments and rejects unsafe evidence', () => {
  const input = fixture();
  input.itemData.description = '<img src="http://example.org/image.png?a=1&amp;b=2#view">';
  const proof = { ...evidence, 'https://example.org/image.png?a=1&b=2#view': { ok: true } };
  assert.equal(compatibility.normalize(input, proof).itemInfo.itemData.description, '<img src="https://example.org/image.png?a=1&amp;b=2#view">');
  for (const unsafe of ['http://name:secret@example.org/map', 'http://example.org:8080/map', 'http://example.org/map?token=secret', 'http://example.org/?url=http://other.org']) assert.equal(compatibility.secureURL(unsafe), null);
  assert.equal(compatibility.normalize(input, evidence).itemInfo.itemData.description, input.itemData.description);
});

test('unknown nested structures block version promotion but not independent HTTPS repairs', () => {
  const input = fixture();
  input.itemData.operationalLayers[0].layers = [{ id: 1 }];
  const result = compatibility.normalize(input, evidence);
  assert.equal(result.itemInfo.itemData.version, '1.9');
  assert.equal(result.itemInfo.itemData.operationalLayers[0].url, feature);
  assert.ok(result.issues.some(issue => issue.code === 'layer_structure'));
});

test('modern maps still receive Light Gray HTTPS repairs without adding a reference layer', () => {
  const input = fixture();
  const lightGray = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer';
  input.itemData.version = '2.34';
  input.itemData.baseMap.baseMapLayers[0].url = lightGray.replace('https:', 'http:');
  const result = compatibility.normalize(input, { ...evidence, [lightGray]: evidence[oceanBase] });
  assert.equal(result.itemInfo.itemData.version, '2.34');
  assert.equal(result.itemInfo.itemData.baseMap.baseMapLayers.length, 1);
  assert.equal(result.itemInfo.itemData.baseMap.baseMapLayers[0].url, lightGray);
});

test('bounded probes deduplicate requests, tolerate failures and cancel timeouts', async () => {
  const input = fixture();
  input.itemData.extra = input.itemData.operationalLayers[0].url;
  const seen = [];
  const result = await compatibility.prepare(input, url => {
    seen.push(url);
    return Promise.resolve(evidence[url] || { ok: false });
  });
  assert.equal(new Set(seen).size, seen.length);
  assert.equal(result.itemInfo.itemData.version, '2.0');
  let cancelled = 0;
  const failed = await compatibility.prepare(input, () => {
    const request = new Promise(() => {});
    request.cancel = () => { cancelled++; };
    return request;
  }, { timeout: 5, budget: 20 });
  assert.ok(cancelled > 0);
  assert.equal(failed.itemInfo.itemData.version, '1.9');
});

test('malformed structure and incomplete metadata remain unresolved without throwing', () => {
  const input = fixture();
  input.itemData.baseMap.baseMapLayers = {};
  assert.equal(compatibility.normalize(input, {}).itemInfo.itemData.version, '1.9');
  const incomplete = { ...evidence, [oceanBase]: { ok: true, data: { singleFusedMapCache: true, tileInfo: {} } } };
  assert.ok(compatibility.normalize(fixture(), incomplete).issues.some(issue => issue.code === 'basemap_unverified'));
  assert.equal(compatibility.secureURL('http://example.org:80/path'), null);
  assert.equal(compatibility.secureURL('http://example.org/?url=http%3A%2F%2Fother.org'), null);
});

test('failure reasons prioritize verified access errors over repair observations', () => {
  const result = { issues: [{ code: 'layer_type' }] };
  assert.equal(compatibility.failureReason(result, { code: 403, message: 'secret' }), 'access');
  assert.equal(compatibility.failureReason(result, {}), 'layer_type');
  assert.equal(compatibility.failureReason({}, { message: 'token=secret' }), 'unknown');
});

test('service queries retain their parameters and HTTP-200 ArcGIS errors do not authorize an upgrade', () => {
  const input = fixture();
  const secure = feature + '?custom=value#fragment';
  input.itemData.operationalLayers[0].url = secure.replace('https:', 'http:');
  assert.equal(compatibility.serviceURL(secure), true);
  const rejected = compatibility.normalize(input, { ...evidence, [secure]: { ok: true, data: { error: { code: 499 } } } });
  assert.equal(rejected.itemInfo.itemData.operationalLayers[0].url, input.itemData.operationalLayers[0].url);
  const accepted = compatibility.normalize(input, { ...evidence, [secure]: evidence[feature] });
  assert.equal(accepted.itemInfo.itemData.operationalLayers[0].url, secure);
});

test('a modern typed HTTPS map is unchanged and does not need probes', () => {
  const input = plain(compatibility.normalize(fixture(), evidence).itemInfo);
  assert.deepEqual(plain(compatibility.requests(input)), []);
  const result = compatibility.normalize(input, {});
  assert.deepEqual(plain(result.itemInfo), input);
  assert.deepEqual(plain(result.issues), []);
  assert.deepEqual(plain(result.changes), []);
});

test('service repair probes take priority over a large collection of media URLs', async () => {
  const input = fixture();
  input.itemData.media = Array.from({ length: 60 }, (_, index) => 'http://example.org/' + index + '.png');
  const seen = [];
  const result = await compatibility.prepare(input, url => {
    seen.push(url);
    return Promise.resolve(evidence[url] || { ok: false });
  });
  assert.equal(seen.length, 32);
  assert.equal(result.itemInfo.itemData.version, '2.0');
  assert.ok(seen.indexOf(oceanReference) < 4);
});

function coreHarness({ authenticated = false, failPreparation = false, legacyBrowser = false } = {}) {
  const input = fixture();
  const requests = [];
  const anonymousRequests = [];
  let acceptMap;
  const created = new Promise(resolve => { acceptMap = resolve; });
  function Deferred() {
    this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.then = this.promise.then.bind(this.promise);
  }
  function DeferredList(entries) {
    return Promise.all(entries.map(entry => Promise.resolve(entry).then(value => [true, value], error => [false, error])));
  }
  const dependencies = {
    'esri/arcgis/utils': { createMap: value => { acceptMap(value); return new Promise(() => {}); } },
    'storymaps/maptour/core/WebApplicationData': { getSourceLayer: () => 'tour' },
    'dojo/has': () => false,
    'esri/IdentityManager': { findCredential: url => authenticated && url === feature ? { server: feature } : null },
    'esri/request': options => {
      requests.push(options.url);
      if (options.url.endsWith('/data')) return Promise.resolve(input.itemData);
      if (options.url === feature) return Promise.resolve(evidence[feature].data);
      return Promise.resolve(input.item);
    },
    'dojo/_base/lang': { hitch: (owner, callback) => callback, clone: value => structuredClone(value) },
    'dojo/_base/array': { forEach: (entries, callback) => entries.forEach(callback), map: (entries, callback) => entries.map(callback), filter: (entries, callback) => entries.filter(callback) },
    'dojo/Deferred': Deferred,
    'dojo/DeferredList': DeferredList,
    'esri/geometry/Extent': function() {},
    'storymaps/utils/WebMapCompatibility': failPreparation ? { ...compatibility, prepare: () => Promise.reject(new Error('synthetic failure')) } : compatibility
  };
  let core;
  vm.runInNewContext(readFileSync(new URL('../../runtimes/maptour/upstream/MapTour/src/app/storymaps/core/Core.js', import.meta.url), 'utf8'), {
    define: (names, factory) => { core = factory(...names.map(name => dependencies[name] || {})); },
    console, app: { isInBuilderMode: false, data: { getAppProxies: () => [] } },
    configOptions: { sharingurl: 'https://www.arcgis.com/sharing/rest/content/items' }, APPCFG: {},
    window: { Promise: legacyBrowser ? undefined : Promise, URL, AbortController, fetch: async (url, options) => {
      anonymousRequests.push({ url, options });
      const parsed = new URL(url);
      parsed.searchParams.delete('f');
      return { status: 200, json: async () => evidence[parsed.href]?.data || { error: { code: 404 } } };
    } },
  });
  return { core, input, requests, anonymousRequests, created };
}

test('primary-only native load uses fetched item/data and the compatible object without refetching', async () => {
  const harness = coreHarness();
  harness.core.loadWebMap(harness.input.item.id);
  const loaded = await harness.created;
  assert.equal(loaded.itemData.version, '2.0');
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.input.itemData.version, '1.9');
  assert.ok(harness.anonymousRequests.every(request => request.options.credentials === 'omit' && request.options.redirect === 'error'));
});

test('existing service credentials use the native request path, not anonymous credential forwarding', async () => {
  const harness = coreHarness({ authenticated: true });
  harness.core.loadWebMap(harness.input.item.id);
  const loaded = await harness.created;
  assert.equal(loaded.itemData.operationalLayers[0].url, feature);
  assert.ok(harness.requests.includes(feature));
  assert.equal(harness.anonymousRequests.some(request => request.url.startsWith(feature)), false);
});

test('preparation rejection preserves original data for native rendering', async () => {
  const harness = coreHarness({ failPreparation: true });
  harness.core.loadWebMap(harness.input);
  const loaded = await harness.created;
  assert.equal(loaded, harness.input);
  assert.equal(loaded.itemData.version, '1.9');
});

test('browsers without compatibility APIs retain the native map-loading path', async () => {
  const harness = coreHarness({ legacyBrowser: true });
  harness.core.loadWebMap(harness.input);
  assert.equal(await harness.created, harness.input);
  assert.equal(harness.anonymousRequests.length, 0);
});