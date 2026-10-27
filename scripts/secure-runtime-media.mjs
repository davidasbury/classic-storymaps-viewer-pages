import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inheritedFingerprints = new Set([
  'e67cac7d6b4648b3bb9d1c7adb3f2b035e28fb30fab7a6c43845712bbffdc3cd',
  'eec6c51dd77e04ddbbdb6f02dd9bf5f0e0d15c6f3ff968250ac9ecd93d08e8a2',
  '2a5418df0260dc6b4c7cf507889f784be429afe3b1e394eb18b236115f635daa',
  '94b810cd9e5a6e4770275caab9699df16dfde71e68cd788f4c8b9e3f803ac6b5'
]);

export function removeInheritedMediaKeys(source, fingerprints = inheritedFingerprints) {
  return source.replace(/[A-Za-z0-9_-]{32,64}/g, value =>
    fingerprints.has(createHash('sha256').update(value).digest('hex')) ? '' : value);
}

export function assertNoEmbeddedMediaKeys(source, label) {
  if (removeInheritedMediaKeys(source) !== source || /AIza[0-9A-Za-z_-]{35}/.test(source)
    || /(?:FLICKR_API(?:_KEY)?|YOUTUBE_API(?:_KEY)?|UNSPLASH_API|youtubeKey)["']?\s*:\s*["'][^"'\r\n]+["']/.test(source)) {
    throw new Error('Embedded media credential detected in ' + label);
  }
}

export function patchKeylessMedia(source) {
  let result = source.replace(/&&\s*((?:APPCFG|app\.cfg)\.(?:FLICKR_API_KEY|YOUTUBE_API_KEY))\s*(?=&&)/g,
    '&&void 0!==$1');
  result = result.replace(/app\.flickr\s*=\s*new\s+([\w$]+)\(APPCFG\.FLICKR_API_KEY\)/g,
    'app.flickr=APPCFG.FLICKR_API_KEY?new $1(APPCFG.FLICKR_API_KEY):null');
  result = result.replace(/api_key:\s*["']["'],\s*(?=photo_id:)/g, '');
  const printStart = result.indexOf('key:"getYoutubeInfo",value:function(');
  if (printStart !== -1) {
    const printEnd = result.indexOf('key:"getVimeoVideoInfo",value:function(', printStart);
    if (printEnd === -1) throw new Error('Unrecognized Cascade print media boundary');
    let method = result.slice(printStart, printEnd);
    const originalGate = 'if(this.state.videoScreenshot)';
    const keylessGate = 'if(this.state.videoScreenshot||!this.state.youtubeKey)';
    if (method.split(originalGate).length === 2) method = method.replace(originalGate, keylessGate);
    else if (!method.includes(keylessGate)) throw new Error('Unrecognized Cascade print media gate');
    result = result.slice(0, printStart) + method + result.slice(printEnd);
  }
  return result;
}

export function secureRuntimeMedia(directory, checkOnly = false) {
  const root = realpathSync(directory);
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const relativeRoot = path.relative(repo, root).split(path.sep).join('/');
  if (!checkOnly && (!relativeRoot || /^(?:runtimes\/[^/]+\/upstream(?:\/|$)|classic-apps(?:\/|$))/.test(relativeRoot))) {
    throw new Error('Cannot modify runtime sources with the output sanitizer');
  }
  let changed = 0;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in media scan');
    if (!entry.isFile() || !/\.(?:js|jsx|mjs|html|json|map)$/i.test(entry.name)) continue;
    const filename = path.join(entry.parentPath, entry.name);
    const source = readFileSync(filename, 'utf8');
    const output = checkOnly ? source : patchKeylessMedia(removeInheritedMediaKeys(source));
    assertNoEmbeddedMediaKeys(output, path.relative(root, filename));
    if (output !== source) {
      writeFileSync(filename, output);
      changed++;
    }
  }
  return changed;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv[2] === '--check';
  const directory = process.argv[checkOnly ? 3 : 2];
  if (!directory) throw new Error('Usage: secure-runtime-media.mjs [--check] OUTPUT_DIRECTORY');
  const changed = secureRuntimeMedia(directory, checkOnly);
  console.log(checkOnly ? 'Media credential check passed.' : 'Secured runtime media; changed files: ' + changed);
}
