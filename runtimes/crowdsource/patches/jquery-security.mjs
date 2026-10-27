import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const originalHash = '097258ff45a423c027a7e0601215f6f9d08d1ddc84abde928a5e9a2eaddb58b3';
const vendorDirectory = fileURLToPath(new URL('./vendor/jquery-3.7.1/', import.meta.url));
const vendorHashes = {
  'jquery.min.js': 'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a',
  'LICENSE.txt': 'd4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d'
};

export function jqueryExpression(source, version) {
  const matches = new Map();
  const jqueryCalls = new Set();
  function visit(node, calls = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.name === 'define'
      && node.arguments[0]?.value === 'jquery' && calls.length) {
      jqueryCalls.add(calls[calls.length - 1].start);
    }
    if (node.type === 'CallExpression') calls = [...calls, node];
    if (node.type === 'Literal' && node.value === version && calls.length) {
      const call = calls[calls.length - 1];
      matches.set(call.start, call);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, calls));
      else if (value && typeof value === 'object') visit(value, calls);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest' }));
  const candidates = [...matches.values()].filter(call => jqueryCalls.has(call.start));
  if (candidates.length !== 1) throw new Error('Expected one jQuery expression for ' + version);
  const expression = candidates[0];
  return { start: expression.start, end: expression.end, source: source.slice(expression.start, expression.end) };
}

export function patchCrowdsourceJQuery(bundle, vendor) {
  if (createHash('sha256').update(vendor).digest('hex') !== vendorHashes['jquery.min.js']) {
    throw new Error('Changed jQuery vendor checksum');
  }
  const original = jqueryExpression(bundle, '3.3.1');
  if (createHash('sha256').update(original.source).digest('hex') !== originalHash) {
    throw new Error('Unrecognized Crowdsource jQuery expression');
  }
  const replacement = jqueryExpression(vendor, '3.7.1');
  const banner = vendor.match(/^\/\*![\s\S]*?\*\//)?.[0];
  if (!banner || !banner.includes('jQuery v3.7.1')) throw new Error('Missing jQuery vendor attribution');
  const updated = bundle.slice(0, original.start) + '(' + banner + '\n' + replacement.source + ')' + bundle.slice(original.end);
  parse(updated, { ecmaVersion: 'latest' });
  return updated;
}

export function secureCrowdsourceJQuery(output) {
  output = realpathSync(output);
  const upstream = realpathSync(fileURLToPath(new URL('../upstream/', import.meta.url)));
  if (output === upstream || output.startsWith(upstream + path.sep)) throw new Error('Cannot patch upstream source');
  if (readFileSync(path.join(output, 'BUILD_SOURCE'), 'utf8').trim() !== 'release:0.10.0') {
    throw new Error('Unsupported Crowdsource release');
  }
  for (const [filename, expected] of Object.entries(vendorHashes)) {
    if (createHash('sha256').update(readFileSync(path.join(vendorDirectory, filename))).digest('hex') !== expected) {
      throw new Error('Changed jQuery vendor file: ' + filename);
    }
  }
  const filename = path.join(output, 'app/main-app.min.js');
  const patched = patchCrowdsourceJQuery(readFileSync(filename, 'utf8'), readFileSync(path.join(vendorDirectory, 'jquery.min.js'), 'utf8'));
  writeFileSync(filename, patched);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: jquery-security.mjs <output>');
  secureCrowdsourceJQuery(process.argv[2]);
}
