import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';
import { createDiscoveryPreview } from './preview-maptour-discovery.mjs';

const root = path.resolve(process.env.MAPTOUR_BUILD_ROOT || 'runtimes/maptour/build');
const automatic = process.env.ARCHIVE_DISCOVERY === 'true';
const native = automatic && process.env.ARCHIVE_DISCOVERY_NATIVE === 'true';
const output = process.env.ARCHIVE_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'maptour-archive-browser-'));
await mkdir(output, { recursive: true });
const { chromium } = process.env.PLAYWRIGHT_NODE_MODULES
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'playwright/index.mjs')))
  : await import('playwright');
const appId = '10c62c6bd29f4175b26386aa46cf5a40';
const mapId = 'a008e1a1884649b8928c01816af9f184';
const secondSource = 'https://www.ebmud.com/files/cache/4a49ef657bce6f31f421d7719456f76e_f5432.png';
const secondCapture = 'https://web.archive.org/web/20180724213440if_/' + secondSource;
const source = automatic && !native ? secondSource : 'https://www.ebmud.com/files/cache/bf62da23163b671cde7167cb412824db_f811.png';
const capture = automatic && !native ? secondCapture : 'https://web.archive.org/web/20150927034152if_/http://www.ebmud.com/files/cache/bf62da23163b671cde7167cb412824db_f811.png';
const dataUrls = [appId, mapId].map(id => 'https://www.arcgis.com/sharing/rest/content/items/' + id + '/data?f=json');
const readData = () => Promise.all(dataUrls.map(async url => {
  const data = await fetch(url, { signal: AbortSignal.timeout(20000) }).then(response => response.json());
  assert.equal(data.error, undefined);
  return data;
}));
const before = await readData();
assert.equal(before[0].values.webmap, mapId);
const archivedResponse = await fetch(capture, { signal: AbortSignal.timeout(20000) });
assert.equal(archivedResponse.status, 200);
assert.match(archivedResponse.headers.get('content-type'), /^image\/png/);
const archivedBytes = Buffer.from(await archivedResponse.arrayBuffer());
assert.deepEqual([...archivedBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', output + '/key.pem', '-out', output + '/cert.pem', '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = automatic ? createDiscoveryPreview({ root, publicOrigins: ['https://www.ebmud.com', 'http://www.ebmud.com'] })
  : https.createServer({ key: await readFile(output + '/key.pem'), cert: await readFile(output + '/cert.pem') }, createPreviewHandler({ root }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = (automatic ? 'http' : 'https') + '://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
const results = [];

try {
  for (const mode of automatic ? ['automatic'] : ['live-archive', 'live-thumbnails', 'archive-unavailable', 'original-healthy']) {
    for (const width of mode === 'original-healthy' ? [1280] : [1280, 390]) {
      if (process.env.ARCHIVE_CASE && process.env.ARCHIVE_CASE !== mode || process.env.ARCHIVE_WIDTH && Number(process.env.ARCHIVE_WIDTH) !== width) continue;
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 850 } });
      const page = await context.newPage();
      const writes = [];
      const errors = [];
      const archives = [];
      const originalResponses = [];
      const originalFailures = [];
      const lookups = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => {
        if (request.url() === source) originalFailures.push(request.failure()?.errorText);
      });
      page.on('response', response => {
        if (response.url() === source) originalResponses.push(response.status());
      });
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (automatic && url.origin === origin && url.pathname === '/api/wayback') {
          lookups.push(request.postDataJSON());
          return route.continue();
        }
        if (/\/(?:update|addItem|delete|applyEdits|addFeatures|updateFeatures|deleteFeatures)(?:\/|$)/i.test(url.pathname)
          || !['GET', 'OPTIONS'].includes(request.method()) && !/\/query\/?$/i.test(url.pathname)) {
          writes.push(url.pathname);
          return route.abort();
        }
        if (request.url() === source && mode === 'original-healthy') return route.fulfill({ contentType: 'image/png', body: archivedBytes });
        if (automatic && !native && url.pathname.endsWith('/' + mapId + '/data')) {
          const fixture = structuredClone(before[1]);
          const attributes = fixture.operationalLayers.find(layer => layer.featureCollection).featureCollection.layers[0].featureSet.features[0].attributes;
          attributes.pic_url = source;
          attributes.thumb_url = source;
          return route.fulfill({ json: fixture });
        }
        if (mode === 'live-thumbnails' && url.pathname.endsWith('/' + appId + '/data')) {
          const fixture = structuredClone(before[0]);
          fixture.values.firstRecordAsIntro = false;
          return route.fulfill({ json: fixture });
        }
        if (url.hostname === 'web.archive.org') {
          archives.push({ url: request.url(), referrer: request.headers().referer || null });
          if (mode === 'archive-unavailable') return route.fulfill({ status: 503, contentType: 'text/html', body: 'Synthetic unavailable archive' });
        }
        return route.continue();
      });
      const result = { mode, width, pass: false };
      results.push(result);
      try {
        await page.goto(origin + '/?appid=' + appId + (mode === 'live-thumbnails' ? '&firstRecordAsIntro=false' : ''), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.app?.map?.loaded && getComputedStyle(document.querySelector('#loadingOverlay')).display === 'none', null, { timeout: 60000 });
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#fatalError')).display !== 'none'), false);
        assert.equal(await page.evaluate(() => (window.app.data.getCurrentAttributes() || window.app.data.getIntroData().attributes).getURL()), source);
        const intro = await page.evaluate(() => !window.app.data.getCurrentAttributes());
        if (native) {
          assert.equal(intro, false);
          assert.equal(await page.evaluate(() => app.data.getCurrentAttributes().getName()), 'Almond Pumping Plant Replacement and Associated Projects');
          assert.equal(await page.evaluate(() => app.data.getTourPoints().length), before[1].operationalLayers.find(layer => layer.featureCollection).featureCollection.layers[0].featureSet.features.length);
        }
        if (mode === 'live-thumbnails') assert.equal(intro, false);
        if (width < 600 && !intro) {
          await page.getByText('Media', { exact: true }).click();
        }
        const selector = width > 600 ? '.member-image.current img' : intro ? '#introPanel .classic .tourPointImg' : '#infoPanel .swipeview-active .tourPointImg';
        const photo = page.locator(selector);
        await photo.waitFor({ state: 'visible' });
        if (automatic) {
          await page.waitForFunction(({ selector, native }) => {
            const image = document.querySelector(selector);
            return native ? image?.complete && image.naturalWidth > 0 : /picture-not-available|media-not-available/.test(image?.src);
          }, { selector, native });
          assert.deepEqual(lookups, []);
          await page.getByRole('button', { name: 'Archived photo settings', exact: true }).filter({ visible: true }).click();
          const checkbox = page.getByRole('checkbox', { name: 'Recover missing photos for this story' });
          assert.equal(await checkbox.isChecked(), false);
          await checkbox.check();
          await page.getByRole('button', { name: 'Close archive settings' }).click();
        }
        const expected = automatic || mode.startsWith('live-') ? capture : mode === 'original-healthy' ? source : null;
        await page.waitForFunction(({ selector, expected }) => {
          const image = document.querySelector(selector);
          return image?.complete && image.naturalWidth > 0 && (expected ? image.src === expected : /picture-not-available|media-not-available/i.test(image.src));
        }, { selector, expected }, { timeout: 45000 });
        result.photo = await photo.evaluate(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight, referrerPolicy: image.referrerPolicy }));
        assert.equal(await page.evaluate(() => (window.app.data.getCurrentAttributes() || window.app.data.getIntroData().attributes).getURL()), source);
        if (mode === 'original-healthy') assert.deepEqual(archives, []);
        else {
          assert.ok(originalResponses.includes(404) || originalFailures.length > 0);
          assert.ok(archives.length > 0);
          assert.ok(archives.every(request => (automatic || request.url === capture) && request.referrer === null));
        }
        if (width > 600 && mode === 'live-thumbnails') {
          const thumbnail = page.locator('#footerDesktop .carousel-item-div img').first();
          await thumbnail.waitFor({ state: 'visible' });
          await page.waitForFunction(expected => {
            const image = document.querySelector('#footerDesktop .carousel-item-div img');
            return image?.src === expected && image.complete && image.naturalWidth > 0;
          }, expected);
          result.thumbnail = true;
          await page.locator('#footerDesktop .carousel-item-div').nth(1).click();
          await page.waitForFunction(() => window.app.data.getCurrentIndex() === 1);
          await page.locator('#footerDesktop .carousel-item-div').first().click();
          await page.waitForFunction(expected => {
            const image = document.querySelector('.member-image.current img');
            return window.app.data.getCurrentIndex() === 0 && image?.src === expected && image.complete && image.naturalWidth > 0;
          }, expected);
          result.returnNavigation = true;
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.waitForFunction(selector => {
          let element = document.querySelector(selector);
          if (!element || window.app.map.updating) return false;
          while (element) {
            if (Number(getComputedStyle(element).opacity) < 0.99) return false;
            element = element.parentElement;
          }
          return true;
        }, selector);
        result.screenshot = path.join(output, mode + '-' + width + '.png');
        await page.screenshot({ path: result.screenshot });
        if (automatic) {
          if (!native) assert.ok(lookups.some(request => request.url === source));
          const link = page.locator('.archive-photo-source').filter({ visible: true }).first();
          await link.waitFor({ state: 'visible' });
          assert.equal(await link.getAttribute('href'), capture.replace('if_', ''));
          assert.equal(await page.evaluate(id => localStorage.getItem('maptour.wayback.v1.' + id), appId), 'yes');
          if (native) {
            if (width < 600) await page.getByText('List', { exact: true }).click();
            const thumbnails = width > 600 ? '#footerDesktop .carousel-item-div img' : '#listPanel .tpImgContainer img';
            await page.waitForFunction(({ thumbnails, secondCapture }) => {
              const image = document.querySelectorAll(thumbnails)[1];
              return image?.src === secondCapture && image.complete && image.naturalWidth > 0;
            }, { thumbnails, secondCapture }, { timeout: 45000 });
            assert.ok(lookups.some(request => request.url === secondSource));
            await page.locator(thumbnails).nth(1).click();
            await page.waitForFunction(() => app.data.getCurrentIndex() === 1);
            if (width < 600) await page.getByText('Media', { exact: true }).click();
            await page.waitForFunction(({ selector, secondCapture }) => {
              const image = document.querySelector(selector);
              return image?.src === secondCapture && image.complete && image.naturalWidth > 0;
            }, { selector, secondCapture }, { timeout: 45000 });
            assert.equal(await page.evaluate(() => app.data.getCurrentAttributes().getName()), 'Chabot Dam Upgrade');
            result.nativeOrdering = { first: 'Almond Pumping Plant Replacement and Associated Projects', second: 'Chabot Dam Upgrade', secondPhotoAndThumbnail: true };
            await page.screenshot({ path: path.join(output, mode + '-' + width + '-chabot.png') });
          }
          await page.reload({ waitUntil: 'domcontentloaded' });
          if (native && width < 600) {
            await page.waitForFunction(() => window.app?.map?.loaded && getComputedStyle(document.querySelector('#loadingOverlay')).display === 'none');
            await page.getByText('Media', { exact: true }).click();
          }
          await page.waitForFunction(({ selector, capture }) => {
            const image = document.querySelector(selector);
            return image?.src === capture && image.complete && image.naturalWidth > 0;
          }, { selector, capture }, { timeout: 45000 });
          await page.getByRole('button', { name: 'Archived photo settings', exact: true }).filter({ visible: true }).click();
          const checkbox = page.getByRole('checkbox', { name: 'Recover missing photos for this story' });
          assert.equal(await checkbox.isChecked(), true);
          await page.screenshot({ path: path.join(output, mode + '-' + width + '-settings.png') });
          await checkbox.uncheck();
          await page.getByRole('button', { name: 'Close archive settings' }).click();
          if (native) assert.equal(await photo.getAttribute('src'), capture);
          else assert.match(await photo.getAttribute('src'), /picture-not-available|media-not-available/);
          assert.equal(await page.evaluate(id => localStorage.getItem('maptour.wayback.v1.' + id), appId), 'no');
          result.consent = { defaultOff: true, rememberedAfterReload: true, revocation: true, lookupCount: lookups.length };
        }
        if (width < 600 && mode === 'live-thumbnails') {
          await page.getByText('List', { exact: true }).click();
          await page.waitForFunction(expected => {
            const image = document.querySelector('#listPanel .tpImgContainer img');
            return image?.src === expected && image.complete && image.naturalWidth > 0;
          }, expected);
          result.thumbnail = true;
          await page.screenshot({ path: path.join(output, mode + '-' + width + '-list.png') });
        }
        result.archivedRequests = archives.length;
        result.originalResponses = originalResponses;
        result.originalFailures = originalFailures;
        assert.deepEqual(writes, []);
        assert.deepEqual(errors, []);
        result.pass = true;
      } catch (error) {
        result.failure = error.message;
        result.errors = errors;
        result.screenshot = path.join(output, mode + '-' + width + '-failed.png');
        await page.screenshot({ path: result.screenshot });
      } finally {
        await context.close();
      }
    }
  }
  assert.deepEqual(await readData(), before, 'Original app and web-map data are unchanged');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ output, results }, null, 2));
assert.ok(results.length > 0 && results.every(result => result.pass), 'Every selected archive-photo scenario passed');
