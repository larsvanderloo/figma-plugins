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
 * Direct cell+text FILL-vertical + textTruncation. Vervangt
 * de maxLines-berekening die niet betrouwbaar werkte.
 *
 * Aanpak:
 * 1. Cell layoutSizingVertical = 'FILL' → cell.height = row's FILL-share.
 * 2. Text layoutSizingHorizontal/Vertical = 'FILL' → text exact cell-bounds.
 * 3. Text textTruncation = 'ENDING' + textAutoResize = 'NONE' → Figma
 *    truncate't visueel wanneer content niet past in cell-bounds.
 *
 * Geen maxLines-formule meer nodig — Figma doet de math native via FILL.
 */
export function applyBodyTruncation(bodyRows: FrameNode[]): void {
  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r];

    for (var c = 0; c < row.children.length; c++) {
      var cell = row.children[c];
      if (cell.type !== 'FRAME') continue;
      var cellFrame = cell as FrameNode;

      // Delta-cellen zijn een verticale waarde+badge-stack (VERTICAL layout):
      // de FILL-vertical truncation hieronder zou de waarde-TEXT de hele
      // cel laten vullen en de delta-badge wegdrukken. Laat zulke cellen
      // HUG-vertical (de row centreert ze) en sla de truncation over;
      // container.clipsContent vangt eventuele overflow.
      if (cellFrame.getPluginData('delta') !== '') continue;

      // Cell vertical FILL → cell.height = row.FILL-share. Vereist
      // counterAxisSizingMode='FIXED' (was 'AUTO' = HUG).
      try {
        cellFrame.counterAxisSizingMode = 'FIXED';
      } catch (_e) {
        /* silent */
      }
      try {
        cellFrame.layoutSizingVertical = 'FILL';
      } catch (_e) {
        /* silent */
      }

      var t = cellFrame.findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t === null || t.type !== 'TEXT') continue;

      var textNode = t as TextNode;
      // Text fills cell-bounds exact. textAutoResize='NONE' = beide
      // dimensies zijn extern bepaald (via FILL).
      try {
        textNode.textAutoResize = 'NONE';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.layoutSizingVertical = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.textTruncation = 'ENDING';
      } catch (_e) {
        /* silent */
      }
    }
  }
}
