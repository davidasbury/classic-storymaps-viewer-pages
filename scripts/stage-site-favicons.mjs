import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = (process.env.SITE_BASE_PATH || '').replace(/\/$/, '');
if (!/^(\/[A-Za-z0-9._~-]+)*$/.test(base) || base.split('/').some(part => part === '.' || part === '..')) {
  throw new Error('Invalid SITE_BASE_PATH');
}
const icon = `<link rel="icon" type="image/x-icon" href="${base}/viewers/assets/images/favicon.ico?v=folded-map-transparent">`;

function stage(filename) {
  if (statSync(filename).isDirectory()) {
    for (const entry of readdirSync(filename)) stage(path.join(filename, entry));
    return;
  }
  if (!filename.endsWith('.html')) return;
  const original = readFileSync(filename, 'utf8');
  if (!/<html\b/i.test(original)) return;
  const updated = original.replace(/^[\s\S]*?(?=<body\b|$)/i, header => {
    const cleaned = header.replace(/<link\b[^>]*\brel\s*=\s*(["'])(?:shortcut\s+)?icon\1[^>]*>/gi, '');
    const insertion = /<head\b[^>]*>/i.test(cleaned) ? /<head\b[^>]*>/i : /<html\b[^>]*>/i;
    return cleaned.replace(insertion, opening => opening + icon);
  });
  if (updated !== original) writeFileSync(filename, updated);
}

for (const filename of process.argv.slice(2)) stage(filename);
