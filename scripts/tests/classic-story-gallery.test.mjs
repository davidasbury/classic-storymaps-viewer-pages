import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const site = new URL('../../apps/classic-storymaps-site/', import.meta.url);
const require = createRequire(import.meta.url);
const gallery = () => require(new URL('assets/js/classic-story-gallery.js', site).pathname);
const input = () => require(new URL('assets/js/classic-story-input.js', site).pathname);
function configuration(pathname = '/viewers/') {
  const context = vm.createContext({ URL, window: { location: { pathname } } });
  vm.runInContext(readFileSync(new URL('assets/js/classic-storymaps-config.js', site), 'utf8'), context);
  return context.window.ClassicStoryMapsConfig;
}

test('metadata counting retains ordered unique stories without consuming visible pages', async () => {
  let calls = 0;
  const pager = gallery().createPager({ pageSize: 2, accept: candidate => candidate.valid ? candidate : null,
    fetchPage: async () => ++calls === 1
      ? { results: [{ id: 'one', valid: true }, { id: 'two', valid: true }, { id: 'three', valid: true }], nextStart: 4 }
      : { results: [{ id: 'three', valid: true }, { id: 'excluded' }, { id: 'four', valid: true }], nextStart: -1 } });
  assert.deepEqual((await pager.next()).items.map(story => story.id), ['one', 'two']);
  assert.equal(pager.snapshot().hasMore, true);
  await pager.scan();
  assert.deepEqual(pager.snapshot(), { items: ['one', 'two', 'three', 'four'].map(id => ({ id, valid: true })), hasMore: false, limited: false });
  assert.deepEqual((await pager.next()).items.map(story => story.id), ['three', 'four']);
  assert.equal(calls, 2);
});

test('canceled metadata scans keep the prior count and unknown totals never expose a distant last page', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pager = gallery().createPager({ accept: candidate => candidate, fetchPage: async () => {
    if (++calls === 2) controller.abort();
    return { results: [{ id: String(calls) }], nextStart: calls + 1 };
  } });
  await pager.scan();
  const before = pager.snapshot();
  await assert.rejects(pager.scan(controller.signal), { name: 'AbortError' });
  assert.deepEqual(pager.snapshot(), before);
  assert.deepEqual(gallery().pageNumbers(1, 125, false), [1, 2, 3, 4, 5]);
  assert.deepEqual(gallery().pageNumbers(1, 125, true), [1, 2, 3, 125]);
});

test('every runtime has two to eight unique screenshot-backed examples', () => {
  const config = configuration();
  const identifiers = new Set();
  for (const runtime of Object.keys(config.appRegistry)) {
    const examples = config.exampleStoriesByRuntime?.[runtime];
    assert.ok(examples?.length >= 2 && examples.length <= 8, runtime);
    for (const example of examples) {
      assert.match(example.id, /^[a-f0-9]{32}$/);
      assert.equal(identifiers.has(example.id), false);
      identifiers.add(example.id);
      assert.ok(example.title);
      assert.ok(existsSync(new URL(example.image, site)), example.image);
    }
  }
  assert.equal(identifiers.size, 19);
  assert.equal(config.gallery.converter.enabled, true);
  assert.equal(config.gallery.publicGroupId, '');
});

test('runtime classification also recognizes Classic tags', () => {
  const config = configuration('/classic-storymaps-viewer-pages/viewers/');
  assert.equal(config.classifyClassicRuntimeFromItem({ type: 'Web Mapping Application', tags: ['Story Map', 'Story Map Journal'] }), 'mapjournal');
  assert.equal(config.runtimeViewerByApp.mapjournal, '/classic-storymaps-viewer-pages/viewers/mapjournal/index.html');
  assert.equal(configuration('/classic-storymaps-viewer-pages/viewers/cascade/index.html').runtimeViewerByApp.cascade,
    '/classic-storymaps-viewer-pages/viewers/cascade/index.html');
});

const item = (number, overrides = {}) => ({
  id: number.toString(16).padStart(32, '0'), title: `Story ${number}`, owner: 'owner',
  type: 'Web Mapping Application', tags: ['Story Map'], typeKeywords: ['Story Map Journal'],
  access: 'public', ...overrides
});

