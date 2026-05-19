import { mkdir, readFile, writeFile, watch } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const uiPath = path.join(distDir, 'ui.html');
const shouldWatch = process.argv.includes('--watch');

function normalizeHtml(html) {
  return html.replace(/`([ \t]+)(\r?\n)/g, (_match, whitespace, newline) => {
    return '`' + whitespace.replace(/ /g, '\\x20').replace(/\t/g, '\\t') + newline;
  });
}

async function normalizeOnce() {
  try {
    const html = await readFile(uiPath, 'utf8');
    const normalized = normalizeHtml(html);
    if (normalized !== html) {
      await writeFile(uiPath, normalized);
      console.log('[normalize-ui-bundle] normalized dist/ui.html');
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
}

await normalizeOnce();

if (shouldWatch) {
  await mkdir(distDir, { recursive: true });
  console.log('[normalize-ui-bundle] watching dist/ui.html');

  let timer = null;
  for await (const event of watch(distDir)) {
    if (event.filename !== 'ui.html') continue;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      normalizeOnce().catch((error) => {
        console.error('[normalize-ui-bundle] failed', error);
      });
    }, 75);
  }
}
