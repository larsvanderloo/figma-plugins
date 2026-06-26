// ============================================================
// editors/table/sizing.ts
//
// Breedte- en truncation-helpers voor de tabel-renderer: render-width
// resolutie (slot-truth met surface-fallback), het cell-budget voor
// content-weighted autofit, de CellSpec-matrix voor `column-autofit`,
// het toepassen van de berekende kolom-breedtes en de post-FILL
// body-truncation pass.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableRowModel, TableColumnSummary } from '../../../shared/types';
import { tableWidthForSurface } from '../../../shared/constants';
import type { CellSpec } from './column-autofit';
import type { TableLayoutMetrics } from './metrics';
import { footerCanvasText } from './footer';

export function tableCellBudget(
  totalWidth: number,
  columnCount: number,
  metrics: TableLayoutMetrics,
): number {
  if (columnCount <= 0) return 0;
  const gapWidth = columnCount > 1 ? metrics.rowGap * (columnCount - 1) : 0;
  const budget = totalWidth - metrics.containerPadX * 2 - metrics.rowPadX * 2 - gapWidth;
  return budget > columnCount ? budget : columnCount;
}

function positiveDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function resolveTableRenderWidth(
  slot: SlotNode,
  surfaceName: string | null,
  columnCount: number,
): number {
  const fallbackWidth = tableWidthForSurface(surfaceName, columnCount);
  const slotWidth = positiveDimension(slot.width);
  if (slotWidth !== null) return slotWidth;
  return fallbackWidth;
}

export function buildColumnSpecs(
  rows: TableRowModel[],
  hasHeader: boolean,
  sizes: { heading: number; body: number },
  columnCount: number,
  footerSummaries: Array<TableColumnSummary | null>,
): CellSpec[][] {
  // Keep these font choices in lockstep with buildHeaderCell() and buildCell();
  // autofit must measure the same typography the renderer actually draws.
  const columns: CellSpec[][] = [];
  for (let j = 0; j < columnCount; j++) columns.push([]);

  for (let i = 0; i < rows.length; i++) {
    const isHeader = hasHeader && i === 0;
    for (let j = 0; j < columnCount; j++) {
      const cell = j < rows[i].cells.length ? rows[i].cells[j] : null;
      const text = cell !== null ? cell.value : '';
      let font: FontName;
      let fontSize: number;
      if (isHeader) {
        font = { family: 'Instrument Sans', style: 'SemiBold' };
        fontSize = 20;
      } else if (cell !== null && cell.emphasis === true) {
        font = { family: 'Instrument Sans', style: 'SemiBold' };
        fontSize = sizes.heading;
      } else {
        font = { family: 'Inter', style: 'Regular' };
        fontSize = sizes.body;
      }
      columns[j].push({ text: text, font: font, fontSize: fontSize });
    }
  }

  for (let j = 0; j < columnCount && j < footerSummaries.length; j++) {
    const summary = footerSummaries[j];
    if (summary === null) continue;
    const emphasized = summary.emphasis === true;
    columns[j].push({
      text: footerCanvasText(summary),
      font: emphasized
        ? { family: 'Instrument Sans', style: 'SemiBold' }
        : { family: 'Inter', style: 'Regular' },
      fontSize: emphasized ? sizes.heading : sizes.body,
    });
  }

  return columns;
}

export function applyColumnSizing(rowFrame: FrameNode, colWidths: number[]): void {
  if (colWidths.length === 0) return;
  const last = colWidths.length - 1;
  for (let j = 0; j < rowFrame.children.length && j < colWidths.length; j++) {
    const child = rowFrame.children[j];
    if (child.type !== 'FRAME') continue;
    const cellFrame = child as FrameNode;
    if (j < last) {
      try {
        cellFrame.layoutSizingHorizontal = 'FIXED';
      } catch (_e) {
        /* silent */
      }
      try {
        cellFrame.resize(colWidths[j], cellFrame.height);
      } catch (_e) {
        /* silent */
      }
    } else {
      try {
        cellFrame.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
    }
  }
}

/**
 * Cell-sizing pass voor body-rijen. Cell HUGt verticaal (volgt zijn tekst);
 * de rij HUGt op de hoogste cel zodat lange gewrapte waarden niet mid-regel
 * clippen. De waarde-TEXT FILLt horizontaal zodat hij op cell-breedte WRAPt
 * i.p.v. de kolom open te duwen, en HEIGHT-autoresize laat zijn hoogte met het
 * aantal wrap-regels meegroeien.
 *
 * Bewust GEEN FILL-vertical of textTruncation meer: rijen mogen verticaal
 * groeien (HUG) en lange celwaarden wrappen over meerdere regels.
 */
export function applyBodyTruncation(bodyRows: FrameNode[]): void {
  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r];

    for (var c = 0; c < row.children.length; c++) {
      var cell = row.children[c];
      if (cell.type !== 'FRAME') continue;
      var cellFrame = cell as FrameNode;

      // Delta-cellen (VERTICAL waarde+badge-stack) HUGen al; overslaan.
      if (cellFrame.getPluginData('delta') !== '') continue;

      var t = cellFrame.findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t === null || t.type !== 'TEXT') continue;

      var textNode = t as TextNode;
      // Text wrapt op cell-breedte: HEIGHT-autoresize houdt de breedte
      // extern (FILL) en laat de hoogte met het aantal regels meegroeien.
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.textAutoResize = 'HEIGHT';
      } catch (_e) {
        /* silent */
      }
    }
  }
}