test('legacy SwipeSpyglass items pass gallery and native startup classification', async () => {
  const config = configuration();
  for (const [id, layout] of [
    ['6b58de911fa44d309431d8b3cf7bba6c', 'swipe'],
    ['d96143b7a084446ebb0417a111c38016', 'swipe'],
    ['1ec6194f21744590aa7644e19b3be356', 'spyglass']
  ]) {
    const candidate = item(1, { id, tags: [],
      typeKeywords: ['JavaScript', 'layout-' + layout, 'Map', 'Mapping Site', 'Online Map', 'Ready To Use', 'selfConfigured', 'Story Map', 'Story Maps', 'SwipeSpyglass', 'Web Map'],
      url: 'https://story.maps.arcgis.com/apps/StorytellingSwipe/index.html?appid=' + id });
    assert.equal(config.classifyClassicRuntimeFromItem(candidate), 'swipe');
    assert.equal(gallery().storyFromItem(candidate, config).runtime, 'swipe');
    const resolved = await input().resolveItem(id, { config, client: { json: async url => {
      assert.equal(url.pathname, '/sharing/rest/content/items/' + id);
      return candidate;
    } } });
    assert.equal(resolved.runtime, 'swipe');
    assert.equal(resolved.appId, id);
  }
});

test('legacy Basic URL variants pass gallery and native startup classification', async () => {
  const config = configuration();
  for (const [id, url, webmap] of [
    ['fb12a83afaa943d6a2e91df06e8840dd', 'https://carto.maps.arcgis.com/apps/OnePane/storytelling_basic/index.html', '4bcbb3b6ea1d4560b7682b3dbfc938d9'],
    ['13c5a58889604931a72c31387e5a4125', 'https://story.maps.arcgis.com/apps/StorytellingTextLegend/index.html', '02a70d47451e4eb38c4ecb7a54d7b5fb']
  ]) {
    const candidate = item(1, { id, tags: [],
      typeKeywords: ['JavaScript', 'Map', 'Mapping Site', 'Online Map', 'Ready To Use', 'Web Map'],
      url: url + '?appid=' + id });
    assert.equal(config.classifyClassicRuntimeFromItem(candidate), 'basic');
    assert.equal(gallery().storyFromItem(candidate, config).runtime, 'basic');
    const resolved = await input().resolveItem(id, { config, client: { json: async endpoint =>
      endpoint.pathname.endsWith('/data') ? { values: { webmap } } : candidate } });
    assert.equal(resolved.runtime, 'basic');
    assert.equal(resolved.appId, id);
  }
  for (const url of [
    'https://example.com/apps/OnePane/storytelling_basic_extra/index.html',
    'https://example.com/apps/StorytellingTextLegendary/index.html',
    'https://example.com/index.html?next=/apps/StorytellingTextLegend/',
    'https://example.com/apps/instant/StorytellingTextLegend/index.html'
  ]) assert.equal(config.classifyClassicRuntimeFromItem(item(2, { tags: [], typeKeywords: [], url })), null);
});

test('modern app URLs and conflicting metadata cannot pass Classic classification through tags', async () => {
  const config = configuration();
  const nearby = item(1, { id: '6d580febadc04c7b896568bfaadbcdbf', tags: ['Trail', 'Story Maps', 'Crowdsource'],
    typeKeywords: ['configurableApp', 'JavaScript', 'Map', 'Mapping Site', 'Online Map', 'Ready To Use', 'Web Map'],
    url: 'https://baycogis.maps.arcgis.com/apps/instant/nearby/index.html?appid=6d580febadc04c7b896568bfaadbcdbf' });
  for (const candidate of [nearby,
    item(2, { url: 'https://www.arcgis.com/apps/dashboards/123' }),
    item(3, { url: 'https://experience.arcgis.com/experience/123' }),
    item(4, { url: 'https://storymaps.arcgis.com/stories/123' }),
    item(5, { typeKeywords: ['Story Map Journal', 'Story Map Tour'] }), item(6, { type: 'Web Map' })]) {
    assert.equal(config.classifyClassicRuntimeFromItem(candidate), null);
    assert.equal(gallery().storyFromItem(candidate, config), null);
    await assert.rejects(input().resolveItem(candidate.id, { config, client: { json: async url => url.pathname.endsWith('/data') ? { values: { webmap: 'synthetic-map' } } : candidate } }), /could not determine which Classic Story Map format|not a web mapping application/);
  }
  assert.equal(config.classifyClassicRuntimeFromItem(item(7, { typeKeywords: [], tags: [], url: 'https://custom.example/MapJournal/index.html?next=/apps/instant/nearby/' })), 'mapjournal');
  assert.equal(config.classifyClassicRuntimeFromItem(item(8, { url: 'https://custom.example/Cascade/index.html' })), 'mapjournal');
});

test('unrecognized Classic metadata reports uncertainty rather than declaring the story non-Classic', async () => {
  const config = configuration();
  const candidate = item(9, { typeKeywords: ['Story Map'], tags: [] });
  assert.equal(config.classifyClassicRuntimeFromItem(candidate), 'unknown-classic');
  await assert.rejects(input().resolveItem(candidate.id, { config, client: { json: async () => candidate } }), {
    message: 'This viewer could not determine which Classic Story Map format to use for this item. The item may still be a Classic story.'
  });
});

