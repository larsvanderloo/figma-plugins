// Font size is a continuous formula rather than a discrete sm/md/lg × rowCount
// matrix: the matrix needed a textSize picker and jumped visibly between tiers
// when rows were added; the formula scales smoothly with actual slot height.

/**
 * rowHeight is the OUTER row height (the row's FILL share; 48 = container
 * padding 24+24). Inner content area is rowHeight - 40 (row frame padding
 * 20+20); the ratios are calibrated against the outer height so heading + body
 * fit the inner area at ~1.2 line-height. Ratios and clamps shrink for denser
 * tables so they read as information tables, not oversized presentation cards.
 */
export function getFontSizes(
  slotHeight: number,
  rowCount: number,
): { heading: number; body: number } {
  var safeRowCount = rowCount > 0 ? rowCount : 1;
  var rowHeight = (slotHeight - 48) / safeRowCount;
  if (rowHeight < 16) rowHeight = 16;

  // Conservative floor only: fit.ts afterwards grows the body font to the
  // largest size that still fits the slot, so these caps just must never overflow.
  var headingRatio = 0.36;
  var bodyRatio = 0.3;
  var headingMax = 32;
  var bodyMax = 24;
  if (safeRowCount >= 7) {
    headingRatio = 0.26;
    bodyRatio = 0.22;
    headingMax = 24;
    bodyMax = 18;
  } else if (safeRowCount >= 4) {
    headingRatio = 0.3;
    bodyRatio = 0.24;
    headingMax = 28;
    bodyMax = 20;
  }

  var heading = Math.round(rowHeight * headingRatio);
  if (heading < 16) heading = 16;
  if (heading > headingMax) heading = headingMax;

  var body = Math.round(rowHeight * bodyRatio);
  if (body < 14) body = 14;
  if (body > bodyMax) body = bodyMax;

  return { heading: heading, body: body };
}

/**
 * Font-proportional vertical row padding (per side, in em). The cap-height trim
 * removed the line's built-in leading; this restores that air explicitly and is
 * >= the font descent (~0.24em) so descenders never touch the row divider.
 * fit.ts uses the same formula, so bigger type costs more padding — the search
 * balances type size against air instead of spending all free space on text.
 */
export const TABLE_ROW_PAD_EM = 0.25;

/** Base per-side padding; TABLE_ROW_PAD_EM × body font is added on top. */
export function computeRowPadding(rowCount: number): number {
  if (rowCount <= 3) return 24;
  if (rowCount <= 6) return 14;
  if (rowCount <= 9) return 10;
  return 6;
}

export interface TableLayoutMetrics {
  containerPadX: number;
  rowPadX: number;
  rowGap: number;
  headerPadTop: number;
  headerPadBottom: number;
}

export function computeTableLayoutMetrics(
  columnCount: number,
  bodyRowCount: number,
): TableLayoutMetrics {
  const dense = bodyRowCount >= 5 || columnCount >= 4;
  const veryDense = bodyRowCount >= 8 || columnCount >= 5;

  return {
    containerPadX: veryDense ? 24 : dense ? 28 : 32,
    rowPadX: veryDense ? 20 : dense ? 24 : 32,
    rowGap: columnCount >= 5 ? 24 : dense ? 32 : 44,
    headerPadTop: dense ? 10 : 14,
    headerPadBottom: dense ? 16 : 24,
  };
}
