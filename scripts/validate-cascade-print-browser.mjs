import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(process.env.CASCADE_BUILD_ROOT || path.join(repo, 'runtimes/cascade/build'));
const output = await mkdtemp(path.join(os.tmpdir(), 'cascade-print-browser-'));
const dependencies = process.env.PLAYWRIGHT_NODE_MODULES || path.join(repo, 'node_modules');
const require = createRequire(path.join(dependencies, '../package.json'));
const { transformSync } = require('esbuild');
const { chromium } = await import(pathToFileURL(path.join(dependencies, 'playwright/index.mjs')));
const sourceRoot = path.join(repo, 'runtimes/cascade/upstream/src/app/storymaps/tpl/print');
const sources = {};
for (const filename of ['media/Text.jsx', 'PrintViewReact.jsx']) {
  sources[filename] = transformSync(await readFile(path.join(sourceRoot, filename), 'utf8'), {
    loader: 'jsx', format: 'cjs', target: 'es2017'
  }).code;
}
const server = http.createServer(createPreviewHandler({ root }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
const results = [];

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') {
        externalRequests.push(request.url());
        return route.abort();
      }
      return route.continue();
    });
    await page.route(origin + '/__print-test', route => route.fulfill({ contentType: 'text/html', body:
      '<!doctype html><html><head><title>Cascade print regression</title><style>body{margin:24px}#fixture{max-width:760px}table{border-collapse:collapse}td,th{border:1px solid;padding:6px}img{max-width:100%}</style></head><body><main id="fixture"></main></body></html>' }));
    await page.goto(origin + '/__print-test');
    await page.evaluate(() => {
      const definitions = new Map();
      const instances = new Map();
      window.app = { isPrint: true, isProduction: true };
      window.__printProbe = 0;
      window.define = (name, dependencies, factory) => {
        if (typeof name !== 'string') {
          factory = dependencies;
          dependencies = name;
          name = window.__moduleName;
        }
        if (!Array.isArray(dependencies)) {
          factory = dependencies;
          dependencies = [];
        }
        definitions.set(name, { dependencies, factory });
      };
      window.define.amd = {};
      window.require = () => {};
      window.__getModule = name => {
        if (instances.has(name)) return instances.get(name);
        const definition = definitions.get(name);
        if (!definition) throw new Error('Missing fixture AMD module: ' + name);
        const module = { exports: {} };
        const values = definition.dependencies.map(dependency => {
          if (dependency === 'module') return module;
          if (dependency === 'exports') return module.exports;
          if (name.endsWith('/PrintViewReact') && !['react', 'storymaps/tpl/print/PrintSanitizer'].includes(dependency)) {
            return dependency.includes('i18n!') ? { print: { page: {} } } : {};
          }
          return window.__getModule(dependency);
        });
        const result = typeof definition.factory === 'function' ? definition.factory(...values) : definition.factory;
        const value = result === undefined ? module.exports : result;
        instances.set(name, value);
        return value;
      };
    });
    for (const [name, filename] of [
      ['resources/dompurify/purify.min', 'resources/dompurify/purify.min.js'],
      ['storymaps/tpl/print/PrintSanitizer', 'app/storymaps/tpl/print/PrintSanitizer.js'],
      ['bundle', 'app/print-min.js']
    ]) {
      await page.evaluate(value => { window.__moduleName = value; }, name);
      await page.addScriptTag({ url: origin + '/' + filename });
    }
    const checks = await page.evaluate(({ sources }) => {
      const React = window.__getModule('react');
      const ReactDOM = window.__getModule('react-dom');
      const sanitizer = window.__getModule('storymaps/tpl/print/PrintSanitizer');
      const sourceModule = code => {
        const module = { exports: {} };
        const require = name => name === 'react' ? React : name === 'storymaps/tpl/print/PrintSanitizer' ? sanitizer
          : name.includes('i18n!') ? { print: { page: {} } } : {};
        new Function('require', 'module', 'exports', code)(require, module, module.exports);
        return module.exports.default;
      };
      const fixture = document.getElementById('fixture');
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const attacks = [
        '<p onclick="window.__printProbe++">Event</p><img src="/missing.png" onerror="window.__printProbe++">',
        '<ScRiPt>window.__printProbe++</ScRiPt><script type="text/javascript">window.__printProbe++</script>',
        '<a href="javascript:window.__printProbe++">Link</a><a href="jav&#x09;ascript:window.__printProbe++">Encoded</a>',
        '<a href="data:text/html,test">Data</a><a href="vbscript:test">VB</a><img src="data:image/svg+xml,test">',
        '<svg onload="window.__printProbe++"><a xlink:href="javascript:test">SVG</a></svg><math><mtext>Math</mtext></math>',
        '<iframe srcdoc="<img src=x onerror=window.__printProbe++>"></iframe><object data="https://unsafe.invalid"></object>',
        '<form id="app"><input name="__proto__"></form><div id="app" name="location">Clobber</div>',
        '<p style="position:fixed;inset:0;z-index:999;background-image:url(https://unsafe.invalid/pixel);color:red">CSS</p>',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=window.__printProbe++>">'
      ];
      const benign = '<h2>Formatted story</h2><p style="color: rgb(255,255,255);background-color: rgb(0,0,0);text-align:center"><strong>Bold</strong> <em>italic</em> <u>underline</u> H<sub>2</sub>O</p><ul><li>First</li><li>Second</li></ul><table><tbody><tr><th scope="col">Place</th><td colspan="2">Details</td></tr></tbody></table><a href="https://example.org/story" target="_blank">External</a> <a href="/relative">Relative</a> <a href="mailto:example@example.org">Email</a>';
      const variants = [
        ['release', window.__getModule('storymaps-react/tpl/print/media/Text'), window.__getModule('storymaps-react/tpl/print/PrintViewReact')],
        ['source', sourceModule(sources['media/Text.jsx']), sourceModule(sources['PrintViewReact.jsx'])]
      ];
      const results = [];
      const benignOutputs = [];
      for (const [variant, Text, PrintView] of variants) {
        for (const tag of ['div', 'figcaption']) {
          for (const attack of attacks) {
            ReactDOM.render(React.createElement(Text, { text: attack, tag }), fixture);
            assert(!fixture.querySelector('script,svg,math,iframe,object,form,input,style'), variant + ' executable element');
            for (const element of fixture.querySelectorAll('*')) {
              for (const attribute of element.attributes) {
                assert(!/^on/i.test(attribute.name) && !['id', 'name', 'srcdoc'].includes(attribute.name), variant + ' unsafe attribute');
                if (['href', 'src'].includes(attribute.name)) assert(!/^(javascript|vbscript|data|blob):/i.test(attribute.value), variant + ' unsafe URL');
              }
              assert(!element.style.position && !element.style.backgroundImage && !element.style.zIndex, variant + ' unsafe style');
            }
            fixture.firstElementChild.click();
            assert(window.__printProbe === 0, variant + ' handler executed');
          }
          ReactDOM.render(React.createElement(Text, { text: benign, tag }), fixture);
          assert(fixture.querySelectorAll('li').length === 2 && fixture.querySelector('strong').textContent === 'Bold', variant + ' formatting lost');
          assert(fixture.querySelector('td').colSpan === 2 && fixture.querySelector('a').rel === 'noopener noreferrer', variant + ' table/link semantics lost');
          assert(fixture.querySelector('p').style.textShadow && !fixture.querySelector('p').style.backgroundColor, variant + ' print color adjustment lost');
          assert(fixture.querySelector('p').style.textAlign === 'center', variant + ' alignment lost');
          assert(fixture.firstElementChild.tagName === tag.toUpperCase(), variant + ' wrong container');
          benignOutputs.push(fixture.innerHTML);
          results.push({ variant, tag, attackCases: attacks.length, formatting: true });
        }
        const settings = { theme: { fonts: { titleFont: { fontFamily: 'Georgia' }, bodyFont: { fontFamily: 'Arial' } }, colors: { bgMain: 'rgb(240, 240, 240)' } } };
        const view = new PrintView({ props: { appSettings: settings, printSettings: {} } });
        view.getAppTheme = () => 'bg-custom';
        const style = view.renderCustomStyles();
        assert(!style.props.dangerouslySetInnerHTML && style.props.children.includes('Georgia'), variant + ' theme not CSS text');
        ReactDOM.render(style, fixture);
        assert(fixture.querySelector('style').sheet.cssRules.length === 3, variant + ' valid CSS did not render');
        view.state.appSettings = { theme: { fonts: { titleFont: { fontFamily: 'Arial; } body { display:none' }, bodyFont: { fontFamily: '</style><img src=x onerror=window.__printProbe++>' } }, colors: { bgMain: 'url(https://unsafe.invalid/pixel)' } } };
        assert(view.renderCustomStyles() === null, variant + ' invalid theme accepted');
        view.state.appSettings = { theme: { fonts: { titleFont: { fontFamily: 'Georgia' } } } };
        assert(view.renderCustomStyles().props.children.includes('Georgia'), variant + ' missing body font failed');
      }
      assert(benignOutputs[0] === benignOutputs[2] && benignOutputs[1] === benignOutputs[3], 'Source/release formatting differs');
      assert(sanitizer.sanitize('') === '' && sanitizer.sanitize(null) === '', 'Empty input handling');
      const Text = variants[0][1];
      ReactDOM.render(React.createElement(Text, { text: benign, tag: 'div' }), fixture);
      return results;
    }, { sources });
    await page.screenshot({ path: path.join(output, 'print-' + width + '.png'), fullPage: true });
    assert.equal(await page.evaluate(() => window.__printProbe), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    results.push({ width, checks, pageErrors: errors, externalRequests });
    await context.close();
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ root, results }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, output, results }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