test('omni input accepts IDs, hosted URLs, web map overrides and verified legacy aliases', () => {
  const appId = '0a48880ceab64924946a0a15a5383916';
  const webmap = '0c8ae0bb497143db9a29de4fbffaed73';
  assert.deepEqual(input().parse(appId), { appId, webmap: null });
  assert.deepEqual(input().parse('https://www.arcgis.com/apps/MapTour/index.html?appid=' + appId + '&webmap=' + webmap), { appId, webmap });
  assert.equal(input().parse('https://blm-egis.maps.arcgis.com/apps/Cascade/index.html?appid=6a9c3a5af20b43dea05fbd1e121ef6da').appId, '6a9c3a5af20b43dea05fbd1e121ef6da');
  assert.equal(input().parse('http://storymaps.esri.com/stories/2014/brazil-beyond-the-stadiums/').appId, 'cf69fa9aee724adf8b6f77d059ae08a9');
  assert.equal(input().parse('http://clear3.uconn.edu/viewers/bears/').appId, '137ee8cb7d05426ca95ae1330ebf4d38');
  assert.equal(input().parse('https://web.tplgis.org/Storymaps/national/willrogers/cascade/index.html').appId, 'a4a39ad4d78b40d9887bf4f19f2fef59');
  for (const value of ['javascript:alert(1)', 'https://user:password@example.org/', 'https://example.org/?appid=' + appId + '&appid=' + appId,
    'https://example.org/?appid=' + appId + '&token=synthetic', 'https://example.org/?appid=invalid', 'https://example.org/?webmap=invalid']) assert.throws(() => input().parse(value));
});

test('self-hosted URL lookup requires an exact, unambiguous Classic item match', async () => {
  const config = configuration();
  const address = 'https://custom.example/story/';
  let candidates = [item(1, { url: address }), item(2, { url: 'https://other.example/story/' })];
  const client = { json: async url => {
    assert.equal(url.origin, 'https://www.arcgis.com');
    assert.ok(!url.searchParams.has('token'));
    return { results: candidates, nextStart: -1 };
  } };
  assert.equal((await input().resolve(address, { client, config })).appId, item(1).id);
  candidates.push(item(3, { url: address }));
  await assert.rejects(input().resolve(address, { client, config }), /Several/);
  candidates = [item(4, { url: address, tags: [], typeKeywords: [] })];
  await assert.rejects(input().resolve(address, { client, config }), /No accessible/);
});

test('gallery membership validates access and requires Classic metadata or a verified URL before routes', () => {
  const config = configuration();
  const accept = (candidate, owner = 'owner', sharing = 'public') => gallery().storyFromItem(candidate, config, { scope: owner ? 'mine' : 'online', owner, sharing });
  assert.equal(accept(item(1)).runtime, 'mapjournal');
  assert.equal(accept(item(1, { typeKeywords: [], tags: ['Story Map Journal'] })).runtime, 'mapjournal');
  assert.equal(accept(item(1, { tags: [] })).runtime, 'mapjournal');
  const legacy = item(1, { tags: [], typeKeywords: [], url: 'https://example.org/MapJournal/' });
  assert.equal(accept(legacy).runtime, 'mapjournal');
  for (const override of [{ owner: 'another' }, { access: 'private' }, { type: 'Web Map' }, { id: '../foreign' }]) {
    assert.equal(accept({ ...legacy, ...override }), null);
  }
  assert.equal(accept({ ...legacy, access: 'private' }, ''), null);
  assert.equal(accept({ ...legacy, access: 'private' }, 'owner', 'private').runtime, 'mapjournal');
  assert.equal(gallery().storyFromItem({ ...legacy, orgId: 'other' }, config, { scope: 'org', orgId: 'wanted', sharing: 'public' }), null);
  assert.equal(gallery().storyFromItem({ ...legacy, orgId: 'wanted' }, config, { scope: 'org', orgId: 'wanted', sharing: 'public' }).runtime, 'mapjournal');
  for (const override of [
    { owner: 'another' }, { type: 'StoryMap' }, { id: '../foreign' },
    { tags: [], typeKeywords: [], url: 'https://example.org/Unrecognized/' },
    { tags: ['Story Map'], typeKeywords: [], url: '' },
    { typeKeywords: ['Story Map Journal', 'Story Map Tour'] }
  ]) assert.equal(accept(item(1, override)), null, JSON.stringify(override));
  assert.equal(accept(item(1, { access: 'private' }), ''), null);
  assert.equal(accept(item(1, { access: 'private' })), null);
  assert.equal(accept(item(1, { access: 'private' }), 'owner', 'private').id, item(1).id);
});

