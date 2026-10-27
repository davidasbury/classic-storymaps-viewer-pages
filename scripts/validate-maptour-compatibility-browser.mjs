import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';

const root = path.resolve(process.env.MAPTOUR_BUILD_ROOT || 'runtimes/maptour/build');
const output = process.env.COMPAT_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'maptour-compatibility-browser-'));
await mkdir(output, { recursive: true });
const { chromium } = process.env.PLAYWRIGHT_NODE_MODULES
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'playwright/index.mjs')))
  : await import('playwright');
const appId = '393a423e2c4c4570a3f47f9bc6bb180a';
const mapId = '6b1e4f428ffa411b96b0e49d214ed17f';
const dataUrl = 'https://www.arcgis.com/sharing/rest/content/items/' + mapId + '/data?f=json';
const before = await fetch(dataUrl).then(response => response.json());
assert.equal(before.version, '1.9', 'Live fixture remains legacy; review this test if the owner updates it');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', output + '/key.pem', '-out', output + '/cert.pem', '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = https.createServer({ key: await readFile(output + '/key.pem'), cert: await readFile(output + '/cert.pem') }, createPreviewHandler({ root }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'https://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
const results = [];
const selectedCase = process.env.COMPAT_CASE;
const selectedWidth = Number(process.env.COMPAT_WIDTH || 0);

async function observe(width, rejectOcean = false) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 850 } });
  const page = await context.newPage();
  const writes = [];
  const pageErrors = [];
  const tileResponses = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (/World_Ocean_.*\/tile\//.test(response.url())) tileResponses.push({ path: new URL(response.url()).pathname, status: response.status(), contentType: response.headers()['content-type'] });
  });
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/\/(?:update|addItem|delete|applyEdits|addFeatures|updateFeatures|deleteFeatures)(?:\/|$)/i.test(url.pathname)
      || request.method() !== 'GET' && request.method() !== 'OPTIONS' && !/\/query\/?$/i.test(url.pathname)) {
      writes.push(url.pathname);
      return route.abort();
    }
    if (rejectOcean && /\/Ocean\/World_Ocean_(?:Base|Reference)\/MapServer/.test(url.pathname)) return route.fulfill({ json: { error: { code: 503, message: 'Synthetic unavailable service' } } });
    return route.continue();
  });
  return { context, page, writes, pageErrors, tileResponses };
}

