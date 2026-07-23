// Fit-to-slot font sizing. A pure ratio (slotHeight / rowCount) breaks once
// cells wrap — a bigger font wraps to more lines and overflows the slot — so we
// measure actual wrapped height at candidate sizes and pick the largest that fits.

import type { TableRowModel } from '../../../shared/types';
import { parseBullets } from '../../../shared/table-bullets';
import { TABLE_ROW_PAD_EM } from './metrics';
import type { MeasureTextHeight } from './measure';

// Approximate hanging-indent a Figma UNORDERED list reserves for the bullet
// glyph; the text column is this much narrower than the cell.
const BULLET_INDENT = 28;

// The fit may shrink below the getFontSizes floor down to this when content
// can't otherwise fit — small text beats clipping rows off the bottom.
export const HARD_MIN_BODY = 14;

export interface FitInput {
  rows: TableRowModel[];
  hasHeader: boolean;
  columnCount: number;
  colWidths: number[];
  // Slot height minus container padding, header and footer reservations.
  availableHeight: number;
  // Base padding per side (computeRowPadding); bodyRowHeightAt adds
  // TABLE_ROW_PAD_EM × candidate body size on top — same formula as the renderer.
  rowPadding: number;
  rowGap: number; // itemSpacing between cells (does not affect row height)
  // Preferred floor/ceiling from getFontSizes; the fit may shrink below minBody
  // (down to HARD_MIN_BODY) when content would otherwise overflow the slot.
  minBody: number;
  maxBody: number;
  headingScale: number;
  measureHeight: MeasureTextHeight;
}

// measureHeight returns real wrapped height, so no line-height fudge is applied.
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
    // Mirror build-rows: bullets are stripped to bare text, and the hanging
    // glyph narrows the text column — measure narrower or height is underestimated.
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
  // Renderer's padding formula: base + font-proportional air. The air grows
  // with the candidate size, so the search fits text and breathing room together.
  return tallest + (rowPadding + Math.round(body * TABLE_ROW_PAD_EM)) * 2;
}

function headerRowHeightAt(
  row: TableRowModel,
  columnCount: number,
  colWidths: number[],
  headerSize: number,
  measureHeight: MeasureTextHeight,
): number {
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

// Must mirror buildHeaderCell so the header-height estimate matches the render.
function headerFontSize(body: number): number {
  let size = Math.round(body * 1.1);
  if (size > 24) size = 24;
  if (size < 14) size = 14;
  return size;
}

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
  body: number;
  // Total stacked row height at `body`, before slack distribution: the renderer
  // spreads availableHeight − contentHeight over the body rows as extra padding.
  contentHeight: number;
  bodyRowCount: number;
}

// totalHeightAt is monotonic in fontSize, so binary-search the largest fitting
// size (~5 probes vs a per-px scan). Each probe measures every cell, and this
// is the hot path while typing.
export function fitBodyFontSize(input: FitInput): FitResult {
  const floor = HARD_MIN_BODY < input.minBody ? HARD_MIN_BODY : input.minBody;
  let bodyRowCount = 0;
  for (let i = 0; i < input.rows.length; i++) {
    if (!(input.hasHeader && i === 0)) bodyRowCount++;
  }
  if (input.availableHeight <= 0 || input.colWidths.length === 0) {
    return { body: input.minBody, contentHeight: 0, bodyRowCount: bodyRowCount };
  }
  // 10% headroom: the measurer can't perfectly mirror Figma's wrapping
  // (hanging indents, sub-pixel line metrics) — a touch of slack beats a clip.
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
