import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import vm from 'node:vm';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const base = process.env.PUBLISH_CHECK_ROOT
  ? (process.env.SITE_BASE_PATH || '')
  : (process.env.SITE_BASE_PATH || '/classic-storymaps-viewer-pages');
const runtimes = ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic'];
let temporary;
let publish;

before(() => {
  if (process.env.PUBLISH_CHECK_ROOT) {
    publish = path.resolve(process.env.PUBLISH_CHECK_ROOT);
    return;
  }
  temporary = mkdtempSync(path.join(os.tmpdir(), 'classic-links-'));
  publish = path.join(temporary, 'publish');
  const env = {
    ...process.env,
    SITE_BASE_PATH: base,
    OUT_DIR: path.join(publish, 'viewers'),
    COMPAT_OUT_DIR_STORIES: path.join(publish, 'templates/classic-stories'),
    COMPAT_OUT_DIR_STORYMAPS: path.join(publish, 'templates/classic-storymaps'),
    ROOT_PAGE_OUT: path.join(publish, 'index.html'),
    ARCHIVE_ROOT_OUT: path.join(publish, 'archive/index.html'),
    ARCHIVE_PAGE_OUT: path.join(publish, 'archive/2017-12-10-app-list.html'),
    ARCHIVE_PAGES_OUT: path.join(publish, 'archive/2017-12-10-pages'),
    SANITIZE_ARCHIVE_SOURCE_PAGES: '0',
    PUBLISH_ROOT: path.join(publish, 'viewers')
  };
  execFileSync('bash', ['scripts/build-classic-storymaps-landing.sh'], { cwd: repo, env });
  for (const runtime of runtimes) {
    const build = path.join(temporary, 'runtimes', runtime, 'build');
    mkdirSync(build, { recursive: true });
    writeFileSync(path.join(build, 'index.html'), '<!doctype html><html><head></head><body><img src="/viewers/' + runtime + '/image.png"></body></html>');
    writeFileSync(path.join(build, 'image.png'), 'fixture');
    writeFileSync(path.join(build, 'BUILD_SOURCE'), runtime === 'crowdsource' ? 'release:0.10.0\n' : 'grunt\n');
    if (runtime === 'shortlist') {
      mkdirSync(path.join(build, 'resources/tpl/builder/icons'), { recursive: true });
      writeFileSync(path.join(build, 'resources/tpl/builder/icons/builder-help.png'), 'shared viewer icon');
      mkdirSync(path.join(build, 'app/storymaps/common/ui/share'), { recursive: true });
      writeFileSync(path.join(build, 'app/storymaps/common/ui/share/ShareDialog.html'), '<img src="resources/tpl/builder/icons/builder-help.png">');
    }
  }
  execFileSync('bash', [path.join(repo, 'scripts/build-classic-storymaps-runtime-publish.sh')], { cwd: temporary, env });
});

after(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  });
}

test('published HTML links stay under the base path and resolve on disk', () => {
  const failures = [];
  let checked = 0;
  for (const file of htmlFiles(publish)) {
    const relative = path.relative(publish, file).split(path.sep).join('/');
    const html = readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>');
    const tags = Array.from(html.matchAll(/<[a-z][^>]*>/gi), (match) => match[0]).join('\n');
    const runtimeFragment = !/<(?:!doctype\s+html|html)\b/i.test(html)
      && relative.match(/^viewers\/[^/]+\//);
    const documentPath = runtimeFragment ? runtimeFragment[0] + 'index.html' : relative;
    for (const match of tags.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
      const value = match[2].replaceAll('&amp;', '&');
      if (!value || value.startsWith('#') || /[<{]/.test(value)) continue;
      const url = new URL(value, 'https://local.example' + base + '/' + documentPath);
      if (url.origin !== 'https://local.example') continue;
      checked += 1;
      if (base && url.pathname !== base && !url.pathname.startsWith(base + '/')) {
        failures.push(relative + ': outside base: ' + value);
        continue;
      }
      let target = path.join(publish, decodeURIComponent(url.pathname.slice(base.length)));
      if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!existsSync(target)) failures.push(relative + ': missing target: ' + value);
    }
  }
  assert.ok(checked > 100, 'Check the real landing and archive links');
  assert.equal(failures.length, 0, failures.length + ' link failures:\n' + failures.slice(0, 30).join('\n'));
});

test('Home omits the empty mini-gallery and gallery call to action without changing app gallery links', () => {
  const home = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  assert.doesNotMatch(home, /id="mini-gallery"|View more story maps in our gallery/);
  assert.match(home, /Engage and Inspire Your Audience/);
  assert.match(home, /The Bare Earth/);
  const appPages = htmlFiles(path.join(publish, 'archive/2017-12-10-pages'))
    .filter(file => path.basename(file).startsWith('en__app-list__'));
  const galleryLinks = appPages.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/<a\b[^>]*href="#"[^>]*>([\s\S]*?)<\/a>/g)])
    .map(match => match[1].replace(/<[^>]*>/g, '').trim());
  assert.equal(galleryLinks.filter(label => label === 'Gallery').length, 20);
  assert.equal(galleryLinks.filter(label => /^(Explore|Browse).*gallery$/.test(label)).length, 10);
});

test('FAQ gallery references are plain text while the How-to gallery reference remains unchanged', () => {
  const faq = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__faq.html'), 'utf8');
  assert.doesNotMatch(faq, /<a\b[^>]*>\s*Story Maps Gallery\s*<\/a>/);
  assert.ok(faq.includes('Then, to see more, go to the Story Maps Gallery.'));
  assert.ok(faq.includes('We recommend visiting the Story Maps Gallery for ideas and inspiration'));
  assert.doesNotMatch(faq, /<a\b[^>]*href="http:\/\/storymaps\.arcgis\.com\/en\/gallery\/[^\"]*"[^>]*>here<\/a>/);
  assert.ok(faq.includes('Story Maps Gallery here.'));
  const howTo = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__how-to.html'), 'utf8');
  assert.ok(howTo.includes('Go to the Story Maps <a href="#">Gallery</a>'));
});

