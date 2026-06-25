// Guard: comments must be self-justifying.
//
// The product spec was removed; git history is the single source of truth.
// Comments may no longer cite dead spec task-IDs ("T39.1.1") or pin behavior
// to a past version stamp ("v0.2.2") — that prose rots into a dangling
// pointer the moment it is written. This script fails if a NEW such citation
// appears inside a comment in src/.
//
// What is allowed and explicitly NOT flagged:
//   - FIG-XXX-01 invariant codes (a living convention taxonomy, e.g. FIG-GUARD-01)
//   - T<n> / v0.x tokens inside string literals (runtime log messages, not comments)
//   - identifiers in code (only comment text is scanned)
//
// Run standalone (`node scripts/assert-no-spec-citations.mjs`) or as part of
// release:check. Exit 1 on any violation.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const exts = new Set(['.ts', '.vue', '.mts']);

// Dead-citation patterns. T-IDs: a capital T directly followed by a digit and
// optional dotted/lettered suffix (T52, T39.1.1, T26b). Version stamps:
// v0.x.y. We require the T-ID to be a standalone token (word boundary) to
// avoid matching things like "Type1" — \bT\d guarantees the digit follows T.
const TID = /\bT\d+(?:\.\d+)*[a-z]?\b/;
const VSTAMP = /\bv0\.\d+\.\d+\b/;

/** Strip string/template literals from a line so tokens inside them aren't flagged. */
function stripStringLiterals(line) {
  // Remove '...' "..." `...` (non-greedy, no escaped-quote handling needed for this guard).
  return line
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** Return the comment portion of a line, or '' if none. Handles // and * (block) lines. */
function commentText(rawLine) {
  const line = stripStringLiterals(rawLine);
  const trimmed = line.trimStart();
  // Block-comment body line (JSDoc continuation) or block open.
  if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return trimmed;
  // Line comment — take everything after the first // that is not in a string
  // (strings already blanked above, so a // here is a real comment).
  const idx = line.indexOf('//');
  if (idx !== -1) return line.slice(idx);
  return '';
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue;
      files.push(...(await walk(full)));
    } else if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(srcDir);
const violations = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const comment = commentText(lines[i]);
    if (comment === '') continue;
    const tid = comment.match(TID);
    const vstamp = comment.match(VSTAMP);
    if (tid) {
      violations.push(`${path.relative(rootDir, file)}:${i + 1}  dead spec task-id "${tid[0]}" in comment`);
    }
    if (vstamp) {
      violations.push(`${path.relative(rootDir, file)}:${i + 1}  version stamp "${vstamp[0]}" in comment`);
    }
  }
}

if (violations.length > 0) {
  console.error('[no-spec-citations] comments must be self-justifying — found dead spec/version citations:');
  for (const v of violations) console.error('  - ' + v);
  console.error(
    '\n  Rewrite the comment to explain the reasoning directly. FIG-XXX-01 invariant codes are allowed.',
  );
  process.exit(1);
}

console.log(`[no-spec-citations] ok — ${files.length} files clean of dead spec/version citations`);
