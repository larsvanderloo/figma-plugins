// When no text-measure function is available this intentionally returns an
// equal split, keeping the render identical to the previous FILL behavior.

export interface CellSpec {
  text: string;
  font: FontName;
  fontSize: number;
  /** Fixed extra width in px before the text (check icon + gap). */
  leadWidth?: number;
  /** Badge-chip label; its measured width plus chip padding is added after the text. */
  badgeText?: string;
}

export type MeasureTextWidth = (text: string, font: FontName, fontSize: number) => number;

export interface ColumnFitOptions {
  totalWidth: number;
  minColWidth: number;
  maxColFraction: number;
}

const MEASURED_CELL_PADDING = 24;

// The measurer reports un-wrapped width, so above this many characters a cell
// is assumed to wrap and its measured width is capped — otherwise one long
// value balloons its column to maxColFraction and starves the others.
const WRAP_MEASURE_CHAR_CAP = 24;

function equalWidths(count: number, totalWidth: number): number[] {
  const widths: number[] = [];
  if (count <= 0) return widths;
  const width = totalWidth / count;
  for (let i = 0; i < count; i++) widths.push(width);
  return widths;
}

function normalizeForMeasure(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

function cellContribution(cell: CellSpec, measure: MeasureTextWidth): number {
  const clean = normalizeForMeasure(cell.text);
  let width;
  if (clean.length <= WRAP_MEASURE_CHAR_CAP) {
    width = measure(clean, cell.font, cell.fontSize);
  } else {
    width = measure(clean.slice(0, WRAP_MEASURE_CHAR_CAP), cell.font, cell.fontSize);
  }
  // Check icon and badge chip count toward intrinsic width; without this an
  // extras-only column measures 0 and gets the much wider text minimum.
  if (typeof cell.leadWidth === 'number' && cell.leadWidth > 0) width += cell.leadWidth;
  if (typeof cell.badgeText === 'string' && cell.badgeText !== '') {
    const chipLabel = measure(
      cell.badgeText,
      { family: 'Inter', style: 'Regular' },
      cell.fontSize,
    );
    // ~1.6em chip padding, plus a gap to the text only when there is text.
    width +=
      chipLabel +
      Math.round(cell.fontSize * 1.6) +
      (clean.length > 0 ? Math.round(cell.fontSize * 0.35) : 0);
  }
  return width;
}

function columnHasText(cells: CellSpec[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    if (normalizeForMeasure(cells[i].text).trim() !== '') return true;
  }
  return false;
}

// A column "wants wrap" once any cell exceeds the measure cap: its intrinsic
// width is then a truncated approximation, so any extra space is useful to it.
function columnWantsWrap(cells: CellSpec[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    if (normalizeForMeasure(cells[i].text).length > WRAP_MEASURE_CHAR_CAP) return true;
  }
  return false;
}

function intrinsicWidth(cells: CellSpec[], measure: MeasureTextWidth): number {
  let max = 0;
  for (let i = 0; i < cells.length; i++) {
    const measured = cellContribution(cells[i], measure);
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
  const wantsWrap: boolean[] = [];
  const hasText: boolean[] = [];
  let intrinsicTotal = 0;
  for (let i = 0; i < count; i++) {
    const value = intrinsicWidth(columns[i], measure);
    intrinsic.push(value);
    wantsWrap.push(columnWantsWrap(columns[i]));
    hasText.push(columnHasText(columns[i]));
    intrinsicTotal += value;
  }
  if (intrinsicTotal <= 0) return equalWidths(count, totalWidth);

  // Hug + grow: single-line columns hug their intrinsic width and only
  // wrapping columns share the surplus by weight — a plain proportional split
  // leaves short columns mostly empty. maxColFraction deliberately does not
  // apply here; with no wrapping columns, fall through to the proportional
  // path below so the table still fills the full width.
  const hugged: number[] = [];
  let huggedTotal = 0;
  for (let i = 0; i < count; i++) {
    // Text columns floor at minColWidth (it exists for readable text);
    // extras-only columns (check/chip, no text) get a small 48px floor —
    // the full text minimum is wasted space on an icon column.
    const floor = hasText[i]
      ? minWidth
      : intrinsic[i] > 0
        ? 48
        : minWidth;
    const hug = intrinsic[i] > floor ? intrinsic[i] : floor;
    hugged.push(hug);
    huggedTotal += hug;
  }
  if (huggedTotal < totalWidth) {
    let growWeight = 0;
    for (let i = 0; i < count; i++) {
      if (wantsWrap[i]) growWeight += intrinsic[i] > 0 ? intrinsic[i] : 1;
    }
    if (growWeight > 0) {
      const surplus = totalWidth - huggedTotal;
      const grown: number[] = [];
      for (let i = 0; i < count; i++) {
        const weight = intrinsic[i] > 0 ? intrinsic[i] : 1;
        grown.push(hugged[i] + (wantsWrap[i] ? (surplus * weight) / growWeight : 0));
      }
      const growDiff = totalWidth - sum(grown);
      grown[count - 1] += growDiff;
      return grown;
    }
  }

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
