import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { createWaybackLookup, createWaybackHandler, publicImageURL } from '../wayback-discovery.mjs';

const source = 'https://www.ebmud.com/files/photo.png';
const allowedOrigins = ['https://www.ebmud.com', 'http://www.ebmud.com'];
const header = ['timestamp', 'original', 'mimetype', 'statuscode'];

test('discovery rejects non-approved or potentially private URLs before any lookup', async () => {
  const lookup = createWaybackLookup({ allowedOrigins, fetchImpl: () => { throw new Error('Must not contact archive'); } });
  for (const url of [source + '?token=secret', source + '#secret', 'https://user:pass@www.ebmud.com/photo.png', 'http://127.0.0.1/photo.png', 'https://private.example/photo.png', 'https://www.ebmud.com:443/photo.png', 'https://www.ebmud.com/%73ecret.png', source.replace('.png', '.svg')]) {
    assert.equal(publicImageURL(url, allowedOrigins), null);
    assert.equal((await lookup(url, '2015-09-27')).reason, 'not_eligible');
  }
  assert.equal((await lookup(source, '2015-02-31')).reason, 'not_eligible');
  assert.equal(publicImageURL(source, allowedOrigins), source);
});

test('queries only fixed CDX endpoint for both schemes, chooses nearest valid capture and caches', async () => {
  const calls = [];
  const lookup = createWaybackLookup({ allowedOrigins, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json([header,
      ['20190101000000', source, 'image/png', '200'],
      ['20150927034152', source.replace('https:', 'http:'), 'image/png', '200'],
      ['20150927000000', 'https://evil.example/other.png', 'image/png', '200'],
      ['20150927000000', source, 'text/html', '200']]);
  } });
  const results = await Promise.all([lookup(source, '2015-09-27'), lookup(source, '2015-09-27')]);
  assert.equal(results[0].snapshot.timestamp, '20150927034152');
  assert.equal(results[0].snapshot.url, 'https://web.archive.org/web/20150927034152if_/http://www.ebmud.com/files/photo.png');
  assert.deepEqual(results[0], results[1]);
  await lookup(source, '2015-09-27');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.url.searchParams.get('url')), [source, source.replace('https:', 'http:')]);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://web.archive.org');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.referrerPolicy, 'no-referrer');
  }
});

test('caches misses, bounds lookup count, and opens circuit on rate limiting', async () => {
  let calls = 0;
  const lookup = createWaybackLookup({ allowedOrigins, maxLookups: 1, fetchImpl: async () => { calls++; return Response.json([header]); } });
  assert.equal((await lookup(source, '2015-09-27')).reason, 'not_found');
  await lookup(source, '2015-09-27');
  assert.equal(calls, 2);
  assert.equal((await lookup(source.replace('photo', 'other'), '2015-09-27')).reason, 'busy');
  calls = 0;
  const limited = createWaybackLookup({ allowedOrigins, fetchImpl: async () => { calls++; return new Response('', { status: 429 }); } });
  assert.equal((await limited(source, '2015-09-27')).reason, 'rate_limited');
  assert.equal((await limited(source.replace('photo', 'other'), '2015-09-27')).reason, 'rate_limited');
  assert.equal(calls, 1);
});