try {
  for (const width of [1280, 390]) {
    if (selectedCase && selectedCase !== 'live-map' || selectedWidth && selectedWidth !== width) continue;
    const observation = await observe(width);
    const { context, page, writes, pageErrors, tileResponses } = observation;
    const result = { check: 'live-map', width };
    results.push(result);
    try {
      await page.goto(origin + '/?appid=' + appId, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#fatalError')).display !== 'none'
        || window.app?.map?.loaded && getComputedStyle(document.querySelector('#loadingOverlay')).display === 'none', null, { timeout: 60000 });
      result.state = await page.evaluate(() => ({
        fatal: getComputedStyle(document.querySelector('#fatalError')).display !== 'none' ? document.querySelector('#fatalError').innerText : null,
        loaded: !!window.app?.map?.loaded,
        data: window.app?.data?.getWebMapItem() ? {
          version: window.app.data.getWebMapItem().itemData.version,
          baseMap: { baseMapLayers: window.app.data.getWebMapItem().itemData.baseMap.baseMapLayers.map(layer => ({ id: layer.id, url: layer.url, isReference: layer.isReference, layerType: layer.layerType })) }
        } : null,
        graphicCounts: (window.app?.map?.graphicsLayerIds || []).map(id => ({ id, count: window.app.map.getLayer(id)?.graphics?.length || 0 })),
        overflow: document.documentElement.scrollWidth > innerWidth,
        title: document.title
      }));
      assert.equal(result.state.fatal, null);
      assert.equal(result.state.loaded, true);
      assert.equal(result.state.data.version, '2.0');
      assert.equal(result.state.data.baseMap.baseMapLayers.length, 2);
      assert.ok(result.state.graphicCounts.some(layer => layer.count >= 9), 'Actual tour features rendered');
      await page.waitForFunction(() => [...document.querySelectorAll('#mainMap img')].some(image => /World_Ocean_Base/.test(image.src) && image.complete && image.naturalWidth > 0), null, { timeout: 20000 });
      assert.ok(tileResponses.some(response => response.path.includes('World_Ocean_Base') && response.status === 200 && /^image\//.test(response.contentType)));
      assert.ok(tileResponses.some(response => response.path.includes('World_Ocean_Reference') && response.status === 200 && /^image\//.test(response.contentType)));
      if (width > 600) {
        await page.locator('#footerDesktop .carousel-item-div').nth(1).click();
        await page.waitForFunction(() => window.app.data.getCurrentIndex() === 1);
      } else {
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await page.locator('#introPanel').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => window.app.data.getCurrentIndex() !== null);
        await page.getByText('Map', { exact: true }).click();
        assert.equal(await page.locator('#mainMap').isVisible(), true);
      }
      result.navigation = true;
      assert.deepEqual(writes, []);
      assert.deepEqual(pageErrors, []);
      result.tiles = tileResponses.length;
      result.pass = true;
    } catch (error) {
      result.pass = false;
      result.failure = error.message;
      result.pageErrors = pageErrors;
    } finally {
      result.screenshot = path.join(output, 'live-' + width + '.png');
      await page.screenshot({ path: result.screenshot });
      await context.close();
    }
  }

  for (const width of [1280, 320]) {
    if (selectedCase && selectedCase !== 'unresolved-repair' || selectedWidth && selectedWidth !== width) continue;
    const { context, page, writes, pageErrors } = await observe(width, true);
    const result = { check: 'unresolved-repair', width };
    results.push(result);
    try {
      await page.goto(origin + '/?appid=' + appId + (width === 320 ? '&locale=fr' : ''), { waitUntil: 'domcontentloaded' });
      await page.locator('#fatalError.compatibility-error').waitFor({ state: 'visible', timeout: 60000 });
      await page.getByText('Repair steps for map owners', { exact: true }).click();
      assert.equal(await page.getByRole('link', { name: 'Open ArcGIS Assistant', exact: true }).getAttribute('href'), 'https://assistant.esri-ps.com/');
      assert.ok((await page.locator('#fatalError').innerText()).includes(mapId));
      assert.ok((await page.locator('#fatalError').innerText()).includes('Back up'));
      assert.ok((await page.locator('#fatalError').innerText()).includes('If you cannot edit'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('#loadingIndicator').isVisible(), false);
      result.screenshot = path.join(output, 'failure-' + width + '.png');
      await page.screenshot({ path: result.screenshot });
      await page.evaluate(() => new Promise(resolve => require(['storymaps/core/Core'], core => {
        core.initError('createMap', { reason: '<img src=x onerror=alert(1)>', result: { mapId: '<img src=x onerror=alert(1)>', issues: [{ code: 'token=synthetic-secret' }] } });
        resolve();
      })));
      assert.equal(await page.locator('#fatalError img').count(), 0);
      assert.equal(await page.locator('#fatalError').innerText().then(text => /synthetic-secret|onerror/.test(text)), false);
      assert.equal(await page.getByRole('link', { name: 'Open ArcGIS Assistant' }).count(), 0);
      await page.evaluate(() => new Promise(resolve => require(['storymaps/core/Core'], core => {
        core.initError('createMap', { reason: 'access', result: { mapId: '6b1e4f428ffa411b96b0e49d214ed17f' } });
        resolve();
      })));
      assert.ok((await page.locator('#fatalError').innerText()).includes('sharing settings'));
      assert.equal(await page.getByRole('link', { name: 'Open ArcGIS Assistant' }).count(), 0);
      await page.evaluate(() => new Promise(resolve => require(['storymaps/core/Core'], core => { core.initError('invalidConfig'); resolve(); })));
      assert.equal(await page.locator('#fatalError .error-msg').innerText(), await page.evaluate(() => i18n.viewer.errors.invalidConfig));
      assert.equal(await page.locator('#fatalError .compatibility-details').isVisible(), false);
      assert.deepEqual(writes, []);
      result.pass = true;
    } catch (error) {
      result.pass = false;
      result.failure = error.message;
      result.pageErrors = pageErrors;
      result.visibleText = await page.locator('body').innerText();
      result.screenshot = path.join(output, 'failure-' + width + '.png');
      await page.screenshot({ path: result.screenshot });
    } finally {
      await context.close();
    }
  }
  const after = await fetch(dataUrl).then(response => response.json());
  assert.deepEqual(after, before, 'Original public item data is unchanged');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ output, results: results.map(({ state, ...result }) => result) }, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;