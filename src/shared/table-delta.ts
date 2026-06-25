// ============================================================
// shared/table-delta.ts
//
// Per-cell delta-badge helpers, shared between the iframe grid (preview
// + arrow menu) and the sandbox renderer (canvas text). The editor types
// a free value (e.g. `+12%`); an optional ▲/▼ prefix sets the direction.
// Same display convention as the chart delta-badge (chart-calculations.ts).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

export const DELTA_ARROW_UP = '▲';
export const DELTA_ARROW_DOWN = '▼';

export type DeltaDirection = 'up' | 'down' | 'neutral';

/**
 * Strip een leidende ▲/▼ (plus omringende spaties) van een delta-string,
 * zodat de kale waarde overblijft. Idempotent op waarden zonder pijl.
 */
export function stripDeltaArrow(raw: string): string {
  let text = raw.trim();
  if (text.indexOf(DELTA_ARROW_UP) === 0 || text.indexOf(DELTA_ARROW_DOWN) === 0) {
    text = text.substring(1).trim();
  }
  return text;
}

/**
 * Bepaalt de richting van een delta-string. Een expliciete ▲/▼ wint;
 * anders wordt het teken van de eerste numerieke waarde gebruikt
 * (`-`/`−` → down, anders up). Lege waarde → neutral.
 */
export function deltaDirection(raw: string): DeltaDirection {
  const text = raw.trim();
  if (text === '') return 'neutral';
  if (text.indexOf(DELTA_ARROW_UP) === 0) return 'up';
  if (text.indexOf(DELTA_ARROW_DOWN) === 0) return 'down';
  const bare = stripDeltaArrow(text);
  if (bare.charAt(0) === '-' || bare.charAt(0) === '−') return 'down';
  return 'up';
}

/**
 * Zet/vervangt/verwijdert de pijl-prefix op een delta-string. `arrow`
 * null → pijl weg (kale waarde). Retourneert de genormaliseerde string
 * (pijl + spatie + kale waarde), of de kale waarde wanneer er niets rest.
 */
export function setDeltaArrow(raw: string, arrow: string | null): string {
  const bare = stripDeltaArrow(raw);
  if (arrow === null) return bare;
  if (bare === '') return arrow;
  return arrow + ' ' + bare;
}

/**
 * Display-string voor de badge: getrimde waarde, of null wanneer er niets
 * te tonen is. De ▲/▼ zit al in `raw` (door de editor via het pijl-menu
 * gezet); deze helper voegt geen pijl toe — single source of truth voor
 * zowel de grid-preview als de canvas-render.
 */
export function tableDeltaDisplay(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  return text === '' ? null : text;
}
