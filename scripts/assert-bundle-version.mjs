import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sameSeriesVersionPattern = /\b0\.5\.\d+\b/g;
const defaultFiles = [
  'dist/ui.html',
  'dist/code.js',
  'manifest-cache/debug/dist/ui.html',
  'manifest-cache/debug/dist/code.js',
  'manifest-cache/dev/dist/ui.html',
  'manifest-cache/dev/dist/code.js',
];

async function fileExists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch (_error) {
    return false;
  }
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

const pkg = await readJson('package.json');
const version = pkg.version;
if (typeof version !== 'string' || version.length === 0) {
  console.error('[version-assert] package.json must contain a non-empty version string');
  process.exit(1);
}

const failures = [];

for (const file of defaultFiles) {
  if (!(await fileExists(file))) continue;

  const text = await readText(file);
  if (!text.includes(version)) {
    failures.push(`${file} does not contain package version ${version}`);
  }

  const foundVersions = Array.from(new Set(text.match(sameSeriesVersionPattern) ?? []));
  const staleVersions = foundVersions.filter((found) => found !== version);
  if (staleVersions.length > 0) {
    failures.push(`${file} contains stale 0.5.x version(s): ${staleVersions.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('[version-assert] bundle version check failed:');
  for (const failure of failures) {
    console.error('  - ' + failure);
  }
  process.exit(1);
}

console.log(`[version-assert] bundle version ok (${version})`);