test('aborts slow discovery and bounds response bytes', async () => {
  const slow = createWaybackLookup({ allowedOrigins, timeoutMs: 5, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.equal((await slow(source, '2015-09-27')).reason, 'unavailable');
  const oversized = createWaybackLookup({ allowedOrigins, fetchImpl: async () => new Response(' '.repeat(65537)) });
  assert.equal((await oversized(source, '2015-09-27')).reason, 'unavailable');
});

const clientSource = readFileSync(new URL('../../runtimes/maptour/upstream/MapTour/src/app/storymaps/utils/WaybackDiscovery.js', import.meta.url), 'utf8');
function clientHarness(fetchImpl, storage = new Map()) {
  let module;
  vm.runInNewContext(clientSource, {
    define: (dependencies, factory) => { module = factory(); },
    window: { URL, Promise, AbortController, fetch: fetchImpl, setTimeout, clearTimeout,
      location: { href: 'https://viewer.example.org/tour/', origin: 'https://viewer.example.org' },
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
  });
  const options = { publicStory: true, storyId: 'a'.repeat(32), endpoint: '/api/wayback', origins: allowedOrigins, date: '2015-09-27' };
  return { module, options };
}

test('one opt-in persists per story, not per photo or across stories', async () => {
  const calls = [];
  const { module, options } = clientHarness(async (url, request) => { calls.push({ url, request }); return Response.json({ snapshot: null }); });
  const client = module.create(options);
  assert.equal(await client.discover(source), null);
  assert.equal(calls.length, 0);
  client.setConsent(true);
  await client.discover(source);
  await client.discover(source.replace('photo', 'second'));
  assert.equal(calls.length, 2);
  assert.equal(module.create(options).isEnabled(), true);
  assert.equal(module.create({ ...options, storyId: 'b'.repeat(32) }).isEnabled(), false);
  client.setConsent(false);
  assert.equal(module.create(options).isEnabled(), false);
  for (const call of calls) {
    assert.equal(call.url, 'https://viewer.example.org/api/wayback');
    assert.equal(call.request.credentials, 'omit');
  }
});

test('private stories, foreign endpoints and credential URLs fail closed in browser', async () => {
  let calls = 0;
  const { module, options } = clientHarness(async () => { calls++; return Response.json({}); });
  assert.equal(module.create({ ...options, publicStory: false }), null);
  assert.equal(module.create({ ...options, endpoint: 'https://other.example.org/lookup' }), null);
  const client = module.create(options);
  client.setConsent(true);
  for (const url of [source + '?token=secret', 'https://other.example.org/photo.png', 'http://127.0.0.1/photo.png']) assert.equal(await client.discover(url), null);
  assert.equal(calls, 0);
});

test('browser validates capture URL and deduplicates positive and negative lookups', async () => {
  let calls = 0;
  const snapshot = { original: source, timestamp: '20150927034152', url: 'https://web.archive.org/web/20150927034152if_/' + source };
  const { module, options } = clientHarness(async () => { calls++; return Response.json({ snapshot }); });
  const client = module.create(options);
  client.setConsent(true);
  assert.equal((await client.discover(source)).url, snapshot.url);
  await client.discover(source);
  assert.equal(calls, 1);
  snapshot.url = 'https://evil.example/track';
  assert.equal(await client.discover(source.replace('photo', 'another')), null);
});

test('revocation cancels in-flight discovery and ignores late responses', async () => {
  let complete;
  let signal;
  const { module, options } = clientHarness((url, request) => { signal = request.signal; return new Promise(resolve => { complete = resolve; }); });
  const client = module.create(options);
  client.setConsent(true);
  const result = client.discover(source);
  client.setConsent(false);
  assert.equal(signal.aborted, true);
  complete(Response.json({ snapshot: { original: source, timestamp: '20150927034152', url: 'https://web.archive.org/web/20150927034152if_/' + source } }));
  assert.equal(await result, null);
});

test('relay HTTP boundary rejects cross-site and malformed origin requests', async () => {
  let calls = 0;
  const server = http.createServer(createWaybackHandler({ allowedOrigins, fetchImpl: async () => { calls++; return Response.json([header]); } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/wayback';
  try {
    for (const origin of ['null', 'https://other.example.org']) {
      const response = await fetch(endpoint, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: source, date: '2015-09-27' }) });
      assert.equal(response.status, 403);
    }
    assert.equal((await fetch(endpoint)).status, 403);
    assert.equal(calls, 0);
    const response = await fetch(endpoint, { method: 'POST', headers: { Origin: new URL(endpoint).origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: source, date: '2015-09-27' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reason, 'not_found');
    assert.equal(calls, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('browser queues eligible images behind two requests and cancels queued work on revoke', async () => {
  const responses = [];
  const { module, options } = clientHarness(() => new Promise(resolve => responses.push(resolve)));
  const client = module.create(options);
  client.setConsent(true);
  const first = client.discover(source);
  const second = client.discover(source.replace('photo', 'second'));
  const third = client.discover(source.replace('photo', 'third'));
  assert.equal(responses.length, 2);
  responses[0](Response.json({ snapshot: null }));
  await first;
  assert.equal(responses.length, 3);
  const fourth = client.discover(source.replace('photo', 'fourth'));
  client.setConsent(false);
  assert.equal(await fourth, null);
  responses[1](Response.json({ snapshot: null }));
  responses[2](Response.json({ snapshot: null }));
  await Promise.all([second, third]);
  assert.equal(responses.length, 3);
});

test('synchronous network failures release browser slots and unavailable storage stays session-only', async () => {
  let calls = 0;
  const { module, options } = clientHarness(() => { calls++; throw new Error('Unavailable'); }, { get: () => { throw new Error('Blocked'); }, set: () => { throw new Error('Blocked'); } });
  const client = module.create(options);
  client.setConsent(true);
  assert.equal(client.isEnabled(), true);
  assert.equal(client.isPersistent(), false);
  for (const name of ['first', 'second', 'third']) assert.equal(await client.discover(source.replace('photo', name)), null);
  assert.equal(calls, 3);
});
