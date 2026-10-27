import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = await readFile(new URL('../apps/classic-storymaps-site/assets/js/classic-image-notice.js', import.meta.url), 'utf8');
const output = await mkdtemp(path.join(os.tmpdir(), 'classic-image-notice-'));
const { chromium } = process.env.PLAYWRIGHT_NODE_MODULES
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'playwright/index.mjs')))
  : await import('playwright');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=', 'base64');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/ok.png' || url.pathname === '/resources/icons/picture-not-available.png') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(png);
  } else if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><html><head><title>Image notice fixture</title></head><body><button id="reader">Story navigation</button><main id="story"></main></body></html>');
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
const results = [];
const bootstrap = '(function(define){' + source + '\n})(function(dependencies, factory){ var notice = factory(); notice.install(); notice.install(); });';

try {
  for (const width of [1280, 390]) {
    for (const mode of ['healthy', 'http', 'https', 'placeholder', 'fallback', 'recovered', 'removed', 'late', 'cascade', 'cascade-recovered']) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 700 : 850 } });
      try {
        const page = await context.newPage();
        const errors = [];
        const requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(request.url()));
        await context.route('https://images.example/**', route => route.abort('failed'));
        await page.goto(origin, { waitUntil: 'load' });
        await page.locator('#reader').focus();
        await page.evaluate(mode => {
          const story = document.querySelector('#story');
          if (mode.startsWith('cascade')) {
            story.innerHTML = '<div class="block error"><div class="block-media"><div class="image-container"></div><div class="loading-error">Unable to load image</div></div></div>';
            if (mode === 'cascade-recovered') setTimeout(() => document.querySelector('.loading-error').remove(), 400);
            return;
          }
          if (mode === 'late') return;
          const image = document.createElement('img');
          image.alt = 'Story photo';
          image.width = 200;
          image.height = 150;
          if (mode === 'fallback' || mode === 'recovered') image.onerror = () => {
            image.onerror = null;
            image.src = mode === 'fallback' ? '/resources/icons/picture-not-available.png' : '/ok.png';
          };
          image.src = mode === 'healthy' ? '/ok.png' : mode === 'placeholder' ? '/resources/icons/picture-not-available.png'
            : mode === 'https' ? 'https://images.example/broken.png?token=synthetic-private-value' : '/missing.png?token=synthetic-private-value';
          story.append(image);
          if (mode === 'removed') setTimeout(() => image.remove(), 400);
          if (mode === 'healthy') {
            const map = document.createElement('div');
            map.className = 'esriMapContainer';
            map.innerHTML = '<img src="/missing-tile.png">';
            story.append(map);
            new Image().src = '/detached-probe.png';
          }
        }, mode);
        if (mode === 'placeholder') await page.waitForFunction(() => document.images[0].complete);
        await page.addScriptTag({ content: bootstrap });
        if (mode === 'late') await page.evaluate(() => {
          const image = document.createElement('img');
          image.src = '/late-missing.png';
          document.querySelector('#story').append(image);
        });
        const expected = !['healthy', 'recovered', 'removed', 'cascade-recovered'].includes(mode);
        const dialog = page.getByRole('dialog', { name: 'Some images could not be loaded' });
        if (expected) {
          await dialog.waitFor({ state: 'visible' });
          assert.equal(await page.locator('dialog').count(), 1);
          assert.equal(await dialog.evaluate(element => element.matches(':modal')), true);
          assert.equal(await page.getByRole('button', { name: 'Continue reading' }).evaluate(element => element === document.activeElement), true);
          await page.getByText('Story owner: repair the images', { exact: true }).click();
          const text = await dialog.innerText();
          assert.match(text, /supports HTTPS/);
          assert.match(text, /browser does not reveal the exact cause/);
          assert.match(text, /No story content has been changed/);
          assert.doesNotMatch(text, /synthetic-private-value|images\.example/);
          const bounds = await dialog.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
          assert.ok(bounds.y >= 0 && bounds.height <= page.viewportSize().height);
          assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
          const buttonBounds = await page.getByRole('button', { name: 'Continue reading' }).boundingBox();
          assert.ok(buttonBounds.y >= bounds.y && buttonBounds.y + buttonBounds.height <= bounds.y + bounds.height);
          assert.equal(await page.locator('.classic-image-notice-content').evaluate(element => element.scrollWidth > element.clientWidth), false);
          if (mode === 'https') await page.screenshot({ path: path.join(output, 'notice-' + width + '.png') });
          if (mode === 'https') await page.keyboard.press('Escape');
          else await page.getByRole('button', { name: 'Continue reading' }).click();
          await dialog.waitFor({ state: 'detached' });
          assert.equal(await page.locator('#reader').evaluate(element => element === document.activeElement), true);
          await page.evaluate(() => {
            const image = document.createElement('img');
            image.src = '/another-missing.png';
            document.body.append(image);
          });
        }
        await page.waitForTimeout(1900);
        assert.equal(await page.locator('dialog').count(), 0);
        assert.deepEqual(errors, []);
        assert.ok(requests.every(url => url.startsWith(origin) || url.startsWith('https://images.example/')));
        results.push({ mode, width, pass: true });
      } finally { await context.close(); }
    }
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, output }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