test('story references follow item URLs before selecting the actual runtime', async () => {
  const config = configuration();
  const wrapper = item(1, { url: 'https://projectbaseline.maps.arcgis.com/apps/Cascade/index.html?appid=' + item(2).id });
  const target = item(2, { typeKeywords: ['Story Map Cascade'], url: 'https://www.arcgis.com/apps/Cascade/?appid=' + item(2).id });
  const calls = [];
  const client = { json: async (url, token) => {
    assert.equal(url.origin, 'https://www.arcgis.com');
    assert.equal(token, 'synthetic-pointer-credential');
    assert.equal(url.searchParams.has('token'), false);
    calls.push(url.pathname);
    if (url.pathname.endsWith('/data')) return null;
    return url.pathname.endsWith(wrapper.id) ? wrapper : target;
  } };
  const result = await input().resolveItem(wrapper.id, { client, config, token: 'synthetic-pointer-credential' });
  assert.equal(result.appId, target.id);
  assert.equal(result.runtime, 'cascade');
  assert.deepEqual(result.chain, [wrapper.id, target.id]);
  assert.equal(calls.length, 3);
});

test('story references reject loops, unsafe URLs and inaccessible targets', async () => {
  const config = configuration();
  const wrapper = item(1, { url: 'https://www.arcgis.com/apps/Cascade/?appid=' + item(2).id });
  const target = item(2, { url: 'https://www.arcgis.com/apps/Cascade/?appid=' + wrapper.id });
  const client = { json: async url => url.pathname.endsWith('/data') ? null : url.pathname.endsWith(wrapper.id) ? wrapper : target };
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), /loop/);
  target.url = 'javascript:alert(1)';
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), /HTTP/);
  client.json = async url => {
    if (url.pathname.endsWith('/data')) return null;
    if (url.pathname.endsWith(wrapper.id)) return wrapper;
    const error = new Error('Denied');
    error.code = 403;
    throw error;
  };
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), error => {
    assert.equal(error.code, 403);
    assert.equal(error.source.url, wrapper.url);
    assert.equal(error.source.id, wrapper.id);
    return /referenced story is unavailable/.test(error.message);
  });
});

test('failed external item-data reads retain a validated source without forwarding credentials', async () => {
  const wrapper = item(1, { url: 'https://source.example/original/' });
  const client = { json: async url => {
    if (url.pathname.endsWith('/data')) throw new Error('Source data unavailable');
    return wrapper;
  } };
  await assert.rejects(input().resolveItem(wrapper.id, { client, config: configuration(), token: 'synthetic-private-session' }), error => {
    assert.equal(error.source.url, wrapper.url);
    assert.equal(JSON.stringify(error.source).includes('synthetic-private-session'), false);
    return true;
  });
  wrapper.url += '?token=synthetic-private-session';
  await assert.rejects(input().resolveItem(wrapper.id, { client, config: configuration() }), error => !error.source && /credentials/.test(error.message));
});

test('pointer subscription errors retain their reason and report status against the source item', async () => {
  const config = configuration();
  const wrapper = item(1, { url: 'https://www.arcgis.com/apps/Cascade/?appid=' + item(2).id });
  let failure = { code: 403, messageCode: 'SB_0006' };
  const observed = [];
  const client = gallery().createClient(async url => ({ ok: true,
    text: async () => '',
    json: async () => url.pathname.endsWith(wrapper.id) ? wrapper : failure ? { error: failure } : item(2)
  }));
  const options = { client, config, onSourceStatus: (source, inactive) => observed.push([source.id, inactive]) };
  await assert.rejects(input().resolveItem(wrapper.id, options), error => {
    assert.equal(error.message, "The source's ArcGIS Online subscription is no longer active.");
    assert.equal(error.messageCode, 'SB_0006');
    assert.equal(error.referencedStory, true);
    return error.subscriptionInactive;
  });
  failure = { code: 403 };
  await assert.rejects(input().resolveItem(wrapper.id, options), /referenced story is unavailable/);
  failure = null;
  await input().resolveItem(wrapper.id, options);
  assert.deepEqual(observed, [[wrapper.id, true], [wrapper.id, false], [wrapper.id, false]]);
});

