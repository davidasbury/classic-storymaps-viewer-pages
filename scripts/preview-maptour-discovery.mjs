import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';
import { createWaybackHandler, publicImageURL } from './wayback-discovery.mjs';

export function createDiscoveryPreview({ root, publicOrigins, lookupOptions = {} }) {
  if (!Array.isArray(publicOrigins) || !publicOrigins.length || !publicOrigins.every(origin => publicImageURL(origin + '/photo.png', publicOrigins))) throw new Error('Explicit public image origins are required');
  const serve = createPreviewHandler({ root });
  const lookup = createWaybackHandler({ ...lookupOptions, allowedOrigins: publicOrigins });
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/wayback') return await lookup(request, response);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        let html = await readFile(path.join(root, 'index.html'), 'utf8');
        const endpoint = /waybackLookupUrl\s*:\s*""/g;
        const origins = /waybackPublicOrigins\s*:\s*\[\]/g;
        if ([...html.matchAll(endpoint)].length !== 1 || [...html.matchAll(origins)].length !== 1) throw new Error('Expected unconfigured Map Tour build');
        html = html.replace(endpoint, 'waybackLookupUrl: "/api/wayback"')
          .replace(origins, 'waybackPublicOrigins: ' + JSON.stringify(publicOrigins));
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html);
        return;
      }
      await serve(request, response);
    } catch { if (!response.headersSent) response.writeHead(500).end('Preview configuration unavailable'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const root = path.resolve(process.env.MAPTOUR_BUILD_ROOT || 'runtimes/maptour/build');
  const publicOrigins = (process.env.WAYBACK_PUBLIC_ORIGINS || '').split(',').filter(Boolean);
  const port = Number(process.env.PORT || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const server = createDiscoveryPreview({ root, publicOrigins });
  server.listen(port, '127.0.0.1', () => console.log('Opt-in Map Tour discovery preview: http://127.0.0.1:' + server.address().port + '/'));
}
