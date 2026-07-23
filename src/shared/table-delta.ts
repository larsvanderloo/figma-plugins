// An optional ▲/▼ prefix on the free-typed delta value encodes direction —
// same display convention as the chart delta-badge (chart-calculations.ts).

export const DELTA_ARROW_UP = '▲';
export const DELTA_ARROW_DOWN = '▼';

export type DeltaDirection = 'up' | 'down' | 'neutral';

export function stripDeltaArrow(raw: string): string {
  let text = raw.trim();
  if (text.indexOf(DELTA_ARROW_UP) === 0 || text.indexOf(DELTA_ARROW_DOWN) === 0) {
    text = text.substring(1).trim();
  }
  return text;
}

export function deltaDirection(raw: string): DeltaDirection {
  const text = raw.trim();
  if (text === '') return 'neutral';
  if (text.indexOf(DELTA_ARROW_UP) === 0) return 'up';
  if (text.indexOf(DELTA_ARROW_DOWN) === 0) return 'down';
  const bare = stripDeltaArrow(text);
  // '−' is Unicode minus (U+2212) — a different character from ASCII '-'.
  if (bare.charAt(0) === '-' || bare.charAt(0) === '−') return 'down';
  return 'up';
}

/** `arrow: null` strips the prefix instead of setting one. */
export function setDeltaArrow(raw: string, arrow: string | null): string {
  const bare = stripDeltaArrow(raw);
  if (arrow === null) return bare;
  if (bare === '') return arrow;
  return arrow + ' ' + bare;
}

/**
 * `raw` already carries any ▲/▼ set via the arrow menu — this never adds one,
 * so the grid preview and the canvas render cannot drift apart.
 */
export function tableDeltaDisplay(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  return text === '' ? null : text;
}
