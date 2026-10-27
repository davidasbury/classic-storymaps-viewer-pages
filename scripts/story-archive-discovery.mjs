import { parse as parseHTML } from 'parse5';
import { parse as parseJavaScript } from 'acorn';
import { createWaybackHandler, createWaybackLookup, publicStoryURL, readArchiveText } from './wayback-discovery.mjs';

export function extractConfiguredAppId(html) {
  const candidates = new Set();
  let uncertain = false;
  function visit(node) {
    if (node.tagName === 'script' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attributes = Object.fromEntries(node.attrs.map(attribute => [attribute.name, attribute.value]));
      if (attributes.src || attributes.type && !/^(?:text\/javascript|application\/javascript)$/i.test(attributes.type)) return;
      const source = node.childNodes.map(child => child.value || '').join('');
      let program;
      try { program = parseJavaScript(source, { ecmaVersion: 2020 }); }
      catch { if (/configOptions/.test(source)) uncertain = true; return; }
      for (const statement of program.body) {
        if (statement.type !== 'VariableDeclaration') {
          if (/configOptions/.test(source.slice(statement.start, statement.end))) uncertain = true;
          continue;
        }
        for (const declaration of statement.declarations) {
          if (declaration.id.type !== 'Identifier' || declaration.id.name !== 'configOptions') {
            if (/configOptions/.test(source.slice(declaration.start, declaration.end))) uncertain = true;
            continue;
          }
          const config = declaration.init;
          if (config?.type !== 'ObjectExpression' || config.properties.some(property => property.type !== 'Property' || property.computed || property.kind !== 'init')) { uncertain = true; continue; }
          const properties = config.properties.filter(property => (property.key.name || property.key.value) === 'appid');
          if (properties.length !== 1 || properties[0].value.type !== 'Literal' || typeof properties[0].value.value !== 'string'
            || !/^[a-f0-9]{32}$/i.test(properties[0].value.value)) { uncertain = true; continue; }
          candidates.add(properties[0].value.value.toLowerCase());
        }
      }
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parseHTML(html));
  return !uncertain && candidates.size === 1 ? [...candidates][0] : null;
}

export function createStoryArchiveHandler({ allowedOrigins = [], fetchImpl = fetch, now = Date.now, timeoutMs = 15000 } = {}) {
  const lookup = createWaybackLookup({ allowedOrigins, fetchImpl, now, timeoutMs, extractStoryId: extractConfiguredAppId });
  let active = 0;
  let spent = 0;
  let windowStart = now();
  return createWaybackHandler({ lookupRequest: async data => {
    if (data?.consent !== true || !/^[a-f0-9]{32}$/i.test(data.itemId || '')) return { snapshot: null, reason: 'not_eligible' };
    if (now() - windowStart >= 60000) { spent = 0; windowStart = now(); }
    if (active >= 2 || spent >= 20) return { snapshot: null, reason: 'busy' };
    active++;
    spent++;
    const signal = AbortSignal.timeout(timeoutMs);
    async function read(suffix) {
      const response = await fetchImpl('https://www.arcgis.com/sharing/rest/content/items/' + data.itemId.toLowerCase() + suffix + '?f=json',
        { signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('unavailable');
      const text = await readArchiveText(response, 65536);
      return text.trim() ? JSON.parse(text) : null;
    }
    try {
      const item = await read('');
      if (item?.id?.toLowerCase() !== data.itemId.toLowerCase() || item.access !== 'public' || item.type !== 'Web Mapping Application'
        || !publicStoryURL(item.url, allowedOrigins) || !Number.isSafeInteger(item.modified) || item.modified < 0 || item.modified > now()) return { snapshot: null, reason: 'not_eligible' };
      const payload = await read('/data');
      if (payload !== null && (typeof payload !== 'object' || Object.keys(payload).length)) return { snapshot: null, reason: 'not_empty' };
      return await lookup(item.url, new Date(item.modified).toISOString().slice(0, 10));
    } catch { return { snapshot: null, reason: 'unavailable' }; }
    finally { active--; }
  } });
}
