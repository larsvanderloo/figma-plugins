// ============================================================
// editors/table/metrics.ts
//
// Pure layout-metrics voor de tabel-renderer: fontSize-afleiding uit
// slot-hoogte + rowCount, responsive row-padding en de dense-table
// layout-metrics (paddings/gaps) die rows, header en footer delen.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

/**
 * Tekst-fontSize afgeleid van actual rowHeight (T39.1.1, v0.2.2).
 *
 * `rowHeight` is hier de OUTER row-height (= row's eigen FILL-share van de
 * container). Inner content-area per rij is rowHeight - 40 (rowFrame
 * paddingTop+paddingBottom = 20+20). De ratios 0.36/0.30 zijn empirisch
 * gekalibreerd op outer-rowHeight zodat heading + body comfortabel binnen
 * inner-area passen met line-height ~1.2.
 *
 * Formule:
 *   rowHeight = (slotHeight - 48) / rowCount        // T41.9: container.padding 24+24
 *   heading/body ratios and max-clamps become smaller once the table has
 *   several body rows, so dense tables read as information tables rather
 *   than oversized presentation cards.
 *
 * T44: de textSize-multiplier (T42.9, sm/lg-branches) is weer verwijderd —
 * fontSize is volledig automatisch; de clamps zijn de eerdere 'md'-waardes
 * (T42.21-kalibratie).
 */
export function getFontSizes(
  slotHeight: number,
  rowCount: number,
): { heading: number; body: number } {
  var safeRowCount = rowCount > 0 ? rowCount : 1;
  var rowHeight = (slotHeight - 48) / safeRowCount;
  if (rowHeight < 16) rowHeight = 16;

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
 * T43.4 — responsive row-padding op basis van bodyRowCount.
 * Bij weinig rijen: ruime padding voor breathing room. Bij veel rijen:
 * compactere padding zodat text-area per rij voldoende blijft.
 */
export function computeRowPadding(rowCount: number): number {
  if (rowCount <= 3) return 24;
  if (rowCount <= 6) return 14;
  if (rowCount <= 9) return 10;
  return 6; // 10-15 rijen
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
