const rasterPath = /\.(?:png|jpe?g|gif|webp|bmp)$/i;

export function publicImageURL(value, allowedOrigins) {
  return publicArchiveURL(value, allowedOrigins, rasterPath);
}

export function publicStoryURL(value, allowedOrigins) {
  return publicArchiveURL(value, allowedOrigins, /(?:\/|\.html?)$/i);
}

function publicArchiveURL(value, allowedOrigins, pathPattern) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s%\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const authority = value.match(/^https?:\/\/([^/]+)/)?.[1];
    if (!authority || /[:@]/.test(authority) || !allowedOrigins.includes(url.origin)
      || url.search || url.hash || !pathPattern.test(url.pathname)
      || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|home)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export async function readArchiveText(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('oversize');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}

function captureTime(value) {
  if (!/^\d{14}$/.test(value)) return NaN;
  const iso = value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) + 'T'
    + value.slice(8, 10) + ':' + value.slice(10, 12) + ':' + value.slice(12, 14) + 'Z';
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === iso.slice(0, 19) ? time : NaN;
}

export function createWaybackLookup({ allowedOrigins = [], fetchImpl = fetch, now = Date.now, timeoutMs = 5000,
  concurrency = 2, maxLookups = 20, windowMs = 60000, cacheLimit = 128, extractStoryId = null } = {}) {
  const cache = new Map();
  const pending = new Map();
  let active = 0;
  let spent = 0;
  let windowStart = now();
  let blockedUntil = 0;
  const empty = reason => ({ snapshot: null, reason });

  async function index(original, timestamp, signal) {
    const endpoint = new URL('https://web.archive.org/cdx/search/cdx');
    endpoint.searchParams.set('url', original);
    endpoint.searchParams.set('matchType', 'exact');
    endpoint.searchParams.set('output', 'json');
    endpoint.searchParams.set('fl', 'timestamp,original,mimetype,statuscode');
    endpoint.searchParams.append('filter', 'statuscode:200');
    endpoint.searchParams.append('filter', extractStoryId ? 'mimetype:text/html' : 'mimetype:image/(png|jpeg|gif|webp|bmp)');
    endpoint.searchParams.set('limit', '50');
    const response = await fetchImpl(endpoint.href, { signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (response.status === 429) {
      blockedUntil = now() + 600000;
      throw new Error('rate_limited');
    }
    if (!response.ok) throw new Error('unavailable');
    const rows = JSON.parse(await readArchiveText(response, 65536));
    if (!Array.isArray(rows) || rows.length > 51) throw new Error('invalid_response');
    const parsed = new URL(original);
    const variants = ['https://' + parsed.host + parsed.pathname, 'http://' + parsed.host + parsed.pathname];
    return rows.slice(1).filter(row => Array.isArray(row) && row.length === 4 && variants.includes(row[1])
      && (extractStoryId ? row[2] === 'text/html' : /^image\/(?:png|jpeg|gif|webp|bmp)$/.test(row[2])) && row[3] === '200' && Number.isFinite(captureTime(row[0])))
      .map(row => ({ timestamp: row[0], original: row[1], distance: Math.abs(captureTime(row[0]) - timestamp) }));
  }

  return async function lookup(source, date) {
    const original = (extractStoryId ? publicStoryURL : publicImageURL)(source, allowedOrigins);
    const time = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
    if (!original || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date || time > now()) return empty('not_eligible');
    const key = original + '\n' + date;
    const stored = cache.get(key);
    if (stored && stored.expires > now()) return stored.result;
    if (pending.has(key)) return pending.get(key);
    if (now() < blockedUntil) return empty('rate_limited');
    if (now() - windowStart >= windowMs) { spent = 0; windowStart = now(); }
    if (active >= concurrency || spent >= maxLookups) return empty('busy');
    active++;
    spent++;
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = new URL(original);
        const candidates = [];
        for (const protocol of ['https:', 'http:']) {
          url.protocol = protocol;
          candidates.push(...await index(url.href, time, controller.signal));
        }
        candidates.sort((left, right) => left.distance - right.distance || left.timestamp.localeCompare(right.timestamp));
        const selected = candidates[0];
        if (selected && extractStoryId) {
          const capture = 'https://web.archive.org/web/' + selected.timestamp + 'id_/' + selected.original;
          const response = await fetchImpl(capture, { signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (response.status === 429) { blockedUntil = now() + 600000; throw new Error('rate_limited'); }
          if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('unavailable');
          const appId = extractStoryId(await readArchiveText(response, 1048576));
          return appId && /^[a-f0-9]{32}$/i.test(appId) ? { snapshot: {
            original: selected.original, timestamp: selected.timestamp, url: capture, appId: appId.toLowerCase()
          } } : empty('no_unique_app_id');
        }
        return selected ? { snapshot: {
          original: selected.original, timestamp: selected.timestamp,
          url: 'https://web.archive.org/web/' + selected.timestamp + 'if_/' + selected.original
        } } : empty('not_found');
      } catch { return empty(now() < blockedUntil ? 'rate_limited' : 'unavailable'); }
      finally { clearTimeout(timer); active--; }
    })();
    pending.set(key, task);
    const result = await task;
    pending.delete(key);
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
    cache.set(key, { result, expires: now() + (result.snapshot ? 3600000 : 300000) });
    return result;
  };
}

export function createWaybackHandler(options = {}) {
  const lookup = createWaybackLookup(options);
  return async (request, response) => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    let sameOrigin = !request.headers.origin;
    try { if (request.headers.origin) sameOrigin = new URL(request.headers.origin).host === request.headers.host; } catch { sameOrigin = false; }
    if (request.method !== 'POST' || request.headers['sec-fetch-site'] === 'cross-site'
      || !sameOrigin) {
      response.writeHead(403, headers).end(JSON.stringify({ snapshot: null, reason: 'forbidden' }));
      return;
    }
    try {
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new Error('content_type');
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) throw new Error('size');
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = options.lookupRequest ? await options.lookupRequest(data) : await lookup(data.url, data.date);
      response.writeHead(200, headers).end(JSON.stringify(result));
    } catch { response.writeHead(400, headers).end(JSON.stringify({ snapshot: null, reason: 'invalid_request' })); }
  };
}
