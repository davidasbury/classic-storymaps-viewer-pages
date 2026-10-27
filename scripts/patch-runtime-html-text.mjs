import { parse } from 'acorn';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function patchHtmlText(source) {
  const replacements = [];
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    const textInMarkup = parent?.type === 'BinaryExpression' && parent.operator === '+'
      && parent.right === node && parent.left.type === 'Literal'
      && typeof parent.left.value === 'string' && parent.left.value.endsWith('<div style="height: 0;">');
    if (textInMarkup && node.type === 'CallExpression' && node.callee.type === 'FunctionExpression'
      && source.slice(node.callee.start, node.callee.end) === 'function(html){var template=document.createElement("template");template.innerHTML=html;return template.content.textContent;}') {
      replacements.push({ start: node.start, end: node.end,
        text: '$("<div>").text(' + source.slice(node.start, node.end) + ').html()' });
      return;
    }
    if (node.type === 'CallExpression' && node.arguments.length === 0
      && node.callee.type === 'MemberExpression' && !node.callee.computed
      && node.callee.property.name === 'text') {
      const fragment = node.callee.object;
      if (fragment.type === 'CallExpression' && fragment.arguments.length === 1
        && fragment.callee.type === 'Identifier' && ['$', 'jQuery'].includes(fragment.callee.name)) {
        const parts = [];
        function flatten(expression) {
          if (expression.type === 'BinaryExpression' && expression.operator === '+') {
            flatten(expression.left);
            flatten(expression.right);
          } else parts.push(expression);
        }
        flatten(fragment.arguments[0]);
        if (parts.length >= 3 && parts[0].type === 'Literal' && parts[0].value === '<div>'
          && parts.at(-1).type === 'Literal' && parts.at(-1).value === '</div>') {
          let text = '(function(html){var template=document.createElement("template");'
              + 'template.innerHTML=html;return template.content.textContent;})('
              + source.slice(fragment.arguments[0].start, fragment.arguments[0].end) + ')';
          if (textInMarkup) text = '$("<div>").text(' + text + ').html()';
          replacements.push({ start: node.start, end: node.end, text });
          return;
        }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, node));
      else if (value && typeof value === 'object') visit(value, node);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  let result = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }
  parse(result, { ecmaVersion: 'latest', sourceType: 'script' });
  return { source: result, count: replacements.length };
}

export function secureRuntimeHtmlText(directory) {
  const root = realpathSync(directory);
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const relative = path.relative(repo, root).split(path.sep).join('/');
  if (!relative || /^(?:runtimes\/[^/]+\/upstream(?:\/|$)|classic-apps(?:\/|$))/.test(relative)) {
    throw new Error('Cannot modify runtime sources with the HTML text patch');
  }
  const changes = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in HTML text patch');
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const filename = path.join(entry.parentPath, entry.name);
    const source = readFileSync(filename, 'utf8');
    if (!source.includes('</div>') || !/\.text\s*\(/.test(source)) continue;
    const patched = patchHtmlText(source);
    if (patched.count) changes.push({ filename, ...patched });
  }
  for (const change of changes) writeFileSync(change.filename, change.source);
  return changes.map(change => ({ file: path.relative(root, change.filename), count: change.count }));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: patch-runtime-html-text.mjs OUTPUT_DIRECTORY');
  console.log('Secured HTML text extraction: ' + JSON.stringify(secureRuntimeHtmlText(process.argv[2])));
}