// ============================================================
// editors/table/column-autofit.ts
//
// Pure column-width distribution for the Slot-based table renderer.
// The renderer passes an optional text-measure function; when measurement
// is unavailable the function intentionally returns an equal split so the
// render remains visually identical to the previous FILL behavior.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

export interface CellSpec {
  text: string;
  font: FontName;
  fontSize: number;
}

export type MeasureTextWidth = (text: string, font: FontName, fontSize: number) => number;

export interface ColumnFitOptions {
  totalWidth: number;
  minColWidth: number;
  maxColFraction: number;
}

const MEASURED_CELL_PADDING = 24;

function equalWidths(count: number, totalWidth: number): number[] {
  const widths: number[] = [];
  if (count <= 0) return widths;
  const width = totalWidth / count;
  for (let i = 0; i < count; i++) widths.push(width);
  return widths;
}

function intrinsicWidth(cells: CellSpec[], measure: MeasureTextWidth): number {
  let max = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const measured = measure(cell.text, cell.font, cell.fontSize);
    const padded = measured > 0 ? measured + MEASURED_CELL_PADDING : measured;
    if (Number.isFinite(padded) && padded > max) max = padded;
  }
  return max;
}

function sum(values: number[]): number {
  let out = 0;
  for (let i = 0; i < values.length; i++) out += values[i];
  return out;
}

export function computeColumnWidths(
  columns: CellSpec[][],
  options: ColumnFitOptions,
  measure: MeasureTextWidth | null,
): number[] {
  const count = columns.length;
  if (count === 0) return [];

  const totalWidth = options.totalWidth > 0 ? options.totalWidth : count;
  if (measure === null) return equalWidths(count, totalWidth);

  const minWidth = options.minColWidth > 0 ? options.minColWidth : 1;
  if (minWidth * count > totalWidth) return equalWidths(count, totalWidth);

  const maxFraction = options.maxColFraction > 0 ? options.maxColFraction : 1;
  let maxWidth = count <= 1 ? totalWidth : totalWidth * maxFraction;
  if (maxWidth < minWidth) maxWidth = minWidth;

  const intrinsic: number[] = [];
  let intrinsicTotal = 0;
  for (let i = 0; i < count; i++) {
    const value = intrinsicWidth(columns[i], measure);
    intrinsic.push(value);
    intrinsicTotal += value;
  }
  if (intrinsicTotal <= 0) return equalWidths(count, totalWidth);

  const widths: number[] = [];
  const active: boolean[] = [];
  for (let i = 0; i < count; i++) {
    widths.push(0);
    active.push(true);
  }

  let remainingWidth = totalWidth;
  let changed = true;
  while (changed) {
    changed = false;
    let activeWeight = 0;
    for (let i = 0; i < count; i++) {
      if (active[i]) activeWeight += intrinsic[i] > 0 ? intrinsic[i] : 1;
    }
    if (activeWeight <= 0) break;

    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;
      const weight = intrinsic[i] > 0 ? intrinsic[i] : 1;
      const share = (remainingWidth * weight) / activeWeight;
      if (share < minWidth) {
        widths[i] = minWidth;
        active[i] = false;
        remainingWidth -= minWidth;
        changed = true;
      } else if (share > maxWidth) {
        widths[i] = maxWidth;
        active[i] = false;
        remainingWidth -= maxWidth;
        changed = true;
      }
    }
  }

  let activeWeight = 0;
  let activeCount = 0;
  for (let i = 0; i < count; i++) {
    if (active[i]) {
      activeWeight += intrinsic[i] > 0 ? intrinsic[i] : 1;
      activeCount += 1;
    }
  }

  for (let i = 0; i < count; i++) {
    if (!active[i]) continue;
    if (activeWeight <= 0) {
      widths[i] = remainingWidth / activeCount;
    } else {
      const weight = intrinsic[i] > 0 ? intrinsic[i] : 1;
      widths[i] = (remainingWidth * weight) / activeWeight;
    }
  }

  const diff = totalWidth - sum(widths);
  widths[count - 1] += diff;
  return widths;
}
