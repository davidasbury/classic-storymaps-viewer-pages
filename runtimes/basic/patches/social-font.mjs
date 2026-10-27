import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const fonts = {
  eot: '7bfcab6db99d5cfbf1705ca0536ddc78585432cc5fa41bbd7ad0f009033b2979',
  svg: 'ad6157926c1622ba4e1d03d478f1541368524bfc46f51e42fe0d945f7ef323e4',
  ttf: 'aa58f33f239a0fb02f5c7a6c45c043d7a9ac9a093335806694ecd6d4edc0d6a8',
  woff: 'ba0c59deb5450f5cb41b3f93609ee2d0d995415877ddfa223e8a8a7533474f07'
};

export function replaceBasicSocialFont(output) {
  const source = path.join(repository, 'runtimes/basic/upstream');
  if (fs.realpathSync(output) === fs.realpathSync(source)) throw new Error('Cannot patch Basic upstream in place');
  const cssPath = path.join(output, 'css/main.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const original = fs.readFileSync(path.join(source, 'css/main.css'), 'utf8').match(/\/\*Icon Fonts\*\/[\s\S]*?(?=\/\*Esri widget style updates\*\/)/)?.[0];
  if (!original) throw new Error('Missing Basic social font block');
  let replacement = original.replaceAll("font-family: 'social'", "font-family: 'FontAwesome'")
    .replaceAll('../font/social.', '../font/fontawesome-webfont.')
    .replaceAll('?89188943', '?v=4.7.0').replaceAll('#icomoon', '#fontawesomeregular');
  for (const [before, after] of [['e800', 'f082'], ['e801', 'f099'], ['e802', 'f0c1'], ['e803', 'f077'], ['e804', 'f078']]) {
    const declaration = `content: "\\${before}"`;
    if (replacement.split(declaration).length !== 2) throw new Error(`Unexpected Basic glyph mapping: ${before}`);
    replacement = replacement.replace(declaration, `content: "\\${after}"`);
  }
  const originalCount = css.split(original).length - 1;
  const replacementCount = css.split(replacement).length - 1;
  if (!((originalCount === 1 && replacementCount === 0) || (originalCount === 0 && replacementCount === 1))) {
    throw new Error('Unrecognized Basic social font CSS; review before replacing');
  }
  const originalToggle = '.toggle-icon {\n  font-family: "social";';
  const replacementToggle = '.toggle-icon {\n  font-family: "FontAwesome";';
  if (css.split(originalToggle).length + css.split(replacementToggle).length !== 3) {
    throw new Error('Unrecognized Basic legend font CSS; review before replacing');
  }
  const updatedCss = css.replace(original, replacement).replace(originalToggle, replacementToggle);
  if (/font-family:\s*["']social["']|font\/social\./.test(updatedCss)) throw new Error('Unreplaced Basic social font reference');
  const replacements = Object.entries(fonts).map(([extension, digest]) => {
    const bytes = fs.readFileSync(path.join(repository, 'runtimes/maptour/upstream/MapTour/src/resources/icons/font-awesome-4.7.0/fonts', `fontawesome-webfont.${extension}`));
    if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error(`Changed Font Awesome ${extension} provenance`);
    return { extension, bytes };
  });
  fs.mkdirSync(path.join(output, 'font'), { recursive: true });
  for (const { extension, bytes } of replacements) {
    fs.writeFileSync(path.join(output, 'font', `fontawesome-webfont.${extension}`), bytes);
    fs.rmSync(path.join(output, 'font', `social.${extension}`), { force: true });
  }
  if (updatedCss !== css) fs.writeFileSync(cssPath, updatedCss);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: social-font.mjs <Basic output directory>');
  replaceBasicSocialFont(path.resolve(process.argv[2]));
}
