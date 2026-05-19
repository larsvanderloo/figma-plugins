import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WATCH_PATTERNS = [
  /\bnpm run debug:session\b/,
  /\bnpm run debug:watch\b/,
  /\bnpm run debug:logs\b/,
  /\bnpm run watch\b/,
  /\bvite build --watch\b/,
  /\besbuild\.config\.mjs --watch\b/,
  /\bdebug-log-server\.mjs\b/,
  /\bwrite-debug-manifests\.mjs --watch\b/,
];

const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command=']);
const matches = stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => WATCH_PATTERNS.some((pattern) => pattern.test(line)));

if (matches.length > 0) {
  console.error('[release-guard] active debug/watch processes found:');
  for (const match of matches) {
    console.error('  ' + match);
  }
  console.error('\nStop these sessions before running a production release check.');
  process.exit(1);
}

console.log('[release-guard] no active debug/watch processes found');
