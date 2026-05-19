import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const DEBUG_ENDPOINT_PATTERN = /https?:\/\/localhost:4789/;
const SOURCE_MAP_PATTERN = /sourceMappingURL/;
const MAX_EXPECTED_CODE_BYTES = 12 * 1024 * 1024;
const MAX_EXPECTED_UI_BYTES = 7 * 1024 * 1024;

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

const manifest = await readJson('manifest.json');
const pkg = await readJson('package.json');
const code = await readText('dist/code.js');
const ui = await readText('dist/ui.html');

if (manifest.name !== 'Welder Editor') {
  fail(`manifest.json name should be "Welder Editor", got "${manifest.name}"`);
}

const allowedDomains = manifest.networkAccess?.allowedDomains;
if (!Array.isArray(allowedDomains) || allowedDomains.length !== 1 || allowedDomains[0] !== 'none') {
  fail('manifest.json must keep networkAccess.allowedDomains set to ["none"] for release builds');
}

if (SOURCE_MAP_PATTERN.test(code) || SOURCE_MAP_PATTERN.test(ui)) {
  fail('dist contains sourceMappingURL; stop debug/watch tasks and run npm run build');
}

if (DEBUG_ENDPOINT_PATTERN.test(code) || DEBUG_ENDPOINT_PATTERN.test(ui)) {
  fail('dist contains the localhost debug endpoint; run a clean production build before release');
}

if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  fail('package.json must contain a non-empty version string');
} else {
  if (!code.includes(pkg.version)) {
    fail(`dist/code.js does not contain package version ${pkg.version}`);
  }
  if (!ui.includes(pkg.version)) {
    fail(`dist/ui.html does not contain package version ${pkg.version}`);
  }
}

if (code.length > MAX_EXPECTED_CODE_BYTES) {
  warn(`dist/code.js is ${(code.length / 1024 / 1024).toFixed(2)} MB; this is larger than expected for production`);
}

if (ui.length > MAX_EXPECTED_UI_BYTES) {
  warn(`dist/ui.html is ${(ui.length / 1024 / 1024).toFixed(2)} MB; this is larger than expected for production`);
}

for (const warning of warnings) {
  console.warn('[release-assert] warning: ' + warning);
}

if (failures.length > 0) {
  console.error('[release-assert] production build check failed:');
  for (const failure of failures) {
    console.error('  - ' + failure);
  }
  process.exit(1);
}

console.log('[release-assert] production build ok');
console.log(
  JSON.stringify(
    {
      codeBytes: code.length,
      uiBytes: ui.length,
      networkAccess: manifest.networkAccess,
    },
    null,
    2,
  ),
);
