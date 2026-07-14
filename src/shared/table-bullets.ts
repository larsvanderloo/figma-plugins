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

// Accepted leading markers: hyphen/asterisk/bullet glyph, gevolgd door
// minstens één spatie. De spatie is verplicht: een dash zónder spatie is
// een minteken (`-100` in een getallen-kolom), geen bullet — `- 100` en
// `- a` bulleten wél.
//
// Naast list-bullets bestaan er glyph-markers (✓ vinkje / ✗ kruisje). Die
// delen dezelfde mechaniek (celmenu-conversie, Enter-continuatie) maar de
// canvas behandelt ze anders: bullets worden gestript en krijgen Figma's
// UNORDERED list-style, glyphs blijven letterlijk in de tekst staan — Figma
// kent geen check-list-style en list-styling zou er een bolletje vóór zetten.
const BULLET_MARKER = /^[-*•]\s+/;
const CHECK_MARKER = /^[✓✔]\s+/;
const CROSS_MARKER = /^[✗✘]\s+/;
const ANY_MARKER = /^[-*•✓✔✗✘]\s+/;

export type LineMarkerType = 'bullet' | 'check' | 'cross';

/** Het marker-voorvoegsel dat de editor invoegt per lijst-type. */
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
 * Lijst-type van de cel voor de menu-state: het type van de eerste
 * gemarkeerde regel, of null wanneer geen enkele regel een marker draagt.
 */
export function cellMarkerType(value: string): LineMarkerType | null {
  const lines = splitLines(value);
  for (let i = 0; i < lines.length; i++) {
    const type = lineMarkerType(lines[i]);
    if (type !== null) return type;
  }
  return null;
}

/**
 * Zet elke niet-lege regel op het gegeven lijst-type: bestaande markers
 * (van welk type dan ook) worden vervangen, ongemarkeerde regels krijgen
 * het voorvoegsel erbij. Zo is bullet→vinkje één menu-actie i.p.v.
 * strippen + opnieuw toevoegen.
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

/** Strip elke per-regel marker, ongeacht type (menu-actie "verwijderen"). */
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
 * Apple-Notes Enter behavior inside a marked line (bullet, vinkje of
 * kruisje), computed purely from the value + caret. Returns the new
 * value/caret, or null when Enter should fall through to a normal newline
 * (caller does nothing special).
 *
 * Rules:
 * - Caret on a marker-only / empty marked line → EXIT: drop the marker so
 *   the line becomes plain and empty; caret stays at the line start. The
 *   next Enter is then a normal newline.
 * - Caret on a marked line with content → CONTINUE: insert a newline + a
 *   fresh marker of the SAME type at the caret.
 * - Caret not on a marked line → null (normal newline / plain prose).
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
    // Empty marker line → exit: drop the marker, leaving a plain empty line.
    const next = value.slice(0, lineStart) + value.slice(lineEnd);
    return { value: next, caret: lineStart };
  }

  const insert = '\n' + markerPrefix(markerType);
  const next = value.slice(0, safeCaret) + insert + value.slice(safeCaret);
  return { value: next, caret: safeCaret + insert.length };
}
