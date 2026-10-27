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
  const context = vm.createContext({ window: { location: { pathname } } });
  vm.runInContext(readFileSync(new URL('assets/js/classic-storymaps-config.js', site), 'utf8'), context);
  return context.window.ClassicStoryMapsConfig;
}

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
  assert.equal(config.gallery.converter.enabled, false);
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

test('omni input accepts IDs, hosted URLs, web map overrides and verified legacy aliases', () => {
  const appId = '0a48880ceab64924946a0a15a5383916';
  const webmap = '0c8ae0bb497143db9a29de4fbffaed73';
  assert.deepEqual(input().parse(appId), { appId, webmap: null });
  assert.deepEqual(input().parse('https://www.arcgis.com/apps/MapTour/index.html?appid=' + appId + '&webmap=' + webmap), { appId, webmap });
  assert.equal(input().parse('https://blm-egis.maps.arcgis.com/apps/Cascade/index.html?appid=6a9c3a5af20b43dea05fbd1e121ef6da').appId, '6a9c3a5af20b43dea05fbd1e121ef6da');
  assert.equal(input().parse('http://storymaps.esri.com/stories/2014/brazil-beyond-the-stadiums/').appId, 'cf69fa9aee724adf8b6f77d059ae08a9');
  assert.equal(input().parse('http://clear3.uconn.edu/viewers/bears/').appId, '137ee8cb7d05426ca95ae1330ebf4d38');
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

test('gallery membership validates owner, type, ID, public access and Classic metadata before routes', () => {
  const config = configuration();
  const accept = (candidate, owner = 'owner', sharing = 'public') => gallery().storyFromItem(candidate, config, { scope: owner ? 'mine' : 'online', owner, sharing });
  assert.equal(accept(item(1)).runtime, 'mapjournal');
  assert.equal(accept(item(1, { typeKeywords: [], tags: ['Story Map Journal'] })).runtime, 'mapjournal');
  assert.equal(accept(item(1, { tags: [] })).runtime, 'mapjournal');
  for (const override of [
    { owner: 'another' }, { type: 'StoryMap' }, { id: '../foreign' },
    { tags: [], typeKeywords: [], url: 'https://example.org/MapJournal/' },
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
  await assert.rejects(input().resolveItem(wrapper.id, { client, config }), error => error.code === 403 && /referenced story is unavailable/.test(error.message));
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
  assert.match(gallery().searchUrl({ scope: 'online', sharing: 'public' }).searchParams.get('q'), /typekeywords:Story\* OR tags:Story\*/);
  const search = gallery().searchUrl({ scope: 'mine', owner: 'test" OR owner:*', title: '" OR type:*', start: 1, sort: 'title' });
  assert.equal(search.origin, 'https://www.arcgis.com');
  assert.equal(search.searchParams.get('q'), 'owner:"test\\" OR owner\\:\\*" AND access:public AND type:"Web Mapping Application" AND (typekeywords:Story* OR tags:Story*) AND title:"\\" OR type\\:\\*"');
  const publicSearch = gallery().searchUrl({ scope: 'online', start: 1 });
  assert.match(publicSearch.searchParams.get('q'), /^access:public AND type:/);
  assert.doesNotMatch(publicSearch.href, /owner|token/);
  assert.throws(() => gallery().searchUrl({}), /source/);
  assert.throws(() => gallery().searchUrl({ scope: 'org' }), /source/i);
  assert.throws(() => gallery().searchUrl({ scope: 'online', sharing: 'private' }), /source/i);
  assert.match(gallery().searchUrl({ scope: 'org', orgId: 'synthetic-org', sharing: 'private' }).searchParams.get('q'), /orgid:"synthetic\\-org" AND \(access:private OR access:shared\)/);
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

test('conversion is gated by identity, deployment approval and supported runtime', () => {
  const config = configuration();
  assert.equal(gallery().convertUrl(item(1, { runtime: 'mapjournal' }), config, 'owner'), null);
  config.gallery.converter.enabled = true;
  const story = item(1, { runtime: 'mapjournal' });
  assert.equal(gallery().convertUrl(story, config, ''), null);
  assert.equal(gallery().convertUrl({ ...story, runtime: 'basic' }, config, 'owner'), null);
  const link = new URL(gallery().convertUrl(story, config, 'owner'));
  assert.equal(link.origin, 'https://regal-sable-0a6dde.netlify.app');
  assert.deepEqual([...link.searchParams], [['appid', story.id]]);
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
  assert.equal(gallery().convertUrl({ ...story, runtime: 'shortlist' }, config, 'owner'), null);
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
