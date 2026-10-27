import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../apps/classic-storymaps-site/assets/js/arcgis-basemap-compatibility.js', import.meta.url), 'utf8');
const root = 'https://www.arcgis.com/sharing/rest/content/items/';
const topographicId = '7dc6cea0b1764a1f9af2e679f642f0f5';
const topographicStyle = root + topographicId + '/resources/styles/root.json';
const service = 'https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer';
const oldStyle = root + 'c3351e2f481e4362976faf0dc1f238e0/resources/styles/root.json';
const metadata = { id: topographicId, owner: 'esri_vector', access: 'public', type: 'Vector Tile Service', url: service };
const style = { version: 8, sources: { esri: { type: 'vector', url: service } }, layers: [{ id: 'background', type: 'background' }] };
const ok = data => ({ ok: true, status: 200, data });
const fixture = () => ({ item: { id: '18af4863d44d45968360795e547cc5d1', title: 'Original map', extent: [[-77, -12], [-76, -11]] },
  itemData: { version: '2.10', operationalLayers: [{ id: 'contributions', url: 'https://services.arcgis.com/example/FeatureServer/0', popupInfo: { title: 'Original' } }],
    baseMap: { title: 'Unavailable gray', baseMapLayers: [{ id: 'base', layerType: 'VectorTileLayer', styleUrl: oldStyle },
      { id: 'labels', layerType: 'VectorTileLayer', styleUrl: oldStyle, isReference: true }] } } });
function moduleAPI(overrides = {}) {
  let api;
  const context = { URL, Promise, Set, AbortController, setTimeout, clearTimeout, window: {},
    define: (dependencies, factory) => { api = factory(overrides.utils || {}, overrides.identity || {}, overrides.Deferred); }, ...overrides.context };
  vm.runInNewContext(source, context);
  return api;
}
function evidence(failure, replacement = metadata) {
  return async url => url === oldStyle ? failure : url === topographicStyle ? ok(style) : ok(replacement);
}

test('missing or inaccessible vector styles replace only the cloned basemap', async () => {
  for (const failure of [{ status: 404 }, { status: 403 }, ok({ error: { code: 400, messageCode: 'CONT_0001' } }),
    ok({ error: { code: 403, messageCode: 'GWM_0003' } }), ok({ error: { code: 499 } })]) {
    const original = fixture();
    const before = JSON.stringify(original);
    const result = await moduleAPI().prepare(original, evidence(failure));
    assert.equal(result.changed, true);
    assert.equal(JSON.stringify(original), before);
    assert.equal(JSON.stringify(result.itemInfo.item), JSON.stringify(original.item));
    assert.equal(JSON.stringify(result.itemInfo.itemData.operationalLayers), JSON.stringify(original.itemData.operationalLayers));
    assert.equal(result.itemInfo.itemData.version, original.itemData.version);
    assert.equal(result.itemInfo.itemData.baseMap.baseMapLayers.length, 1);
    assert.equal(result.itemInfo.itemData.baseMap.baseMapLayers[0].styleUrl, topographicStyle);
  }
});

test('healthy styles, transient failures and unverified replacements are never swapped', async () => {
  const original = fixture();
  for (const failure of [ok(style), { ok: false }, { status: 500 }, { status: 429 }, ok({ error: { code: 400 } })]) {
    const result = await moduleAPI().prepare(original, evidence(failure));
    assert.equal(result.changed, false);
    assert.equal(result.itemInfo, original);
  }
  for (const replacement of [{ ...metadata, owner: 'unverified' }, { ...metadata, access: 'private' }, { error: { code: 403 } }]) {
    assert.equal((await moduleAPI().prepare(original, evidence({ status: 404 }, replacement))).changed, false);
  }
  assert.equal((await moduleAPI().prepare(original, async url => url === oldStyle ? { status: 404 } : url === topographicStyle ? ok({ ...style, layers: [] }) : ok(metadata))).changed, false);
});

test('probes are restricted to visible ArcGIS Online vector basemap style references', async () => {
  const api = moduleAPI();
  const layer = fixture().itemData.baseMap.baseMapLayers[0];
  assert.equal(api.reference(layer), oldStyle);
  for (const styleUrl of [oldStyle + '?token=secret', oldStyle.replace('www.arcgis.com', 'evil.example'), oldStyle.replace('https:', 'http:'), oldStyle.replace('/resources/styles/root.json', '/data')]) {
    assert.equal(api.reference({ ...layer, styleUrl }), null);
  }
  assert.equal(api.reference({ ...layer, visibility: false }), null);
  assert.equal(api.reference({ ...layer, layerType: 'ArcGISTiledMapServiceLayer' }), null);
  const original = fixture();
  original.itemData.operationalLayers.push(original.itemData.baseMap.baseMapLayers[0]);
  original.itemData.baseMap.baseMapLayers = [];
  assert.equal((await api.prepare(original, () => assert.fail('Operational style probed'))).changed, false);
  let requests = 0;
  await api.prepare(fixture(), async url => { requests++; return evidence({ status: 404 })(url); });
  assert.equal(requests, 3, 'Duplicate original references share one probe');
});

function deferredClass() {
  return class {
    constructor(cancel) {
      this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
      this.cancel = cancel;
    }
    then(...args) { return this.promise.then(...args); }
  };
}

test('createMap wrapper preserves SDK options, errors and cancellation without writes', async () => {
  const original = fixture();
  const calls = [];
  const utils = { getItem: id => { assert.equal(id, original.item.id); return Promise.resolve(original); },
    createMap: (...args) => { calls.push(args); return Promise.resolve({ map: 'native-result' }); } };
  const fetched = [];
  const api = moduleAPI({ utils, Deferred: deferredClass(), identity: { findCredential: () => ({ token: 'synthetic-basemap-credential', expires: Date.now() + 60000 }) },
    context: { window: { fetch: async (url, options) => {
      fetched.push(url);
      assert.equal(new URL(url).searchParams.has('token'), false);
      assert.equal(options.headers['X-Esri-Authorization'], 'Bearer synthetic-basemap-credential');
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.method, undefined);
      const clean = new URL(url); clean.search = '';
      const proof = await evidence({ status: 403, data: { error: { code: 403 } } })(clean.href);
      return { ok: proof.ok, status: proof.status, json: async () => proof.data };
    } } } });
  api.install();
  const installed = utils.createMap;
  api.install();
  assert.equal(utils.createMap, installed);
  const options = { mapOptions: { zoom: 8 } };
  const result = await utils.createMap(original.item.id, 'map-container', options);
  assert.equal(result.map, 'native-result');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].itemData.baseMap.baseMapLayers[0].styleUrl, topographicStyle);
  assert.equal(calls[0][1], 'map-container');
  assert.equal(calls[0][2], options);
  assert.equal(fetched.length, 3);
  assert.equal(original.itemData.baseMap.title, 'Unavailable gray');
  const canceled = utils.createMap(original);
  canceled.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1, 'Canceled preparation never starts native rendering');
});

test('native failures and unavailable replacement evidence preserve native error handling', async () => {
  const failure = new Error('Native map failure');
  const original = fixture();
  const utils = { createMap: info => { assert.equal(info, original); return Promise.reject(failure); } };
  moduleAPI({ utils, Deferred: deferredClass(), identity: { findCredential: () => null },
    context: { window: { fetch: async () => { throw new Error('offline'); } } } }).install();
  await assert.rejects(Promise.resolve(utils.createMap(original)), error => error === failure);
});