// In-place fast path for table edits: a full applyTable() rebuild (~30 nodes,
// ~210ms) lags typing, so value/bullet-only changes write straight onto the
// existing TEXT nodes. Any other difference returns false → full rebuild.

import type { TableWrapModel, TableRowModel } from '../../../shared/types';
import {
  columnCalculationsEqual,
  columnEmphasisEqual,
  columnLabelsEqual,
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';
import { tableDeltaDisplay } from '../../../shared/table-delta';
import { applyCellText, CELL_VALUE_NAME } from './build-rows';
import { footerCanvasText } from './footer';
import {
  readHasColumnHeader,
  readColumnCalculations,
  readColumnCalculationEmphasis,
  readColumnCalculationCurrency,
  readColumnCalculationPercent,
  readColumnCalculationLabel,
} from './plugin-data';

function findContentContainer(slot: SlotNode): FrameNode | null {
  for (let i = 0; i < slot.children.length; i++) {
    const child = slot.children[i];
    if (child.type === 'FRAME' && child.name === 'WelderTableContent') return child as FrameNode;
  }
  return null;
}

function isRowFrame(node: SceneNode): boolean {
  return (
    node.type === 'FRAME' &&
    (node.name.indexOf('TableRow') === 0 || node.name.indexOf('TableHeaderRow') === 0)
  );
}

function cellTextNode(cellFrame: FrameNode): TextNode | null {
  let t = cellFrame.findOne(function (n: SceneNode): boolean {
    return n.type === 'TEXT' && n.name === CELL_VALUE_NAME;
  });
  if (t === null) {
    t = cellFrame.findOne(function (n: SceneNode): boolean {
      return n.type === 'TEXT';
    });
  }
  return t !== null && t.type === 'TEXT' ? (t as TextNode) : null;
}

// Non-text attributes must be unchanged: emphasis (font) and delta/badge/check
// (node structure). Any such change needs the full rebuild.
function cellStructureMatches(
  cellFrame: FrameNode,
  desiredCell: { emphasis?: boolean; delta?: string; check?: boolean; badge?: string },
): boolean {
  const curEmphasis = cellFrame.getPluginData('emphasis') === '1';
  if (curEmphasis !== (desiredCell.emphasis === true)) return false;
  const curDelta = cellFrame.getPluginData('delta');
  const wantDelta = tableDeltaDisplay(desiredCell.delta);
  // Compare the delta TEXT, not just presence: the fast path never writes the
  // badge label, so any delta change ('▲ 12%'→'▲ 15%') must force the full
  // render — presence-only would silently drop such an edit.
  if (curDelta !== (wantDelta !== null ? wantDelta : '')) return false;
  // Same content comparison for check and badge: the fast path writes only
  // CellValue text, so any difference here → full render.
  const curCheck = cellFrame.getPluginData('check');
  const wantCheck =
    desiredCell.check === true ? '1' : desiredCell.check === false ? '0' : '';
  if (curCheck !== wantCheck) return false;
  const curBadge = cellFrame.getPluginData('badge');
  const wantBadge =
    typeof desiredCell.badge === 'string' && desiredCell.badge.trim() !== ''
      ? desiredCell.badge.trim()
      : '';
  if (curBadge !== wantBadge) return false;
  return true;
}

// Calc state must match EXACTLY, not just footer presence: the fast path never
// writes footer styling, so a moved sum or label/emphasis/currency/percent
// change must force the full render or it is silently dropped until the next
// full render. Read from pluginData — cheaper than a slot scan.
function calcStateMatches(slot: SlotNode, desired: TableWrapModel, columnCount: number): boolean {
  if (
    !columnCalculationsEqual(
      desired.columnCalculations,
      readColumnCalculations(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationEmphasis,
      readColumnCalculationEmphasis(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationCurrency,
      readColumnCalculationCurrency(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationPercent,
      readColumnCalculationPercent(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnLabelsEqual(
      desired.columnCalculationLabel,
      readColumnCalculationLabel(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Write `desired` cell text in place; returns false when a structural
 * difference means the caller must fall back to the full applyTable().
 * Text only — font size and column widths are NOT re-fitted; the next full
 * apply (blur / structural change / scan) reconciles any drift.
 */
export function applyTableTextOnly(slot: SlotNode, desired: TableWrapModel): boolean {
  const container = findContentContainer(slot);
  if (container === null) return false;

  // Only tables on the current canvas-schema version may be patched in place.
  // Older ones (v<5, before the leadingTrim/clipsContent typography) take the
  // full rebuild once and pick up the new style; after that the fast path
  // applies again.
  if (slot.getPluginData('v') !== '5') return false;

  if (readHasColumnHeader(slot) !== desired.hasColumnHeader) return false;
  let columnCount = 0;
  for (let i = 0; i < desired.rows.length; i++) {
    if (desired.rows[i].cells.length > columnCount) columnCount = desired.rows[i].cells.length;
  }
  if (!calcStateMatches(slot, desired, columnCount)) return false;

  // Collect current row frames in order.
  const rowFrames: FrameNode[] = [];
  for (let i = 0; i < container.children.length; i++) {
    const node = container.children[i];
    if (isRowFrame(node)) rowFrames.push(node as FrameNode);
  }

  // Desired rows after the renderer's empty-body-row filter: the canvas only
  // holds the header + non-empty body rows, so compare against that set.
  const hasHeader = desired.hasColumnHeader && desired.rows.length > 0;
  const effective: TableRowModel[] = [];
  for (let i = 0; i < desired.rows.length; i++) {
    if (hasHeader && i === 0) {
      effective.push(desired.rows[i]);
      continue;
    }
    let hasContent = false;
    for (let j = 0; j < desired.rows[i].cells.length; j++) {
      if (desired.rows[i].cells[j].value !== '') {
        hasContent = true;
        break;
      }
    }
    if (hasContent) effective.push(desired.rows[i]);
  }

  // Row-count mismatch → structure changed (row added/removed or an empty row
  // appeared/disappeared, which shifts dividers) → full rebuild.
  if (rowFrames.length !== effective.length) return false;

  // First pass: verify every cell matches structurally before mutating, so we
  // never leave a half-updated table when bailing to the full path.
  for (let r = 0; r < rowFrames.length; r++) {
    const cellFrames: FrameNode[] = [];
    for (let c = 0; c < rowFrames[r].children.length; c++) {
      const node = rowFrames[r].children[c];
      if (
        node.type === 'FRAME' &&
        (node.name.indexOf('TableItem') === 0 || node.name.indexOf('TableHeaderItem') === 0)
      ) {
        cellFrames.push(node as FrameNode);
      }
    }
    const desiredCells = effective[r].cells;
    if (cellFrames.length !== desiredCells.length) return false;
    const isHeaderRow = hasHeader && r === 0;
    for (let c = 0; c < cellFrames.length; c++) {
      // Header cells carry no emphasis/delta; only body cells need the check.
      if (!isHeaderRow && !cellStructureMatches(cellFrames[c], desiredCells[c])) return false;
      if (cellTextNode(cellFrames[c]) === null) return false;
    }
  }

  // Record each row's height before the write so we can detect whether the
  // edit changed how a row wraps (and thus its height).
  const heightsBefore: number[] = [];
  for (let r = 0; r < rowFrames.length; r++) heightsBefore.push(rowFrames[r].height);

  // Second pass: structure verified — write the text in place.
  for (let r = 0; r < rowFrames.length; r++) {
    const cellFrames: FrameNode[] = [];
    for (let c = 0; c < rowFrames[r].children.length; c++) {
      const node = rowFrames[r].children[c];
      if (
        node.type === 'FRAME' &&
        (node.name.indexOf('TableItem') === 0 || node.name.indexOf('TableHeaderItem') === 0)
      ) {
        cellFrames.push(node as FrameNode);
      }
    }
    const desiredCells = effective[r].cells;
    const isHeaderRow = hasHeader && r === 0;
    for (let c = 0; c < cellFrames.length; c++) {
      const t = cellTextNode(cellFrames[c]);
      if (t === null) continue;
      // Header cells render '- ' literally (buildHeaderCell parses no bullets);
      // write raw so fast path and full render stay identical.
      if (isHeaderRow) {
        t.characters = desiredCells[c].value;
      } else {
        applyCellText(t, desiredCells[c].value);
      }
    }
  }

  // Footer sums depend on cell values, so a text edit changes them while the
  // calc state (proven equal above) leaves styling untouched — only
  // `.characters` needs updating. maxLines=1 keeps the footer height stable so
  // the height check below stays valid.
  const calcs = normalizeColumnCalculations(desired.columnCalculations, columnCount);
  if (hasColumnCalculations(calcs)) {
    const summaries = computeTableColumnSummaries(
      desired.rows,
      hasHeader,
      calcs,
      columnCount,
      normalizeColumnEmphasis(desired.columnCalculationEmphasis, columnCount),
      normalizeColumnEmphasis(desired.columnCalculationCurrency, columnCount),
      normalizeColumnEmphasis(desired.columnCalculationPercent, columnCount),
    );
    let footerRow: FrameNode | null = null;
    for (let i = 0; i < container.children.length; i++) {
      const node = container.children[i];
      if (node.type === 'FRAME' && node.name === 'TableFooterRow') {
        footerRow = node as FrameNode;
        break;
      }
    }
    // Sums desired but no footer row on canvas → structure differs.
    if (footerRow === null) return false;
    for (let c = 0; c < footerRow.children.length; c++) {
      const cell = footerRow.children[c];
      if (cell.type !== 'FRAME' || cell.name.indexOf('TableFooterItem-c') !== 0) continue;
      const j = parseInt(cell.name.slice('TableFooterItem-c'.length), 10);
      if (!(j >= 0) || j >= summaries.length) continue;
      const summary = summaries[j];
      // Label columns (summary null) are proven textually unchanged.
      if (summary === null) continue;
      const t = (cell as FrameNode).findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t !== null && t.type === 'TEXT') {
        (t as TextNode).characters = footerCanvasText(summary);
      }
    }
  }

  // The in-place write keeps the existing font size and per-row padding (the
  // speed win). That's only valid when the edit DIDN'T change any row's height
  // — i.e. it stayed on the same number of wrap-lines. If a row grew or shrank
  // (auto-layout has already reflowed synchronously), the table needs the full
  // applyTable() to re-fit the font and re-distribute the fill across rows, so
  // one row doesn't end up tall while the rest stay short. Bail in that case.
  const HEIGHT_EPSILON = 1;
  for (let r = 0; r < rowFrames.length; r++) {
    if (Math.abs(rowFrames[r].height - heightsBefore[r]) > HEIGHT_EPSILON) return false;
  }

  return true;
}
