import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { extractConfiguredAppId, createStoryArchiveHandler } from '../story-archive-discovery.mjs';
import { createWaybackLookup } from '../wayback-discovery.mjs';

const appId = 'a4a39ad4d78b40d9887bf4f19f2fef59';
const source = 'https://web.tplgis.org/Storymaps/national/willrogers/cascade/index.html';
const html = '<script>var configOptions = {appid: "' + appId + '", oAuthAppId: "", authorizedOwners: [""]};</script>';
const allowedOrigins = ['https://web.tplgis.org', 'http://web.tplgis.org'];
const header = ['timestamp', 'original', 'mimetype', 'statuscode'];

test('extracts literal configuration without executing HTML and rejects ambiguous or dynamic IDs', () => {
  assert.equal(extractConfiguredAppId(html), appId);
  assert.equal(extractConfiguredAppId(html.replace('var ', 'const ')), appId);
  for (const candidate of [html.replace('"' + appId + '"', 'getId()'), html + html.replace(appId, 'b'.repeat(32)),
    html.replace('appid:', '...other, appid:'), html.replace('appid:', '[key]:'), html.replace('appid:', 'get appid() { return "' + appId + '" }, ignored:'),
    html + '<script>configOptions.appid="' + 'b'.repeat(32) + '";</script>', html + '<script>var changed=(configOptions.appid="' + 'b'.repeat(32) + '");</script>', '<script>const text = ' + JSON.stringify(html) + '</script>',
    '<template>' + html + '</template>', html.replace('<script>', '<script src="other.js">')]) {
    assert.equal(extractConfiguredAppId(candidate), null, candidate);
  }
  assert.equal(extractConfiguredAppId('<img src=x onerror="throw 1">' + html + '<script>throw new Error("must not execute")</script>'), appId);
});

test('story mode reuses bounded exact CDX lookup, fetches only archive HTML, and caches parsed metadata', async () => {
  const calls = [];
  const lookup = createWaybackLookup({ allowedOrigins, extractStoryId: extractConfiguredAppId, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, 'https://web.archive.org');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return url.includes('/cdx/') ? Response.json([header, ['20171001000000', source, 'text/html', '200']]) : new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } });
  const result = await lookup(source, '2017-10-01');
  assert.equal(result.snapshot.appId, appId);
  assert.equal(result.snapshot.url, 'https://web.archive.org/web/20171001000000id_/' + source);
  assert.deepEqual(await lookup(source, '2017-10-01'), result);
  assert.equal(calls.length, 3);
  assert.equal((await lookup(source + '?token=secret', '2017-10-01')).reason, 'not_eligible');
});

test('story capture rejects oversized HTML, wrong content types and rate limits', async () => {
  for (const response of [new Response(' '.repeat(1048577), { headers: { 'Content-Type': 'text/html' } }),
    new Response(html, { headers: { 'Content-Type': 'application/json' } }), new Response('', { status: 429 })]) {
    const lookup = createWaybackLookup({ allowedOrigins, extractStoryId: extractConfiguredAppId, fetchImpl: async url =>
      url.includes('/cdx/') ? Response.json([header, ['20171001000000', source, 'text/html', '200']]) : response });
    const result = await lookup(source, '2017-10-01');
    assert.equal(result.snapshot, null);
    assert.equal(result.reason, response.status === 429 ? 'rate_limited' : 'unavailable');
  }
});

test('story relay requires explicit consent and independently verifies an empty public wrapper', async () => {
  let access = 'private';
  let payload = '';
  const calls = [];
  const itemId = 'a'.repeat(32);
  const server = http.createServer(createStoryArchiveHandler({ allowedOrigins, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers, undefined);
    if (url.includes('arcgis.com')) return url.includes('/data?') ? new Response(payload) : Response.json({ id: itemId, type: 'Web Mapping Application', access, url: source, modified: Date.parse('2017-10-01') });
    return url.includes('/cdx/') ? Response.json([header, ['20171001000000', source, 'text/html', '200']]) : new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port;
  const send = async consent => (await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, consent }) })).json();
  try {
    assert.equal((await send(false)).reason, 'not_eligible');
    assert.equal(calls.length, 0);
    assert.equal((await send(true)).reason, 'not_eligible');
    assert.equal(calls.length, 1);
    access = 'public'; payload = '{"story":"real"}';
    assert.equal((await send(true)).reason, 'not_empty');
    assert.equal(calls.some(url => url.includes('archive.org')), false);
    payload = '';
    assert.equal((await send(true)).snapshot.appId, appId);
    const response = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
