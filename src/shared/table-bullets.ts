// Per-line bullet helpers shared by the iframe grid and the sandbox renderer.
// The model string keeps markers verbatim; the canvas strips them and applies
// Figma's UNORDERED list-style per bulleted line, so a cell can mix bullets and prose.

// The space after the marker is mandatory: a bare dash is a minus sign
// (`-100` in a number column), not a bullet.
// Check/cross glyphs share the marker mechanics but stay literal on canvas:
// Figma has no check-list-style, and list-styling would prepend a bullet glyph.
const BULLET_MARKER = /^[-*•]\s+/;
const CHECK_MARKER = /^[✓✔]\s+/;
const CROSS_MARKER = /^[✗✘]\s+/;
const ANY_MARKER = /^[-*•✓✔✗✘]\s+/;

export type LineMarkerType = 'bullet' | 'check' | 'cross';

export function markerPrefix(type: LineMarkerType): string {
  if (type === 'check') return '✓ ';
  if (type === 'cross') return '✗ ';
  return '- ';
}

function lineMarkerType(line: string): LineMarkerType | null {
  const t = line.trim();
  if (CHECK_MARKER.test(t)) return 'check';
  if (CROSS_MARKER.test(t)) return 'cross';
  if (BULLET_MARKER.test(t)) return 'bullet';
  return null;
}

function isMarkedLine(line: string): boolean {
  return ANY_MARKER.test(line.trim());
}

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function isBulletLine(line: string): boolean {
  return BULLET_MARKER.test(line.trim());
}

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
  // Marker-stripped text; marker-only bullet lines collapse to an empty line.
  text: string;
  // Ranges into `text` (not the input) that get the list-style; plain lines omitted.
  ranges: BulletRange[];
}

/**
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

export function cellMarkerType(value: string): LineMarkerType | null {
  const lines = splitLines(value);
  for (let i = 0; i < lines.length; i++) {
    const type = lineMarkerType(lines[i]);
    if (type !== null) return type;
  }
  return null;
}

/**
 * Replaces existing markers of any type instead of requiring strip + re-add,
 * so e.g. bullet→check is a single menu action.
 */
export function setLineMarkers(value: string, type: LineMarkerType): string {
  const prefix = markerPrefix(type);
  const lines = splitLines(value);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      out.push(line);
    } else if (isMarkedLine(line)) {
      out.push(prefix + line.trim().replace(ANY_MARKER, ''));
    } else {
      out.push(prefix + line);
    }
  }
  return out.join('\n');
}

export function stripBulletMarkers(value: string): string {
  const lines = splitLines(value);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(isMarkedLine(line) ? line.trim().replace(ANY_MARKER, '') : line);
  }
  return out.join('\n');
}

export interface BulletEnterResult {
  value: string;
  caret: number;
}

/**
 * Apple-Notes Enter: an empty marked line exits the list (marker dropped),
 * a marked line with content continues with a fresh marker of the same type.
 * Null means Enter falls through to a plain newline.
 */
export function bulletEnter(value: string, caret: number): BulletEnterResult | null {
  const safeCaret = caret < 0 ? 0 : caret > value.length ? value.length : caret;
  const lineStart = value.lastIndexOf('\n', safeCaret - 1) + 1;
  const lineEndRaw = value.indexOf('\n', safeCaret);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const line = value.slice(lineStart, lineEnd);

  const markerType = lineMarkerType(line);
  if (markerType === null) return null;

  const afterMarker = line.trim().replace(ANY_MARKER, '');
  if (afterMarker.trim() === '') {
    const next = value.slice(0, lineStart) + value.slice(lineEnd);
    return { value: next, caret: lineStart };
  }

  const insert = '\n' + markerPrefix(markerType);
  const next = value.slice(0, safeCaret) + insert + value.slice(safeCaret);
  return { value: next, caret: safeCaret + insert.length };
}
