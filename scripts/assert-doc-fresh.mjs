// Guard: docs/architecture/slide-machine.md must stay a timeless structural map.
//
// The doc describes WHAT the plugin looks for in Figma (surfaces, wrapper
// instances, slots, variables) — not history. Two failure modes drift it, and
// this guard rejects both:
//
//   A. Time-bound / changelog tokens. Dates, commit hashes, "deferred",
//      "Phase-N", "fixed in", "verified on", "TODO", task-IDs. These turn the
//      doc into a stale changelog. The "when" and "why" belong in git.
//   B. Dangling code references. Every wrapper-finder name (find<Name>) and
//      every 40-char library variable key the doc cites must still exist
//      somewhere in src/ — otherwise the doc describes code that's gone.
//
// Run standalone (`npm run lint:doc`) or via release:check. Exit 1 on violation.
// Deliberately narrow: it checks finders + variable keys (the brittle,
// load-bearing references), NOT every capitalized token — so prose that names
// a removed constant, or a Figma API method like findOne(), does not false-fail.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const docPath = path.join(rootDir, 'docs/architecture/slide-machine.md');
const srcDir = path.join(rootDir, 'src');
const exts = new Set(['.ts', '.vue', '.mts']);

// --- A. Banned time-bound / changelog tokens (case-insensitive where noted) ---
const bannedPatterns = [
  { re: /\b20\d{2}-\d{2}-\d{2}\b/, label: 'ISO date' },
  { re: /\bcommit\s+[0-9a-f]{7,40}\b/i, label: '"commit <hash>"' },
  { re: /`[0-9a-f]{7,12}`/, label: 'short-hash in backticks (looks like a commit ref)' },
  { re: /\bPhase[\s-]?\d\b/i, label: '"Phase-N"' },
  { re: /\bdeferred\b/i, label: '"deferred"' },
  { re: /\bfixed in\b/i, label: '"fixed in"' },
  { re: /\bverified (on|via|against)\b/i, label: '"verified on/via/against"' },
  { re: /\bwas a (real )?bug\b/i, label: '"was a bug"' },
  { re: /\bTODO\b|\bFIXME\b/, label: 'TODO/FIXME' },
  { re: /\bT\d+(?:\.\d+)*[a-z]?:/, label: 'spec task-id (T<n>:)' },
];

// A short-hash regex would also match the two 40-char variable keys, which are
// legitimate. Exempt any 40-char hex run from the short-hash check.
const longHex = /\b[0-9a-f]{40}\b/g;

// --- B. Code references the doc must keep honest ---
const finderRe = /\bfind[A-Z][a-zA-Z]+\b/g;
const varKeyRe = /\b[0-9a-f]{40}\b/g;
// Figma API methods that look like finders but are not plugin symbols.
const apiMethodAllowlist = new Set(['findOne', 'findAll', 'findChild', 'findChildren', 'findAllWithCriteria']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...(await walk(full)));
    } else if (exts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

let doc;
try {
  doc = await readFile(docPath, 'utf8');
} catch (_e) {
  console.error('[doc-fresh] cannot read ' + path.relative(rootDir, docPath));
  process.exit(1);
}

// --- Pass A: banned tokens, line by line ---
const lines = doc.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const deHexed = line.replace(longHex, '<varkey>'); // protect 40-char keys
  for (const { re, label } of bannedPatterns) {
    const target = label.indexOf('hash in backticks') !== -1 ? deHexed : line;
    const m = target.match(re);
    if (m) failures.push(`L${i + 1}: time-bound token (${label}): "${m[0]}"`);
  }
}

// --- Pass B: every finder + variable key cited must exist in src/ ---
const srcFiles = await walk(srcDir);
const srcText = (await Promise.all(srcFiles.map((f) => readFile(f, 'utf8')))).join('\n');

const finders = Array.from(new Set(doc.match(finderRe) || [])).filter((f) => !apiMethodAllowlist.has(f));
for (const fn of finders) {
  if (srcText.indexOf(fn) === -1) {
    failures.push(`dangling code ref: finder "${fn}" named in doc but not found in src/`);
  }
}

const keys = Array.from(new Set(doc.match(varKeyRe) || []));
for (const key of keys) {
  if (srcText.indexOf(key) === -1) {
    failures.push(`dangling code ref: variable key "${key}" named in doc but not found in src/`);
  }
}

if (failures.length > 0) {
  console.error('[doc-fresh] docs/architecture/slide-machine.md must stay a timeless structural map:');
  for (const f of failures) console.error('  - ' + f);
  console.error(
    '\n  Keep it describing WHAT exists (wrappers/slots/variables). Move dates, commit refs,\n' +
    '  and fix/status notes to the commit message. Fix or remove any dangling code reference.',
  );
  process.exit(1);
}

console.log(
  '[doc-fresh] ok — slide-machine.md is timeless and its ' +
    finders.length +
    ' finders + ' +
    keys.length +
    ' variable keys all exist in src/',
);