test('developer references are plain text and lesson links use the owner-selected Learn ArcGIS homepage', () => {
  let developerReferences = 0;
  let lessonLinks = 0;
  for (const file of htmlFiles(path.join(publish, 'archive/2017-12-10-pages'))) {
    const html = readFileSync(file, 'utf8');
    developerReferences += (html.match(/Story Maps Developers' Corner/g) || []).length;
    for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      const label = anchor[2].replace(/<[^>]*>/g, '').trim();
      assert.notEqual(label, "Story Maps Developers' Corner", file);
      if (label.includes('Learn ArcGIS') && label.includes('lesson')) {
        assert.match(anchor[1], /href="https:\/\/learn\.arcgis\.com"/);
        assert.match(anchor[1], /target="_blank"/);
        assert.match(anchor[1], /rel="noopener noreferrer"/);
        lessonLinks += 1;
      }
    }
  }
  assert.equal(developerReferences, 12);
  assert.equal(lessonLinks, 3);
});

test('FAQ approved placeholders are unlinked while all answer text remains intact', () => {
  const faqPath = 'archive/2017-12-10-pages/en__faq.html';
  const faq = readFileSync(path.join(publish, faqPath), 'utf8');
  const source = readFileSync(path.join(repo, 'classic-apps/2017-12-10/app-list/pages/en__faq.html'), 'utf8')
    .replace(/(<a\b[^>]*href=")[^"]*("[^>]*>this blog post<\/a>)/g,
      '$1' + base + '/archive/2017-12-10-pages/en__archive-blog.html$2');
  const placeholders = html => [...html.matchAll(/<a\b[^>]*href="#"[^>]*>(?:this link|linked|embedded)<\/a>/g)].map(match => match[0]);
  assert.equal(placeholders(source).length, 4);
  assert.equal(placeholders(faq).length, 0);
  const answer = html => html.match(/<header class="question" id="question6">([\s\S]*?)<div><a class="faq-to-top"/)[1];
  assert.equal(answer(faq), answer(source).replace('<a href="#" target="_blank">this link</a>', 'this link'));
  const audienceAnswer = html => html.match(/<header class="question" id="question9">([\s\S]*?)<div><a class="faq-to-top"/)[1];
  assert.equal(audienceAnswer(faq), audienceAnswer(source).replace(/<a href="#" target="_blank">(linked|embedded)<\/a>/g, '$1'));
  const customAnswer = html => html.match(/<header class="question" id="question19">([\s\S]*?)<div><a class="faq-to-top"/)[1];
  assert.equal(customAnswer(faq), customAnswer(source)
    .replace('<a href="#" target="_blank">this link</a>', 'this link')
    .replace(/<a href="http:\/\/storymaps\.arcgis\.com\/en\/gallery\/[^\"]*" target="_blank">here<\/a>/, 'here'));
});

test('Playlist and Countdown download references retain text without download anchors', () => {
  let removed = 0;
  for (const name of ['playlist', 'countdown']) {
    for (const suffix of ['', '__tutorial']) {
      const filename = 'en__app-list__' + name + suffix + '.html';
      const source = readFileSync(path.join(repo, 'classic-apps/2017-12-10/app-list/pages', filename), 'utf8');
      const output = readFileSync(path.join(publish, 'archive/2017-12-10-pages', filename), 'utf8');
      const downloads = [...source.matchAll(/<a\b[^>]*href="(http:\/\/bit\.ly\/(?:1cImr14|1eML1U4)|https:\/\/github\.com\/Esri\/(?:playlist|countdown)-storytelling-template-js(?:\/archive\/master\.zip)?)"[^>]*>([\s\S]*?)<\/a>/g)];
      for (const [, href, body] of downloads) {
        assert.ok(!output.includes('href="' + href + '"'), filename + ': ' + href);
        assert.ok(output.includes(body), filename + ': retained label');
        removed += 1;
      }
    }
  }
  assert.equal(removed, 7);
});

test('remaining app downloads offer current source ZIPs and canonical GitHub repositories', () => {
  const repositories = {
    'map-tour': 'storymap-tour', basic: 'storymap-basic', cascade: 'storymap-cascade',
    crowdsource: 'storymap-crowdsource', 'map-journal': 'storymap-journal',
    'map-series': 'storymap-series', shortlist: 'storymap-shortlist', 'swipe-spyglass': 'storymap-swipe',
  };
  for (const [app, repository] of Object.entries(repositories)) {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__' + app + '.html'), 'utf8');
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    const download = anchors.find(anchor => anchor[2].includes('Download current source (ZIP)'));
    assert.ok(download, app + ': source download label');
    assert.ok(download[1].includes('href="https://github.com/Esri/' + repository + '/archive/refs/heads/master.zip"'), app);
    const github = anchors.find(anchor => anchor[2].includes('Get the source code on GitHub'));
    assert.ok(github[1].includes('href="https://github.com/Esri/' + repository + '"'), app);
    for (const anchor of [download, github]) {
      assert.match(anchor[1], /target="_blank"/);
      assert.match(anchor[1], /rel="noopener noreferrer"/);
    }
    assert.doesNotMatch(html, /Download the ready-to-deploy app/);
  }
});

test('Five Principles is captured locally with local resources and referring links', () => {
  const destination = '/archive/2017-12-10-pages/en__five-principles.html';
  assert.ok(existsSync(path.join(publish, destination)), 'Publish the saved Five Principles page');
  const html = readFileSync(path.join(publish, destination), 'utf8');
  for (const heading of ['Connect with your audience', 'Lure people in', 'Choose the best user experience', 'Make easy-to-read maps', 'Strive for simplicity']) {
    assert.ok(html.includes(heading), heading);
  }
  assert.doesNotMatch(html, /web\.archive\.org|wombat|bundle-playback|googletagmanager|adobedtm/);
  for (const resource of html.matchAll(/<(?:img|script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
    assert.ok(resource[1].startsWith(base + '/viewers/assets/'), resource[1]);
  }
  for (const image of ['boat.jpg', 'people.png', 'people_dim.jpg', 'collage.png', 'tapestry2.jpg', 'simple.png']) {
    const resource = '/viewers/assets/images/archive/five-principles/' + image;
    assert.ok(html.includes(base + resource), image);
    const bytes = readFileSync(path.join(publish, resource));
    assert.equal(bytes.subarray(0, image.endsWith('.png') ? 8 : 3).toString('hex'),
      image.endsWith('.png') ? '89504e470d0a1a0a' : 'ffd8ff', image + ': actual image, not an error page');
  }
  const stylesheet = readFileSync(path.join(publish, 'viewers/assets/css/archive/newfeature.css'), 'utf8');
  assert.match(stylesheet, /\.large-background/);
  assert.doesNotMatch(stylesheet, /@import|url\(/);
  for (const filename of ['en.html', 'en__resources.html', 'en__faq.html']) {
    const source = readFileSync(path.join(publish, 'archive/2017-12-10-pages', filename), 'utf8');
    assert.ok(source.includes('href="' + base + destination + '"'), filename);
    assert.doesNotMatch(source, /href="[^"]*web\.archive\.org[^\"]*five-principles/);
  }
});

test('published release-capable runtimes retain valid build-source markers', () => {
  for (const runtime of ['cascade', 'shortlist', 'mapseries', 'crowdsource']) {
    const source = readFileSync(path.join(publish, 'viewers', runtime, 'BUILD_SOURCE'), 'utf8').trim();
    assert.match(source, /^(?:grunt|release:\d+\.\d+\.\d+)$/, runtime);
  }
});

test('published runtime entry points contain no uncompiled template tags', () => {
  for (const runtime of runtimes) {
    const html = readFileSync(path.join(publish, 'viewers', runtime, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<%/, runtime + ': runtime entry point must be compiled');
  }
});

test('archive sticky-footer layout has no reserved bottom padding or negative footer offset', () => {
  const stylesheet = readFileSync(path.join(publish, 'viewers/assets/css/archive/screen.css'), 'utf8');
  const pageRules = [...stylesheet.matchAll(/\.page\.sticky-footer\s*\{([^}]+)\}/g)];
  assert.ok(pageRules.length > 0);
  for (const rule of pageRules) assert.match(rule[1], /padding-bottom:\s*0(?:px)?\s*;/);
  const footerRules = [...stylesheet.matchAll(/\.footer\.sticky-footer\s*\{([^}]+)\}/g)];
  assert.ok(footerRules.length > 0);
  for (const rule of footerRules) assert.match(rule[1], /margin-top:\s*0(?:px)?\s*;/);
});

test('archive root repeats the archive disclaimer below the shared navigation', () => {
  for (const filename of ['index.html', 'archive/index.html']) {
    const html = readFileSync(path.join(publish, filename), 'utf8');
    const banner = html.match(/<div class="archive-banner"[^>]*>\s*<div class="container">([^<]+)<\/div>/);
    const footer = html.match(/<footer id="archive-footer"[^>]*>([\s\S]*?)<\/footer>/);
    assert.ok(footer, filename + ': archive disclaimer footer is present');
    const navigationFooter = html.match(/<footer class="footer sticky-footer">[\s\S]*?<\/footer>/);
    assert.ok(navigationFooter && navigationFooter.index + navigationFooter[0].length <= footer.index, 'Disclaimer follows the shared navigation footer');
    const disclaimer = 'This is a historical archive of the Classic Story Maps website from 2017-12-10.';
    assert.equal(banner[1], disclaimer);
    assert.match(footer[0], /class="archive-banner"/);
    assert.equal(footer[1].match(/<div class="container">([^<]+)<\/div>/)?.[1], disclaimer);
    assert.doesNotMatch(footer[1], /<nav\b|<a\b|site-brand|esri-logo/);
    assert.match(html, /#archive-footer\s*\{[^}]*position:\s*static;/);
  }
});

test('site and archive pages omit Esri PNG logos and the historical copyright footer', () => {
  const sitePages = htmlFiles(publish).filter(file => {
    const relative = path.relative(publish, file).split(path.sep).join('/');
    return !runtimes.some(runtime => relative.startsWith('viewers/' + runtime + '/'));
  });
  for (const file of sitePages) {
    const html = readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /class="[^"]*\besri-logo(?:-footer)?\b|(?:src|background)="[^"]*logo-esri[^"/]*\.png/i, file);
    assert.doesNotMatch(html, /Copyright\s+2017\s+Environmental Systems Research Institute, Inc\.|footer-legal/i, file);
  }
  const stylesheet = readFileSync(path.join(publish, 'viewers/assets/css/archive/screen.css'), 'utf8');
  assert.doesNotMatch(stylesheet, /url\([^)]*logo-esri[^)]*\.png/i);
});

test('archive headers and mobile drawers link to Viewers', () => {
  const pages = [path.join(publish, 'index.html'), path.join(publish, 'viewers/archive-root.html'), ...htmlFiles(path.join(publish, 'archive'))];
  let checked = 0;
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const navigation = Array.from(html.matchAll(/<nav\b[^>]*class="(?:site-nav|drawer-nav)\b[^>]*>([\s\S]*?)<\/nav>/g), match => match[1]);
    for (const content of navigation) {
      if (!/nav_(?:gallery|viewers)/.test(content)) continue;
      const link = content.match(/<a\b[^>]*data-langlabel="nav_viewers"[^>]*href="([^"]+)"[^>]*>Viewers<\/a>/);
      assert.ok(link, file + ': header or drawer must offer Viewers');
      assert.equal(link[1], base + '/viewers/');
      assert.doesNotMatch(content, /nav_gallery/);
      if (content.includes('drawer-link')) assert.match(link[0], /class="drawer-link icon-grid"/);
      checked += 1;
    }
  }
  assert.ok(checked > 30, 'Check the full archive navigation set');
});

test('archive headers and mobile drawers replace My Stories with FAQs', () => {
  const pages = [path.join(publish, 'index.html'), path.join(publish, 'viewers/archive-root.html'), ...htmlFiles(path.join(publish, 'archive'))];
  let checked = 0;
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    for (const navigation of html.matchAll(/<nav\b[^>]*class="(?:site-nav|drawer-nav)\b[^>]*>([\s\S]*?)<\/nav>/g)) {
      const content = navigation[1];
      const link = content.match(/<a\b[^>]*data-langlabel="nav_faq"[^>]*href="([^"]+)"[^>]*>FAQs<\/a>/);
      assert.ok(link, file + ': header or drawer must offer FAQs');
      assert.equal(link[1], base + '/archive/2017-12-10-pages/en__faq.html');
      assert.doesNotMatch(content, /nav_mystories|My Stories/);
      checked += 1;
    }
  }
  assert.ok(checked > 30, 'Check the full archive navigation set');
});

test('published pages retain My Stories text without links', () => {
  for (const file of htmlFiles(publish)) {
    const html = readFileSync(file, 'utf8');
    for (const anchor of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = anchor[2].replace(/<[^>]*>/g, '').trim();
      assert.notEqual(label, 'My Stories', file);
      assert.doesNotMatch(anchor[1], /(?:\/my-stories(?:\/|[?#]|$)|en__my-stories\.html)/i, file);
    }
  }
  const tutorial = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__cascade__tutorial.html'), 'utf8');
  assert.match(tutorial, /My Stories/);
});

test('archive links to retired hosts use owner-selected destinations', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'classic-product-links-'));
  const file = path.join(directory, 'fixture.html');
  const destination = 'https://www.esri.com/en-us/arcgis/products/arcgis-storymaps/classic';
  try {
    writeFileSync(file, [
      '<a href="https://storymaps-classic.arcgis.com/en/app-list/?old=1#section" target="_blank">Classic apps</a>',
      '<a href="//STORYMAPS-CLASSIC.ARCGIS.COM/anything">Classic gallery</a>',
      '<a href="https://web.archive.org/web/20171210000000/https://storymaps-classic.arcgis.com/en/">Archived link</a>',
      '<a href="https://storymaps-classic.arcgis.com/en/my-stories/">My Stories</a>',
      '<a href="https://storymaps-classic.arcgis.com.example.org/en/">Unrelated</a>',
      '<a href="http://storymaps.arcgis.com/en/app-list/cascade/">Legacy Cascade</a>',
      '<a href="http://crossingtherubikhan.com/old-post/?from=story#more" target="_blank">Travel blog</a>',
      '<a href="//WWW.CROSSINGTHERUBICON.COM/blog/">Rally blog</a>',
      '<a href="https://crossingtherubikhan.com.example.org/blog/">Unrelated blog</a>',
    ].join('\n'));
    execFileSync(process.execPath, ['scripts/refresh-archive-examples.mjs', file], { cwd: repo });
    const html = readFileSync(file, 'utf8');
    assert.ok(html.includes(`<a href="${destination}" target="_blank">Classic apps</a>`));
    assert.ok(html.includes(`<a href="${destination}">Classic gallery</a>`));
    assert.ok(html.includes(`<a href="${destination}">Archived link</a>`));
    assert.ok(html.includes(`<a href="${destination}">Legacy Cascade</a>`));
    const travelArchive = 'https://web.archive.org/web/20171023101933/http://crossingtherubikhan.com/';
    assert.ok(html.includes(`<a href="${travelArchive}" target="_blank">Travel blog</a>`));
    assert.ok(html.includes(`<a href="${travelArchive}">Rally blog</a>`));
    assert.ok(html.includes('<a href="/archive/2017-12-10-pages/en__archive-blog.html">Unrelated blog</a>'));
    assert.match(html, /\nMy Stories\n/);
    assert.ok(html.includes('<a href="https://storymaps-classic.arcgis.com.example.org/en/">Unrelated</a>'));
    for (const published of htmlFiles(publish)) {
      assert.doesNotMatch(readFileSync(published, 'utf8'), /<a\b[^>]*href="(?:https?:)?\/\/storymaps-classic\.arcgis\.com(?:[/?#"])/i, published);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('viewer policy disables My Stories and routes audited retired links without blocking unrelated links', () => {
  const callbacks = {};
  const anchor = (href, textContent = '') => {
    const attributes = new Map([['href', href], ['target', '_blank']]);
    return {
      textContent,
      querySelectorAll: () => [],
      matches: selector => selector.startsWith('a[href]') && attributes.has('href'),
      getAttribute: name => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
    };
  };
  const initial = anchor('https://storymaps.arcgis.com/en/my-stories/?from=tutorial');
  const ordinary = anchor('https://example.org/my-stories/', 'Unrelated stories');
  const classic = anchor('https://storymaps-classic.arcgis.com/en/', 'Classic Story Maps');
  const travel = anchor('https://www.crossingtherubikhan.com/blog/', 'Travel blog');
  const document = {
    baseURI: 'https://preview.example/project/viewers/cascade/index.html',
    currentScript: { src: 'https://preview.example/project/viewers/assets/js/social-link-policy.js' },
    documentElement: {},
    head: { appendChild() {} },
    createElement: () => ({}),
    querySelectorAll: () => [initial, ordinary, classic, travel],
    addEventListener: (name, callback) => { callbacks[name] = callback; },
  };
  vm.runInNewContext(readFileSync(path.join(repo, 'apps/classic-storymaps-site/assets/js/social-link-policy.js'), 'utf8'), {
    document, URL, WeakSet,
    MutationObserver: class {
      constructor(callback) { callbacks.mutation = callback; }
      observe() {}
    },
  });
  assert.equal(initial.getAttribute('href'), undefined);
  assert.equal(initial.getAttribute('target'), undefined);
  assert.equal(ordinary.getAttribute('href'), 'https://example.org/my-stories/');
  const productUrl = 'https://www.esri.com/en-us/arcgis/products/arcgis-storymaps/classic';
  assert.equal(classic.getAttribute('href'), productUrl);
  for (const href of [
    'http://storymaps-classic.arcgis.com/en/app-list/?old=1#section',
    '//STORYMAPS-CLASSIC.ARCGIS.COM/anything',
    'http://storymaps.arcgis.com/en/app-list/cascade/',
    'https://storymaps.arcgis.com/en/app-list/cascade/',
    'https://storymaps.arcgis.com/en/app-list/',
    'https://storymaps.arcgis.com/en/gallery/',
  ]) {
    const linked = anchor(href, 'Classic apps');
    callbacks.mutation([{ type: 'childList', addedNodes: [linked] }]);
    assert.equal(linked.getAttribute('href'), productUrl);
    assert.equal(linked.textContent, 'Classic apps');
    assert.equal(linked.getAttribute('target'), '_blank');
    assert.equal(linked.getAttribute('rel'), 'noopener noreferrer');
    callbacks.mutation([{ type: 'attributes', target: linked }]);
    assert.equal(linked.getAttribute('href'), productUrl);
  }
  const unrelatedClassic = anchor('https://storymaps-classic.arcgis.com.example.org/en/');
  callbacks.mutation([{ type: 'childList', addedNodes: [unrelatedClassic] }]);
  assert.equal(unrelatedClassic.getAttribute('href'), 'https://storymaps-classic.arcgis.com.example.org/en/');
  const modernStory = anchor('https://storymaps.arcgis.com/stories/749af21064e34f029bdd53946d9d941a');
  callbacks.mutation([{ type: 'childList', addedNodes: [modernStory] }]);
  assert.equal(modernStory.getAttribute('href'), 'https://storymaps.arcgis.com/stories/749af21064e34f029bdd53946d9d941a');
  const audit = JSON.parse(readFileSync(path.join(repo, 'docs/testing/artifacts/deployed-link-audit-2026-10-08/results.json'), 'utf8'));
  const travelArchive = 'https://web.archive.org/web/20171023101933/http://crossingtherubikhan.com/';
  assert.equal(travel.getAttribute('href'), travelArchive);
  const travelLinks = audit.destinations.filter(entry => entry.assessment === 'DA-007');
  assert.equal(travelLinks.length, 10);
  for (const href of [...travelLinks.map(entry => entry.url), '//WWW.CROSSINGTHERUBICON.COM/blog/?old=1#more', 'https://crossingtherubicon.com/']) {
    const linked = anchor(href, 'Original travel label');
    callbacks.mutation([{ type: 'childList', addedNodes: [linked] }]);
    assert.equal(linked.getAttribute('href'), travelArchive);
    assert.equal(linked.textContent, 'Original travel label');
    assert.equal(linked.getAttribute('target'), '_blank');
    assert.equal(linked.getAttribute('rel'), 'noopener noreferrer');
    callbacks.mutation([{ type: 'attributes', target: linked }]);
    assert.equal(linked.getAttribute('href'), travelArchive);
  }
  const unrelatedTravel = anchor('https://crossingtherubikhan.com.example.org/blog/');
  callbacks.mutation([{ type: 'childList', addedNodes: [unrelatedTravel] }]);
  assert.equal(unrelatedTravel.getAttribute('href'), 'https://crossingtherubikhan.com.example.org/blog/');
  const retired = audit.destinations.filter(entry => entry.assessment === 'DA-003');
  assert.equal(retired.length, 8);
  for (const entry of retired) {
    const destination = new URL(entry.url);
    const runtime = destination.pathname.includes('MapSeries') ? 'mapseries'
      : destination.pathname.includes('StoryMapCrowdsource') ? 'crowdsource' : 'cascade';
    const linked = anchor(entry.url + '&locale=en#section-2', 'Original label');
    callbacks.mutation([{ type: 'childList', addedNodes: [linked] }]);
    assert.equal(linked.getAttribute('href'), '/project/viewers/' + runtime + '/index.html' + destination.search + '&locale=en#section-2');
    assert.equal(linked.textContent, 'Original label');
    assert.equal(linked.getAttribute('target'), '_blank');
    assert.equal(linked.getAttribute('rel'), 'noopener noreferrer');
    const rewritten = linked.getAttribute('href');
    callbacks.mutation([{ type: 'attributes', target: linked }]);
    assert.equal(linked.getAttribute('href'), rewritten);
  }
  for (const href of [
    retired[0].url.replace('nation.maps.arcgis.com', 'unrelated.example'),
    retired[0].url.replace('7a0c165e7b404073b686f95ef98d6241', '00000000000000000000000000000000'),
  ]) {
    const untouched = anchor(href);
    callbacks.mutation([{ type: 'childList', addedNodes: [untouched] }]);
    assert.equal(untouched.getAttribute('href'), href);
  }
  for (const dynamic of [
    anchor('/project/archive/2017-12-10-pages/en__my-stories.html#start'),
    anchor('https://storymaps-classic.arcgis.com/en/my-stories/'),
    anchor('https://example.org/redirect', 'My Stories'),
  ]) {
    callbacks.mutation([{ type: 'childList', addedNodes: [dynamic] }]);
    assert.equal(dynamic.getAttribute('href'), undefined);
    let prevented = false;
    callbacks.click({ target: dynamic, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
    assert.equal(prevented, true);
  }
});

test('example links avoid the custom domain and resolve relatively on either deployment', () => {
  for (const file of htmlFiles(publish)) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /<a\b[^>]*href="(?:https?:)?\/\/(?:www\.)?classicstorymaps\.com/i, file);
  }
  const launcher = readFileSync(path.join(publish, 'viewers/maptour-launcher.html'), 'utf8');
  const href = launcher.match(/<a\b[^>]*id="demo-link"[^>]*href="([^"]+)"/)?.[1];
  assert.equal(href, 'maptour/index.html?webmap=a5019e8c55d547eab69c0777dcd7509a');
  for (const origin of ['https://example.test/', 'https://example.test/classic-storymaps-viewer-pages/']) {
    assert.equal(new URL(href, origin + 'viewers/maptour-launcher.html').href, origin + 'viewers/' + href);
  }
});

test('archive pages share an internal-only footer matching header navigation', () => {
  const pages = [path.join(publish, 'index.html'), path.join(publish, 'viewers/archive-root.html'), ...htmlFiles(path.join(publish, 'archive'))];
  const root = readFileSync(pages[0], 'utf8');
  const footerPattern = /<footer class="footer sticky-footer">[\s\S]*?<\/footer>/;
  const sharedFooter = root.match(footerPattern)?.[0];
  assert.ok(sharedFooter);
  const links = content => [...content.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map(match => [match[2], match[1]]);
  const header = root.match(/<nav class="site-nav[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual(links(sharedFooter), [
    ['Home', base + '/archive/2017-12-10-pages/en.html'],
    ...links(header),
  ]);
  let checked = 0;
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const footer = html.match(footerPattern)?.[0];
    if (footer) {
      assert.equal(footer, sharedFooter, file + ': shared footer markup');
      checked += 1;
    }
    for (const footer of html.matchAll(/<footer\b[\s\S]*?<\/footer>/g)) {
      assert.doesNotMatch(footer[0], /footer-social-nav|icon-(?:twitter|facebook|github|email)|feedback-footer|nav_gallery|nav_mystories|My Stories|Copyright 2017|Privacy|Legal/, file);
      for (const [, href] of links(footer[0])) {
        assert.ok(href.startsWith(base + '/'), file + ': internal footer destination');
        assert.equal(new URL(href, 'https://local.example').origin, 'https://local.example');
      }
    }
  }
  assert.ok(checked > 4, 'Check root, captured, and standalone archive footers');
  for (const filename of ['index.html', 'archive/index.html', 'viewers/archive-root.html', 'archive/2017-12-10-app-list.html', 'archive/2017-12-10-pages/en.html', 'archive/2017-12-10-pages/en__app-list.html']) {
    const html = readFileSync(path.join(publish, filename), 'utf8');
    assert.equal(html.match(footerPattern)?.[0], sharedFooter, filename);
  }
});

test('archive app listings omit Gallery controls but retain other app actions', () => {
  for (const filename of ['index.html', 'archive/index.html', 'viewers/archive-root.html', 'archive/2017-12-10-app-list.html', 'archive/2017-12-10-pages/en__app-list.html']) {
    const html = readFileSync(path.join(publish, filename), 'utf8');
    const listings = Array.from(html.matchAll(/<div class="app-text">([\s\S]*?)<\/div>/g), match => match[1]);
    const sourceFile = filename === 'archive/2017-12-10-app-list.html'
      ? 'classic-apps/2017-12-10/app-list/raw/index.raw.html'
      : filename === 'archive/2017-12-10-pages/en__app-list.html'
        ? 'classic-apps/2017-12-10/app-list/pages/en__app-list.html'
        : 'apps/classic-storymaps-site/archive-root.html';
    const source = readFileSync(path.join(repo, sourceFile), 'utf8');
    const sourceListings = Array.from(source.matchAll(/<div class="app-text">([\s\S]*?)<\/div>/g), match => match[1]);
    const labels = listing => Array.from(listing.matchAll(/<(?:a|span)\b[^>]*>([^<]*)<\/(?:a|span)>/g), match => match[1].trim()).filter(label => label !== 'GALLERY');
    assert.ok(listings.length >= 8, filename + ': check every app listing');
    assert.deepEqual(listings.map(labels), sourceListings.map(labels), filename + ': preserve non-Gallery controls');
    for (const listing of listings) {
      assert.doesNotMatch(listing, /<(?:a|span)\b[^>]*>\s*GALLERY\s*<\/(?:a|span)>/i, filename);
    }
  }
});

test('all sample and overview story links open in an isolated new tab', () => {
  const slugs = ['map-tour', 'map-journal', 'map-series', 'cascade', 'shortlist', 'swipe-spyglass', 'crowdsource', 'basic'];
  const files = ['index.html', 'archive/index.html', 'viewers/archive-root.html', 'archive/2017-12-10-app-list.html', 'archive/2017-12-10-pages/en__app-list.html',
    ...slugs.map(slug => 'archive/2017-12-10-pages/en__app-list__' + slug + '.html')];
  let checked = 0;
  for (const file of files) {
    const html = readFileSync(path.join(publish, file), 'utf8');
    for (const match of html.matchAll(/<a\b([^>]*\bhref="([^"]*)"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const label = match[3].replace(/<[^>]*>/g, '').trim();
      if (!/^view (?:sample\b|a\b|this\b)/i.test(label) && !/\/viewers\/(?:maptour|swipe|mapjournal|mapseries|cascade|shortlist|crowdsource|basic)(?:[/?]|$)/.test(match[2])) continue;
      assert.match(match[1], /\btarget="_blank"/, file + ': ' + match[2]);
      const rel = match[1].match(/\brel="([^"]*)"/)?.[1].split(/\s+/) || [];
      assert.ok(rel.includes('noopener') && rel.includes('noreferrer'), file + ': ' + match[2]);
      checked += 1;
    }
  }
  assert.ok(checked >= 48, 'Cover every example and repeated archive listing');
});

for (const [name, image, oldDestination] of [
  ['Norway', 'playlist4.jpg', 'geoportal.tversu.ru/Atlas/norway12'],
  ['Idaho', 'playlist2.jpg', 'fishandgame.idaho.gov/ifwis/maps/wma'],
]) test(`${name} example keeps its image without a link or view-story caption`, () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__playlist.html'), 'utf8');
  const block = [...html.matchAll(/<div class="feature-block">([\s\S]*?)<\/div>/g)]
    .find(match => match[1].includes(image));
  assert.ok(block, 'Keep the ' + name + ' example image block');
  assert.ok(block[1].includes('src="' + base + '/viewers/assets/images/archive/app-list/' + image + '"'));
  assert.doesNotMatch(block[1], /<a\b|View this story map/);
  assert.ok(!html.includes(oldDestination));
  assert.ok(existsSync(path.join(publish, 'viewers/assets/images/archive/app-list', image)));
  assert.match(html, /href="http:\/\/storymaps\.esri\.com\/stories\/2013\/storylocator\/"/);
});

test('newsletter links use the owner-selected ArcGIS StoryMaps signup page', () => {
  let checked = 0;
  const expectedLabels = { 'en.html': ['Sign up today.', 'Sign up'], 'en__resources.html': ['Sign up!'] };
  for (const [filename, labels] of Object.entries(expectedLabels)) {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages', filename), 'utf8');
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const label of labels) {
      const link = links.find(match => match[2].replace(/<[^>]*>/g, '').trim() === label);
      assert.ok(link, filename + ': ' + label);
      assert.equal(link[1], 'https://www.esri.com/en-us/arcgis/products/arcgis-storymaps/newsletter-signup');
      checked += 1;
    }
    assert.ok(!html.includes('links.esri.com/storymaps/newsletter_signup'));
  }
  assert.equal(checked, 3);
});

test('all viewer runtimes load the shared social-link removal policy', () => {
  const script = base + '/viewers/assets/js/social-link-policy.js';
  for (const runtime of runtimes) {
    const html = readFileSync(path.join(publish, 'viewers', runtime, 'index.html'), 'utf8');
    assert.ok(html.includes('src="' + script + '"'), runtime);
  }
  assert.ok(existsSync(path.join(publish, 'viewers/assets/js/social-link-policy.js')));
});

test('published pages omit social profile links while retaining author names', () => {
  for (const file of htmlFiles(publish)) {
    for (const link of readFileSync(file, 'utf8').matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)) {
      const url = new URL(link[1], 'https://local.example');
      const socialHosts = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com', 'threads.net', 'bsky.app', 'youtube.com', 'youtu.be', 'flickr.com'];
      assert.ok(!socialHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)), file + ': ' + link[1]);
    }
  }
  const resources = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__resources.html'), 'utf8');
  for (const label of ['@EsriStoryMaps', 'Allen Carroll', 'John Nelson']) assert.ok(resources.includes(label), label);
});

