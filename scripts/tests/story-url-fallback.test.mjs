import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../apps/classic-storymaps-site/assets/js/classic-story-url-fallback.js', import.meta.url), 'utf8');
const original = 'https://storymaps.esri.com/stories/2012/warming-cities/';
const archived = 'https://storymaps.esri.com/archives/stories/2012/warming-cities/';
function moduleAPI(utils = {}, fetch = undefined, overrides = {}) {
  let api;
  const define = (dependencies, factory) => { api = factory(utils); };
  define.amd = {};
  vm.runInNewContext(source, { URL, Promise, Map, AbortController, setTimeout, clearTimeout,
    window: { fetch }, define, ...overrides });
  return api;
}

test('missing Esri stories use a verified archive only in the returned JSON copy', async () => {
  const input = { item: { url: original }, itemData: { sections: [{ url: original + '#cities' }], text: 'Unchanged', count: 2 } };
  const before = JSON.stringify(input);
  const calls = [];
  const output = await moduleAPI().prepare(input, async url => {
    calls.push(url);
    return url === original ? { status: 404 } : { status: 200, html: true };
  });
  assert.equal(JSON.stringify(input), before);
  assert.equal(output.item.url, archived);
  assert.equal(output.itemData.sections[0].url, archived + '#cities');
  assert.equal(output.itemData.text, 'Unchanged');
  assert.equal(output.itemData.count, 2);
  assert.deepEqual(calls, [original, archived]);
});

test('working, inaccessible, transient and unobservable originals remain unchanged', async () => {
  const input = { url: original };
  for (const status of [200, 301, 401, 403, 429, 500, 0]) {
    const calls = [];
    assert.equal(await moduleAPI().prepare(input, async url => { calls.push(url); return { status }; }), input);
    assert.deepEqual(calls, [original]);
  }
  assert.equal(await moduleAPI().prepare(input, async () => { throw new Error('CORS or network failure'); }), input);
  for (const result of [{ status: 404 }, { status: 200, html: false }, { status: 302 }, { status: 403 }]) {
    assert.equal(await moduleAPI().prepare(input, async url => url === original ? { status: 410 } : result), input);
  }
});

test('only exact Esri story paths without credentials or queries are probed', async () => {
  const api = moduleAPI();
  for (const url of [archived, original.replace('storymaps.esri.com', 'other.example'),
    original.replace('storymaps.esri.com', 'storymaps.esri.com.evil.example'),
    original.replace('/stories/', '/apps/'), original + '?token=synthetic-secret',
    original.replace('https://', 'https://user:password@'), original.replace('.com/', '.com:8443/'),
    original.replace('/2012/', '/%32%30%31%32/'), 'javascript:alert(1)']) {
    assert.equal(api.candidate(url), null);
    const input = { url };
    assert.equal(await api.prepare(input, () => { throw new Error('Unexpected request'); }), input);
  }
  assert.equal(api.candidate(original.replace('https:', 'http:')).original, original);
});

test('SDK hook preserves receiver and arguments, and uses credential-free bounded HEAD probes', async () => {
  const input = { itemData: { url: original } };
  const requests = [];
  const utils = { getItem(id, options) { assert.equal(this, utils); assert.equal(id, 'item'); assert.equal(options.keep, true); return Promise.resolve(input); } };
  const api = moduleAPI(utils, async (url, options) => {
    requests.push(url);
    assert.equal(options.method, 'HEAD');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers, undefined);
    return { status: url === original ? 404 : 200, headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }) };
  });
  api.install();
  api.install();
  assert.equal((await utils.getItem('item', { keep: true })).itemData.url, archived);
  assert.deepEqual(requests, [original, archived]);
});

test('large candidate sets are left unchanged and probes have at most four workers', async () => {
  const api = moduleAPI();
  const tooMany = Array.from({ length: 17 }, (_, index) => ({ url: original + index + '/' }));
  let calls = 0;
  assert.equal(await api.prepare(tooMany, async () => { calls++; return { status: 404 }; }), tooMany);
  assert.equal(calls, 0);
  let active = 0;
  let peak = 0;
  const input = tooMany.slice(0, 16);
  assert.equal(await api.prepare(input, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { status: 200 };
  }), input);
  assert.equal(peak, 4);
});

test('the shared deadline aborts stalled fetches and preserves the original payload', async () => {
  let expire;
  let signal;
  let cleared = false;
  const api = moduleAPI({}, async (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }, { setTimeout(callback, milliseconds) { assert.equal(milliseconds, 4000); expire = callback; return 1; },
    clearTimeout(timer) { assert.equal(timer, 1); cleared = true; } });
  const input = { url: original };
  const pending = api.prepare(input);
  expire();
  assert.equal(await pending, input);
  assert.equal(signal.aborted, true);
  assert.equal(cleared, true);
});

test('native SDK request errors propagate unchanged', async () => {
  const failure = new Error('Native request failed');
  const utils = { getItem() { return Promise.reject(failure); } };
  moduleAPI(utils).install();
  await assert.rejects(utils.getItem(), error => error === failure);
});
