import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [runtime, directory] = process.argv.slice(2);
if (['maptour', 'swipe', 'mapjournal', 'mapseries', 'cascade', 'shortlist', 'crowdsource', 'basic'].includes(runtime)) {
  const base = (process.env.SITE_BASE_PATH || '').replace(/\/$/, '');
  if (!/^(\/[A-Za-z0-9._~-]+)*$/.test(base) || base.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Invalid SITE_BASE_PATH');
  }
  const legacyDependency = `${base}/viewers/assets/js/arcgis-runtime-auth.js`;
  const dependency = legacyDependency + '!story';
  const mainFile = path.join(directory, runtime === 'basic' ? 'index.html'
    : runtime === 'crowdsource' ? 'app/main-app.min.js' : 'app/main-app.js');
  const original = readFileSync(mainFile, 'utf8');
  if (!original.includes(dependency)) {
    const startup = runtime === 'crowdsource' ? /require\(\["dojo\/_base\/kernel"/
      : runtime === 'cascade' ? /(?:^|\n)require\(\[/ : /require\(\[/;
    const offset = original.search(startup);
    if (offset === -1) throw new Error(`Missing startup call for ${runtime}`);
    const updated = original.slice(0, offset) + original.slice(offset).replace(/(require\(\[[\s\S]*?)(\]\s*,\s*function\s*\([^)]*\)\s*\{)/,
      (_match, dependencies, callback) => {
        const imports = dependencies.includes(JSON.stringify(legacyDependency))
          ? dependencies.replace(JSON.stringify(legacyDependency), JSON.stringify(dependency))
          : `${dependencies}${dependencies.trimEnd().endsWith('[') ? '' : ','} ${JSON.stringify(dependency)}`;
        return imports + callback + 'if(arguments[arguments.length-1]===false)return;';
      });
    if (updated === original) throw new Error(`Missing startup dependency list for ${runtime}`);
    writeFileSync(mainFile, updated);
  }
  const indexFile = path.join(directory, 'index.html');
  let html = readFileSync(indexFile, 'utf8');
  const helpers = ['arcgis-auth-helpers.js', 'classic-storymaps-config.js', 'classic-story-gallery.js', 'classic-story-input.js', 'classic-story-discovery.js'];
  for (const filename of helpers.reverse()) {
    const helper = `<script src="${base}/viewers/assets/js/${filename}"></script>`;
    if (!html.includes(helper)) {
      const updated = html.replace(/<head\b[^>]*>/i, opening => opening + helper);
      if (updated === html) throw new Error(`Missing document head for ${runtime}`);
      html = updated;
    }
  }
  writeFileSync(indexFile, html);
}