test('Map Series entry-limit FAQ links to the migrated Community answer', () => {
  const faq = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__faq.html'), 'utf8');
  const source = readFileSync(path.join(repo, 'classic-apps/2017-12-10/app-list/pages/en__faq.html'), 'utf8');
  const answer = html => html.match(/<header class="question" id="question39">([\s\S]*?)<div><a class="faq-to-top"/)[1];
  const destination = 'https://community.esri.com/en/discussion/comment/499570#Comment_499570';
  assert.ok(answer(source).includes('href="https://geonet.esri.com/thread/150596"'));
  assert.equal(answer(faq), answer(source).replace('https://geonet.esri.com/thread/150596', destination));
  assert.ok(!faq.includes('geonet.esri.com/thread/150596'));
});

test('Story Map Collections references retain their text without collection links', () => {
  const destinations = new Set([
    'https://collections.storymaps.esri.com/shortlists/',
    'https://links.esri.com/storymaps/story_map_collection_oceans',
    'https://links.esri.com/storymaps/story_map_collection_cip',
    'https://links.esri.com/storymaps/story_map_collection_instructional',
    'https://links.esri.com/storymaps/story_map_collection_vision_zero',
    'https://links.esri.com/storymaps/story_map_collections',
  ]);
  let removed = 0;
  for (const filename of ['en__resources.html', 'en__app-list__shortlist.html']) {
    const source = readFileSync(path.join(repo, 'classic-apps/2017-12-10/app-list/pages', filename), 'utf8');
    const output = readFileSync(path.join(publish, 'archive/2017-12-10-pages', filename), 'utf8');
    for (const link of source.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      if (!destinations.has(link[1])) continue;
      assert.ok(output.includes(link[2]), filename + ': preserve collection text and headings');
      assert.ok(!output.includes('href="' + link[1] + '"'), filename + ': unlink ' + link[1]);
      removed += 1;
    }
  }
  assert.equal(removed, 7);
  for (const file of htmlFiles(publish)) {
    const html = readFileSync(file, 'utf8');
    assert.ok(!/href="[^"]*(?:collections\.storymaps\.esri\.com|links\.esri\.com\/storymaps\/story_map_collections?(?:_|\/|"))/.test(html), file);
  }
});

test('ArcGIS Marketplace links use the owner-selected retirement article', () => {
  let checked = 0;
  for (const file of htmlFiles(publish)) {
    const html = readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /href="https?:\/\/marketplace\.arcgis\.com(?:\/|\")/, file);
    for (const link of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      if (!link[2].replace(/<[^>]*>/g, '').trim().startsWith('ArcGIS Marketplace')) continue;
      assert.equal(link[1], 'https://support.esri.com/en-us/knowledge-base/arcgis-marketplace-retirement-000041842', file);
      checked += 1;
    }
  }
  assert.ok(checked >= 3, 'Preserve Marketplace links across the captured pages');
});

test('blog listings and articles link to the internal archive notice', () => {
  const audit = JSON.parse(readFileSync(path.join(repo, 'docs/testing/artifacts/archive-link-audit.json'), 'utf8'));
  const destinations = audit.destinations.filter(entry => {
    const url = new URL(entry.final || entry.url);
    return url.hostname === 'blogs.esri.com'
      || url.hostname === 'developerscorner.storymaps.arcgis.com'
      || /(^|\.)medium\.com$/.test(url.hostname)
      || url.pathname.includes('/arcgis-blog/')
      || entry.url === 'http://links.esri.com/storymaps/blog_all'
      || entry.url.includes('/http://blogs.esri.com/');
  });
  assert.ok(destinations.length >= 20, 'Cover historical destinations, not just links labelled Blog');
  let checked = 0;
  for (const destination of destinations) {
    for (const reference of destination.references) {
      const html = readFileSync(path.join(publish, reference.page), 'utf8');
      for (const label of reference.labels) {
        if (label === 'Insiders Blog') {
          assert.ok(!html.includes('Insiders Blog'), 'Keep the replaced legacy footer removed');
          continue;
        }
        const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
          .filter(match => match[2].replace(/<[^>]*>/g, '').trim() === label);
        assert.ok(links.length, `${reference.page}: preserve ${label}`);
        for (const link of links) {
          assert.equal(link[1], base + '/archive/2017-12-10-pages/en__archive-blog.html', `${reference.page}: ${label}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked >= 40);
  const faq = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__faq.html'), 'utf8');
  assert.ok(faq.includes('href="http://links.esri.com/storymaps/shortlist_layer_template"'));
});

test('historical home links open the original Bare Earth Cascade in the current viewer', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  const examples = [...html.matchAll(/<a\b[^>]*href="([^"]*\/viewers\/cascade\/index\.html\?appid=36b4887370d141fcbb35392f996c82d9)"[^>]*>[\s\S]*?<\/a>/g)];
  assert.equal(examples.length, 2, 'Cover both the image and text links');
  assert.ok(examples.some(example => example[0].includes('The Bare Earth')));
  for (const example of examples) {
    assert.equal(example[1], base + '/viewers/cascade/index.html?appid=36b4887370d141fcbb35392f996c82d9');
    assert.ok(example[0].includes('target="_blank"'));
    assert.ok(example[0].includes('noopener noreferrer'));
  }
  assert.doesNotMatch(html, /href="[^"]*smotm_dec2017/);
});

test('Resources singing presentation opens its original Cascade in the current viewer', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__resources.html'), 'utf8');
  const example = html.match(/<a\b[^>]*href="([^"]*\/viewers\/cascade\/index\.html\?appid=dcd5d01e2b0342fe90cf3b8ca9ab8302)"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(example, 'Preserve the original singing presentation');
  assert.equal(example[1], base + '/viewers/cascade/index.html?appid=dcd5d01e2b0342fe90cf3b8ca9ab8302');
  assert.ok(example[0].includes('Make Your Story Map Sing'));
  assert.ok(example[0].includes('target="_blank"'));
  assert.ok(example[0].includes('noopener noreferrer'));
  assert.ok(!html.includes('make_your_story_map_sing'));
});

for (const [itemId, topic, label] of [
  ['5cd671a4cf1844b7854220979574b927', 'Sections', "'How To Cascade' guide"],
  ['7a0c165e7b404073b686f95ef98d6241', 'Transitions', "'How To Cascade' guide"],
  ['954145df6cf84e2d8bbea996438c99fb', 'Map Legends', 'guide'],
  ['a644a02894d246b59ecad16fae25b767', 'Multi-View Map', "'How To Cascade' guide"],
  ['c4ed68ecb9d54d398dbf46dcde881471', 'Media', "'How to Cascade' guide"],
]) {
  test(`Cascade tutorial ${topic} guide retains its original item in the current viewer`, () => {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__cascade__tutorial.html'), 'utf8');
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .filter(link => link[1].includes(itemId));
    assert.equal(links.length, 1);
    assert.equal(links[0][1], base + '/viewers/cascade/index.html?appid=' + itemId);
    assert.equal(links[0][2].trim(), label);
    assert.ok(links[0][0].includes('target="_blank"'));
    assert.ok(links[0][0].includes('noopener noreferrer'));
  });
}

test('Resources introduction presentation opens its original Map Series in the current viewer', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__resources.html'), 'utf8');
  const example = html.match(/<a\b[^>]*href="([^"]*\/viewers\/mapseries\/index\.html\?appid=4aaf9036c7324b0cb5c8ee3e609126e7)"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(example, 'Preserve the original introduction presentation');
  assert.equal(example[1], base + '/viewers/mapseries/index.html?appid=4aaf9036c7324b0cb5c8ee3e609126e7');
  assert.ok(example[0].includes('An Introduction to Story Maps'));
  assert.ok(example[0].includes('target="_blank"'));
  assert.ok(example[0].includes('noopener noreferrer'));
  assert.ok(!html.includes('an_introduction_presentation'));
});

test('FAQ caption example opens the original Map Tour in the current viewer', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__faq.html'), 'utf8');
  const example = html.match(/<a\b[^>]*href="([^"]*\/viewers\/maptour\/index\.html\?appid=d5b2c90d8a53466f9c3efb0f25d13325)"[^>]*>Map Tour<\/a>/);
  assert.ok(example, 'Preserve the caption-formatting story and link label');
  assert.equal(example[1], base + '/viewers/maptour/index.html?appid=d5b2c90d8a53466f9c3efb0f25d13325');
  assert.ok(example[0].includes('target="_blank"'));
  assert.ok(example[0].includes('noopener noreferrer'));
  assert.ok(!html.includes('story_map_tour_html_formatting_in_caption_example'));
});

test('Audubon organization tile opens the owner-approved original Map Series', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  const tile = html.match(/<a\b[^>]*class="party-tile audubon"[^>]*>/);
  assert.ok(tile, 'Preserve the Audubon organization tile');
  assert.ok(tile[0].includes('href="' + base + '/viewers/mapseries/index.html?appid=3c48121bd41945d68aacd1ded71841a4"'));
  assert.ok(tile[0].includes('target="_blank"'));
  assert.ok(tile[0].includes('noopener noreferrer'));
  assert.doesNotMatch(html, /href="[^"]*links\.esri\.com\/storymaps\/user\/audubon/);
});

test('organization tiles retain local styling and accessible NOAA content', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  assert.ok(html.includes('href="' + base + '/viewers/assets/css/archive/organization-tiles.css"'));
  assert.ok(existsSync(path.join(publish, 'viewers/assets/css/archive/organization-tiles.css')));
  const tile = html.match(/<a\b[^>]*class="party-tile noaa"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(tile?.[1].includes('NOAA'), 'NOAA has visible, accessible link content');
});

for (const [organization, label, shortlink] of [
  ['montana', 'Montana FWP', 'montana_fwp'],
  ['ncc', 'NCC', 'ncc'],
  ['usda', 'USDA', 'usda'],
  ['natparksrvc', 'National Park Service', 'nps'],
  ['nature', 'The Nature Conservancy', 'tnc'],
  ['trust', 'Trust for Public Land', 'tpl'],
  ['raster', 'Blue Raster', 'blueraster'],
]) {
  test(`${label} organization example is explicitly unavailable and not a link`, () => {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
    const tile = html.match(new RegExp(`<span\\b[^>]*class="party-tile ${organization}"[^>]*>[^<]*<\\/span>`));
    assert.ok(tile, 'Keep the organization name and explicit unavailable state');
    assert.ok(tile[0].includes(`${label} (Unavailable)`));
    assert.ok(tile[0].includes('aria-disabled="true"'));
    assert.doesNotMatch(tile[0], /\b(?:href|target|tabindex)=/);
    assert.ok(!html.includes(`<a class="party-tile ${organization}"`));
    assert.ok(!html.includes(`href="https://links.esri.com/storymaps/user/${shortlink}"`));
  });
}

test('Boston organization tile opens the owner-selected filtered gallery', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  const tile = html.match(/<a\b[^>]*class="party-tile boston"[^>]*>City of Boston<\/a>/);
  assert.ok(tile, 'Preserve the readable Boston organization tile');
  const href = tile[0].match(/\bhref="([^"]+)"/)[1].replaceAll('&amp;', '&');
  assert.equal(href, 'https://boston.maps.arcgis.com/home/gallery.html?sortField=relevance&sortOrder=desc&mode=keyword&focus=applications-storymap');
  assert.ok(tile[0].includes('target="_blank"'));
  assert.ok(tile[0].includes('rel="noopener noreferrer"'));
  assert.doesNotMatch(html, /href="[^"]*links\.esri\.com\/storymaps\/user\/city_boston/);
});

test('NOAA organization tile uses the owner-selected Wayback capture', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en.html'), 'utf8');
  const tile = html.match(/<a\b[^>]*class="party-tile noaa"[^>]*>/);
  assert.ok(tile, 'NOAA tile exists');
  assert.ok(tile[0].includes('href="https://web.archive.org/web/20250223200002/https://oceanservice.noaa.gov/map-stories/welcome.html"'));
  assert.ok(tile[0].includes('target="_blank"'));
  assert.ok(!html.includes('href="https://links.esri.com/storymaps/user/noaa"'));
});

test('Resources section illustrations are local PNG assets rather than missing Wayback backgrounds', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__resources.html'), 'utf8');
  const illustrations = [...html.matchAll(/class="rsrc-circle"[^>]*background-image:url\('([^']+)'\)/g)].map(match => match[1]);
  const names = ['basics', 'faqs', 'community', 'blog', 'newsletter', 'developers'];
  assert.deepEqual(illustrations, names.map(name => `${base}/viewers/assets/images/archive/resources/${name}.png`));
  assert.ok(html.includes(`href="${base}/viewers/assets/css/archive/support.css"`));
  const stylesheet = readFileSync(path.join(publish, 'viewers/assets/css/archive/support.css'), 'utf8');
  assert.ok(stylesheet.includes('../../images/archive/resources/trophy.png'));
  assert.doesNotMatch(stylesheet, /web\.archive\.org/);
  for (const name of [...names, 'trophy']) {
    const image = readFileSync(path.join(publish, `viewers/assets/images/archive/resources/${name}.png`));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('site pages use the shared local folded-map favicon', () => {
  for (const file of htmlFiles(publish)) {
    const html = readFileSync(file, 'utf8');
    if (!/<html\b/i.test(html)) continue;
    const icons = [...html.matchAll(/<link\b[^>]*rel="(?:shortcut )?icon"[^>]*>/g)];
    assert.equal(icons.length, 1, file + ': one canonical favicon');
    for (const icon of icons) assert.ok(icon[0].includes(`href="${base}/viewers/assets/images/favicon.ico?v=folded-map-transparent"`), file);
  }
  const icon = readFileSync(path.join(publish, 'viewers/assets/images/favicon.ico'));
  assert.equal(icon.readUInt16LE(2), 1);
  assert.deepEqual(readFileSync(path.join(publish, 'viewers/favicon.ico')), icon);
  assert.deepEqual(readFileSync(path.join(publish, 'favicon.ico')), icon);
  assert.deepEqual(readFileSync(path.join(repo, 'apps/classic-storymaps-site/favicon.ico')), icon);
  const before = htmlFiles(publish).map(file => readFileSync(file, 'utf8'));
  execFileSync(process.execPath, [path.join(repo, 'scripts/stage-site-favicons.mjs'), publish], {
    env: { ...process.env, SITE_BASE_PATH: base }
  });
  assert.deepEqual(htmlFiles(publish).map(file => readFileSync(file, 'utf8')), before);
});

test('Map Series layout options retain their compact layout illustrations', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__map-series.html'), 'utf8');
  const options = html.slice(html.indexOf('<div class="feature-options">'), html.indexOf('<div class="clear">'));
  assert.deepEqual([...options.matchAll(/<img[^>]*src="([^"]+)"/g)].map(match => path.basename(match[1])), [
    'mapseries_layout_tabbed.jpg', 'mapseries_layout_side_accordion.jpg', 'mapseries_layout_bulleted.jpg',
  ]);
});

test('Shortlist Get inspired and Map Series Side Accordion illustration use the owner-selected destinations', () => {
  const shortlist = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__shortlist.html'), 'utf8');
  const examples = [...shortlist.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .filter(match => match[2].includes('<img') && match[2].includes('View this story map'));
  assert.ok(examples[1][1].endsWith('/viewers/shortlist/index.html?appid=5a9c34acf59a49f0a67d5f7293b44d6b'));
  assert.match(examples[1][2], /alt="The Raised Bogs of Ireland"/);
  assert.ok(examples[0][1].endsWith('appid=0584dbad6ebf433a96f1111f4cc7e3bd'));
  assert.ok(examples[2][1].endsWith('appid=62eef62250984b188b7512ec8f1caadb'));
  const series = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__map-series.html'), 'utf8');
  const accordion = [...series.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .find(match => match[2].includes('mapseries_layout_side_accordion.jpg'));
  assert.equal(accordion?.[1], 'https://storymaps.esri.com/archives/stories/2013/ShaleGas/');
});

test('Countdown overview leads with Ports and ends with 25 Busiest Airports', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__countdown.html'), 'utf8');
  const examples = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*countdown([1-4])\.jpg[^>]*>[\s\S]*?<\/a>/g)];
  assert.deepEqual(examples.map(example => example[2]), ['4', '2', '3', '1']);
  assert.equal(examples[0][1], 'https://storymaps.esri.com/archives/stories/2013/ports/');
  assert.match(examples[1][1], /\/debellgolf\//);
  assert.equal(examples[2][1], 'https://storymaps.esri.com/archives/stories/2013/refugee-camps/');
  assert.match(examples[3][1], /\/stories\/2013\/airports\//);
  const top = html.slice(html.indexOf('<div id="top-feat">'), html.indexOf('<div id="features"'));
  assert.match(top, /countdown4\.jpg/);
  assert.doesNotMatch(top, /countdown1\.jpg/);
});

for (const story of ['ports', 'refugee-camps']) {
  test(`Countdown ${story} example uses its owner-selected archived destination`, () => {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__countdown.html'), 'utf8');
    const examples = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)]
      .filter(example => example[1].includes('/2013/' + story + '/'));
    assert.equal(examples.length, 1);
    assert.equal(examples[0][1], 'https://storymaps.esri.com/archives/stories/2013/' + story + '/');
    assert.match(examples[0][0], /View this story map/i);
    assert.ok(examples[0][0].includes('target="_blank"'));
    assert.ok(examples[0][0].includes('noopener noreferrer'));
  });
}

test('first Playlist example uses the archived 20 Towns destination', () => {
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__playlist.html'), 'utf8');
  const example = html.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*playlist1\.jpg[^>]*>[\s\S]*?<\/a>/);
  assert.ok(example, 'First Playlist example exists');
  assert.equal(example[1], 'https://storymaps.esri.com/archives/stories/2013/20towns/');
  assert.ok(example[0].includes('target="_blank"'));
  assert.ok(example[0].includes('noopener noreferrer'));
});

test('Map Tour sample and fourth Overview example use the owner-selected stories', () => {
  for (const file of ['index.html', 'archive/index.html', 'viewers/archive-root.html']) {
    const html = readFileSync(path.join(publish, file), 'utf8');
    const tour = [...html.matchAll(/<div class="app-text">([\s\S]*?)<\/div>/g)]
      .find(match => match[1].includes('Story Map Tour'))?.[1];
    assert.ok(tour?.includes('/viewers/maptour/index.html?webmap=a5019e8c55d547eab69c0777dcd7509a'), file + ': Map Tour sample');
  }
  const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__map-tour.html'), 'utf8');
  const examples = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .filter(match => match[1].includes('/viewers/maptour') && match[2].includes('<img'));
  assert.equal(examples.length, 4);
  assert.ok(examples[3][1].endsWith('/viewers/maptour/index.html?appid=016c31c6dcd54c7ca635cc63e4bc82a4'));
  assert.ok(examples[3][2].includes('/images/examples/016c31c6dcd54c7ca635cc63e4bc82a4.jpg'));
  assert.ok(examples[3][0].includes('target="_blank"'));
});

test('owner-selected Cascade, Map Series and Crowdsource examples match their screenshots and samples', () => {
  for (const [slug, position, id] of [
    ['cascade', 1, 'f2e8448fef064238ace4f324ffc16fde'],
    ['map-series', 1, '79798a56715c4df183448cc5b7e1b999'],
    ['crowdsource', 0, '467eccf026ca416cae01a2c6f086b2b9'],
  ]) {
    const html = readFileSync(path.join(publish, `archive/2017-12-10-pages/en__app-list__${slug}.html`), 'utf8');
    const examples = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .filter(match => match[2].includes('<img') && match[2].includes('View this story map'));
    assert.ok(examples[position][1].endsWith('index.html?appid=' + id), slug + ': example destination');
    assert.ok(examples[position][2].includes('/images/examples/' + id + '.jpg'), slug + ': paired screenshot');
    if (slug === 'crowdsource') {
      assert.ok(examples[1][1].endsWith('appid=f1fcc302b0864b0c94beffc5177da2b8'));
      assert.ok(examples[2][1].endsWith('appid=b861ca9ea1114af7908600022ee9d033'));
      assert.ok(examples[2][2].includes('/images/examples/b861ca9ea1114af7908600022ee9d033.jpg'));
      assert.match(html, /href="[^"]*appid=467eccf026ca416cae01a2c6f086b2b9"[^>]*>View a Crowdsource Story/);
    }
    if (slug === 'cascade') {
      assert.ok(examples[0][1].endsWith('appid=dbc3574e3d0d4f4a81ae95f2e86b0dc2'));
      assert.ok(examples[2][1].endsWith('appid=9497dbc933bc46efacc5236722cebde6'));
    }
  }
  for (const file of ['index.html', 'archive/index.html', 'viewers/archive-root.html']) {
    const html = readFileSync(path.join(publish, file), 'utf8');
    const blocks = [...html.matchAll(/<div class="app-text">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    for (const [label, id] of [['Story Map Cascade', 'f2e8448fef064238ace4f324ffc16fde'], ['Side Accordion Layout', '79798a56715c4df183448cc5b7e1b999'], ['Story Map Crowdsource', '467eccf026ca416cae01a2c6f086b2b9']]) {
      assert.ok(blocks.find(block => block.includes(label))?.includes('appid=' + id), file + ': ' + label);
    }
  }
});

test('archive examples replace failed stories and match advertised sample layouts', () => {
  const slugs = ['map-tour', 'map-journal', 'map-series', 'cascade', 'shortlist', 'swipe-spyglass', 'crowdsource', 'basic'];
  const files = ['index.html', 'archive/index.html', 'viewers/archive-root.html',
    ...slugs.map(slug => 'archive/2017-12-10-pages/en__app-list__' + slug + '.html')];
  const retired = ['2c62acf3468c4cbbba6b82f1035bfe22', '5afdbed13fad458cb6288c46a0bad060', 'd6635d5602b04c05a445058f53da5cb5', 'ef703d9454bb4e4e8a9c1b086b5b66b5', 'c7ad1a55de0247a68454a76f251225a4', 'a0a12caf5025441497d49d35b01a07f8', '716b6277db404a5aaf2406f7bb444295'];
  for (const file of files) {
    const html = readFileSync(path.join(publish, file), 'utf8');
    for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      assert.ok(!retired.some(id => match[1].includes(id)), file + ': stale example ' + match[1]);
    }
  }
  for (const file of files.slice(0, 3)) {
    const html = readFileSync(path.join(publish, file), 'utf8');
    const blocks = [...html.matchAll(/<div class="app-text">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    for (const [label, id] of [['Tabbed Layout', '6aab740eb5f146d0bbc073185aa726cb'], ['Side Accordion Layout', '79798a56715c4df183448cc5b7e1b999'], ['Story Map Spyglass', '97ae55e015774b7ea89fd0a52ca551c2']]) {
      const block = blocks.find(content => content.includes(label));
      assert.ok(block?.includes('appid=' + id), file + ': ' + label);
    }
  }
});

test('archive overview examples do not depend on the inactive custom domain', () => {
  const slugs = ['map-tour', 'map-journal', 'map-series', 'cascade', 'shortlist', 'swipe-spyglass', 'crowdsource', 'basic'];
  for (const slug of slugs) {
    const html = readFileSync(path.join(publish, 'archive/2017-12-10-pages/en__app-list__' + slug + '.html'), 'utf8');
    assert.doesNotMatch(html, /href="https?:\/\/(?:www\.)?classicstorymaps\.com\/viewers\//i, slug);
  }
});

test('catalog has a return button pointing to the archive under the deployment prefix', () => {
  const html = readFileSync(path.join(publish, 'viewers/index.html'), 'utf8');
  const link = html.match(/<a\b[^>]*class="[^"]*\barchive-return\b[^>]*href="([^"]+)"[^>]*>\s*Back to Archive\s*<\/a>/);
  assert.ok(link, 'Catalog includes a Back to Archive button-styled link');
  assert.equal(link[1], base + '/archive/');
});

test('catalog supports all eight runtimes with working launcher routes', () => {
  const context = vm.createContext({ window: { location: { pathname: base + '/viewers/' } } });
  vm.runInContext(readFileSync(path.join(publish, 'viewers/assets/js/classic-storymaps-config.js'), 'utf8'), context);
  const apps = context.window.ClassicStoryMapsConfig.catalogApps;
  assert.equal(apps.length, runtimes.length);
  for (const app of apps) {
    assert.equal(app.state, 'supported', app.runtime);
    assert.equal(app.action, 'Open Launcher', app.runtime);
    assert.equal(app.launchRoute, app.runtime + '-launcher.html');
    assert.ok(existsSync(path.join(publish, 'viewers', app.launchRoute)));
    assert.doesNotMatch(app.description, /in progress/i);
  }
});

test('catalog cards omit support badges and retain all launcher links', () => {
  const context = vm.createContext({ window: { location: { pathname: base + '/viewers/' } }, grid: {} });
  vm.runInContext(readFileSync(path.join(publish, 'viewers/assets/js/classic-storymaps-config.js'), 'utf8'), context);
  const html = readFileSync(path.join(publish, 'viewers/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.slice(script.indexOf('    const CLASSIC_CONFIG'), script.indexOf('    const grid')), context);
  vm.runInContext(script.slice(script.indexOf('    function cardTemplate')), context);
  const cards = [...context.grid.innerHTML.matchAll(/<a class="card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, runtimes.length);
  for (const card of cards) {
    assert.ok(runtimes.some(runtime => card[1] === runtime + '-launcher.html'));
    assert.doesNotMatch(card[2], /<a\b|<button\b/);
  }
  assert.doesNotMatch(context.grid.innerHTML, /class="(?:badge|row)\b|In Progress|>Supported</);
  assert.equal((context.grid.innerHTML.match(/class="link-btn"/g) || []).length, runtimes.length);
});

test('catalog routes and loader inference include the deployment prefix', () => {
  const context = vm.createContext({ window: { location: { pathname: base + '/viewers/maptour-launcher.html' } } });
  vm.runInContext(readFileSync(path.join(publish, 'viewers/assets/js/classic-storymaps-config.js'), 'utf8'), context);
  const config = context.window.ClassicStoryMapsConfig;
  assert.equal(config.basePath, base + '/viewers');
  assert.equal(config.runtimeViewerByApp.maptour, base + '/viewers/maptour/index.html');
  const loader = readFileSync(path.join(publish, 'viewers/assets/js/classic-story-loader.js'), 'utf8');
  vm.runInContext(loader.slice(loader.indexOf('  var APP_ID_REGEX'), loader.indexOf('  function encodePath(')), context);
  assert.equal(context.getStoryBasePath(), base + '/viewers');
});

test('compatibility redirects retain the deployment prefix, query, and hash', () => {
  for (const legacy of ['classic-stories', 'classic-storymaps']) {
    let destination;
    const html = readFileSync(path.join(publish, 'templates', legacy, 'maptour/index.html'), 'utf8');
    const context = vm.createContext({ window: { location: {
      pathname: base + '/templates/' + legacy + '/maptour/',
      search: '?appid=local-test', hash: '#section',
      replace: (url) => { destination = url; }
    } } });
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    assert.equal(destination, base + '/viewers/maptour/?appid=local-test#section');
  }
});