test('source status storage is public-only, bounded, expiring and optional', () => {
  const storage = new Map();
  let now = Date.now();
  const context = vm.createContext({ Event, Date: { now: () => now }, window: {
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    dispatchEvent: event => assert.equal(event.type, 'classic-source-status')
  } });
  vm.runInContext(readFileSync(new URL('assets/js/classic-story-gallery.js', site), 'utf8'), context);
  const api = context.window.ClassicStoryGallery;
  const key = 'classic-public-source-status-v1';
  api.rememberSourceStatus(item(1, { access: 'private' }), true);
  assert.equal(storage.size, 0);
  api.rememberSourceStatus(item(1), true);
  assert.deepEqual(JSON.parse(storage.get(key)), [{ id: item(1).id, expires: now + 1800000 }]);
  api.rememberSourceStatus(item(1), false);
  assert.deepEqual(JSON.parse(storage.get(key)), []);
  for (let number = 1; number <= 101; number++) api.rememberSourceStatus(item(number), true);
  assert.equal(JSON.parse(storage.get(key)).length, 100);
  now += 1800001;
  api.rememberSourceStatus(item(102), true);
  assert.deepEqual(JSON.parse(storage.get(key)), [{ id: item(102).id, expires: now + 1800000 }]);
  storage.set(key, '{invalid');
  assert.doesNotThrow(() => api.rememberSourceStatus(item(1), true));
  Object.defineProperty(context.window, 'localStorage', { get: () => { throw new Error('Storage disabled'); } });
  assert.doesNotThrow(() => api.rememberSourceStatus(item(1), true));
});

test('external empty pointers stop before native startup and verified mappings retain nonempty-copy protection', async () => {
  const config = configuration();
  const wrapper = item(1, { url: 'https://public.example.org/cascade/index.html' });
  let payload = null;
  const client = { json: async url => url.pathname.endsWith('/data') ? payload : url.pathname.endsWith(wrapper.id) ? wrapper : item(2, { id: 'a4a39ad4d78b40d9887bf4f19f2fef59' }) };
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), error => error.source.id === wrapper.id && error.source.url === wrapper.url);
  payload = { story: 'real copy' };
  assert.equal((await input().resolveItem(wrapper.id, { client, config })).appId, wrapper.id);
  wrapper.url = 'https://web.tplgis.org/Storymaps/national/willrogers/cascade/index.html';
  assert.equal((await input().resolveItem(wrapper.id, { client, config })).appId, wrapper.id);
  payload = null;
  assert.equal((await input().resolveItem(wrapper.id, { client, config })).appId, 'a4a39ad4d78b40d9887bf4f19f2fef59');
});

test('archive client requires consent, validates provenance, and resolves live metadata without sharing credentials with the relay', async () => {
  const config = configuration();
  config.archiveDiscovery = { endpoint: '/api/story-archive', allowedOrigins: ['https://web.tplgis.org'] };
  const source = { id: item(1).id, access: 'public', url: 'https://web.tplgis.org/unmapped/index.html' };
  let snapshot = { appId: item(2).id, timestamp: '20171001000000', original: source.url,
    url: 'https://web.archive.org/web/20171001000000id_/' + source.url };
  let requests = 0;
  const options = { config, baseURL: 'https://viewer.example.org/viewers/', token: 'synthetic-archive-session',
    client: { json: async (url, token) => { assert.equal(token, 'synthetic-archive-session'); return item(2); } },
    fetcher: async (url, request) => {
      requests++;
      assert.equal(url.origin, 'https://viewer.example.org');
      assert.equal(request.credentials, 'omit');
      assert.deepEqual(request.headers, { 'Content-Type': 'application/json' });
      assert.deepEqual(JSON.parse(request.body), { itemId: source.id, consent: true });
      return { ok: true, json: async () => ({ snapshot }) };
    }
  };
  await assert.rejects(input().discoverArchive(source, options), /not enabled/);
  assert.equal(requests, 0);
  options.consent = true;
  assert.equal((await input().discoverArchive(source, options)).resolved.appId, item(2).id);
  snapshot = { ...snapshot, url: 'https://other.example/capture' };
  await assert.rejects(input().discoverArchive(source, options), /invalid/);
  for (const override of [{ access: 'private' }, { url: source.url + '?token=secret' }, { url: 'http://127.0.0.1/index.html' }]) {
    assert.equal(input().archiveEndpoint({ ...source, ...override }, options), null);
  }
  config.archiveDiscovery.endpoint = 'https://foreign.example/relay';
  assert.equal(input().archiveEndpoint(source, options), null);
});

test('real story data takes precedence over a stale copied URL and references stay bounded', async () => {
  const config = configuration();
  const wrapper = item(1, { url: 'https://www.arcgis.com/apps/Cascade/?appid=' + item(2).id });
  const client = { json: async url => url.pathname.endsWith('/data') ? { values: { story: 'original copy' } } : wrapper };
  assert.equal((await input().resolveItem(wrapper.id, { client, config })).appId, wrapper.id);
  let requests = 0;
  client.json = async url => {
    requests++;
    if (url.pathname.endsWith('/data')) return {};
    const number = parseInt(url.pathname.split('/').pop(), 16);
    return item(number, { url: 'https://www.arcgis.com/apps/Cascade/?appid=' + item(number + 1).id });
  };
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), /five-item limit/);
  assert.equal(requests, 10);
});

