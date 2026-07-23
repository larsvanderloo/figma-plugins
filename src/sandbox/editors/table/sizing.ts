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
      const spec: CellSpec = { text: text, font: font, fontSize: fontSize };
      // Checks and badges take width on the value line; measure them in lockstep with
      // buildCell (icon = 1em + 0.35em gap; badge label + padding via cellContribution).
      if (!isHeader && cell !== null) {
        if (cell.check === true || cell.check === false) {
          spec.leadWidth = Math.round(fontSize) + Math.round(fontSize * 0.35);
        }
        if (typeof cell.badge === 'string' && cell.badge.trim() !== '') {
          spec.badgeText = cell.badge.trim();
        }
      }
      columns[j].push(spec);
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
      }
      try {
        cellFrame.resize(colWidths[j], cellFrame.height);
      } catch (_e) {
      }
    } else {
      try {
        cellFrame.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
      }
    }
  }
}

// Deliberately no vertical FILL or textTruncation: rows HUG their tallest cell so long
// wrapped values grow the row instead of clipping, and the value TEXT FILLs horizontally
// so it wraps at cell width rather than pushing the column open.
export function applyBodyTruncation(bodyRows: FrameNode[]): void {
  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r];

    for (var c = 0; c < row.children.length; c++) {
      var cell = row.children[c];
      if (cell.type !== 'FRAME') continue;
      var cellFrame = cell as FrameNode;

      // Delta cells (vertical value+badge stack) already HUG; skip them.
      if (cellFrame.getPluginData('delta') !== '') continue;

      var t = cellFrame.findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t === null || t.type !== 'TEXT') continue;

      var textNode = t as TextNode;
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
      }
      try {
        textNode.textAutoResize = 'HEIGHT';
      } catch (_e) {
      }
    }
  }
}
