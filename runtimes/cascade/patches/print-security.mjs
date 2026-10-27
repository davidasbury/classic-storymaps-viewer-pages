import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const upstream = fileURLToPath(new URL('../upstream/', import.meta.url));
const sanitizerId = 'storymaps/tpl/print/PrintSanitizer';
const releaseHash = '72069ea46e51f2e1e6915f2859a60377811f22f3be62c701892efca0ef45363d';
const vendorHashes = {
  'purify.min.js': 'cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31',
  LICENSE: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function replaceOnce(content, target, replacement) {
  if (content.split(target).length !== 2) throw new Error('Unrecognized Cascade print target: ' + target);
  return content.replace(target, () => replacement);
}

function moduleRange(bundle, name) {
  const marker = 'define("storymaps-react/tpl/print/' + name + '",';
  const start = bundle.indexOf(marker);
  if (start < 0 || bundle.indexOf(marker, start + marker.length) >= 0) throw new Error('Unrecognized Cascade print module: ' + name);
  const next = bundle.indexOf(',define(', start + marker.length);
  return [start, next < 0 ? bundle.length : next];
}

export function patchCascadePrintBundle(original) {
  let bundle = original;
  for (const name of ['media/Text', 'PrintViewReact']) {
    const [start, end] = moduleRange(bundle, name);
    let module = bundle.slice(start, end);
    module = replaceOnce(module, '["module","exports","react"', '["module","exports","react","' + sanitizerId + '"');
    if (name === 'media/Text') {
      module = replaceOnce(module, 'function(e,t,n){', 'function(e,t,n,classicPrintSecurity){');
      module = replaceOnce(module, 'var e=this.createMarkup(this.props.text);',
        'var e=classicPrintSecurity.toReact(this.createMarkup(this.props.text).__html,a.default);');
      module = replaceOnce(module, 'a.default.createElement("figcaption",{dangerouslySetInnerHTML:e})',
        'a.default.createElement("figcaption",null,e)');
      module = replaceOnce(module, 'a.default.createElement("div",{className:"text-block",dangerouslySetInnerHTML:e})',
        'a.default.createElement("div",{className:"text-block"},e)');
    } else {
      module = replaceOnce(module, 'function(e,t,n,r,i,o,a,s,l,u,c){',
        'function(e,t,n,classicPrintSecurity,r,i,o,a,s,l,u,c){');
      const styleMethods = [...module.matchAll(/key:"renderCustomStyles",value:function\(\)\{[\s\S]*?\}\},(?=\{key:"render")/g)];
      if (styleMethods.length !== 1 || !styleMethods[0][0].includes('g.default.createElement("style",{dangerouslySetInnerHTML:{__html:t.join(" ")}})')) {
        throw new Error('Unrecognized Cascade print theme method');
      }
      module = replaceOnce(module, styleMethods[0][0],
        'key:"renderCustomStyles",value:function(){var styles=classicPrintSecurity.themeStyles(this.state.appSettings,"bg-custom"===this.getAppTheme());return styles?g.default.createElement("style",null,styles):null}},');
    }
    bundle = bundle.slice(0, start) + module + bundle.slice(end);
  }
  return bundle;
}

export function secureCascadePrint(output) {
  output = realpathSync(output);
  if (output === realpathSync(upstream) || output.startsWith(realpathSync(upstream) + path.sep)) {
    throw new Error('Cannot stage Cascade print security into upstream');
  }
  const source = readFileSync(path.join(output, 'BUILD_SOURCE'), 'utf8').trim();
  const bundlePath = path.join(output, 'app/print-min.js');
  let bundle = readFileSync(bundlePath, 'utf8');
  if (source === 'release:1.23.0') {
    if (digest(Buffer.from(bundle)) !== releaseHash) throw new Error('Unexpected Cascade release print checksum');
    bundle = patchCascadePrintBundle(bundle);
    const manifest = JSON.parse(readFileSync(new URL('../runtime-manifest.json', import.meta.url), 'utf8'));
    const sharing = manifest.patches.find(patch => patch.name === 'bounded-share-url-query-filter');
    if (!sharing) throw new Error('Missing Cascade share URL patch');
    bundle = replaceOnce(bundle, sharing.find, sharing.replace);
  } else if (source === 'grunt') {
    for (const [name, method] of [['media/Text', 'toReact'], ['PrintViewReact', 'themeStyles']]) {
      const [start, end] = moduleRange(bundle, name);
      const module = bundle.slice(start, end);
      if (!module.includes(sanitizerId) || !module.includes('.' + method + '(')
        || module.includes('dangerouslySetInnerHTML')) {
        throw new Error('Grunt output lacks Cascade print security: ' + name);
      }
    }
  } else {
    throw new Error('Unsupported Cascade print build source: ' + source);
  }
  for (const [filename, expected] of Object.entries(vendorHashes)) {
    if (digest(readFileSync(path.join(upstream, 'src/resources/dompurify', filename))) !== expected) {
      throw new Error('Changed DOMPurify dependency: ' + filename);
    }
  }
  const files = ['app/storymaps/tpl/print/PrintSanitizer.js', 'resources/dompurify/purify.min.js', 'resources/dompurify/LICENSE'];
  for (const filename of files) {
    const destination = path.join(output, filename);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(upstream, 'src', filename), destination);
    if (filename === 'resources/dompurify/purify.min.js') {
      const vendor = readFileSync(destination, 'utf8');
      writeFileSync(destination, 'define([], function() {\nvar module = { exports: {} };\nvar exports = module.exports;\n'
        + vendor + '\nreturn module.exports;\n});\n');
    }
  }
  writeFileSync(bundlePath, bundle);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: print-security.mjs <output>');
  secureCascadePrint(process.argv[2]);
}