test('REST data reads accept empty pointer bodies but retain ArcGIS errors', async () => {
  let text = '';
  const client = gallery().createClient(async () => ({ ok: true, text: async () => text }));
  const url = new URL('https://www.arcgis.com/sharing/rest/content/items/' + item(1).id + '/data?f=json');
  assert.equal(await client.json(url, null, null, true), null);
  text = '{"error":{"code":403}}';
  await assert.rejects(client.json(url, null, null, true), error => error.code === 403);
});

test('scope and sharing searches preserve escaping and public-only online searches', () => {
  assert.equal(gallery().searchUrl({ scope: 'online', sharing: 'public' }).searchParams.get('q'), 'access:public AND type:"Web Mapping Application"');
  const search = gallery().searchUrl({ scope: 'mine', owner: 'test" OR owner:*', title: '" OR type:*', start: 1, sort: 'title' });
  assert.equal(search.origin, 'https://www.arcgis.com');
  assert.equal(search.searchParams.get('q'), 'owner:"test\\" OR owner\\:\\*" AND access:public AND type:"Web Mapping Application" AND title:"\\" OR type\\:\\*"');
  const publicSearch = gallery().searchUrl({ scope: 'online', start: 1 });
  assert.match(publicSearch.searchParams.get('q'), /^access:public AND type:/);
  assert.doesNotMatch(publicSearch.href, /owner|token/);
  assert.throws(() => gallery().searchUrl({}), /source/);
  assert.throws(() => gallery().searchUrl({ scope: 'org' }), /source/i);
  assert.throws(() => gallery().searchUrl({ scope: 'online', sharing: 'private' }), /source/i);
  assert.match(gallery().searchUrl({ scope: 'org', orgId: 'synthetic-org', sharing: 'private' }).searchParams.get('q'), /orgid:"synthetic\\-org" AND \(access:private OR access:shared\)/);
});

test('advanced expressions retain syntax while scope, sharing and application type stay outside their group', () => {
  for (const selection of [
    { scope: 'online', sharing: 'public' },
    { scope: 'mine', owner: 'owner', sharing: 'private' },
    { scope: 'org', orgId: 'synthetic-org', sharing: 'org' }
  ]) {
    const base = gallery().searchUrl(selection).searchParams.get('q');
    for (const expression of ['owner:dwright_storymaps', 'owner:one OR owner:two',
      'tags:"ocean science" AND NOT title:test', 'modified:[1600000000000 TO 1800000000000]',
      '(title:Ocean OR title:Coast) AND owner:dwright_storymaps', 'title:"a (quoted) phrase"', 'title:escaped\\(text\\)']) {
      const query = gallery().searchUrl({ ...selection, searchMode: 'advanced', title: expression }).searchParams.get('q');
      assert.equal(query, base + ' AND (' + expression + ')');
    }
    assert.equal(gallery().searchUrl({ ...selection, searchMode: 'advanced', title: '  ' }).searchParams.get('q'), base);
  }
});

test('advanced expressions cannot close the constraint group or leave its delimiters escaped', () => {
  for (const title of [') OR owner:other (', 'owner:other)', '(owner:other', 'title:"unclosed', 'owner:other\\']) {
    assert.throws(() => gallery().searchUrl({ scope: 'online', searchMode: 'advanced', title }),
      error => error.code === 'invalid_search_expression');
  }
  assert.match(gallery().searchUrl({ scope: 'online', title: 'owner:dwright_storymaps' }).searchParams.get('q'),
    /title:"owner\\:dwright_storymaps"$/);
});

test('organization results allow accessible other-owner items without granting conversion', () => {
  const config = configuration();
  const selection = { scope: 'org', orgId: 'synthetic-org', owner: 'owner', sharing: 'private' };
  for (const access of ['private', 'shared']) {
    const story = gallery().storyFromItem(item(1, { owner: 'another', access, orgId: selection.orgId }), config, selection);
    assert.ok(story);
    config.gallery.converter.enabled = true;
    assert.equal(gallery().convertUrl(story, config, 'owner'), null);
  }
  assert.equal(gallery().storyFromItem(item(1, { access: 'private', orgId: 'other-org' }), config, selection), null);
});

test('gallery sorting uses documented fields and explicit directions with safe defaults', () => {
  for (const sort of ['modified', 'created', 'title', 'owner', 'numviews', 'avgrating', 'numratings', 'numcomments', 'scorecompleteness']) {
    for (const sortOrder of ['asc', 'desc']) {
      const url = gallery().searchUrl({ scope: 'online', sort, sortOrder });
      assert.equal(url.searchParams.get('sortField'), sort);
      assert.equal(url.searchParams.get('sortOrder'), sortOrder);
      assert.equal(url.searchParams.has('token'), false);
    }
  }
  const invalid = gallery().searchUrl({ scope: 'online', sort: 'arbitrary', sortOrder: 'arbitrary' });
  assert.equal(invalid.searchParams.get('sortField'), 'modified');
  assert.equal(invalid.searchParams.get('sortOrder'), 'desc');
  assert.equal(gallery().searchUrl({ scope: 'online', sort: 'title' }).searchParams.get('sortOrder'), 'asc');
});

