// ============================================================
// editors/table/apply-text.ts
//
// In-place fast-path for table updates. A full applyTable() clears the Slot
// and rebuilds ~30 nodes (createFrame/createText + variable binds) — ~210ms,
// which makes typing lag. The common edit while typing only changes a cell's
// text, not the table structure. This path detects that case and writes the
// new value straight onto the existing TEXT nodes, skipping the rebuild.
//
// It deliberately handles ONLY value/bullet changes. Anything structural
// (row/column count, header flag, emphasis, delta add/remove, calculations)
// returns false so the caller falls back to the full applyTable().
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableWrapModel, TableRowModel } from '../../../shared/types';
import { hasColumnCalculations } from '../../../shared/table-calculations';
import { tableDeltaDisplay } from '../../../shared/table-delta';
import { applyCellText, CELL_VALUE_NAME } from './build-rows';
import { readHasColumnHeader, readColumnCalculations } from './plugin-data';

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

// A cell qualifies for the fast path only when its non-text attributes are
// unchanged: same emphasis (font), same delta presence (node structure). A
// delta or emphasis change needs the full rebuild.
function cellStructureMatches(cellFrame: FrameNode, desiredCell: { emphasis?: boolean; delta?: string }): boolean {
  const curEmphasis = cellFrame.getPluginData('emphasis') === '1';
  if (curEmphasis !== (desiredCell.emphasis === true)) return false;
  const curDelta = cellFrame.getPluginData('delta');
  const wantDelta = tableDeltaDisplay(desiredCell.delta);
  if ((curDelta !== '') !== (wantDelta !== null)) return false;
  return true;
}

// Footer presence is the only calc-derived structural change a text edit could
// collide with: if the desired calcs add/remove the footer row, the row set
// changes → full rebuild. Read the persisted calcs from pluginData (cheap)
// rather than a full slot scan.
function footerPresenceMatches(slot: SlotNode, desired: TableWrapModel, columnCount: number): boolean {
  const currentCalcs = readColumnCalculations(slot, columnCount);
  const desiredCalcs = desired.columnCalculations !== undefined ? desired.columnCalculations : [];
  return hasColumnCalculations(desiredCalcs) === hasColumnCalculations(currentCalcs);
}

/**
 * Try to apply `desired` by writing cell text in place. Returns true on
 * success (no rebuild needed), false when a structural difference means the
 * caller must fall back to the full applyTable().
 *
 * NOTE: this updates text only — it does NOT re-fit the font size or column
 * widths. Those are stable across a same-structure text edit in the common
 * case; the next full apply (on blur / structural change / scan) reconciles
 * any drift. Skipping the measure+fit+build is the whole point of the path.
 */
export function applyTableTextOnly(slot: SlotNode, desired: TableWrapModel): boolean {
  const container = findContentContainer(slot);
  if (container === null) return false;

  // Header flag / calc-footer presence must match (they change the row set).
  // Both come from pluginData — far cheaper than a full slot scan.
  if (readHasColumnHeader(slot) !== desired.hasColumnHeader) return false;
  let columnCount = 0;
  for (let i = 0; i < desired.rows.length; i++) {
    if (desired.rows[i].cells.length > columnCount) columnCount = desired.rows[i].cells.length;
  }
  if (!footerPresenceMatches(slot, desired, columnCount)) return false;

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
    for (let c = 0; c < cellFrames.length; c++) {
      const t = cellTextNode(cellFrames[c]);
      if (t !== null) applyCellText(t, desiredCells[c].value);
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
