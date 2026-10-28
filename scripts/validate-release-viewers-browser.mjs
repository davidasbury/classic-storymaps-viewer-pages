import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';

const publish = path.resolve(process.env.PUBLISH_CHECK_ROOT || 'publish');
const basePath = process.env.SITE_BASE_PATH ?? '/classic-storymaps-viewer-pages';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'classic-release-browser-'));
const modulePath = process.env.PLAYWRIGHT_NODE_MODULES;
const { chromium } = modulePath
  ? await import(pathToFileURL(path.join(modulePath, 'playwright/index.mjs')).href)
  : await import('playwright');
const archiveFixture = { calls: 0, mode: 'success', itemId: 'c'.repeat(32), target: 'a4a39ad4d78b40d9887bf4f19f2fef59', source: 'https://web.tplgis.org/unmapped/cascade/index.html' };
const archiveTesting = (process.env.RUNTIME_FILTER || '').split(',').includes('archive-discovery');
const archiveOptions = archiveTesting ? {
  storyArchiveOrigins: ['https://web.tplgis.org'],
  storyArchiveOptions: { fetchImpl: async (address, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers, undefined);
    const url = new URL(address);
    if (url.hostname === 'www.arcgis.com') return url.pathname.endsWith('/data') ? new Response('') : Response.json({
      id: archiveFixture.itemId, access: 'public', type: 'Web Mapping Application', url: archiveFixture.source, modified: Date.parse('2017-10-01') });
    assert.equal(url.hostname, 'web.archive.org');
    archiveFixture.calls++;
    return url.pathname.includes('/cdx/') ? Response.json([['timestamp', 'original', 'mimetype', 'statuscode'],
      ['20171001000000', archiveFixture.source, 'text/html', '200']]) : new Response('<script>var configOptions={appid:"' + archiveFixture.target + '"};</script>', { headers: { 'Content-Type': 'text/html' } });
  } }
} : {};
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(temporary, 'key.pem'), '-out', path.join(temporary, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = https.createServer({ key: await readFile(path.join(temporary, 'key.pem')), cert: await readFile(path.join(temporary, 'cert.pem')) }, createPreviewHandler({ root: publish, basePath, ...archiveOptions }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'https://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const results = [];
const selectedRuntimes = new Set((process.env.RUNTIME_FILTER || 'crowdsource,shortlist,mapseries,cascade').split(','));
async function observePage(width) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 850 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push('page: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
  page.on('requestfailed', request => errors.push('request: ' + request.url() + ' ' + request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400) errors.push('http: ' + response.status() + ' ' + response.url()); });
  return { context, page, errors };
}
try {
  if (selectedRuntimes.has('story-url-fallback')) {
    for (const runtime of ['catalog', 'mapjournal']) {
      for (const width of [1280, 390]) {
        const { context, page, errors } = await observePage(width);
        const result = { runtime, check: 'Esri story URL fallback', width };
        results.push(result);
        const itemId = 'b'.repeat(32);
        const jsonId = 'c'.repeat(32);
        const original = 'https://storymaps.esri.com/stories/2012/warming-cities/';
        const archived = 'https://storymaps.esri.com/archives/stories/2012/warming-cities/';
        const healthy = 'https://storymaps.esri.com/stories/healthy/';
        const requests = [];
        const payload = { nested: [{ url: original + '#cities' }], other: 'https://other.example/stories/2012/warming-cities/',
          html: '<p><a href="' + original + '">Story</a><iframe src="' + original + '"></iframe></p>',
          inert: '<img src="https://storymaps.esri.com/must-not-load.png" onerror="window.unexpectedExecution=true">',
          text: 'Keep this text exactly.', version: '1.9' };
        await context.route('https://storymaps.esri.com/**', route => {
          const request = route.request();
          requests.push({ url: request.url(), method: request.method() });
          if (request.method() === 'HEAD') {
            assert.equal(request.headers().authorization, undefined);
            assert.equal(request.headers()['x-esri-authorization'], undefined);
            assert.equal(request.headers().cookie, undefined);
            assert.equal(request.headers().referer, undefined);
          }
          return route.fulfill({ status: [archived, healthy].includes(request.url()) ? 200 : 404,
            contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' },
            body: '<!doctype html><title>Esri archived story</title><h1>Archived Warming Cities</h1>' });
        });
        await context.route('https://www.arcgis.com/sharing/rest/content/items/**', route => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname.endsWith('/' + itemId + '/data')) return route.fulfill({ json: {} });
          if (pathname.endsWith('/' + jsonId + '/data')) return route.fulfill({ json: payload });
          return route.fulfill({ json: { id: pathname.endsWith('/' + jsonId) ? jsonId : itemId,
            title: 'Original story', access: 'public', type: 'Web Mapping Application', url: original, typeKeywords: [] } });
        });
        try {
          await page.goto(origin + basePath + '/viewers/' + (runtime === 'catalog' ? '' : runtime + '/?appid=' + itemId));
          if (runtime === 'catalog') {
            await page.locator('#omni-appid').fill(itemId);
            await page.locator('#omni-form').evaluate(form => form.requestSubmit());
          }
          await page.getByRole('link', { name: 'Open Esri archived website', exact: true }).waitFor({ timeout: 60000 });
          assert.equal(await page.getByRole('link', { name: 'Open source website', exact: true }).getAttribute('href'), original);
          assert.equal(await page.locator('iframe[title="Source website"]').getAttribute('src'), archived);
          await page.frameLocator('iframe[title="Source website"]').getByRole('heading', { name: 'Archived Warming Cities' }).waitFor();
          const transformed = runtime === 'catalog'
            ? await page.evaluate(payload => window.ClassicStoryUrlFallback.prepare(payload), payload)
            : (await page.evaluate(jsonId => new Promise((resolve, reject) => require(['esri/arcgis/utils'], utils => utils.getItem(jsonId).then(resolve, reject))), jsonId)).itemData;
          assert.equal(transformed.nested[0].url, archived + '#cities');
          assert.equal(transformed.other, payload.other);
          assert.equal(transformed.text, payload.text);
          assert.equal(transformed.version, payload.version);
          assert.equal(transformed.inert, payload.inert);
          assert.ok(transformed.html.includes('href="' + archived + '"'));
          assert.ok(transformed.html.includes('src="' + archived + '"'));
          assert.equal(await page.evaluate(() => window.unexpectedExecution), undefined);
          assert.equal(requests.some(request => request.url.includes('must-not-load')), false);
          assert.equal(await page.evaluate(async healthy => {
            const input = { url: healthy };
            return await window.ClassicStoryUrlFallback.prepare(input) === input;
          }, healthy), true);
          assert.equal(requests.some(request => request.url.includes('/archives/stories/healthy/')), false);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.screenshot({ path: path.join(temporary, 'story-url-fallback-' + runtime + '-' + width + '.png') });
          assert.equal(errors.filter(error => error.startsWith('page:')).length, 0);
          result.pass = true;
        } catch (error) { result.pass = false; result.failure = error.message; }
        await context.close();
      }
    }
  }
  if (selectedRuntimes.has('source-iframe')) {
    for (const runtime of ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic', 'catalog']) {
      if (process.env.SOURCE_RUNTIME_FILTER && !process.env.SOURCE_RUNTIME_FILTER.split(',').includes(runtime)) continue;
      for (const width of [1280, 390]) {
        const { context, page, errors } = await observePage(width);
        const result = { runtime, check: 'source-website-fallback', width };
        results.push(result);
        const itemId = 'b'.repeat(32);
        const missingId = 'd'.repeat(32);
        const source = 'https://source.example/original/' + (width === 390 ? '?appid=' + missingId : '');
        const sourceRequests = [];
        let blocked = false;
        await context.route('**/*', route => {
          const request = route.request();
          const url = new URL(request.url());
          if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
          if (url.origin === 'https://source.example') {
            sourceRequests.push({ referer: request.headers().referer, authorization: request.headers().authorization, url: request.url() });
            return route.fulfill({ contentType: 'text/html', headers: blocked ? { 'Content-Security-Policy': "frame-ancestors 'none'" } : {},
              body: '<!doctype html><title>Original website</title><h1>Original recreation website</h1><button onclick="document.querySelector(\'h1\').textContent=\'Facilities directory\'">Facilities</button>' });
          }
          if (url.pathname.endsWith('/content/items/' + missingId)) return route.fulfill({ json: { error: { code: 403, message: 'Unavailable reference' } } });
          if (url.pathname.endsWith('/content/items/' + itemId + '/data')) return route.fulfill({ json: {} });
          if (url.pathname.endsWith('/content/items/' + itemId)) return route.fulfill({ json: {
            id: itemId, title: 'Unavailable reference', type: 'Web Mapping Application', access: 'public', url: source, typeKeywords: [] } });
          return route.continue();
        });
        try {
          await page.goto(origin + basePath + '/viewers/' + (runtime === 'catalog' ? '' : runtime + '/?appid=' + itemId));
          if (runtime === 'catalog') {
            await page.locator('#omni-appid').fill(itemId);
            await page.locator('#omni-form').evaluate(form => form.requestSubmit());
          } else await page.getByRole('heading', { name: 'Story unavailable', exact: true }).waitFor({ timeout: 60000 });
          const frame = page.frameLocator('iframe[title="Source website"]');
          await frame.getByRole('heading', { name: 'Original recreation website' }).waitFor();
          await page.waitForLoadState('networkidle');
          await frame.getByRole('button', { name: 'Facilities', exact: true }).click();
          await frame.getByRole('heading', { name: 'Facilities directory' }).waitFor();
          const iframe = page.locator('iframe[title="Source website"]');
          assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
          assert.equal(await iframe.getAttribute('referrerpolicy'), 'no-referrer');
          assert.equal(await iframe.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.width > 200 && bounds.left >= 0 && bounds.right <= innerWidth; }), true);
          assert.ok(sourceRequests.length > 0);
          assert.ok(sourceRequests.every(request => !request.referer && !request.authorization && request.url === source));
          await page.screenshot({ path: path.join(temporary, 'source-iframe-' + runtime + '-' + width + '.png') });
          blocked = true;
          const refused = page.waitForEvent('console', { predicate: message => /frame-ancestors/.test(message.text()), timeout: 15000 });
          refused.catch(() => {});
          await page.reload();
          if (runtime === 'catalog') {
            await page.locator('#omni-appid').fill(itemId);
            await page.locator('#omni-form').evaluate(form => form.requestSubmit());
          }
          await refused;
          const direct = page.getByRole('link', { name: 'Open source website', exact: true });
          assert.equal(await direct.getAttribute('href'), source);
          const opened = page.waitForEvent('popup');
          await direct.click();
          const website = await opened;
          await website.getByRole('heading', { name: 'Original recreation website' }).waitFor();
          assert.equal(await website.evaluate(() => window.opener), null);
          await website.close();
          const safety = await page.evaluate(() => {
            const outcomes = [];
            for (const url of ['javascript:alert(1)', 'https://user:password@source.example/', 'https://source.example/?token=hidden', 'https://source.example/#access_token=hidden', location.href, 'http://source.example/']) {
              const container = document.createElement('div');
              document.body.appendChild(container);
              const cleanup = ClassicStoryDiscovery.mount(container, { url }, { config: ClassicStoryMapsConfig });
              outcomes.push({ frames: container.querySelectorAll('iframe').length, links: container.querySelectorAll('a').length });
              cleanup();
              container.remove();
            }
            return outcomes;
          });
          assert.ok(safety.every(value => value.frames === 0));
          assert.ok(safety.slice(0, 5).every(value => value.links === 0));
          assert.equal(safety[5].links, 1);
          if (runtime === 'catalog') {
            await page.locator('#omni-appid').fill('changed');
            assert.equal(await iframe.count(), 0);
          }
          result.pass = true;
        } catch (error) { result.pass = false; result.failure = error.message; }
        await context.close();
        result.pageErrors = errors.filter(message => message.startsWith('page:'));
        if (result.pageErrors.length) result.pass = false;
      }
    }
  }
  if (selectedRuntimes.has('basemap-fallback') || selectedRuntimes.has('crowdsource-jquery')) {
    const mapId = '18af4863d44d45968360795e547cc5d1';
    const endpoint = 'https://www.arcgis.com/sharing/rest/content/items/' + mapId;
    const item = await (await fetch(endpoint + '?f=json')).json();
    const itemData = await (await fetch(endpoint + '/data?f=json')).json();
    assert.equal(item.id, mapId);
    assert.equal(itemData.operationalLayers.length, 2);
    const fixture = { item, itemData };
    for (const runtime of selectedRuntimes.has('basemap-fallback') ? ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic'] : []) {
      const { context, page, errors } = await observePage(runtime === 'basic' ? 390 : 1280);
      const result = { runtime, check: 'shared-basemap-sdk', writes: [] };
      results.push(result);
      const syntheticId = 'e'.repeat(32);
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'OPTIONS'].includes(request.method())) {
          result.writes.push(url.origin + url.pathname);
          return route.abort();
        }
        if (url.pathname.endsWith('/content/items/' + syntheticId)) return route.fulfill({ json: {
          id: syntheticId, type: 'Web Map', title: 'Stopped native startup fixture', access: 'public' } });
        return route.continue();
      });
      try {
        await page.goto(origin + basePath + '/viewers/' + runtime + '/?appid=' + syntheticId);
        await page.getByRole('heading', { name: 'Story unavailable', exact: true }).waitFor({ timeout: 45000 });
        const rendered = await page.evaluate(info => new Promise((resolve, reject) => {
          const container = document.createElement('div');
          container.id = 'basemap-contract-map';
          container.style.cssText = 'position:fixed;inset:0;';
          document.body.replaceChildren(container);
          window.require(['esri/arcgis/utils'], utils => {
            utils.createMap(info, container, { mapOptions: { showAttribution: true } }).then(response => {
              window.basemapContractMap = response.map;
              resolve({ basemap: response.itemInfo.itemData.baseMap,
                operationalLayers: response.itemInfo.itemData.operationalLayers.map(layer => ({ id: layer.id, url: layer.url })),
                loaded: response.map.getLayer('classic-topographic-fallback')?.loaded === true });
            }, reject);
          });
        }), fixture);
        assert.equal(rendered.basemap.baseMapLayers.length, 1);
        assert.equal(rendered.basemap.baseMapLayers[0].itemId, '7dc6cea0b1764a1f9af2e679f642f0f5');
        assert.equal(rendered.loaded, true);
        assert.deepEqual(rendered.operationalLayers, itemData.operationalLayers.map(layer => ({ id: layer.id, url: layer.url })));
        const notice = page.locator('.classic-basemap-notice');
        await notice.waitFor();
        assert.match(await notice.innerText(), /original web map has not been modified/);
        await notice.locator('summary').click();
        assert.equal(await notice.getByRole('link', { name: 'Open web map in Map Viewer' }).getAttribute('href'), 'https://www.arcgis.com/apps/mapviewer/index.html?webmap=' + mapId);
        assert.equal(await notice.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
        }), true);
        await page.screenshot({ path: path.join(temporary, 'basemap-' + runtime + '.png') });
        await notice.getByRole('button', { name: 'Dismiss basemap notice' }).click();
        assert.equal(await notice.count(), 0);
        assert.deepEqual(result.writes, []);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
    for (const width of [1440, 390]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'crowdsource', check: 'live-basemap-fallback', width, writes: [], readOnlyQueries: [] };
      results.push(result);
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        const attachmentEndpoint = itemData.operationalLayers.find(layer => layer.id === 'crowdsource-layer-1510693645817').url + '/queryAttachments';
        if (request.method() === 'POST' && url.origin + url.pathname === attachmentEndpoint) {
          result.readOnlyQueries.push(url.pathname);
          return route.continue();
        }
        if (!['GET', 'OPTIONS'].includes(request.method())) {
          result.writes.push(new URL(request.url()).pathname);
          return route.abort();
        }
        return route.continue();
      });
      try {
        await page.goto(origin + basePath + '/viewers/crowdsource/?appid=38e18b052b9440a0927a5adb524c2c4a');
        await page.locator('.classic-basemap-notice').waitFor({ timeout: 60000 });
        await page.locator('button.explore').waitFor({ state: 'attached' });
        if (await page.locator('button.explore').isVisible()) await page.locator('button.explore').click();
        else await page.getByRole('button', { name: 'Map', exact: true }).click();
        await page.locator('.gallery-item').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => {
          const map = document.querySelector('.map-pane');
          if (!map) return false;
          const bounds = map.getBoundingClientRect();
          const splash = document.querySelector('.splash');
          if (splash && splash.getBoundingClientRect().bottom > bounds.top + 1) return false;
          const center = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 3);
          return bounds.width > 100 && bounds.height > 100 && center && map.contains(center);
        });
        assert.ok(await page.locator('.gallery-item').count() > 0);
        if (selectedRuntimes.has('crowdsource-jquery')) {
          result.jquerySecurity = await page.evaluate(() => new Promise((resolve, reject) => {
            require(['jquery', 'babel/store/reducers/items/app/App', 'babel/constants/actionsTypes/Arcgis'], (jquery, reducer, types) => {
              try {
                const response = JSON.parse('{"item":{"title":"Audit"},"data":{"__proto__":{"classicVisitorAuditMarker":true},"values":{"normal":"kept"}}}');
                const state = reducer.app({}, { type: types.RECEIVE_APP_ITEM, response });
                resolve({ version: jquery.fn.jquery, polluted: ({}).classicVisitorAuditMarker === true,
                  normal: state.data.values.normal, title: state.item.title });
              } catch (error) { reject(error); }
              finally { delete Object.prototype.classicVisitorAuditMarker; }
            }, reject);
          }));
          assert.deepEqual(result.jquerySecurity, { version: '3.7.1', polluted: false, normal: 'kept', title: 'Audit' });
        }
        assert.equal(await page.locator('.classic-basemap-notice').evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth;
        }), true);
        await page.screenshot({ path: path.join(temporary, 'basemap-crowdsource-live-' + width + '.png') });
        assert.deepEqual(result.writes, []);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
  }
  if (selectedRuntimes.has('crowdsource-invalid')) {
    const itemId = '6d580febadc04c7b896568bfaadbcdbf';
    const endpoint = 'https://www.arcgis.com/sharing/rest/content/items/' + itemId;
    const nearby = await (await fetch(endpoint + '?f=json', { signal: AbortSignal.timeout(20000) })).json();
    const payload = await (await fetch(endpoint + '/data?f=json', { signal: AbortSignal.timeout(20000) })).json();
    assert.equal(nearby.id, itemId);
    assert.equal(payload.authoringApp, 'InstantAppsHomePage');
    assert.ok(payload.values && !payload.values.settings);
    const classic = { ...nearby, id: 'd'.repeat(32), title: 'Classic Crowdsource control', tags: ['Story Maps'],
      typeKeywords: ['Story Map Crowdsource'], url: 'https://www.arcgis.com/apps/Crowdsource/?appid=' + 'd'.repeat(32) };
    for (const width of [1280, 390]) {
      for (const mode of ['preflight', 'native']) {
        const { context, page, errors } = await observePage(width);
        const result = { runtime: 'crowdsource', check: 'invalid-data-' + mode, width, navigations: [] };
        results.push(result);
        let nativeDataReads = 0;
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            result.navigations.push(request.url());
            if (url.searchParams.has('edit')) return route.abort();
          }
          if (url.pathname === '/sharing/rest/search') return route.fulfill({ json: { results: [nearby, classic], nextStart: -1 } });
          if (url.pathname.endsWith('/content/items/' + itemId) && mode === 'native') {
            const metadata = { ...classic, id: itemId, url: 'https://www.arcgis.com/apps/Crowdsource/?appid=' + itemId };
            return url.searchParams.has('callback') ? route.fulfill({ contentType: 'application/javascript', body: url.searchParams.get('callback') + '(' + JSON.stringify(metadata) + ')' }) : route.fulfill({ json: metadata });
          }
          if (url.pathname.endsWith('/content/items/' + itemId + '/data')) {
            nativeDataReads++;
            return url.searchParams.has('callback') ? route.fulfill({ contentType: 'application/javascript', body: url.searchParams.get('callback') + '(' + JSON.stringify(payload) + ')' }) : route.fulfill({ json: payload });
          }
          return route.continue();
        });
        try {
          await page.goto(origin + basePath + '/viewers/crowdsource/index.html?appid=' + itemId);
          const message = mode === 'native' ? 'Something went wrong, the app did not load correctly.' : 'This viewer could not determine which Classic Story Map format to use for this item. The item may still be a Classic story.';
          await page.getByText(message, { exact: true }).waitFor({ timeout: 60000 });
          if (mode === 'native') await page.waitForFunction(() => {
            const message = document.querySelector('.loading-error-message .message');
            if (!message) return false;
            const bounds = message.getBoundingClientRect();
            return Number(getComputedStyle(message.closest('.loading-error-message')).opacity) >= 0.99
              && !document.querySelector('.loadingIndicator') && bounds.width > 0 && bounds.height > 0
              && message.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
          }, undefined, { timeout: 10000 });
          assert.equal(result.navigations.length, 1);
          assert.equal(new URL(page.url()).searchParams.has('edit'), false);
          assert.equal(nativeDataReads, mode === 'native' ? 1 : 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.screenshot({ path: path.join(temporary, 'crowdsource-invalid-' + mode + '-' + width + '.png') });
          if (mode === 'preflight') {
            await page.goto(origin + basePath + '/viewers/');
            await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
            await page.getByRole('link', { name: 'View ' + classic.title, exact: true }).waitFor();
            assert.equal(await page.getByRole('link', { name: 'View ' + nearby.title, exact: true }).count(), 0);
            await page.locator('#omni-appid').fill(itemId);
            await page.locator('#omni-form').evaluate(form => form.requestSubmit());
            await page.locator('#omni-status').getByText(message, { exact: true }).waitFor();
            assert.equal(context.pages().length, 1);
          }
          result.pass = true;
        } catch (error) { result.pass = false; result.failure = error.message; }
        await context.close();
        result.pageErrors = errors.filter(message => message.startsWith('page:'));
        if (result.pageErrors.length) result.pass = false;
      }
    }
  }
  if (selectedRuntimes.has('blank-cascade')) {
    const { context, page, errors } = await observePage(1280);
    const itemId = 'd'.repeat(32);
    const result = { runtime: 'cascade', check: 'empty-editor-no-builder-loop', navigations: [] };
    results.push(result);
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        result.navigations.push(request.url());
        if (result.navigations.length > 1) return route.abort();
      }
      if (url.pathname.endsWith('/cascade/app/viewer-min.js')) {
        const response = await route.fetch();
        const text = await response.text();
        const blank = /([\w$]+\.isStoryBlank\(\))\?/g;
        assert.equal([...text.matchAll(blank)].length, 1);
        return route.fulfill({ response, body: text.replace(blank, '(app.userCanEdit=true,$1)?') });
      }
      if (url.pathname.includes('/content/items/' + itemId)) {
        const payload = url.pathname.endsWith('/data') ? {} : { id: itemId, title: 'Empty editor fixture', owner: 'synthetic-owner',
          type: 'Web Mapping Application', access: 'public', typeKeywords: ['Story Map Cascade'], url: 'https://www.arcgis.com/apps/Cascade/?appid=' + itemId };
        return url.searchParams.has('callback') ? route.fulfill({ contentType: 'application/javascript', body: url.searchParams.get('callback') + '(' + JSON.stringify(payload) + ')' }) : route.fulfill({ json: payload });
      }
      return route.continue();
    });
    try {
      await page.goto(origin + basePath + '/viewers/cascade/index.html?appid=' + itemId);
      await page.getByText('The story is not configured yet.', { exact: true }).waitFor({ timeout: 60000 });
      assert.equal(await page.evaluate(() => window.app.userCanEdit), true);
      assert.equal(result.navigations.length, 1);
      assert.equal(new URL(page.url()).searchParams.has('edit'), false);
      result.pass = true;
    } catch (error) { result.pass = false; result.failure = error.message; }
    await context.close();
    result.pageErrors = errors.filter(message => message.startsWith('page:'));
    if (result.pageErrors.length) result.pass = false;
  }
  if (archiveTesting) {
    for (const width of [1280, 390]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'archive-discovery', width };
      results.push(result);
      let relayRequests = 0;
      let hold;
      let holdNext = false;
      let ambiguous = false;
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && url.pathname.endsWith('/api/story-archive')) {
          relayRequests++;
          assert.equal(request.headers()['x-esri-authorization'], undefined);
          assert.equal(request.headers().cookie, undefined);
          if (holdNext) { hold = route; holdNext = false; return; }
          if (ambiguous) return route.fulfill({ json: { snapshot: null, reason: 'no_unique_app_id' } });
          return route.continue();
        }
        if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
        if (url.pathname.endsWith('/content/items/' + archiveFixture.itemId + '/data')) return route.fulfill({ body: '', contentType: 'application/json' });
        if (url.pathname.endsWith('/content/items/' + archiveFixture.itemId)) return route.fulfill({ json: {
          id: archiveFixture.itemId, title: 'Archived configuration pointer', access: 'public', type: 'Web Mapping Application',
          typeKeywords: ['Story Map Cascade'], url: archiveFixture.source } });
        return route.continue();
      });
      try {
        await page.goto(origin + basePath + '/viewers/cascade/index.html?appid=' + archiveFixture.itemId);
        const lookup = page.getByRole('button', { name: 'Look up in Wayback Machine', exact: true });
        await lookup.waitFor({ timeout: 60000 });
        assert.equal(await lookup.isDisabled(), true);
        assert.equal(relayRequests, 0);
        assert.equal(await page.getByRole('link', { name: 'Open source website' }).getAttribute('href'), archiveFixture.source);
        await page.getByRole('checkbox').check();
        holdNext = true;
        await lookup.click();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByText('Lookup canceled.', { exact: true }).waitFor();
        if (hold) await hold.abort().catch(() => {});
        ambiguous = true;
        await lookup.click();
        await page.getByText('The archived page has no unambiguous supported app ID.', { exact: true }).waitFor();
        ambiguous = false;
        await lookup.click();
        const open = page.getByRole('link', { name: 'Open live story', exact: true });
        await open.waitFor({ timeout: 60000 });
        assert.equal(new URL(await open.getAttribute('href')).searchParams.get('appid'), archiveFixture.target);
        assert.equal(await page.getByRole('link', { name: 'Archived source (2017-10-01)', exact: true }).getAttribute('href'),
          'https://web.archive.org/web/20171001000000id_/' + archiveFixture.source);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(temporary, 'archive-discovery-' + width + '.png') });
        const popupPromise = page.waitForEvent('popup');
        await open.click();
        const story = await popupPromise;
        await story.waitForFunction(id => window.app?.data?.appItem?.item?.id === id, archiveFixture.target, { timeout: 60000 });
        await story.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 });
        assert.equal(await story.evaluate(() => window.opener), null);
        await story.screenshot({ path: path.join(temporary, 'archive-live-story-' + width + '.png') });
        await story.close();
        await page.getByRole('checkbox').uncheck();
        assert.equal(await open.count(), 0);
        await page.goto(origin + basePath + '/viewers/');
        await page.locator('#omni-appid').fill(archiveFixture.itemId);
        await page.locator('#omni-form').evaluate(form => form.requestSubmit());
        await lookup.waitFor();
        await page.getByRole('checkbox').check();
        await lookup.click();
        await open.waitFor({ timeout: 60000 });
        await page.locator('#omni-appid').fill('changed');
        assert.equal(await lookup.count(), 0);
        result.relayRequests = relayRequests;
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
    const { context, page, errors } = await observePage(1280);
    const result = { runtime: 'cascade', check: 'verified-will-rogers-pointer' };
    results.push(result);
    try {
      await context.route('**/*', route => ['GET', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
      await page.goto(origin + basePath + '/viewers/cascade/index.html?appid=6f336f5b90594c7fbdb204a9268c925b');
      await page.waitForFunction(id => window.app?.data?.appItem?.item?.id === id, archiveFixture.target, { timeout: 60000 });
      await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 });
      assert.equal(new URL(page.url()).searchParams.get('appid'), archiveFixture.target);
      await page.screenshot({ path: path.join(temporary, 'verified-will-rogers.png') });
      result.pass = true;
    } catch (error) { result.pass = false; result.failure = error.message; }
    await context.close();
    result.pageErrors = errors.filter(message => message.startsWith('page:'));
    if (result.pageErrors.length) result.pass = false;
  }
  if (selectedRuntimes.has('source-status')) {
    for (const width of [1280, 390]) {
      const { context, page, errors } = await observePage(width);
      const pointer = 'a'.repeat(32);
      const target = 'b'.repeat(32);
      const wrapper = { id: pointer, title: 'Source subscription example', owner: 'public-owner', access: 'public',
        type: 'Web Mapping Application', typeKeywords: ['Story Map Cascade'],
        url: 'https://other-org.maps.arcgis.com/apps/Cascade/?appid=' + target };
      let mode = 'inactive';
      const message = "The source's ArcGIS Online subscription is no longer active.";
      const result = { runtime: 'source-status', width };
      results.push(result);
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
        if (url.pathname === '/sharing/rest/search') return route.fulfill({ json: { results: [wrapper], nextStart: -1 } });
        if (url.pathname.endsWith('/content/items/' + pointer + '/data')) return route.fulfill({ body: '', contentType: 'application/json' });
        if (url.pathname.endsWith('/content/items/' + pointer)) return route.fulfill({ json: wrapper });
        if (url.pathname.endsWith('/content/items/' + target)) return route.fulfill({ json: mode === 'recovered'
          ? { ...wrapper, id: target, url: 'https://www.arcgis.com/apps/Cascade/?appid=' + target }
          : { error: mode === 'inactive' ? { code: 403, messageCode: 'SB_0006' } : { code: 403 } } });
        if (url.origin === origin && url.searchParams.get('appid') === target) return route.fulfill({ body: '<title>Recovered story</title>', contentType: 'text/html' });
        return route.continue();
      });
      try {
        await page.goto(origin + basePath + '/viewers/');
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        const card = page.locator('.story-card');
        await card.waitFor();
        const badge = card.locator('.story-source-status');
        assert.equal(await badge.isVisible(), false);
        const popupPromise = page.waitForEvent('popup');
        await card.getByRole('link', { name: 'View ' + wrapper.title, exact: true }).click();
        const viewer = await popupPromise;
        viewer.on('pageerror', error => errors.push('page: ' + error.message));
        await viewer.getByText(message, { exact: true }).waitFor({ timeout: 60000 });
        await badge.waitFor({ state: 'visible' });
        assert.equal(await badge.innerText(), 'Source subscription inactive');
        assert.equal(await viewer.evaluate(() => window.opener), null);
        await viewer.screenshot({ path: path.join(temporary, 'source-inactive-viewer-' + width + '.png') });
        await page.bringToFront();
        await card.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const cardBounds = await card.boundingBox();
        const badgeBounds = await badge.boundingBox();
        assert.ok(badgeBounds.x >= cardBounds.x && badgeBounds.x + badgeBounds.width <= cardBounds.x + cardBounds.width);
        await card.screenshot({ path: path.join(temporary, 'source-inactive-card-' + width + '.png') });
        await page.reload();
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        await badge.waitFor({ state: 'visible' });
        mode = 'denied';
        await viewer.reload();
        await viewer.getByText('The referenced story is unavailable or is not shared with your account.', { exact: true }).waitFor({ timeout: 60000 });
        await badge.waitFor({ state: 'hidden' });
        mode = 'inactive';
        await viewer.reload();
        await viewer.getByText(message, { exact: true }).waitFor({ timeout: 60000 });
        await badge.waitFor({ state: 'visible' });
        mode = 'recovered';
        await viewer.reload();
        await viewer.waitForURL(url => url.searchParams.get('appid') === target, { timeout: 60000 });
        await badge.waitFor({ state: 'hidden' });
        mode = 'inactive';
        await page.locator('#omni-appid').fill(pointer);
        await page.locator('#omni-form').evaluate(form => form.requestSubmit());
        await page.getByText(message, { exact: true }).waitFor();
        await badge.waitFor({ state: 'visible' });
        await page.evaluate(() => {
          const now = Date.now;
          Date.now = () => now() + 1800001;
          window.dispatchEvent(new Event('focus'));
          Date.now = now;
        });
        await badge.waitFor({ state: 'hidden' });
        await viewer.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }));
        await viewer.goto(origin + basePath + '/viewers/cascade/index.html?appid=' + pointer);
        await viewer.getByText(message, { exact: true }).waitFor({ timeout: 60000 });
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
  }
  if (selectedRuntimes.has('pointers')) {
    for (const runtime of ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic']) {
      const { context, page, errors } = await observePage(1280);
      const pointer = 'a'.repeat(32);
      const target = 'b'.repeat(32);
      const result = { runtime, check: 'pointer-startup', wrapperDataRequests: 0 };
      results.push(result);
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
        if (url.pathname.endsWith('/content/items/' + pointer + '/data')) {
          result.wrapperDataRequests++;
          return route.fulfill({ json: {} });
        }
        if (url.pathname.endsWith('/content/items/' + pointer)) {
          return route.fulfill({ json: { id: pointer, type: 'Web Mapping Application', typeKeywords: ['Story Map Cascade'],
            url: 'https://other-org.maps.arcgis.com/apps/Cascade/?appid=' + target } });
        }
        if (url.pathname.endsWith('/content/items/' + target)) {
          return route.fulfill({ json: { id: target, type: 'Web Mapping Application', typeKeywords: ['Story Map Journal'],
            url: 'https://www.arcgis.com/apps/MapJournal/?appid=' + target } });
        }
        if (url.origin === origin && url.searchParams.get('appid') === target) {
          return route.fulfill({ contentType: 'text/html', body: '<title>Resolved target</title>' });
        }
        return route.continue();
      });
      try {
        await page.goto(origin + basePath + '/viewers/' + runtime + '/index.html?appid=' + pointer + '&embed#section', { waitUntil: 'domcontentloaded' });
        await page.waitForURL(url => url.searchParams.get('appid') === target, { timeout: 60000 });
        const destination = new URL(page.url());
        assert.equal(destination.pathname, basePath + '/viewers/mapjournal/index.html');
        assert.equal(destination.searchParams.has('embed'), true);
        assert.equal(destination.hash, '#section');
        assert.equal(result.wrapperDataRequests, 1);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
    for (const width of [1280, 390]) {
      for (const mode of ['public-story', 'unavailable', 'loop']) {
        const { context, page, errors } = await observePage(width);
        const pointer = 'a'.repeat(32);
        const target = mode === 'public-story' ? 'f2e8448fef064238ace4f324ffc16fde' : 'b'.repeat(32);
        const result = { runtime: 'cascade', width, check: 'pointer-' + mode, wrapperDataRequests: 0 };
        results.push(result);
        await context.route('**/*', route => {
          const request = route.request();
          const url = new URL(request.url());
          if (!['GET', 'OPTIONS'].includes(request.method())) return route.abort();
          if (url.pathname.endsWith('/content/items/' + pointer + '/data')) {
            result.wrapperDataRequests++;
            return route.fulfill({ contentType: 'application/json', body: '' });
          }
          if (mode === 'loop' && url.pathname.endsWith('/content/items/' + target + '/data')) return route.fulfill({ json: {} });
          if (url.pathname.endsWith('/content/items/' + pointer)) {
            return route.fulfill({ json: { id: pointer, type: 'Web Mapping Application',
              url: 'https://other-org.maps.arcgis.com/apps/Cascade/?appid=' + target } });
          }
          if (mode !== 'public-story' && url.pathname.endsWith('/content/items/' + target)) {
            return route.fulfill({ json: mode === 'unavailable' ? { error: { code: 403, message: 'Not accessible' } }
              : { id: target, type: 'Web Mapping Application', url: 'https://www.arcgis.com/apps/Cascade/?appid=' + pointer } });
          }
          return route.continue();
        });
        try {
          await page.goto(origin + basePath + '/viewers/cascade/index.html?appid=' + pointer, { waitUntil: 'domcontentloaded' });
          if (mode === 'public-story') {
            await page.waitForFunction(id => window.app?.data?.appItem?.item?.id === id, target, { timeout: 60000 });
            await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 });
            assert.equal(new URL(page.url()).searchParams.get('appid'), target);
            assert.ok((await page.locator('body').innerText()).length > 100);
          } else {
            await page.getByRole('heading', { name: 'Story unavailable', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
            assert.match(await page.getByRole('alert').innerText(), mode === 'loop' ? /loop/ : /referenced story is unavailable/);
            assert.equal(new URL(page.url()).searchParams.get('appid'), pointer);
            assert.equal(await page.getByRole('link', { name: 'Back to Viewers' }).getAttribute('href'), basePath + '/viewers/');
          }
          assert.equal(result.wrapperDataRequests, 1);
          await page.screenshot({ path: path.join(temporary, 'pointer-' + mode + '-' + width + '.png') });
          result.pass = true;
        } catch (error) { result.pass = false; result.failure = error.message; }
        await context.close();
        result.pageErrors = errors.filter(message => message.startsWith('page:'));
        if (result.pageErrors.length) result.pass = false;
      }
    }
  }
  if (selectedRuntimes.has('owner-controls') || selectedRuntimes.has('html-text-security')) {
    const htmlTextTesting = selectedRuntimes.has('html-text-security');
    const targets = [
      { runtime: 'maptour', appid: '10c62c6bd29f4175b26386aa46cf5a40' },
      { runtime: 'swipe', appid: '5c851a0bd60d42f0b2955966ee933465' },
      { runtime: 'mapjournal', appid: '68affb679afc40718babf3493927b4ac' },
      { runtime: 'mapseries', appid: '167ca9b1c85e4c7ea5eac8c6be43358b' },
      { runtime: 'cascade', appid: 'f2e8448fef064238ace4f324ffc16fde' },
      { runtime: 'shortlist', appid: '5a9c34acf59a49f0a67d5f7293b44d6b' },
      { runtime: 'crowdsource', appid: 'f1fcc302b0864b0c94beffc5177da2b8' },
      { runtime: 'basic', appid: 'ef329532de2645239789978efe531f3b' }
    ];
    for (const target of targets) {
      if (htmlTextTesting && ['crowdsource', 'basic'].includes(target.runtime)) continue;
      if (process.env.OWNER_RUNTIME_FILTER && !process.env.OWNER_RUNTIME_FILTER.split(',').includes(target.runtime)) continue;
      for (const width of process.env.OWNER_WIDTH ? [Number(process.env.OWNER_WIDTH)] : [1280, 390]) {
        const { context, page, errors } = await observePage(width);
        const result = { ...target, width, check: 'owner-controls', blockedWrites: [], readOnlyQueries: [] };
        results.push(result);
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (request.method() === 'POST' && url.hostname === 'services.arcgis.com' && url.pathname.endsWith('/queryAttachments')) {
            new URLSearchParams(request.postData() || '').forEach((value, key) => url.searchParams.set(key, value));
            const response = await fetch(url);
            result.readOnlyQueries.push(url.pathname);
            return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
          }
          if (!['GET', 'OPTIONS'].includes(route.request().method())) {
            result.blockedWrites.push(new URL(route.request().url()).pathname);
            return route.abort();
          }
          return route.continue();
        });
        await page.addInitScript(() => {
          let application;
          Object.defineProperty(window, 'app', {
            configurable: true,
            get: () => application,
            set: value => {
              application = value;
              if (!value || typeof value !== 'object') return;
              Object.defineProperty(value, 'userCanEdit', { configurable: true, get: () => true, set: () => {} });
              const initialHeader = value.header;
              let header;
              Object.defineProperty(value, 'header', {
                configurable: true,
                get: () => header,
                set: instance => {
                  header = instance;
                  if (!instance || typeof instance.init !== 'function') return;
                  const initialize = instance.init;
                  instance.init = function(...args) {
                    window.__ownerHeaderEligibility = args[6];
                    return initialize.apply(this, args);
                  };
                }
              });
              value.header = initialHeader;
            }
          });
        });
        try {
          await page.goto(origin + basePath + '/viewers/' + target.runtime + '/index.html?appid=' + target.appid, { waitUntil: 'domcontentloaded' });
          if (['maptour', 'swipe'].includes(target.runtime)) {
            await page.waitForFunction(() => window.__ownerHeaderEligibility !== undefined, undefined, { timeout: 60000 });
            result.eligible = await page.evaluate(() => window.__ownerHeaderEligibility);
            assert.equal(result.eligible, false);
          } else if (target.runtime === 'crowdsource') {
            await page.waitForFunction(() => document.querySelectorAll('.gallery-item').length > 0, undefined, { timeout: 60000 });
            result.state = await page.evaluate(() => new Promise(resolve => {
              require(['babel/actions/UserActions', 'babel/store/AppStore'], (actions, store) => {
                actions.default.authenticateUser({ editor: true, publisher: true, contributor: true });
                const state = store.default.getState();
                resolve({ authenticated: state.user.authenticated, editor: state.user.editor,
                  adminVisible: state.app.layout.visibleComponents.includes('admin-banner') });
              });
            }));
            assert.equal(result.state.authenticated, true);
            assert.equal(result.state.editor, true);
            assert.equal(result.state.adminVisible, false);
          } else if (target.runtime === 'basic') {
            await page.waitForFunction(() => document.querySelector('#mapDiv .esriMapContainer'), undefined, { timeout: 60000 });
            result.eligible = 'no native story-builder control';
          } else {
            const module = target.runtime === 'cascade' ? 'storymaps/tpl/core/Core' : 'storymaps/common/Core';
            await page.waitForFunction(() => typeof window.require === 'function' && window.require.toUrl, undefined, { timeout: 30000 });
            result.eligible = await page.evaluate(module => new Promise((resolve, reject) => {
              setTimeout(() => reject(new Error('Native Core module did not load')), 30000);
              require([module], core => resolve(core.hasSwitchBuilderButton()));
            }), module);
            assert.equal(result.eligible, false);
            await page.waitForFunction(() => window.app?.data?.getWebAppItem?.()?.id || window.app?.data?.appItem?.item?.id, undefined, { timeout: 60000 });
          }
          if (target.runtime === 'crowdsource') {
            await page.locator('.gallery-item').first().waitFor({ state: 'visible', timeout: 60000 });
          } else {
            await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 });
            await page.locator('#loadingIndicator').waitFor({ state: 'hidden', timeout: 60000 });
          }
          if (target.runtime !== 'basic') assert.equal(await page.evaluate(() => window.app.userCanEdit), true);
          const controls = '.switchBuilder, .header-edit-button, .admin-banner, #builder-banner';
          assert.equal(await page.locator(controls.split(', ').map(selector => selector + ':visible').join(', ')).count(), 0);
          for (const control of await page.getByText(/^\W*Edit\W*$/i).all()) assert.equal(await control.isVisible(), false);
          await page.screenshot({ path: path.join(temporary, 'owner-' + target.runtime + '-' + width + '.png') });
          if (htmlTextTesting) {
            result.check = 'html-text-security';
            const filename = ['maptour', 'swipe'].includes(target.runtime) ? target.runtime + '-viewer-min.js' : 'viewer-min.js';
            const bundle = await readFile(path.join(publish, 'viewers', target.runtime, 'app', filename), 'utf8');
            const readers = [...bundle.matchAll(/function\(html\)\{var template=document.createElement\("template"\);template.innerHTML=html;return template.content.textContent;\}/g)].map(match => match[0]);
            assert.equal(readers.length, { maptour: 2, swipe: 1, mapjournal: 9, mapseries: 5, cascade: 2, shortlist: 5 }[target.runtime]);
            const probeRequests = [];
            await context.route('**/__html_text_probe__*', route => {
              probeRequests.push(route.request().url());
              return route.fulfill({ status: 404, body: '' });
            });
            const payload = '<img src="' + origin + '/__html_text_probe__candidate" onerror="window.__htmlTextProbe++">'
              + '<svg onload="window.__htmlTextProbe++"></svg><b>A &amp; B</b>';
            result.textChecks = await page.evaluate(({ readers, payload }) => {
              window.__htmlTextProbe = 0;
              const jquery = window.jQuery || window.$;
              const examples = ['Title', 'A &amp; B', '<b>Title</b> <em>subtitle</em>', '<p>First</p><p>Second</p>',
                'A<br>B', '&lt;img&gt;', 'Quotes &quot; &#39;', '', '<template>hidden</template>visible'];
              const checks = readers.map(source => {
                const read = new Function('return (' + source + ')')();
                return { benign: examples.every(value => read('<div>' + value + '</div>') === jquery('<div>' + value + '</div>').text()),
                  hostile: read('<div>' + payload + '</div>') };
              });
              return { jquery: jquery.fn.jquery, checks };
            }, { readers, payload });
            assert.ok(result.textChecks.checks.every(check => check.benign && check.hostile === 'A & B'));
            if (target.runtime === 'maptour') {
              const descriptions = [];
              function visit(node) {
                if (!node || typeof node !== 'object') return;
                if (node.type === 'BinaryExpression' && typeof node.left.value === 'string'
                  && node.left.value.endsWith('<div style="height: 0;">')) {
                  const expression = bundle.slice(node.right.start, node.right.end);
                  const receiver = expression.match(/([\w$]+)\.attributes\.getDescription\(\)/);
                  if (receiver) descriptions.push({ expression, receiver: receiver[1] });
                }
                for (const value of Object.values(node)) {
                  if (Array.isArray(value)) value.forEach(visit);
                  else if (value && typeof value === 'object') visit(value);
                }
              }
              visit(parse(bundle, { ecmaVersion: 'latest' }));
              assert.equal(descriptions.length, 1);
              result.carouselDescription = await page.evaluate(({ expression, receiver, payload }) => {
                const encoded = $('<div>').text(payload).html();
                const render = new Function(receiver, 'return (' + expression + ')');
                const html = render({ attributes: { getDescription: () => encoded } });
                const container = $('<div>').html(html).appendTo(document.body);
                try { return { text: container.text(), images: container.find('img').length, svg: container.find('svg').length }; }
                finally { container.remove(); }
              }, { ...descriptions[0], payload });
              assert.equal(result.carouselDescription.text, payload);
              assert.equal(result.carouselDescription.images, 0);
              assert.equal(result.carouselDescription.svg, 0);
            }
            if (['mapjournal', 'mapseries', 'shortlist'].includes(target.runtime)) {
              result.nativeShares = await page.evaluate(payload => new Promise((resolve, reject) => {
                require(['storymaps/common/utils/HeaderHelper', 'storymaps/common/utils/SocialSharing'], (helper, social) => {
                  const data = app.data.getWebAppData();
                  const original = { title: data.getTitle, subtitle: data.getSubtitle, facebook: social.shareFacebook, twitter: social.shareTwitter };
                  const container = $('<div><button class="share_facebook"></button><button class="share_twitter"></button></div>');
                  const calls = [];
                  try {
                    data.getTitle = data.getSubtitle = () => payload;
                    social.shareFacebook = (title, subtitle) => calls.push([title, subtitle]);
                    social.shareTwitter = title => calls.push([title]);
                    helper.initEvents(container);
                    container.find('.share_facebook').trigger('click');
                    container.find('.share_twitter').trigger('click');
                    resolve(calls);
                  } catch (error) { reject(error); }
                  finally {
                    data.getTitle = original.title;
                    data.getSubtitle = original.subtitle;
                    social.shareFacebook = original.facebook;
                    social.shareTwitter = original.twitter;
                    container.remove();
                  }
                }, reject);
              }), payload);
              assert.deepEqual(result.nativeShares, [['A & B', 'A & B'], ['A & B']]);
            }
            if (target.runtime === 'mapseries') {
              result.mobileTitle = await page.evaluate(payload => new Promise((resolve, reject) => {
                require(['storymaps/tpl/ui/mobile/Header'], Header => {
                  const container = $('<div><div class="title"></div><button class="menu-btn"></button><div class="menu" style="display:none"></div></div>').appendTo(document.body);
                  const navigation = [];
                  const previousAnimations = $.fx.off;
                  try {
                    $.fx.off = true;
                    const header = new Header(container, false, index => navigation.push(index));
                    const params = { headerCfg: { logoURL: 'NO_LOGO', linkText: '', compactSize: true, socialBtn: { facebook: false, twitter: false, bitly: false } },
                      entries: [{ title: 'First' }, { title: 'Second' }], entryIndex: 0, appLayout: 'tab', layoutOpt: {},
                      appColors: { headerTitle: '#ffffff', header: '#333333', text: '#000000', panel: '#ffffff' } };
                    const encoded = $('<div>').text(payload).html();
                    const checks = [];
                    for (const [title, expected, bold] of [
                      ['<b>A &amp; B</b>', 'A & B', 1], [payload, 'A & B', 1], [encoded, payload, 0],
                      ['<span style="color:red" onclick="window.__htmlTextProbe++">Text</span>', 'Text', 0],
                      ['<script>window.__htmlTextProbe++</script><iframe src="/__html_text_probe__candidate"></iframe>OK', 'OK', 0],
                      ['', '', 0]
                    ]) {
                      header.init({ ...params, title });
                      const heading = container.find('.title');
                      checks.push({ text: heading.text() === expected, bold: heading.find('b').length === bold,
                        safe: heading.find('img,svg,script,iframe,object,math,style').length === 0
                          && [...heading[0].querySelectorAll('*')].every(element => element.attributes.length === 0) });
                    }
                    container.find('.menu-btn').trigger('click');
                    const menuOpened = container.find('.menu').css('display') !== 'none';
                    container.find('.menu-entry').eq(1).trigger('click');
                    resolve({ checks, menuOpened, navigation, menuClosed: container.find('.menu').css('display') === 'none' });
                  } catch (error) { reject(error); }
                  finally { $.fx.off = previousAnimations; container.remove(); }
                }, reject);
              }), payload);
              assert.ok(result.mobileTitle.checks.every(check => check.text && check.bold && check.safe));
              assert.equal(result.mobileTitle.menuOpened, true);
              assert.equal(result.mobileTitle.menuClosed, true);
              assert.deepEqual(result.mobileTitle.navigation, [1]);
            }
            await page.waitForLoadState('networkidle');
            assert.equal(await page.evaluate(() => window.__htmlTextProbe), 0);
            assert.equal(probeRequests.length, 0);
            await page.evaluate(url => {
              const jquery = window.jQuery || window.$;
              jquery('<div><img src="' + url + '" onerror="window.__htmlTextProbe++"></div>').text();
            }, origin + '/__html_text_probe__baseline');
            await page.waitForFunction(() => window.__htmlTextProbe > 0);
            assert.ok(probeRequests.some(url => url.endsWith('__html_text_probe__baseline')));
            result.baselineExecuted = true;
            if (target.runtime === 'cascade') {
              result.shareURL = await page.evaluate(() => new Promise((resolve, reject) => {
                require(['storymaps-react/tpl/core/Controller'], loaded => {
                  try {
                    const controller = loaded.default || loaded;
                    const input = 'https://example.org/?edit=true&appid=abc&locale=fr&edit=false&value=a%26b#edit=keep';
                    const start = performance.now();
                    const long = controller.getStoryURL({ url: 'https://example.org/?edit=' + '='.repeat(100000) });
                    resolve({ ordinary: controller.getStoryURL({ url: input }),
                      encoded: controller.getStoryURL({ url: input, urlEncoding: true }), long, milliseconds: performance.now() - start });
                  } catch (error) { reject(error); }
                }, reject);
              }));
              assert.equal(result.shareURL.ordinary, 'https://example.org/?appid=abc&value=a%26b#edit=keep');
              assert.equal(result.shareURL.encoded, encodeURIComponent(result.shareURL.ordinary));
              assert.equal(result.shareURL.long, 'https://example.org/');
              assert.ok(result.shareURL.milliseconds < 1000);
            }
          }
          result.pass = true;
        } catch (error) {
          result.pass = false;
          result.failure = error.message;
        } finally {
          await context.close();
          result.observedErrors = errors;
          if (errors.some(message => message.startsWith('page:'))) {
            result.pass = false;
            result.failure ||= 'Native page exception during owner-control check';
          }
        }
      }
    }
  }
  if (selectedRuntimes.has('auth')) {
    for (const runtime of ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic']) {
      if (process.env.AUTH_RUNTIME_FILTER && !process.env.AUTH_RUNTIME_FILTER.split(',').includes(runtime)) continue;
      for (const mode of ['anonymous', 'cookie-only', 'catalog']) {
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const signedIn = mode !== 'anonymous';
        const result = { runtime, check: 'catalog-session', mode };
        results.push(result);
        const itemId = '0123456789abcdef0123456789abcdef';
        const syntheticToken = 'synthetic-runtime-browser-session';
        const itemRequests = [];
        const requestPaths = new Set();
        const startupErrors = [];
        page.on('pageerror', error => startupErrors.push(error.message.replaceAll(syntheticToken, '[synthetic credential]')));
        const portal = { id: 'synthetic-org', name: 'Synthetic organization', access: 'public',
          portalHostname: 'www.arcgis.com', portalMode: 'multitenant', isPortal: false,
          urlKey: 'www', customBaseUrl: 'arcgis.com', allSSL: true, helperServices: {},
          defaultBasemap: { baseMapLayers: [] }, featuredGroups: [] };
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          requestPaths.add(url.origin + url.pathname);
          if (url.origin === origin) {
            if (mode === 'cookie-only' && url.pathname.endsWith('/arcgis-runtime-auth.js')) {
              return route.fulfill({ contentType: 'application/javascript', body: 'define([], function() { return { load: function(name, require, loaded) { loaded(true); } }; });' });
            }
            return route.continue();
          }
          if (['https://js.arcgis.com', 'https://jsdev.arcgis.com'].includes(url.origin) && !url.searchParams.has('token')) return route.continue();
          const params = new URLSearchParams(request.postData() || url.search);
          if (url.origin === 'https://www.arcgis.com' && url.pathname.includes('/sharing/')) {
            if (url.pathname.includes('/content/items/' + itemId)) {
              const authenticated = params.get('token') === syntheticToken
                || request.headers()['x-esri-authorization'] === 'Bearer ' + syntheticToken;
              itemRequests.push(authenticated);
              return route.fulfill({ json: authenticated
                ? (url.pathname.endsWith('/data') ? {} : { id: itemId, owner: 'synthetic-owner',
                    title: 'Synthetic private story', type: 'Web Mapping Application', access: 'private',
                    typeKeywords: [runtime === 'maptour' ? 'Story Map Tour' : 'Story Map Shortlist'] })
                : { error: { code: 499, message: 'Token required', details: [] } } });
            }
            return route.fulfill({ json: url.pathname.endsWith('/info')
              ? { owningSystemUrl: 'https://www.arcgis.com', authInfo: { isTokenBasedSecurity: true,
                  tokenServicesUrl: 'https://www.arcgis.com/sharing/rest/generateToken' } }
              : portal });
          }
          return route.abort();
        });
        try {
          if (signedIn) await context.addCookies([{ name: 'esri_auth', value: encodeURIComponent(JSON.stringify({
            token: syntheticToken, expires: Date.now() + 600000, ssl: true
          })), url: origin, secure: true, sameSite: 'Lax' }]);
          const firstItem = page.waitForResponse(response => response.url().includes('/content/items/' + itemId), { timeout: 30000 });
          firstItem.catch(() => {});
          const nativeData = mode === 'catalog' ? page.waitForResponse(response => response.url().includes('/content/items/' + itemId + '/data'), { timeout: 30000 }) : null;
          if (nativeData) nativeData.catch(() => {});
          await page.goto(origin + basePath + '/viewers/' + runtime + '/?appid=' + itemId);
          await firstItem;
          if (nativeData) await nativeData;
          assert.ok(itemRequests.length, 'Native runtime requested the synthetic private item');
          if (mode === 'catalog') {
            assert.ok(itemRequests.every(Boolean), 'Every private-item request uses the catalog credential');
            assert.equal(await page.locator('.esriSignInDialog:visible').count(), 0);
            await page.evaluate(() => {
              Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set() {} });
              window.__catalogMaskStarted = Date.now();
            });
            await page.waitForFunction(() => Date.now() - window.__catalogMaskStarted >= 2500, undefined, { timeout: 5000 });
            assert.equal(await page.evaluate(() => document.cookie), '');
            assert.equal((await context.cookies()).some(cookie => cookie.name === 'esri_auth'), true);
            const reload = page.waitForNavigation();
            const requestsBeforeSignOut = itemRequests.length;
            const signedOutItem = page.waitForResponse(response => response.url().includes('/content/items/' + itemId)
              && itemRequests.length > requestsBeforeSignOut, { timeout: 30000 });
            signedOutItem.catch(() => {});
            await context.clearCookies();
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await reload;
            await signedOutItem;
            assert.ok(itemRequests.slice(requestsBeforeSignOut).every(value => !value));
            assert.equal(await page.evaluate(() => sessionStorage.getItem('arcgis_access_token')), null);
          } else {
            assert.ok(itemRequests.every(value => !value));
          }
          result.pass = true;
          result.itemRequests = itemRequests.length;
        } catch (error) {
          result.pass = false;
          result.failure = error.message.replaceAll(syntheticToken, '[synthetic credential]');
          result.startupErrors = startupErrors;
          result.requestPaths = [...requestPaths].filter(value => !value.startsWith('https://js.arcgis.com/')).slice(-20);
        } finally {
          await context.close();
        }
      }
    }
  }
  if (selectedRuntimes.has('launchers')) {
    for (const width of [1440, 390, 320]) {
      const { context, page, errors } = await observePage(width);
      let selectedApp;
      const itemId = '0123456789abcdef0123456789abcdef';
      await context.route('https://www.arcgis.com/sharing/rest/**', async route => {
        const url = new URL(route.request().url());
        const payload = url.pathname.endsWith('/data') ? {} : {
          id: itemId, title: 'Synthetic advanced-tools story', type: 'Web Mapping Application',
          typeKeywords: [selectedApp.demoType], tags: ['Story Map'], access: 'public', owner: 'synthetic-owner',
          url: 'https://www.arcgis.com/apps/' + selectedApp.runtimeFolder + '/index.html?appid=' + itemId
        };
        await route.fulfill({ json: payload });
      });
      await page.goto(origin + basePath + '/viewers/');
      const config = await page.evaluate(() => window.ClassicStoryMapsConfig);
      for (const app of config.catalogApps) {
        selectedApp = config.appRegistry[app.runtime];
        const result = { runtime: 'launcher-' + app.runtime, width };
        results.push(result);
        try {
          await page.goto(origin + basePath + '/viewers/' + app.launchRoute);
          assert.equal(await page.locator('.launcher-heading').innerText(), app.title);
          assert.equal(await page.locator('.launcher-description').innerText(), app.description);
          assert.equal(await page.locator('#advanced-tools').getAttribute('open'), null);
          const links = await page.locator('.launcher-example').evaluateAll(anchors => anchors.map(anchor => ({ href: anchor.getAttribute('href'), target: anchor.target, rel: anchor.rel })));
          assert.equal(links.length, config.exampleStoriesByRuntime[app.runtime].length);
          links.forEach((link, index) => {
            assert.equal(link.href, config.runtimeViewerByApp[app.runtime] + '?appid=' + config.exampleStoriesByRuntime[app.runtime][index].id);
            assert.equal(link.target, '_blank');
            assert.ok(link.rel.includes('noopener') && link.rel.includes('noreferrer'));
          });
          await page.locator('.launcher-header img, .launcher-screenshot').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.screenshot({ path: path.join(temporary, 'launcher-' + app.runtime + '-' + width + '.png'), fullPage: true });
          await page.getByText('Advanced tools', { exact: true }).click();
          await page.locator('#appid').fill('invalid');
          assert.equal(await page.locator('#launch-form button[type=submit]').isDisabled(), true);
          assert.equal(await page.locator('#advanced-tools button[id^=download-]').count(), 4);
          await page.locator('#appid').fill(itemId);
          await page.locator('#launch-form button[type=submit]').click();
          await page.waitForFunction(() => !document.getElementById('download-item-btn').disabled);
          const downloadPromise = page.waitForEvent('download');
          await page.locator('#download-item-btn').click();
          const download = await downloadPromise;
          const metadata = JSON.parse(await readFile(await download.path(), 'utf8'));
          assert.equal(metadata.id, itemId);
          assert.equal(await page.locator('#open-story-btn').isEnabled(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          result.pass = true;
          result.examples = links.length;
          result.advancedMetadataDownload = true;
        } catch (error) { result.pass = false; result.failure = error.message; }
      }
      assert.deepEqual(errors.filter(message => message.startsWith('page:')), []);
      await context.close();
    }
  }
  if (selectedRuntimes.has('gallery-counting')) {
    for (const width of [1440, 390, 320]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'gallery-counting', width };
      results.push(result);
      let mode = 'held';
      let release;
      let heldStarted;
      let held = new Promise(resolve => { heldStarted = resolve; });
      let searches = 0;
      let thumbnails = 0;
      const story = (number, owner = 'owner-one') => ({ id: number.toString(16).padStart(32, '0'),
        title: 'Story ' + number, owner, access: 'public', type: 'Web Mapping Application',
        typeKeywords: ['Story Map Journal'], thumbnail: 'thumbnail/test.png' });
      const candidates = [...Array.from({ length: 245 }, (_, index) => story(index + 1)),
        ...Array.from({ length: 15 }, (_, index) => ({ ...story(index + 246), type: 'StoryMap' })), story(1)];
      await context.addInitScript(() => {
        sessionStorage.setItem('arcgis_access_token', 'synthetic-one');
        sessionStorage.setItem('arcgis_access_token_expires', String(Date.now() + 600000));
      });
      await context.route('https://www.arcgis.com/sharing/rest/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const authorization = request.headers()['x-esri-authorization'];
        const owner = authorization === 'Bearer synthetic-two' ? 'owner-two' : 'owner-one';
        assert.equal(url.searchParams.has('token'), false);
        assert.equal(request.method(), 'GET');
        if (url.pathname.endsWith('/community/self')) return route.fulfill({ json: { username: owner, orgId: 'synthetic-org' } });
        if (url.pathname.endsWith('/thumbnail/test.png')) {
          thumbnails++;
          return route.fulfill({ contentType: 'image/png', body: await readFile(path.join(publish, 'viewers/assets/images/archive/resources/basics.png')) });
        }
        searches++;
        const start = Number(url.searchParams.get('start'));
        if (mode === 'held' && start > 1) {
          mode = 'normal'; heldStarted();
          await new Promise(resolve => { release = resolve; });
        }
        if (mode === 'error' && start > 1) return route.fulfill({ json: { error: { code: 500 } } });
        const source = owner === 'owner-two' ? [story(900, owner)] : candidates;
        const payload = ['long', 'medium'].includes(mode) ? { results: Array.from({ length: 100 }, (_, index) => story(start + index)), nextStart: mode === 'medium' && start >= 2901 ? -1 : start + 100, total: 10000 }
          : { results: source.slice(start - 1, start + 99), nextStart: start + 100 > source.length ? -1 : start + 100, total: 10000 };
        return route.fulfill({ json: payload }).catch(() => {});
      });
      const exact = () => page.waitForFunction(() => document.getElementById('stories-status').textContent === 'Showing 1-24 of 245 stories');
      try {
        await page.goto(origin + basePath + '/viewers/');
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        await held;
        await page.waitForFunction(() => [...document.querySelectorAll('.story-image')].every(image => image.src.startsWith('blob:')));
        assert.equal(thumbnails, 24);
        await page.evaluate(() => { window.countingFirstCard = document.querySelector('.story-card'); });
        assert.match(await page.locator('#stories-status').innerText(), /100 stories found so far/);
        await page.getByRole('button', { name: 'Pause counting', exact: true }).click();
        assert.match(await page.locator('#stories-status').innerText(), /Count incomplete/);
        release(); release = null;
        await page.getByRole('button', { name: 'Continue counting', exact: true }).click();
        await exact();
        assert.equal(await page.evaluate(() => window.countingFirstCard === document.querySelector('.story-card')), true);
        assert.equal(thumbnails, 24);
        assert.equal(await page.locator('#stories-status').innerText(), await page.locator('#stories-page').innerText());
        await page.locator('.story-results').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(temporary, 'gallery-counted-toolbar-' + width + '.png') });
        await page.getByRole('button', { name: 'Page 11', exact: true }).click();
        assert.equal(await page.locator('#stories-page').innerText(), 'Showing 241-245 of 245 stories');
        const beforeSize = searches;
        for (const [size, range] of [['48', '241-245'], ['96', '193-245'], ['24', '193-216']]) {
          await page.getByLabel('Stories per page', { exact: true }).selectOption(size);
          assert.equal(await page.locator('#stories-page').innerText(), 'Showing ' + range + ' of 245 stories');
        }
        assert.equal(searches, beforeSize);
        await page.locator('.story-pagination').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('.story-pagination').evaluate(node => [...node.querySelectorAll('button')].every(button => button.scrollWidth <= button.clientWidth)), true);
        await page.screenshot({ path: path.join(temporary, 'gallery-counted-' + width + '.png') });
        await page.getByRole('button', { name: 'Page 1', exact: true }).click();
        mode = 'error';
        await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('stories-status').textContent.includes('Count interrupted'));
        assert.equal(await page.locator('.story-card').count(), 24);
        mode = 'normal';
        await page.getByRole('button', { name: 'Continue counting', exact: true }).click();
        await exact();
        mode = 'long';
        const beforeLimit = searches;
        await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('stories-status').textContent.includes('2100 stories found so far') && document.getElementById('stories-status').textContent.includes('Count incomplete'));
        assert.equal(searches - beforeLimit, 21);
        mode = 'medium';
        await page.getByRole('button', { name: 'Continue counting', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('stories-status').textContent === 'Showing 1-24 of 3000 stories');
        await page.getByRole('button', { name: 'Page 125', exact: true }).click();
        await page.locator('.story-pagination').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('.story-pagination').evaluate(node => [...node.querySelectorAll('button')].every(button => button.scrollWidth <= button.clientWidth)), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(temporary, 'gallery-three-digit-pages-' + width + '.png') });
        mode = 'normal';
        const beforeOrg = searches;
        await page.getByLabel('View items in', { exact: true }).selectOption('org');
        await page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false');
        assert.equal(searches - beforeOrg, 1);
        assert.equal(await page.locator('#stories-count').isVisible(), false);
        mode = 'held';
        held = new Promise(resolve => { heldStarted = resolve; });
        await page.getByLabel('View items in', { exact: true }).selectOption('mine');
        await held;
        await page.evaluate(() => { sessionStorage.setItem('arcgis_access_token', 'synthetic-two'); window.dispatchEvent(new Event('focus')); });
        await page.waitForFunction(() => document.getElementById('stories-status').textContent === 'Showing 1-1 of 1 stories');
        release(); release = null;
        assert.equal(await page.locator('.story-owner').innerText(), 'owner-two');
        assert.equal(await page.locator('.story-card').count(), 1);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.stack; }
      finally { if (release) release(); await context.close(); }
      result.pageErrors = errors.filter(message => message.startsWith('page:'));
      if (result.pageErrors.length) result.pass = false;
    }
  }
  if (selectedRuntimes.has('gallery-advanced-search')) {
    for (const width of [1440, 390, 320]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'gallery-advanced-search', width };
      results.push(result);
      const captured = [];
      const story = (number, overrides = {}) => ({ id: number.toString(16).padStart(32, '0'),
        title: 'Ocean story ' + number, owner: 'owner-self', orgId: 'synthetic-org', access: 'public',
        type: 'Web Mapping Application', typeKeywords: number === 1 ? [] : ['Story Map Journal'],
        url: number === 1 ? 'https://story.maps.arcgis.com/apps/StorytellingTextLegend/index.html' : undefined, ...overrides });
      await context.addInitScript(() => {
        sessionStorage.setItem('arcgis_access_token', 'synthetic-advanced-session');
        sessionStorage.setItem('arcgis_access_token_expires', String(Date.now() + 600000));
      });
      await context.route('https://www.arcgis.com/sharing/rest/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        assert.equal(url.searchParams.has('token'), false);
        if (url.pathname.endsWith('/community/self')) return route.fulfill({ json: { username: 'owner-self', orgId: 'synthetic-org' } });
        const query = url.searchParams.get('q');
        assert.ok(query);
        const online = query.startsWith('access:public');
        assert.equal(request.headers()['x-esri-authorization'], online ? undefined : 'Bearer synthetic-advanced-session');
        assert.ok(query.includes('AND type:"Web Mapping Application"'));
        assert.ok(!query.includes('typekeywords:Story* OR tags:Story*'));
        captured.push({ query, start: url.searchParams.get('start') });
        if (query.endsWith('(badfield:)')) return route.fulfill({ json: { error: { code: 400 } } });
        const access = query.includes('access:private') ? 'private' : query.includes('access:org') ? 'org' : 'public';
        let entries = Array.from({ length: 55 }, (_, index) => story(index + 1, { access }));
        if (query.includes('title:"owner\\:')) entries = [];
        else if (query.endsWith('(owner:dwright_storymaps)')) entries = online ? [story(1, { owner: 'dwright_storymaps' })] : [];
        else if (query.includes('(owner:dwright_storymaps OR owner:another)')) entries = [
          story(1, { owner: 'dwright_storymaps' }), story(2, { owner: 'another', typeKeywords: ['Story Map Tour'] })
        ];
        if (query.startsWith('orgid:')) entries = [story(1, { access }), story(2, { access, owner: 'colleague' }),
          story(3, { access, orgId: 'outside-org' }), story(4, { access: access === 'private' ? 'public' : 'private' })];
        entries.push(story(90, { access, type: 'StoryMap' }), story(91, { access: 'org' }),
          story(92, { access, owner: 'wrong-owner', orgId: 'outside-org', typeKeywords: ['Dashboard'] }),
          story(93, { access, typeKeywords: [], url: 'https://example.com/apps/instant/nearby/?next=/MapJournal/' }));
        return route.fulfill({ json: { results: entries, nextStart: -1 } });
      });
      const settled = count => page.waitForFunction(count => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false'
        && document.getElementById('stories-status').textContent !== 'Loading stories...'
        && document.querySelectorAll('.story-card').length === count, count);
      try {
        await page.goto(origin + basePath + '/viewers/');
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        await settled(24);
        assert.equal(await page.getByRole('checkbox', { name: 'Advanced search', exact: true }).isChecked(), false);
        const help = page.getByRole('link', { name: 'Advanced search', exact: true });
        const documentation = 'https://doc.arcgis.com/en/arcgis-online/reference/advanced-search.htm';
        assert.equal(await help.getAttribute('href'), documentation);
        assert.match(await help.getAttribute('title'), /Check the box.*operators.*Classic Story Maps.*scope, sharing level and app type.*public items only/);
        await context.route(documentation, route => route.fulfill({ contentType: 'text/html', body: '<title>Advanced search documentation</title>' }));
        const opened = page.waitForEvent('popup');
        await help.click();
        const documentationPage = await opened;
        await documentationPage.waitForLoadState('domcontentloaded');
        assert.equal(documentationPage.url(), documentation);
        await documentationPage.close();
        assert.equal(await page.getByRole('checkbox', { name: 'Advanced search', exact: true }).isChecked(), false);
        assert.equal(await page.getByRole('searchbox', { name: 'Search', exact: true }).count(), 1);
        assert.deepEqual(await page.locator('.story-filter-row label').evaluateAll(labels => labels.map(label => label.firstChild.textContent.trim())),
          ['View items in', 'Sharing', 'App type', 'Sort by', 'Sort direction']);
        assert.equal(await page.locator('.story-search-row').evaluate(row => row.getBoundingClientRect().bottom <= document.querySelector('.story-filter-row').getBoundingClientRect().top), true);
        await page.getByRole('button', { name: 'Page 2', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#stories-pages [aria-current="page"]')?.textContent === '2');
        await page.locator('#stories-search').fill('owner:dwright_storymaps');
        await settled(0);
        assert.ok(captured.at(-1).query.endsWith('title:"owner\\:dwright_storymaps"'));
        await page.getByRole('checkbox', { name: 'Advanced search', exact: true }).check();
        await page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false');
        assert.ok(captured.at(-1).query.startsWith('owner:"owner\\-self" AND access:public'));
        assert.ok(captured.at(-1).query.endsWith('AND (owner:dwright_storymaps)'));
        assert.equal(await page.locator('.story-card').count(), 0);
        await page.locator('#stories-scope').selectOption('online');
        await settled(1);
        assert.equal(await page.locator('.story-title').innerText(), 'Ocean story 1');
        assert.equal(captured.at(-1).start, '1');
        assert.match(await page.locator('#stories-page').innerText(), /Showing 1-1 of 1 stories/);
        await page.getByLabel('Search', { exact: true }).fill('owner:dwright_storymaps OR owner:another');
        await settled(2);
        assert.ok(captured.at(-1).query.endsWith('AND (owner:dwright_storymaps OR owner:another)'));
        await page.locator('#stories-runtime').selectOption('basic');
        await settled(1);
        await page.locator('#stories-runtime').selectOption('');
        await settled(2);
        const beforeInvalid = captured.length;
        await page.locator('#stories-search').fill(') OR owner:other (');
        await page.waitForFunction(() => document.getElementById('stories-search').getAttribute('aria-invalid') === 'true');
        assert.equal(captured.length, beforeInvalid);
        assert.match(await page.locator('#stories-status').innerText(), /quotes, parentheses, and escapes/);
        await page.locator('#stories-search').fill('badfield:');
        await page.waitForFunction(() => document.getElementById('stories-status').textContent.includes('ArcGIS Online rejected'));
        await page.locator('#stories-search').fill('tags:ocean');
        await settled(24);
        assert.equal(await page.locator('#stories-search').getAttribute('aria-invalid'), null);
        await page.locator('#stories-scope').selectOption('org');
        await settled(2);
        await page.locator('#stories-sharing').selectOption('private');
        await settled(2);
        assert.ok(captured.at(-1).query.startsWith('orgid:"synthetic\\-org" AND (access:private OR access:shared)'));
        assert.ok(captured.at(-1).query.endsWith('AND (tags:ocean)'));
        await page.locator('#stories-search').fill('Ocean');
        await settled(2);
        await page.getByRole('checkbox', { name: 'Advanced search', exact: true }).uncheck();
        await page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false');
        assert.ok(captured.at(-1).query.endsWith('AND title:"Ocean"'));
        await page.getByLabel('Search', { exact: true }).fill('No matching title');
        await settled(0);
        await page.getByRole('checkbox', { name: 'Advanced search', exact: true }).check();
        await page.locator('#stories-scope').selectOption('online');
        await page.locator('#stories-search').fill('owner:dwright_storymaps');
        await settled(1);
        await page.locator('.story-toolbar').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('.story-toolbar input, .story-toolbar select').evaluateAll(elements => elements.some(element => {
          const bounds = element.getBoundingClientRect(); return bounds.left < 0 || bounds.right > innerWidth;
        })), false);
        await page.screenshot({ path: path.join(temporary, 'gallery-advanced-search-' + width + '.png') });
        assert.equal(errors.filter(error => error.startsWith('page:')).length, 0);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
    }
  }
  if (selectedRuntimes.has('gallery-pagination')) {
    for (const width of [1440, 390, 320]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'gallery-pagination', width };
      results.push(result);
      const fields = { modified: 'modified', created: 'created', title: 'title', owner: 'owner', numviews: 'numViews', avgrating: 'avgRating', numratings: 'numRatings', numcomments: 'numComments', scorecompleteness: 'scoreCompleteness' };
      const stories = Array.from({ length: 245 }, (_, index) => ({
        id: (index + 1).toString(16).padStart(32, '0'), title: 'Story ' + String(index + 1).padStart(3, '0'),
        owner: 'owner-' + index % 7, type: 'Web Mapping Application', access: 'public', typeKeywords: ['Story Map Journal'],
        modified: index, created: 245 - index, numViews: index * 3, avgRating: index % 6,
        numRatings: index % 13, numComments: index % 17, scoreCompleteness: index % 101
      }));
      const ordered = (field, direction) => [...stories].sort((first, second) => {
        const left = first[fields[field]];
        const right = second[fields[field]];
        const comparison = typeof left === 'string' ? left.localeCompare(right) : left - right;
        return direction === 'asc' ? comparison : -comparison;
      });
      const requests = [];
      let mode = 'normal';
      let held;
      let releaseHeld;
      let heldFinished;
      await context.route('https://www.arcgis.com/sharing/rest/search?**', async route => {
        const url = new URL(route.request().url());
        const start = Number(url.searchParams.get('start'));
        const field = url.searchParams.get('sortField');
        const direction = url.searchParams.get('sortOrder');
        requests.push({ start, field, direction });
        assert.equal(route.request().headers()['x-esri-authorization'], undefined);
        assert.equal(url.searchParams.has('token'), false);
        if (mode === 'error' && start > 1) {
          mode = 'normal';
          return route.fulfill({ json: { error: { code: 500 } } });
        }
        if (mode === 'held' && start > 1) {
          mode = 'normal';
          held();
          await new Promise(resolve => { releaseHeld = resolve; });
          await route.fulfill({ json: { results: ordered(field, direction).slice(start - 1, start + 99), nextStart: -1 } }).catch(() => {});
          heldFinished();
          return;
        }
        if (mode === 'sparse') return route.fulfill({ json: start <= 600
          ? { results: [{ ...stories[0], type: 'StoryMap' }], nextStart: start + 100, total: 10000 }
          : { results: stories.slice(0, 24), nextStart: -1, total: 10000 } });
        const sorted = ordered(field, direction);
        return route.fulfill({ json: { results: sorted.slice(start - 1, start + 99), nextStart: start + 100 > sorted.length ? -1 : start + 100, total: 10000 } });
      });
      const settled = () => page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false' && document.querySelectorAll('.story-card').length > 0);
      try {
        await page.goto(origin + basePath + '/viewers/');
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        await settled();
        assert.deepEqual(await page.locator('#stories-pages button').allTextContents(), ['1', '2', '3', '4', '5']);
        assert.match(await page.locator('#stories-page').innerText(), /^Showing 1-24 \| 100 stories found so far/);
        assert.equal(requests.length, 1);
        await page.getByRole('button', { name: 'Page 5', exact: true }).click();
        await settled();
        assert.equal(await page.locator('.story-title').first().innerText(), 'Story 149');
        assert.equal(await page.locator('#stories-pages [aria-current="page"]').innerText(), '5');
        for (let nextPage = 6; nextPage <= 9; nextPage++) {
          await page.getByRole('button', { name: 'Next page', exact: true }).click();
          await settled();
          assert.equal(await page.locator('#stories-pages [aria-current="page"]').innerText(), String(nextPage));
        }
        await page.getByRole('button', { name: 'Page 11', exact: true }).click();
        await settled();
        assert.equal(await page.locator('#stories-page').innerText(), 'Showing 241-245 of 245 stories');
        assert.equal(await page.locator('.story-card').count(), 5);
        assert.equal(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled(), true);
        const beforeBack = requests.length;
        await page.getByRole('button', { name: 'Previous page', exact: true }).click();
        await settled();
        assert.equal(await page.locator('#stories-page').innerText(), 'Showing 217-240 of 245 stories');
        assert.equal(requests.length, beforeBack);
        await page.locator('.story-pagination').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('.story-pagination').evaluate(element => [...element.querySelectorAll('button')].every(button => {
          const bounds = button.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && button.scrollWidth <= button.clientWidth;
        })), true);
        await page.screenshot({ path: path.join(temporary, 'gallery-pages-' + width + '.png') });
        await page.getByRole('button', { name: 'Page 1', exact: true }).focus();
        await page.keyboard.press('Enter');
        await settled();
        assert.equal(await page.locator('#stories-page').innerText(), 'Showing 1-24 of 245 stories');
        assert.equal(requests.length, beforeBack);
        for (const field of Object.keys(fields)) {
          await page.getByLabel('Sort by', { exact: true }).selectOption(field);
          await settled();
          assert.equal(await page.locator('#stories-sort').evaluate(select => {
            const style = getComputedStyle(select);
            const context = document.createElement('canvas').getContext('2d');
            context.font = style.font;
            return context.measureText(select.selectedOptions[0].textContent).width + 32 <= select.clientWidth;
          }), true, 'Selected sort label fits');
          for (const direction of ['asc', 'desc']) {
            await page.getByLabel('Sort direction', { exact: true }).selectOption(direction);
            await settled();
            assert.deepEqual(requests.at(-1), { start: 1, field, direction });
            assert.match(await page.locator('#stories-page').innerText(), /^Showing 1-24 \| 100 stories found so far/);
            assert.deepEqual(await page.locator('.story-title').allTextContents(), ordered(field, direction).slice(0, 24).map(story => story.title));
          }
        }
        await page.locator('.story-toolbar').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(temporary, 'gallery-sort-' + width + '.png') });
        mode = 'error';
        await page.getByRole('button', { name: 'Page 5', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('stories-status').textContent.includes('could not be loaded'));
        await page.getByRole('button', { name: 'Page 5', exact: true }).click();
        await settled();
        assert.match(await page.locator('#stories-page').innerText(), /^Showing 97-120/);
        await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
        await settled();
        mode = 'held';
        const heldRequest = new Promise(resolve => { held = resolve; });
        const released = new Promise(resolve => { heldFinished = resolve; });
        await page.getByRole('button', { name: 'Page 5', exact: true }).click();
        await heldRequest;
        assert.equal(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled(), true);
        await page.getByLabel('Sort direction', { exact: true }).selectOption('asc');
        await settled();
        releaseHeld();
        await released;
        assert.match(await page.locator('#stories-page').innerText(), /^Showing 1-24/);
        assert.deepEqual(await page.locator('.story-title').allTextContents(), ordered('scorecompleteness', 'asc').slice(0, 24).map(story => story.title));
        mode = 'sparse';
        let beforeSparse = requests.length;
        await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false' && !document.querySelector('.story-card'));
        assert.equal(requests.length - beforeSparse, 3);
        beforeSparse = requests.length;
        await page.getByRole('button', { name: 'Next page', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('story-gallery').getAttribute('aria-busy') === 'false');
        assert.equal(requests.length - beforeSparse, 3);
        assert.match(await page.locator('#stories-page').innerText(), /^Showing 0 \| 0 stories found so far/);
        await page.getByRole('button', { name: 'Next page', exact: true }).click();
        await settled();
        assert.equal(await page.locator('#stories-page').innerText(), 'Showing 1-24 of 24 stories');
        assert.equal(await page.getByRole('button', { name: 'Previous page', exact: true }).isDisabled(), true);
        assert.deepEqual(errors.filter(message => message.startsWith('page:')), []);
        result.pass = true;
      } catch (error) {
        result.pass = false;
        result.failure = error.stack;
        await page.screenshot({ path: path.join(temporary, 'gallery-pages-failure-' + width + '.png') });
      } finally { if (releaseHeld) releaseHeld(); await context.close(); }
    }
  }
  if (selectedRuntimes.has('gallery')) {
    for (const width of [1440, 390, 320]) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'public-gallery', width };
      results.push(result);
      try {
        await page.goto(origin + basePath + '/viewers/');
        assert.equal(await page.locator('#catalog-grid > a.card').count(), 8);
        const examples = await page.evaluate(() => {
          const config = window.ClassicStoryMapsConfig;
          return Object.values(config.exampleStoriesByRuntime).flat().map(story => ({ ...story,
            owner: 'public-owner', type: 'Web Mapping Application', access: 'public',
            tags: ['Story Map', config.appRegistry[story.runtime].classifyFragments[0]] }));
        });
        await context.route('https://www.arcgis.com/sharing/rest/search?**', route => {
          const url = new URL(route.request().url());
          assert.match(url.searchParams.get('q'), /^access:public AND/);
          assert.equal(route.request().headers()['x-esri-authorization'], undefined);
          const stories = url.searchParams.get('sortField') === 'title' ? [...examples].sort((first, second) => first.title.localeCompare(second.title)) : examples;
          if (url.searchParams.get('sortField') === 'title' && url.searchParams.get('sortOrder') === 'desc') stories.reverse();
          return route.fulfill({ json: { results: stories, nextStart: -1 } });
        });
        assert.equal(await page.locator('#story-gallery').isVisible(), false);
        await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 19);
        assert.equal(await page.locator('#stories-scope').inputValue(), 'online');
        assert.equal(await page.locator('#stories-sharing').inputValue(), 'public');
        assert.equal(await page.locator('#stories-sharing').isDisabled(), true);
        assert.equal(await page.locator('#catalog-grid').isVisible(), false);
        assert.equal(await page.getByRole('link', { name: /^Convert / }).count(), 0);
        assert.equal(await page.locator('.story-title > a').count(), 19);
        assert.equal(await page.locator('.story-actions').count(), 0);
        assert.equal(await page.locator('.story-card a a').count(), 0);
        const firstCard = page.locator('.story-card').first();
        const storyLink = firstCard.locator('.story-title > a');
        assert.notEqual(await storyLink.innerText(), 'View');
        const storyUrl = new URL(await storyLink.getAttribute('href'), page.url()).href;
        await context.route(storyUrl, route => route.fulfill({ contentType: 'text/html', body: '<title>Local story destination</title>' }));
        for (const activation of ['image', 'padding', 'keyboard']) {
          const popupPromise = page.waitForEvent('popup');
          if (activation === 'keyboard') {
            await storyLink.focus();
            await page.keyboard.press('Enter');
          } else {
            const bounds = await firstCard.boundingBox();
            await firstCard.click({ position: { x: 12, y: activation === 'image' ? 12 : bounds.height - 12 } });
          }
          const popup = await popupPromise;
          await popup.waitForLoadState();
          assert.equal(popup.url(), storyUrl);
          assert.equal(await popup.evaluate(() => window.opener), null);
          await popup.close();
        }
        await context.unroute(storyUrl);
        await page.getByLabel('App type', { exact: true }).selectOption('cascade');
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 3);
        await page.getByLabel('Search', { exact: true }).fill('Rupert');
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
        assert.match(await page.locator('.story-title').innerText(), /Rupert/);
        await page.getByLabel('Search', { exact: true }).fill('no matching synthetic title');
        await page.waitForFunction(() => document.getElementById('stories-status').textContent === 'Showing 0 of 0 stories');
        await page.getByLabel('Search', { exact: true }).fill('');
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 3);
        await page.getByLabel('Sort direction', { exact: true }).selectOption('asc');
        await page.getByLabel('Sort by', { exact: true }).selectOption('title');
        await page.waitForFunction(() => document.querySelector('.story-title')?.textContent === 'Palau');
        await page.locator('.story-image').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(temporary, 'gallery-' + width + '.png'), fullPage: true });
        await page.getByRole('button', { name: 'Hide Stories', exact: true }).click();
        assert.equal(await page.locator('#catalog-grid').isVisible(), true);
        await page.locator('#catalog-grid > a.card img').first().click();
        await page.waitForURL('**/maptour-launcher.html');
        assert.deepEqual(errors.filter(message => message.startsWith('page:')), []);
        result.pass = true;
      } catch (error) { result.pass = false; result.failure = error.message; }
      await context.close();
    }
    const { context, page, errors } = await observePage(1280);
    const result = { runtime: 'gallery-synthetic-sessions' };
    results.push(result);
    let mode = 'normal';
    let releaseHeldRequest;
    let requestHeld;
    const captured = [];
    const syntheticItem = (number, owner) => ({
      id: number.toString(16).padStart(32, '0'), title: number === 1 ? '<img src=x onerror=alert(1)>' : 'Synthetic story ' + number,
      owner, type: 'Web Mapping Application', tags: ['Story Map'], access: 'private',
      typeKeywords: [number === 2 ? 'Story Map Basic' : 'Story Map Journal'], thumbnail: number === 1 ? 'thumbnail/test.png' : null
    });
    await context.addInitScript(() => {
      sessionStorage.setItem('arcgis_access_token', 'synthetic-one');
      sessionStorage.setItem('arcgis_access_token_expires', String(Date.now() + 600000));
    });
    await context.route('https://www.arcgis.com/sharing/rest/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const authorization = request.headers()['x-esri-authorization'];
      const owner = authorization === 'Bearer synthetic-two' ? 'owner-two' : 'owner-one';
      assert.ok(!url.searchParams.has('token'));
      if (url.pathname.endsWith('/community/self')) { await route.fulfill({ json: { username: owner, orgId: mode === 'no-org' ? undefined : 'synthetic-org' } }); return; }
      if (url.pathname.endsWith('/info/thumbnail/test.png')) {
        await route.fulfill({ contentType: 'image/png', body: await readFile(path.join(publish, 'viewers/assets/images/archive/resources/basics.png')) }); return;
      }
      captured.push({ query: url.searchParams.get('q'), authenticated: Boolean(authorization) });
      if (mode === 'held' && authorization) {
        requestHeld();
        await new Promise(resolve => { releaseHeldRequest = resolve; });
      }
      if (mode === 'error') { await route.fulfill({ json: { error: { code: 500 } } }); return; }
      if (mode === 'expired' && authorization) { await route.fulfill({ json: { error: { code: 498 } } }); return; }
      const query = url.searchParams.get('q');
      const access = query.includes('access:private') ? 'private' : query.includes('access:org') ? 'org' : 'public';
      let stories = Array.from({ length: 30 }, (_, index) => ({ ...syntheticItem(index + 1, owner), access }));
      stories.push({ ...syntheticItem(100, 'wrong-owner'), access }, { ...syntheticItem(101, owner), type: 'StoryMap', access });
      if (query.startsWith('orgid:')) stories = [ { ...syntheticItem(1, owner), access }, { ...syntheticItem(100, 'other-owner'), access: access === 'private' ? 'shared' : access } ];
      if (query.startsWith('access:public')) stories = [ { ...syntheticItem(1, 'public-owner'), access: 'public' }, syntheticItem(2, 'public-owner') ];
      await route.fulfill({ json: { results: stories, nextStart: -1 } }).catch(() => {});
    });
    try {
      await page.goto(origin + basePath + '/viewers/');
      assert.equal(await page.locator('#story-gallery').isVisible(), false);
      await page.getByRole('button', { name: 'Browse Stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      assert.equal(await page.locator('#stories-heading').innerText(), 'My Content');
      assert.equal(await page.locator('#stories-scope').inputValue(), 'mine');
      assert.equal(await page.locator('#stories-sharing').inputValue(), 'public');
      assert.equal(await page.locator('.story-title').first().innerText(), '<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('.story-title img').count(), 0);
      await page.waitForFunction(() => document.querySelector('.story-image').src.startsWith('blob:'));
      assert.equal(await page.getByRole('link', { name: /^Convert / }).count(), 23);
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 6);
      await page.getByRole('button', { name: 'Previous page', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      await page.evaluate(() => { window.ClassicStoryMapsConfig.gallery.converter.enabled = false; });
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-action-secondary').length === 0);
      await page.evaluate(() => { window.ClassicStoryMapsConfig.gallery.converter.enabled = true; });
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-action-secondary').length === 23);
      assert.equal(await page.locator('.story-action-view').count(), 23);
      const viewAction = page.locator('.story-action-view').first();
      const viewDestination = new URL(await viewAction.getAttribute('href'), page.url()).href;
      assert.equal(viewDestination, new URL(await page.locator('.story-title > a').first().getAttribute('href'), page.url()).href);
      await context.route(viewDestination, route => route.fulfill({ contentType: 'text/html', body: '<title>Local viewer destination</title>' }));
      const viewPopupPromise = page.waitForEvent('popup');
      await viewAction.click();
      const viewPopup = await viewPopupPromise;
      await viewPopup.waitForLoadState();
      assert.equal(viewPopup.url(), viewDestination);
      assert.equal(await viewPopup.evaluate(() => window.opener), null);
      await viewPopup.close();
      await context.unroute(viewDestination);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 850 });
        const actions = await page.locator('.story-actions').first().evaluate(node => [...node.children].map(action => ({
          text: action.textContent, background: getComputedStyle(action).backgroundColor,
          top: action.getBoundingClientRect().top
        })));
        assert.deepEqual(actions.map(action => action.text), ['View', 'Convert']);
        assert.deepEqual(actions.map(action => action.background), ['rgb(11, 111, 95)', 'rgb(40, 172, 219)']);
        assert.ok(Math.abs(actions[0].top - actions[1].top) < 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('.story-card').first().screenshot({ path: path.join(temporary, 'gallery-actions-' + width + '.png') });
      }
      await page.setViewportSize({ width: 1280, height: 850 });
      const conversion = new URL(await page.locator('.story-action-secondary').first().getAttribute('href'));
      assert.equal(conversion.origin, 'https://convert.classicstorymaps.com');
      assert.deepEqual([...conversion.searchParams.keys()], ['appid']);
      assert.equal(conversion.searchParams.get('appid'), new URL(viewDestination).searchParams.get('appid'));
      assert.equal(await page.locator('.story-title > a').count(), 24);
      assert.equal(await page.locator('.story-card a a').count(), 0);
      await context.route(conversion.href, route => {
        const headers = route.request().headers();
        for (const name of ['authorization', 'x-esri-authorization', 'cookie', 'referer']) assert.equal(headers[name], undefined);
        return route.fulfill({ contentType: 'text/html', body: '<title>Local converter destination</title>' });
      });
      const conversionPopupPromise = page.waitForEvent('popup');
      await page.locator('.story-action-secondary').first().click();
      const conversionPopup = await conversionPopupPromise;
      await conversionPopup.waitForLoadState();
      assert.equal(conversionPopup.url(), conversion.href);
      assert.equal(await conversionPopup.evaluate(() => window.opener), null);
      await conversionPopup.close();
      await context.unroute(conversion.href);
      await page.getByLabel('Sharing', { exact: true }).selectOption('private');
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      assert.match(captured.at(-1).query, /access:private OR access:shared/);
      await page.getByLabel('View items in', { exact: true }).selectOption('org');
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 2);
      assert.match(captured.at(-1).query, /^orgid:/);
      assert.ok(captured.at(-1).authenticated);
      assert.equal(await page.locator('.story-owner').last().innerText(), 'other-owner');
      assert.equal(await page.locator('.story-action-secondary').count(), 1);
      await page.getByLabel('Sharing', { exact: true }).selectOption('org');
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 2);
      assert.match(captured.at(-1).query, /AND access:org/);
      await page.getByLabel('View items in', { exact: true }).selectOption('online');
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
      assert.equal(await page.locator('#stories-sharing').inputValue(), 'public');
      assert.equal(await page.locator('#stories-sharing').isDisabled(), true);
      assert.equal(captured.at(-1).authenticated, false);
      assert.equal(await page.locator('.story-action-secondary').count(), 0);
      await page.getByLabel('View items in', { exact: true }).selectOption('mine');
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      mode = 'no-org';
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      assert.equal(await page.locator('#stories-scope option[value="org"]').evaluate(option => option.disabled), true);
      mode = 'error';
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('stories-status').textContent.includes('could not be loaded'));
      mode = 'normal';
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      await page.evaluate(() => { sessionStorage.setItem('arcgis_access_token', 'synthetic-two'); window.dispatchEvent(new Event('focus')); });
      await page.waitForFunction(() => document.querySelector('.story-owner')?.textContent === 'owner-two');
      assert.ok(captured.some(entry => entry.query.includes('owner:"owner\\-two"')));
      mode = 'held';
      const held = new Promise(resolve => { requestHeld = resolve; });
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await held;
      await page.getByRole('button', { name: 'Sign out of ArcGIS Online', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
      mode = 'normal';
      releaseHeldRequest();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await page.locator('.story-owner').innerText(), 'public-owner');
      assert.equal(await page.locator('.story-action-secondary').count(), 0);
      assert.equal(await page.locator('#stories-scope').inputValue(), 'online');
      assert.equal(await page.locator('#stories-sharing').inputValue(), 'public');
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
      assert.equal(await page.locator('.story-owner').innerText(), 'public-owner');
      assert.equal(captured.at(-1).authenticated, false);
      assert.match(captured.at(-1).query, /^access:public AND/);
      await page.evaluate(() => {
        window.ClassicStoryMapsConfig.gallery.publicGroupId = '';
        sessionStorage.setItem('arcgis_access_token', 'synthetic-one');
        sessionStorage.setItem('arcgis_access_token_expires', String(Date.now() + 600000));
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
      mode = 'expired';
      await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('arcgis_access_token')), null);
      assert.equal(await page.locator('.story-action-secondary').count(), 0);
      assert.deepEqual(errors.filter(message => message.startsWith('page:')), []);
      result.pass = true;
      result.checks = ['owner isolation', 'scope and sharing', 'accessible other-owner private and shared items', 'public-only Online', 'no organization', 'pagination', 'safe text', 'thumbnail blob', 'conversion ownership', 'retry', 'account replacement', 'stale-response rejection', 'expiry cleanup'];
    } catch (error) { result.pass = false; result.failure = error.stack; }
    await context.close();
  }
  if (selectedRuntimes.has('input')) {
    const { context, page, errors } = await observePage(1280);
    const result = { runtime: 'omni-input' };
    results.push(result);
    const cases = [
      { input: 'https://www.arcgis.com/apps/MapTour/index.html?appid=0a48880ceab64924946a0a15a5383916&webmap=0c8ae0bb497143db9a29de4fbffaed73', id: '0a48880ceab64924946a0a15a5383916', runtime: 'maptour', webmap: '0c8ae0bb497143db9a29de4fbffaed73' },
      { input: 'http://storymaps.esri.com/stories/2014/brazil-beyond-the-stadiums/', id: 'cf69fa9aee724adf8b6f77d059ae08a9', runtime: 'mapjournal' },
      { input: 'http://clear3.uconn.edu/viewers/bears/', id: '137ee8cb7d05426ca95ae1330ebf4d38', runtime: 'mapjournal' },
      { input: 'https://blm-egis.maps.arcgis.com/apps/Cascade/index.html?appid=6a9c3a5af20b43dea05fbd1e121ef6da', id: '6a9c3a5af20b43dea05fbd1e121ef6da', runtime: 'cascade' },
      { input: '137ee8cb7d05426ca95ae1330ebf4d38', id: '137ee8cb7d05426ca95ae1330ebf4d38', runtime: 'mapjournal' },
      { input: 'https://custom.example/ExactCase/', id: '137ee8cb7d05426ca95ae1330ebf4d38', runtime: 'mapjournal' }
    ];
    const itemRequests = [];
    await context.addInitScript(() => {
      sessionStorage.setItem('arcgis_access_token', 'synthetic-omni');
      sessionStorage.setItem('arcgis_access_token_expires', String(Date.now() + 600000));
    });
    await context.route('https://www.arcgis.com/sharing/rest/**', route => {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(url.searchParams.has('token'), false);
      assert.equal(request.headers()['x-esri-authorization'], 'Bearer synthetic-omni');
      if (url.pathname.endsWith('/search')) {
        const match = url.searchParams.get('q').includes('ExactCase');
        return route.fulfill({ json: { results: match ? [{ id: cases[2].id, type: 'Web Mapping Application', typeKeywords: ['Story Map Journal'], url: cases[5].input }] : [], nextStart: -1 } });
      }
      const candidate = cases.find(entry => url.pathname.endsWith('/' + entry.id));
      itemRequests.push(candidate?.id);
      return route.fulfill({ json: candidate ? { id: candidate.id, type: 'Web Mapping Application',
        url: candidate.input.startsWith('http') ? candidate.input : '',
        typeKeywords: candidate.runtime === 'maptour' ? ['JavaScript', 'Web Map'] : ['Story Map ' + candidate.runtime] }
        : { id: 'f'.repeat(32), type: 'Web Map', typeKeywords: ['Story Map Journal'] } });
    });
    try {
      await page.goto(origin + basePath + '/viewers/');
      for (const candidate of cases) {
        const destination = origin + basePath + '/viewers/' + candidate.runtime + '/index.html?appid=' + candidate.id + (candidate.webmap ? '&webmap=' + candidate.webmap : '');
        await context.route(destination, route => route.fulfill({ contentType: 'text/html', body: '<title>Resolved viewer</title>' }));
        await page.getByLabel('Classic app ID or URL', { exact: true }).fill(candidate.input);
        const opened = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Open Viewer', exact: true }).click();
        const popup = await opened;
        await popup.waitForLoadState();
        assert.equal(popup.url(), destination);
        assert.equal(await popup.evaluate(() => window.opener), null);
        assert.equal(itemRequests.at(-1), candidate.id);
        await popup.close();
        await context.unroute(destination);
      }
      for (const invalid of ['javascript:alert(1)', 'https://custom.example/unindexed/', 'https://www.arcgis.com/apps/MapTour/?appid=' + cases[0].id + '&token=synthetic', 'f'.repeat(32)]) {
        await page.getByLabel('Classic app ID or URL', { exact: true }).fill(invalid);
        await page.getByRole('button', { name: 'Open Viewer', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('omni-status').classList.contains('error'));
        assert.equal(context.pages().length, 1);
      }
      assert.deepEqual(errors.filter(message => message.startsWith('page:')), []);
      result.pass = true;
      result.checks = ['four supplied URLs', 'plain ID', 'exact case-sensitive indexed URL', 'web map override', 'header-only credential', 'invalid and unresolved input', 'item type validation', 'no opener'];
    } catch (error) { result.pass = false; result.failure = error.stack; }
    await context.close();
  }
  if (selectedRuntimes.has('crowdsource')) {
  for (const width of [1280, 390]) {
    for (const suffix of ['', '&edit=true', '&fromScratch=true']) {
      const { context, page, errors } = await observePage(width);
      const result = { runtime: 'crowdsource', width, suffix, errors };
      results.push(result);
      try {
        await page.goto(origin + basePath + '/viewers/crowdsource/index.html?appid=f1fcc302b0864b0c94beffc5177da2b8' + suffix, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.querySelectorAll('.gallery-item').length > 0, undefined, { timeout: 60000 });
        result.galleryItems = await page.locator('.gallery-item').count();
        result.builder = await page.evaluate(() => window.app.mode.isBuilder);
        assert.equal(result.builder, false);
        assert.equal(await page.locator('button.participate').count(), 0);
        assert.doesNotMatch(await page.locator('body').innerText(), /Participate/);
        assert.doesNotMatch(new URL(page.url()).search, /edit=|fromScratch=/);
        if (width === 1280) {
          await page.getByText('Explore Map', { exact: true }).click({ timeout: 30000 });
          await page.waitForFunction(() => {
            const bounds = document.querySelector('.map-pane')?.getBoundingClientRect();
            return bounds && bounds.top >= 0 && bounds.top < 100 && bounds.bottom > 200;
          });
          result.mapVisible = true;
        } else {
          await page.getByText('Gallery', { exact: true }).click();
          await page.waitForFunction(() => {
            const bounds = document.querySelector('.gallery-item')?.getBoundingClientRect();
            return bounds && bounds.top >= 0 && bounds.top < innerHeight && bounds.width > 0;
          });
          result.galleryVisible = true;
        }
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(temporary, 'crowdsource-' + width + '-' + (suffix || 'plain').replace(/[^a-z0-9]/gi, '') + '.png') });
        assert.deepEqual(errors, []);
        result.pass = true;
      } catch (error) {
        result.pass = false;
        result.failure = error.message;
        result.visibleText = (await page.locator('body').innerText()).slice(0, 1500);
      }
      await context.close();
    }
  }
  }
  for (const target of [
    { runtime: 'shortlist', appid: '5a9c34acf59a49f0a67d5f7293b44d6b', title: 'The Raised Bogs of Ireland' },
    { runtime: 'mapseries', appid: '77245a2c7bb540878fd3b24ebd048b20', title: 'Stewardship' },
    { runtime: 'cascade', appid: 'dbc3574e3d0d4f4a81ae95f2e86b0dc2', title: 'Palau' }
  ]) {
    if (!selectedRuntimes.has(target.runtime)) continue;
    for (const width of [1280, 390]) {
      for (const suffix of ['', '&edit=true']) {
        const { context, page, errors } = await observePage(width);
        const result = { ...target, width, suffix, errors };
        results.push(result);
        try {
          await page.goto(origin + basePath + '/viewers/' + target.runtime + '/index.html?appid=' + target.appid + suffix, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(title => document.body.innerText.toLowerCase().includes(title.toLowerCase()), target.title, { timeout: 60000 });
          await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 });
          await page.locator('#loadingIndicator').waitFor({ state: 'hidden', timeout: 60000 });
          await page.waitForLoadState('networkidle', { timeout: 60000 });
          for (const control of await page.getByText(/^\W*Edit\W*$/i).all()) assert.equal(await control.isVisible(), false, 'Edit control must not be visible');
          assert.doesNotMatch(new URL(page.url()).search, /edit=/);
          await page.screenshot({ path: path.join(temporary, target.runtime + '-' + width + '-' + (suffix ? 'edit' : 'plain') + '.png') });
          assert.deepEqual(errors, []);
          result.pass = true;
        } catch (error) {
          result.pass = false;
          result.failure = error.message;
          result.visibleText = (await page.locator('body').innerText()).slice(0, 1500);
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(path.join(temporary, 'key.pem'));
  await rm(path.join(temporary, 'cert.pem'));
}
await writeFile(path.join(temporary, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ artifacts: temporary, results }, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;