test('page shortcuts include the current neighborhood and known endpoints without invented pages', () => {
  assert.deepEqual(gallery().pageNumbers(0, 0), []);
  assert.deepEqual(gallery().pageNumbers(1, 1), [1]);
  assert.deepEqual(gallery().pageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(gallery().pageNumbers(8, 20), [1, 7, 8, 9, 20]);
  assert.deepEqual(gallery().pageNumbers(20, 20), [1, 18, 19, 20]);
});

test('pager exposes only filtered buffered pages and shares a bounded jump request budget', async () => {
  let requests = 0;
  const pager = gallery().createPager({ pageSize: 2, accept: candidate => candidate.keep && candidate,
    fetchPage: async start => {
      requests++;
      return { results: Array.from({ length: 10 }, (_, offset) => ({ id: start + offset, keep: offset % 2 === 0 })), nextStart: start + 10, total: 10000 };
    }
  });
  assert.equal(pager.bufferedPages(), 0);
  const first = await pager.next();
  assert.equal(first.requests, 1);
  assert.equal(pager.bufferedPages(), 2);
  await pager.next(undefined, 0);
  const partial = await pager.next(undefined, 0);
  assert.equal(partial.items.length, 1);
  assert.equal(partial.hasMore, true);
  assert.equal(pager.bufferedPages(), 0);
  assert.equal(requests, 1);
});

test('conversion is gated by identity, deployment approval and supported runtime', () => {
  const config = configuration();
  config.gallery.converter.enabled = false;
  assert.equal(gallery().convertUrl(item(1, { runtime: 'mapjournal' }), config, 'owner'), null);
  config.gallery.converter.enabled = true;
  const story = item(1, { runtime: 'mapjournal' });
  for (const runtime of ['maptour', 'mapjournal', 'mapseries', 'cascade', 'swipe', 'shortlist', 'crowdsource', 'basic']) {
    const candidate = { ...story, runtime };
    assert.equal(gallery().convertUrl(candidate, config, ''), null, runtime);
    assert.equal(gallery().convertUrl(candidate, config, 'other-owner'), null, runtime);
    assert.equal(gallery().convertUrl({ ...candidate, id: 'invalid' }, config, 'owner'), null, runtime);
    assert.equal(gallery().convertUrl(candidate, config, 'owner'), 'https://convert.classicstorymaps.com/?appid=' + story.id, runtime);
  }
  assert.equal(gallery().convertUrl({ ...story, runtime: 'unknown' }, config, 'owner'), null);
  config.gallery.converter.url = 'javascript:alert(1)';
  assert.equal(gallery().convertUrl(story, config, 'owner'), null);
});

test('HTTP conversion requires explicit development opt-in and a loopback destination', () => {
  const config = configuration();
  const converter = config.gallery.converter;
  const story = item(1, { runtime: 'mapjournal' });
  converter.enabled = true;
  converter.url = 'http://localhost:8888/';
  assert.equal(gallery().convertUrl(story, config, 'owner'), null);
  converter.allowLocalHttp = true;
  assert.equal(gallery().convertUrl(story, config, 'owner'), 'http://localhost:8888/?appid=' + story.id);
  assert.equal(gallery().convertUrl(story, config, ''), null);
  assert.equal(gallery().convertUrl({ ...story, runtime: 'shortlist' }, config, 'owner'), 'http://localhost:8888/?appid=' + story.id);
  assert.equal(gallery().convertUrl({ ...story, runtime: 'unknown' }, config, 'owner'), null);
  for (const url of ['http://example.org/', 'http://localhost.example.org/', 'http://user:password@localhost:8888/', 'ftp://localhost/']) {
    converter.url = url;
    assert.equal(gallery().convertUrl(story, config, 'owner'), null, url);
  }
});

test('pager crosses sparse pages, deduplicates and buffers excess results', async () => {
  const starts = [];
  const pager = gallery().createPager({ pageSize: 2, accept: candidate => candidate.keep && candidate,
    fetchPage: async start => {
      starts.push(start);
      return start === 1 ? { results: [{ id: 'skip' }], nextStart: 101 }
        : { results: ['a', 'a', 'b', 'c'].map(id => ({ id, keep: true })), nextStart: -1 };
    }
  });
  const first = await pager.next();
  assert.deepEqual(first.items.map(story => story.id), ['a', 'b']);
  assert.equal(first.hasMore, true);
  assert.deepEqual((await pager.next()).items.map(story => story.id), ['c']);
  assert.deepEqual(starts, [1, 101]);
});

test('pager bounds empty-page fetching and does not falsely claim exhaustion', async () => {
  let requests = 0;
  const pager = gallery().createPager({ accept: () => null,
    fetchPage: async start => { requests++; return { results: [], nextStart: start + 100 }; }
  });
  const page = await pager.next();
  assert.equal(requests, 3);
  assert.equal(page.items.length, 0);
  assert.equal(page.hasMore, true);
  assert.equal(page.continuation, true);
});

test('pager rejects repeated cursors, preserves state after errors and handles result limit', async () => {
  const repeated = gallery().createPager({ accept: candidate => candidate, fetchPage: async () => ({ results: [], nextStart: 1 }) });
  await assert.rejects(repeated.next(), /cursor/i);
  let fail = true;
  const starts = [];
  const retry = gallery().createPager({ accept: candidate => candidate, fetchPage: async start => {
    starts.push(start);
    if (fail) { fail = false; throw new Error('offline'); }
    return { results: [], nextStart: 10001 };
  } });
  await assert.rejects(retry.next(), /offline/);
  const page = await retry.next();
  assert.deepEqual(starts, [1, 1]);
  assert.equal(page.hasMore, false);
  assert.equal(page.limited, true);
});

test('REST client fixes the origin, keeps tokens out of URLs, and classifies auth errors', async () => {
  const calls = [];
  const client = gallery().createClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ error: { code: 498 } }) };
  });
  await assert.rejects(client.json(new URL('https://www.arcgis.com/sharing/rest/community/self?f=json'), 'synthetic-token'), error => error.code === 498);
  assert.doesNotMatch(calls[0].url, /synthetic-token|token=/);
  assert.equal(calls[0].options.headers['X-Esri-Authorization'], 'Bearer synthetic-token');
  await assert.rejects(client.json(new URL('https://other.example/sharing/rest/search'), 'synthetic-token'), /origin/i);
  assert.equal(calls.length, 1);
  assert.equal(gallery().thumbnailUrl(item(1, { thumbnail: '../outside' })), null);
  assert.equal(gallery().thumbnailUrl(item(1, { thumbnail: 'https://other.example/img.png' })), null);
});

