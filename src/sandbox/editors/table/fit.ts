// ============================================================
// editors/table/fit.ts
//
// Fit-to-slot font sizing. A pure ratio (slotHeight / rowCount) can't size
// text correctly once cells wrap: a bigger font makes paragraph cells wrap to
// more lines, so the rows grow taller than the ratio predicts and overflow the
// slot. This module measures the actual wrapped content height at candidate
// font sizes and picks the largest body size whose total table height still
// fits the slot — "fill, but never overflow".
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableRowModel } from '../../../shared/types';
import { parseBullets } from '../../../shared/table-bullets';
import type { MeasureTextHeight } from './measure';

// Approximate hanging-indent a Figma UNORDERED list reserves for the bullet
// glyph; the text column is this much narrower than the cell.
const BULLET_INDENT = 28;

// Absolute smallest body fontSize. The fit may shrink below the getFontSizes
// floor down to this when content genuinely can't fit the slot otherwise —
// small text beats clipping content off the bottom.
const HARD_MIN_BODY = 14;

export interface FitInput {
  rows: TableRowModel[];
  hasHeader: boolean;
  columnCount: number;
  colWidths: number[];
  // Inner content height available to the body rows (slot minus container
  // padding, header and footer reservations).
  availableHeight: number;
  rowPadding: number; // top+bottom padding per body row is 2× this
  rowGap: number; // itemSpacing between cells (does not affect row height)
  // Preferred body fontSize floor (from getFontSizes) and ceiling. The fit
  // grows up to maxBody, but may shrink below minBody — down to HARD_MIN_BODY —
  // when the content would otherwise overflow the slot.
  minBody: number;
  maxBody: number;
  headingScale: number;
  measureHeight: MeasureTextHeight;
}

// Per-line height fudge: Figma line-height ≈ fontSize × ~1.25; the measurer
// already returns real wrapped height, so we only need the measured value.
function bodyRowHeightAt(
  row: TableRowModel,
  columnCount: number,
  colWidths: number[],
  body: number,
  emphasisSize: number,
  rowPadding: number,
  measureHeight: MeasureTextHeight,
): number {
  let tallest = 0;
  for (let j = 0; j < columnCount; j++) {
    const cell = j < row.cells.length ? row.cells[j] : null;
    if (cell === null) continue;
    const colWidth = j < colWidths.length ? colWidths[j] : 0;
    // Mirror build-rows: bulleted lines are stripped to bare text. The bullet
    // glyph hangs an indent, narrowing the text column — measure at a slightly
    // smaller width so wrap-lines (and thus height) aren't underestimated.
    const parsed = parseBullets(cell.value);
    const text = parsed.text;
    if (text.length === 0) continue;
    const width = parsed.ranges.length > 0 ? colWidth - BULLET_INDENT : colWidth;
    const emphasized = cell.emphasis === true;
    const font: FontName = emphasized
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    const size = emphasized ? emphasisSize : body;
    const h = measureHeight(text, font, size, width > 0 ? width : colWidth);
    if (h > tallest) tallest = h;
  }
  return tallest + rowPadding * 2;
}

function headerRowHeightAt(
  row: TableRowModel,
  columnCount: number,
  colWidths: number[],
  headerSize: number,
  measureHeight: MeasureTextHeight,
): number {
  // Header text wraps at the column width (no more maxLines=1), so measure its
  // wrapped height per column and take the tallest.
  let tallest = 0;
  const font: FontName = { family: 'Instrument Sans', style: 'SemiBold' };
  for (let j = 0; j < columnCount; j++) {
    const cell = j < row.cells.length ? row.cells[j] : null;
    const text = cell !== null ? cell.value : '';
    const width = j < colWidths.length ? colWidths[j] : 0;
    const h = measureHeight(text.length > 0 ? text : 'X', font, headerSize, width);
    if (h > tallest) tallest = h;
  }
  return tallest;
}

// Header fontSize: must mirror buildHeaderCell (body × 1.1, capped 14–24) so
// the fit's header-height estimate matches the rendered header.
function headerFontSize(body: number): number {
  let size = Math.round(body * 1.1);
  if (size > 24) size = 24;
  if (size < 14) size = 14;
  return size;
}

// Total stacked height of all rows at a given body font size.
function totalHeightAt(input: FitInput, body: number): number {
  const heading = Math.round(body * input.headingScale);
  let total = 0;
  for (let i = 0; i < input.rows.length; i++) {
    if (input.hasHeader && i === 0) {
      total += headerRowHeightAt(
        input.rows[i],
        input.columnCount,
        input.colWidths,
        headerFontSize(body),
        input.measureHeight,
      );
    } else {
      total += bodyRowHeightAt(
        input.rows[i],
        input.columnCount,
        input.colWidths,
        body,
        heading,
        input.rowPadding,
        input.measureHeight,
      );
    }
  }
  return total;
}

export interface FitResult {
  // Chosen body fontSize.
  body: number;
  // Measured total stacked height of all rows at `body` (before any slack
  // distribution). The renderer spreads availableHeight − contentHeight across
  // the body rows as extra padding so the table fills the slot exactly.
  contentHeight: number;
  // Number of body (non-header) rows the slack should be distributed over.
  bodyRowCount: number;
}

/**
 * Largest body fontSize in [floor, maxBody] whose total table height still fits
 * availableHeight, plus the measured content height at that size.
 *
 * totalHeightAt is monotonic in fontSize (bigger font → taller content), so we
 * binary-search the largest fitting size: ~log2(range) ≈ 5 probes instead of a
 * per-px linear scan. Each probe measures every body cell, so the fewer probes
 * the less Figma text-measurement work — this is the hot path while typing.
 */
export function fitBodyFontSize(input: FitInput): FitResult {
  const floor = HARD_MIN_BODY < input.minBody ? HARD_MIN_BODY : input.minBody;
  let bodyRowCount = 0;
  for (let i = 0; i < input.rows.length; i++) {
    if (!(input.hasHeader && i === 0)) bodyRowCount++;
  }
  if (input.availableHeight <= 0 || input.colWidths.length === 0) {
    return { body: input.minBody, contentHeight: 0, bodyRowCount: bodyRowCount };
  }
  // Target a fraction of the available height as a safety margin: the measurer
  // can't perfectly mirror Figma's wrapping (bullet hanging-indent narrows the
  // text column, sub-pixel line metrics), so leaving headroom keeps the chosen
  // size from overflowing once rendered. Better a touch of slack than a clip.
  const target = input.availableHeight * 0.9;

  let lo = floor;
  let hi = input.maxBody > floor ? input.maxBody : floor;
  let best = floor;
  let bestHeight = totalHeightAt(input, floor);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const total = totalHeightAt(input, mid);
    if (total <= target) {
      best = mid;
      bestHeight = total;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { body: best, contentHeight: bestHeight, bodyRowCount: bodyRowCount };
}
