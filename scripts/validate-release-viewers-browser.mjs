import assert from 'node:assert/strict';
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
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(temporary, 'key.pem'), '-out', path.join(temporary, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = https.createServer({ key: await readFile(path.join(temporary, 'key.pem')), cert: await readFile(path.join(temporary, 'cert.pem')) }, createPreviewHandler({ root: publish, basePath }));
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
  if (selectedRuntimes.has('owner-controls')) {
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
        await page.getByLabel('Search stories', { exact: true }).fill('Rupert');
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 1);
        assert.match(await page.locator('.story-title').innerText(), /Rupert/);
        await page.getByLabel('Search stories', { exact: true }).fill('no matching synthetic title');
        await page.waitForFunction(() => document.getElementById('stories-status').textContent === 'No matching stories found.');
        await page.getByLabel('Search stories', { exact: true }).fill('');
        await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 3);
        await page.getByLabel('Sort', { exact: true }).selectOption('title');
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
      assert.equal(await page.getByRole('link', { name: /^Convert / }).count(), 0);
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 6);
      await page.getByRole('button', { name: 'Previous page', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 24);
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
      assert.equal(conversion.origin, 'https://regal-sable-0a6dde.netlify.app');
      assert.deepEqual([...conversion.searchParams.keys()], ['appid']);
      assert.equal(await page.locator('.story-title > a').count(), 24);
      assert.equal(await page.locator('.story-card a a').count(), 0);
      await context.route(conversion.href, route => route.fulfill({ contentType: 'text/html', body: '<title>Local converter destination</title>' }));
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