test('only the explicit canceled subscription response gets the inactive-source message', async () => {
  for (const payload of [
    { code: 403, messageCode: 'SB_0006' },
    { code: 403 },
    { code: 403, messageCode: 'OTHER' },
    { code: 498, messageCode: 'SB_0006' }
  ]) {
    const client = gallery().createClient(async () => ({ ok: true, json: async () => ({ error: payload }) }));
    await assert.rejects(client.json(new URL('https://www.arcgis.com/sharing/rest/content/items/' + 'a'.repeat(32) + '?f=json')), error => {
      assert.equal(error.code, payload.code);
      assert.equal(error.messageCode, payload.messageCode);
      const inactive = payload.code === 403 && payload.messageCode === 'SB_0006';
      assert.equal(error.subscriptionInactive === true, inactive);
      if (inactive) assert.equal(error.message, "The source's ArcGIS Online subscription is no longer active.");
      return true;
    });
  }
});

test('Viewers starts with a hidden gallery and whole-card catalog links', () => {
  const page = readFileSync(new URL('viewers.html', site), 'utf8');
  assert.match(page, /id="stories-toggle"[^>]*aria-expanded="false"/);
  assert.match(page, /id="story-gallery"[^>]*hidden/);
  assert.match(page, /<a class="card"[^>]*href="\$\{app.launchRoute\}"/);
  assert.match(page, /ClassicStoryGallery.mount/);
  assert.match(page, /galleryController.setSession/);
  assert.ok(page.includes('This is a free, community-built project&mdash;not an official Esri product. These tools are not covered by Esri Technical Support. Use them at your own risk.'));
  assert.doesNotMatch(page, /I may put a link to a GitHub repo/);
});

test('all eight launchers opt into shared galleries and explicitly identify their advanced tools', () => {
  for (const runtime of Object.keys(configuration().appRegistry)) {
    const page = readFileSync(new URL(`${runtime}-launcher.html`, site), 'utf8');
    assert.ok(page.includes(`data-classic-runtime="${runtime}"`), runtime);
    assert.ok(page.includes('assets/js/classic-launcher.js'), runtime);
    assert.ok(page.includes('assets/css/classic-launcher.css'), runtime);
    assert.ok(page.indexOf('assets/js/classic-launcher.js') < page.indexOf('assets/js/classic-story-loader.js'));
    assert.match(page, /id="launch-form"/);
  }
  const loader = readFileSync(new URL('assets/js/classic-story-loader.js', site), 'utf8');
  assert.match(loader, /getAttribute\("data-classic-runtime"\)/);
});
