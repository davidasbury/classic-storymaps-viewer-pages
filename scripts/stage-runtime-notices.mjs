import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const runtimes = ['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic'];

export function stageRuntimeNotices(runtime, output) {
  if (!runtimes.includes(runtime)) throw new Error(`Unknown runtime: ${runtime}`);
  const prefix = `runtimes/${runtime}/upstream/`;
  const tracked = execFileSync('git', ['ls-files', '-z', prefix], { cwd: repository, encoding: 'utf8' }).split('\0').filter(Boolean);
  const selected = tracked.filter(filename => /(?:license|licence|notice|copying|copyright|ofl)(?:\.|$)/i.test(path.basename(filename))
    || (/\/fonts?\//.test(filename) && /^readme/i.test(path.basename(filename))));
  const rootLicense = selected.find(filename => path.posix.dirname(filename) === prefix.slice(0, -1) && /^license/i.test(path.basename(filename)));
  if (!rootLicense) throw new Error(`Missing upstream root license: ${runtime}`);
  const notices = [];
  for (const filename of selected) {
    const relative = filename.slice(prefix.length);
    const destination = path.join(output, 'notices/upstream', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repository, filename), destination);
    notices.push(`upstream/${relative}`);
  }
  fs.copyFileSync(path.join(repository, rootLicense), path.join(output, 'LICENSE.txt'));
  const supplement = (filename, content) => {
    const destination = path.join(output, 'notices/supplemental', filename);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
    notices.push(`supplemental/${filename}`);
  };
  const editorLicense = fs.readFileSync(path.join(repository, 'runtimes/mapjournal/upstream/src/lib-app/ckeditor/LICENSE.md'), 'utf8');
  const ofl = editorLicense.match(/Appendix E:[\s\S]*?```\s*([\s\S]*?)```/)?.[1];
  if (!ofl?.startsWith('SIL OPEN FONT LICENSE Version 1.1')) throw new Error('Missing complete bundled OFL terms');
  supplement('OFL-1.1.txt', ofl);
  const mit = editorLicense.match(/Appendix D:[\s\S]*?```\s*([\s\S]*?)```/)?.[1];
  if (!mit?.startsWith('The MIT License')) throw new Error('Missing complete bundled MIT terms');
  supplement('MIT.txt', mit);
  for (const filename of ['OpenSans-LICENSE.txt', 'glyphicons-LICENSE.txt']) {
    supplement(filename, fs.readFileSync(path.join(repository, 'runtimes/cascade/upstream/src/resources/fonts', filename)));
  }
  supplement('font-attribution.txt', 'Fontelico: Copyright (C) 2012 by Fontello project. Entypo: Copyright (C) 2012 by Daniel Bruce. Source-font credits and SIL license references are preserved in the upstream font LICENSE files.\nFont Awesome fonts: Dave Gandy; SIL OFL 1.1. Map Tour includes Font Awesome 4.7.0, copyright Dave Gandy 2016. Font Awesome CSS/LESS/Sass use MIT; see https://github.com/FortAwesome/Font-Awesome/blob/v4.7.0/README.md#license .\nFull OFL terms are reproduced verbatim from the bundled CKEditor license Appendix E. Open Sans and Glyphicons terms are copied verbatim from the Cascade upstream font notices. These terms do not establish the origin of unidentified custom IcoMoon or Fontello glyphs.\n');
  if (runtime === 'basic') {
    supplement('FontAwesome-4.7.0-attribution.txt', 'Font Awesome 4.7.0\nCopyright Dave Gandy 2016. All rights reserved.\nFont files: SIL Open Font License 1.1; complete terms in OFL-1.1.txt.\nSource: https://github.com/FortAwesome/Font-Awesome/tree/v4.7.0/fonts\nThe Basic build uses unchanged Font Awesome files in place of its original custom social font. Only the local CSS glyph mapping changes; the font files are unmodified.\nBrand icons represent their respective services; no endorsement is implied.\n');
  }
  if (runtime === 'cascade') {
    supplement('DOMPurify-LICENSE.txt', fs.readFileSync(path.join(repository, prefix, 'src/resources/dompurify/LICENSE')));
    supplement('DOMPurify-attribution.txt', 'DOMPurify 3.4.17\nCopyright Cure53 and other contributors; the vendored distribution retains its upstream copyright header.\nSource: https://github.com/cure53/DOMPurify/tree/3.4.17\nPackage: https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz\nThe Apache-2.0 option is used; full terms are in DOMPurify-LICENSE.txt.\nGenerated output encloses the unchanged vendor code in a local AMD wrapper with a terminating newline for the legacy Dojo loader. A separate local policy restricts print markup and formatting.\n');
  }
  if (runtime === 'crowdsource') {
    supplement('jQuery-3.7.1-LICENSE.txt', fs.readFileSync(path.join(repository, 'runtimes/crowdsource/patches/vendor/jquery-3.7.1/LICENSE.txt')));
    supplement('jQuery-3.7.1-attribution.txt', 'jQuery 3.7.1\nCopyright OpenJS Foundation and other contributors. MIT License; full terms in jQuery-3.7.1-LICENSE.txt.\nSource: https://github.com/jquery/jquery/tree/3.7.1\nPackage: https://registry.npmjs.org/jquery/-/jquery-3.7.1.tgz\nThe build replaces only the verified bundled jQuery 3.3.1 expression with the unchanged 3.7.1 vendor expression, retaining the upstream header and AMD registration. No legacy toolchain rebuild is involved.\n');
  }
  if (runtime === 'shortlist') {
    for (const family of ['icomoon', 'fontelloIcons']) {
      for (const extension of ['eot', 'svg', 'ttf', 'woff']) {
        fs.rmSync(path.join(output, 'resources/tpl/viewer/font/font', `${family}.${extension}`), { force: true });
      }
    }
    const fonts = {
      eot: 'a4803d7bdeb478a5b9238fe74d8aaa98dafe2e8e68fccbd0e3f4dced823f27f0',
      svg: 'a627d9068c1235d9b3c95c405eb6ecb64a290b159cf5e926c0d96d89b24cd5fc',
      ttf: '2ba7f20b1d8990e17a47fe3d88e4c766628aaa2baf1dd30fca0a0db59836f5f9',
      woff: '709f2789daaff440820ebb975d3ae409af45121bdec47e39e83523490b1bc0fc'
    };
    for (const [extension, digest] of Object.entries(fonts)) {
      const bytes = fs.readFileSync(path.join(repository, prefix, `src/resources/tpl/viewer/font/font/ionicons.${extension}`));
      if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Review changed Ionicons font provenance');
    }
    const license = fs.readFileSync(path.join(repository, 'docs/licenses/ionicons-2.0.1-LICENSE.txt'));
    if (createHash('sha256').update(license).digest('hex') !== '5407c91b6c8b7305f72aec4ee5ffb99b32ed9a5413c19cf3cd1b94354d2645e8') throw new Error('Ionicons license differs from pinned upstream text');
    supplement('Ionicons-2.0.1-LICENSE.txt', license);
    supplement('Ionicons-attribution.txt', 'Ionicons by Ben Sperry and the Ionic Framework; font metadata credits Adam Bradley. Copyright (c) 2014 Drifty. MIT License.\nAll four retained source font formats exactly match https://github.com/ionic-team/ionicons/tree/ecb4b806831005c25b97ed9089fbb1d7dcc0879c (v2.0.1), despite the bundled CSS header saying v2.0.0. Build output may differ in SVG line endings. No glyph changes were made by this notice step.\nAndroid-style icons were originally built by Google: Material Design Icons, https://github.com/google/material-design-icons . Used under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ ; legal code: https://creativecommons.org/licenses/by/4.0/legalcode.en . Upstream modified those icons to fit the Ionicons grid; this attribution preserves that modification statement. No endorsement is implied.\n');
  }
  if (['mapjournal', 'mapseries'].includes(runtime)) {
    const editor = fs.readFileSync(path.join(repository, prefix, 'src/lib-app/ckeditor/ckeditor.js'), 'utf8');
    if (!editor.includes('version:"4.5.3"') || !editor.includes('revision:"6c70c82"')) throw new Error('Review CKEditor source notice for changed version');
    const legal = 'CKEditor 4.5.3\nCopyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.\nThe MPL 1.1 option in LICENSE.md is used for this distribution; recipients retain the alternative licenses offered there.\nThe Source Code is available under those terms at https://github.com/ckeditor/ckeditor4/tree/6c70c820595044f78fb39ee72410b806164fe448 (tag 4.5.3).\nBundled configuration and plugin source is preserved under notices/supplemental/bundled-editor-source. No editor core changes are made by this notice-packaging step. Any later modifications must preserve corresponding source and change notices under the applicable license.\n';
    supplement('CKEditor-legal.txt', legal);
    const editorOutput = path.join(output, 'resources/lib/ckeditor');
    fs.mkdirSync(editorOutput, { recursive: true });
    fs.writeFileSync(path.join(editorOutput, 'LICENSE.md'), fs.readFileSync(path.join(repository, prefix, 'src/lib-app/ckeditor/LICENSE.md')));
    fs.writeFileSync(path.join(editorOutput, 'legal.txt'), legal);
    for (const filename of tracked.filter(filename => filename.includes('/ckeditor/') && /\.(?:js|json|css)$/.test(filename))) {
      supplement(`bundled-editor-source/${filename.slice(prefix.length)}.txt`, fs.readFileSync(path.join(repository, filename)));
    }
  }
  const manifestPath = path.join(repository, `runtimes/${runtime}/runtime-manifest.json`);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  fs.writeFileSync(path.join(output, 'notices/manifest.json'), `${JSON.stringify({ runtime, sourceManifest: manifest, documents: notices,
    scope: 'Preserved upstream legal documents; not blanket clearance of captured content or unidentified third-party components.' }, null, 2)}\n`);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  fs.writeFileSync(path.join(output, 'notices/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Runtime Licenses</title><body><main><h1>${escape(runtime)} Licenses and Attribution</h1><p>Powered by <a href="https://www.esri.com/">Esri</a>.</p><p>Classic Story Maps by Esri, with local viewer adaptations. Upstream and component terms are preserved below; a root license does not supersede component licenses.</p><ul>${notices.map(filename => `<li><a href="${escape(filename)}">${escape(filename)}</a></li>`).join('')}</ul></main></body></html>\n`);
  const index = path.join(output, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  if (!html.includes('rel="license"')) {
    if (!/<\/head>/i.test(html)) throw new Error(`Missing head in ${runtime} output`);
    fs.writeFileSync(index, html.replace(/<\/head>/i, '<link rel="license" href="notices/index.html">\n</head>'));
  }
  return notices;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [, , runtime, output] = process.argv;
  if (!runtime || !output) throw new Error('Usage: stage-runtime-notices.mjs <runtime> <output>');
  console.log(`${runtime}: ${stageRuntimeNotices(runtime, path.resolve(output)).length} upstream notice documents preserved`);
}
