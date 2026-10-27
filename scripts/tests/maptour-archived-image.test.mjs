import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const filename = new URL('../../runtimes/maptour/upstream/MapTour/src/app/storymaps/utils/ArchivedImage.js', import.meta.url);
let archivedImage;
const backgroundImages = [];
const timers = [];
vm.runInNewContext(readFileSync(filename, 'utf8'), {
  define: (dependencies, factory) => { archivedImage = factory(); },
  window: {
    Image: function() { const photo = image(null); backgroundImages.push(photo); return photo; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); }
  }
});
const source = 'https://www.ebmud.com/files/cache/bf62da23163b671cde7167cb412824db_f811.png';
const capture = 'https://web.archive.org/web/20150927034152if_/http://www.ebmud.com/files/cache/bf62da23163b671cde7167cb412824db_f811.png';
const placeholder = 'resources/tpl/viewer/icons/picture-not-available.png';

function image(url) {
  const attributes = { src: url };
  const assignments = [];
  return {
    attributes, assignments,
    getAttribute: name => attributes[name],
    get src() { return attributes.src; },
    setAttribute: (name, value) => { attributes[name] = value; assignments.push([name, value]); }
  };
}

test('only exact known public photo URLs map to the verified capture', () => {
  assert.equal(archivedImage.target(source), capture);
  assert.equal(archivedImage.target(source.replace('https:', 'http:')), capture);
  for (const unsafe of [source + '?token=secret', source + '?size=2', source + '#fragment', source.replace('www.ebmud.com', 'other.example'), source.replace('https://', 'https://user:secret@'), 'data:image/png;base64,abc', 'https://example.com/video.mp4']) {
    assert.equal(archivedImage.target(unsafe), null);
  }
});

test('failed photo tries archive once, then placeholder without looping', () => {
  const photo = image(source);
  assert.equal(archivedImage.recover(photo, placeholder, true), true);
  assert.equal(photo.attributes.src, capture);
  assert.equal(photo.attributes.referrerpolicy, 'no-referrer');
  assert.equal(archivedImage.recover(photo, placeholder, true), false);
  assert.equal(photo.attributes.src, placeholder);
  const assignments = photo.assignments.length;
  assert.equal(archivedImage.recover(photo, placeholder, true), false);
  assert.equal(photo.assignments.length, assignments);
  photo.setAttribute('src', source);
  assert.equal(archivedImage.recover(photo, placeholder, true), true);
  assert.equal(photo.attributes.src, capture);
});

test('unknown or disabled recovery retains the existing placeholder behavior', () => {
  for (const [url, enabled] of [[source, false], ['https://private.example/photo?token=secret', true]]) {
    const photo = image(url);
    assert.equal(archivedImage.recover(photo, placeholder, enabled), false);
    assert.equal(photo.attributes.src, placeholder);
    assert.equal(photo.attributes.referrerpolicy, undefined);
  }
});

test('separate photo and thumbnail elements recover independently without changing source data', () => {
  const attributes = Object.freeze({ pic_url: source, thumb_url: source });
  for (const url of Object.values(attributes)) {
    const photo = image(url);
    assert.equal(archivedImage.recover(photo, placeholder, true), true);
    assert.equal(photo.attributes.src, capture);
  }
  assert.equal(attributes.pic_url, source);
  assert.equal(attributes.thumb_url, source);
});

test('missing source does not initiate a request', () => {
  const photo = image(null);
  assert.equal(archivedImage.recover(photo, placeholder, true), false);
  assert.deepEqual(photo.assignments, []);
});

test('archive timeout preserves loaded images and ignores a newer source', () => {
  for (const outcome of ['loaded', 'navigated', 'stalled']) {
    const photo = image(source);
    archivedImage.recover(photo, placeholder, true);
    const timer = timers.at(-1);
    assert.equal(timer.delay, 10000);
    if (outcome === 'loaded') { photo.complete = true; photo.naturalWidth = 640; }
    if (outcome === 'navigated') photo.setAttribute('src', 'https://example.com/new.png');
    timer.callback();
    assert.equal(photo.attributes.src, outcome === 'loaded' ? capture : outcome === 'navigated' ? 'https://example.com/new.png' : placeholder);
  }
});

test('returning to the same photo starts a fresh attempt immune to its old timeout', () => {
  const photo = image(source);
  archivedImage.recover(photo, placeholder, true);
  const oldTimer = timers.at(-1);
  photo.setAttribute('src', 'https://example.com/other.png');
  photo.setAttribute('src', source);
  archivedImage.recover(photo, placeholder, true);
  const currentTimer = timers.at(-1);
  oldTimer.callback();
  assert.equal(photo.attributes.src, capture);
  currentTimer.callback();
  assert.equal(photo.attributes.src, placeholder);
});

test('CSS background recovery waits for decoded image load and ignores stale callbacks', () => {
  const container = { style: {} };
  archivedImage.loadBackground(container, source, placeholder, true);
  const first = backgroundImages.at(-1);
  first.onerror();
  assert.equal(first.src, capture);
  assert.equal(container.style.backgroundImage, undefined);
  first.onload();
  assert.equal(container.style.backgroundImage, 'url(' + JSON.stringify(capture) + ')');
  const count = backgroundImages.length;
  archivedImage.loadBackground(container, source, placeholder, true);
  assert.equal(backgroundImages.length, count);
  archivedImage.loadBackground(container, 'https://example.com/new.png', placeholder, true);
  const second = backgroundImages.at(-1);
  second.onload();
  first.onload();
  first.onerror();
  assert.equal(container.style.backgroundImage, 'url("https://example.com/new.png")');
  assert.equal(first.src, capture);
  second.onerror();
  second.onload();
  assert.equal(container.style.backgroundImage, 'url(' + JSON.stringify(placeholder) + ')');
});

test('viewer does not force the first saved point into an intro', () => {
  const index = readFileSync(new URL('../../runtimes/maptour/upstream/MapTour/src/index.html', import.meta.url), 'utf8');
  assert.match(index, /firstRecordAsIntro:\s*false/);
});

test('automatic discovery restores only the still-current failed image and honors revocation', async () => {
  const second = 'https://www.ebmud.com/files/another.png';
  let resolve;
  let enabled = true;
  archivedImage.setDiscovery({
    isEnabled: () => enabled, setConsent: value => { enabled = value; },
    eligible: url => url === second,
    discover: () => new Promise(complete => { resolve = complete; })
  });
  const photo = image(second);
  archivedImage.recover(photo, placeholder, true);
  assert.equal(photo.src, placeholder);
  resolve({ url: capture, timestamp: '20150927034152' });
  await Promise.resolve();
  assert.equal(photo.src, capture);
  for (let index = 0; index < 300; index++) archivedImage.recover(image('https://example.com/photo-' + index + '.png'), placeholder, true);
  archivedImage.revoke();
  assert.equal(photo.src, placeholder);
  enabled = true;
  photo.setAttribute('src', second);
  archivedImage.recover(photo, placeholder, true);
  photo.setAttribute('src', 'https://example.com/new.png');
  resolve({ url: capture, timestamp: '20150927034152' });
  await Promise.resolve();
  assert.equal(photo.src, 'https://example.com/new.png');
  archivedImage.setDiscovery(null);
});
