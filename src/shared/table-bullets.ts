// ============================================================
// shared/table-bullets.ts
//
// Bullet-list helpers for table cell values, shared between the iframe grid
// (editing/affordance) and the sandbox renderer (canvas TEXT). Bullets are
// per-line, Apple-Notes style: a line that starts with a `- `/`• `/`* ` marker
// is a bullet item; other lines are plain prose. The model string keeps the
// markers verbatim; the canvas strips them and applies a Figma UNORDERED
// list-style only over the character ranges of the bulleted lines, so a single
// cell can mix bullets and plain text.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

// Accepted leading markers: hyphen/asterisk/bullet glyph followed by at least
// one space. The space is required: a dash without a space is a minus sign
// (`-100` in a numbers column), not a bullet — `- 100` and `- a` bullet.
const BULLET_MARKER = /^[-*•]\s+/;

// The marker the editor inserts when auto-continuing a bullet list.
const CONTINUE_MARKER = '- ';

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function isBulletLine(line: string): boolean {
  return BULLET_MARKER.test(line.trim());
}

/** True when at least one line carries a bullet marker. */
export function hasBulletLine(value: string): boolean {
  const lines = splitLines(value);
  for (let i = 0; i < lines.length; i++) {
    if (isBulletLine(lines[i])) return true;
  }
  return false;
}

export interface BulletRange {
  start: number;
  end: number;
}

export interface ParsedBullets {
  // Canvas text with per-line markers stripped (lines preserved, including
  // plain ones). Marker-only / empty bullet lines collapse to an empty line.
  text: string;
  // Character ranges (in `text`) that should carry the UNORDERED list-style,
  // one per bulleted line. Plain lines are omitted.
  ranges: BulletRange[];
}

/**
 * Strip the per-line markers and report which line-ranges are bullets, so the
 * canvas can apply `setRangeListOptions` per line (mixed bullet + prose cells).
 * Figma puts one glyph per line in a list-range, so each bulleted line gets its
 * own single-line range; plain lines are left out of `ranges`.
 */
export function parseBullets(value: string): ParsedBullets {
  const lines = splitLines(value);
  const outLines: string[] = [];
  const ranges: BulletRange[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bullet = isBulletLine(line);
    const bare = bullet ? line.replace(BULLET_MARKER, '') : line;
    if (bullet && bare.length > 0) {
      ranges.push({ start: offset, end: offset + bare.length });
    }
    outLines.push(bare);
    // +1 for the '\n' that rejoins this line to the next (not after the last).
    offset += bare.length + 1;
  }
  return { text: outLines.join('\n'), ranges: ranges };
}

/**
 * Add a `- ` marker to every non-empty line that lacks one. Used by the grid
 * "bullet list" toggle to convert a plain cell into a bullet list. Idempotent
 * on lines that already carry a marker.
 */
export function addBulletMarkers(value: string): string {
  const lines = splitLines(value);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || isBulletLine(line)) {
      out.push(line);
    } else {
      out.push(CONTINUE_MARKER + line);
    }
  }
  return out.join('\n');
}

/** Strip every per-line bullet marker (used by the toggle to un-bullet). */
export function stripBulletMarkers(value: string): string {
  const lines = splitLines(value);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(isBulletLine(lines[i]) ? lines[i].replace(BULLET_MARKER, '') : lines[i]);
  }
  return out.join('\n');
}

export interface BulletEnterResult {
  value: string;
  caret: number;
}

/**
 * Apple-Notes Enter behavior inside a bullet line, computed purely from the
 * value + caret. Returns the new value/caret, or null when Enter should fall
 * through to a normal newline (caller does nothing special).
 *
 * Rules:
 * - Caret on a marker-only / empty bullet line → EXIT: drop the marker so the
 *   line becomes plain and empty; caret stays at the line start. The next Enter
 *   is then a normal newline.
 * - Caret on a bullet line with content → CONTINUE: insert a newline + a fresh
 *   `- ` marker at the caret.
 * - Caret not on a bullet line → null (normal newline / plain prose).
 */
export function bulletEnter(value: string, caret: number): BulletEnterResult | null {
  const safeCaret = caret < 0 ? 0 : caret > value.length ? value.length : caret;
  const lineStart = value.lastIndexOf('\n', safeCaret - 1) + 1;
  const lineEndRaw = value.indexOf('\n', safeCaret);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const line = value.slice(lineStart, lineEnd);

  if (!isBulletLine(line)) return null;

  const afterMarker = line.replace(BULLET_MARKER, '');
  if (afterMarker.trim() === '') {
    // Empty bullet → exit: drop the marker, leaving a plain empty line.
    const next = value.slice(0, lineStart) + value.slice(lineEnd);
    return { value: next, caret: lineStart };
  }

  const insert = '\n' + CONTINUE_MARKER;
  const next = value.slice(0, safeCaret) + insert + value.slice(safeCaret);
  return { value: next, caret: safeCaret + insert.length };
}
