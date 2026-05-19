import { readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const failures = [];
const ignoredRootDirs = new Set([
  '.git',
  '.local',
  '.vscode',
  'dist',
  'manifest-cache',
  'node_modules',
]);

async function walk(dir, relativeDir = '') {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const relativePath = relativeDir === '' ? entry.name : path.join(relativeDir, entry.name);

    if (relativeDir === '' && ignoredRootDirs.has(entry.name)) {
      continue;
    }

    if (entry.name === 'node_modules') {
      failures.push(relativePath);
      continue;
    }

    await walk(path.join(dir, entry.name), relativePath);
  }
}

await walk(rootDir);

if (failures.length > 0) {
  console.error('[workspace-hygiene] nested node_modules directories are not allowed:');
  for (const failure of failures) {
    console.error('  - ' + failure);
  }
  console.error('[workspace-hygiene] remove them and run from the repository root.');
  process.exit(1);
}

console.log('[workspace-hygiene] ok');
