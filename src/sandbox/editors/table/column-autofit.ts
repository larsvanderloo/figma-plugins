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

import { TABLE_VALUE_GAP_EM, TABLE_BADGE_LABEL_EM, tableBadgeChipPadX } from './metrics';

export interface CellSpec {
  text: string;
  font: FontName;
  fontSize: number;
  /** Vaste extra breedte in px vóór de tekst (vinkje-icoon + gap). */
  leadWidth?: number;
  /** Badge-chip label — wordt gemeten + chip-padding, achter de tekst. */
  badgeText?: string;
}

export type MeasureTextWidth = (text: string, font: FontName, fontSize: number) => number;

export interface ColumnFitOptions {
  totalWidth: number;
  minColWidth: number;
  maxColFraction: number;
}

const MEASURED_CELL_PADDING = 24;

// A single long-pasted value used to drive the whole column to its intrinsic
// (single-line) width, ballooning it to maxColFraction and starving the other
// columns. The autofit measurer reports the un-wrapped width, so we clamp each
// cell's contribution: above this many characters the cell is assumed to wrap,
// and its measured width is capped so the column lands at a wrap-friendly size
// instead of one giant line. Body text wraps freely inside (no truncation).
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

// Width a cell contributes to its column's intrinsic size. Long values are
// measured only up to the wrap cap (proportionally scaled) so they request a
// column wide enough to read comfortably, not wide enough to hold the whole
// string on one line.
function cellContribution(cell: CellSpec, measure: MeasureTextWidth): number {
  const clean = normalizeForMeasure(cell.text);
  let width;
  if (clean.length <= WRAP_MEASURE_CHAR_CAP) {
    width = measure(clean, cell.font, cell.fontSize);
  } else {
    width = measure(clean.slice(0, WRAP_MEASURE_CHAR_CAP), cell.font, cell.fontSize);
  }
  // Vinkje en badge-chip tellen mee in de intrinsieke breedte. Zonder dit
  // valt een kolom met alleen een vinkje/chip terug op tekst-intrinsiek 0
  // en krijgt hij de (veel bredere) tekst-minimumbreedte — het icoon en de
  // chip zweven dan in een lege kolom.
  if (typeof cell.leadWidth === 'number' && cell.leadWidth > 0) width += cell.leadWidth;
  if (typeof cell.badgeText === 'string' && cell.badgeText !== '') {
    // Lockstep met buildBadgeChip: label op TABLE_BADGE_LABEL_EM × korps in
    // Inter Medium, plus de chip-padding uit dezelfde metrics-formule. Meet
    // de autofit een andere chip dan de builder tekent, dan hugt een
    // badge-kolom te krap of te ruim.
    const chipLabel = measure(
      cell.badgeText,
      { family: 'Inter', style: 'Medium' },
      cell.fontSize * TABLE_BADGE_LABEL_EM,
    );
    width +=
      chipLabel +
      tableBadgeChipPadX(cell.fontSize) +
      (clean.length > 0 ? Math.round(cell.fontSize * TABLE_VALUE_GAP_EM) : 0);
  }
  return width;
}

// Kolommen zonder tekst (alleen vinkjes/chips) mogen onder de tekst-
// minimumbreedte huggen: dat minimum bestaat voor léésbare tekstkolommen.
function columnHasText(cells: CellSpec[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    if (normalizeForMeasure(cells[i].text).trim() !== '') return true;
  }
  return false;
}

// Een kolom "wil wrappen" zodra één cel boven de meet-cap uitkomt: de
// gemeten intrinsieke breedte is dan een afgekapte benadering en de kolom
// kan élke extra ruimte nuttig gebruiken. Kolommen zonder zulke cellen
// passen per definitie op één regel binnen hun intrinsieke breedte.
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

  // ── Surplus-pad: hug + groei ────────────────────────────────────────
  // Proportioneel verdelen over ALLE kolommen verspilt ruimte: een korte
  // label-kolom (intrinsiek ~20 tekens) en een lange wrap-kolom (gemeten
  // op de wrap-cap van 24 tekens) krijgen bijna gelijke gewichten, dus een
  // ~50/50-split met de label-kolom grotendeels leeg. In plaats daarvan:
  // kolommen waarvan álle cellen op één regel passen huggen hun intrinsieke
  // breedte; alleen kolommen met wrappende content verdelen het overschot
  // (naar gewicht). De maxColFraction-cap geldt hier bewust niet — de
  // overige kolommen hebben al wat ze nodig hebben, dus een cap zou de
  // lege ruimte alleen maar terugbrengen. Zonder wrap-kolommen (alles
  // kort) valt de verdeling door naar het bestaande proportionele pad,
  // zodat de tabel de volle breedte blijft vullen.
  const hugged: number[] = [];
  let huggedTotal = 0;
  for (let i = 0; i < count; i++) {
    // Tekstkolommen huggen op minimaal minColWidth; extras-only kolommen
    // (alleen vinkje/chip, geen tekst) huggen hun eigen intrinsiek met een
    // kleine ondergrens — 160px voor een icoon-kolom is verspilde ruimte.
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
