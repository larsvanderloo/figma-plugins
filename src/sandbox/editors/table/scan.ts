// Canvas is leading: row/cell structure comes from the FRAMEs in the Slot,
// header/calculation flags from pluginData. Legacy `textSize` pluginData is
// ignored — applyTable derives fontSize from slot.height + rows.length.

import type { TableWrapModel, TableRowModel, TableCellModel } from '../../../shared/types';
import { CELL_VALUE_NAME } from './build-rows';
import {
  readHasColumnHeader,
  readColumnCalculations,
  readColumnCalculationEmphasis,
  readColumnCalculationCurrency,
  readColumnCalculationPercent,
  readColumnCalculationLabel,
} from './plugin-data';

// Queried per line so mixed bullet/prose cells scan correctly.
// getRangeListOptions can return figma.mixed; that does not count as a bullet.
function rangeIsUnordered(text: TextNode, start: number, end: number): boolean {
  if (end <= start) return false;
  try {
    const opts = text.getRangeListOptions(start, end);
    if (opts === figma.mixed) return false;
    return (opts as TextListOptions).type === 'UNORDERED';
  } catch (_e) {
    return false;
  }
}

// Rebuild the markers-in-the-string form (`- ` prefix per UNORDERED line) so
// per-line bullet state survives the scan → iframe → re-apply round-trip.
function reconstructBulletMarkers(text: TextNode): string {
  const chars = text.characters;
  const lines = chars.split('\n');
  const out: string[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bullet = line.length > 0 && rangeIsUnordered(text, offset, offset + line.length);
    out.push(bullet ? '- ' + line : line);
    offset += line.length + 1;
  }
  return out.join('\n');
}

export function scanTableSlot(slot: SlotNode): TableWrapModel {
  // Older slides carried the marker as `kind='welder-table'` + `v='2'`; the
  // canonical marker is now `kind='welder-tablewrap'` + `v='3'` on the Slot.
  // On a legacy marker just log and continue — canvas is leading, no migration.
  const legacyKind = slot.getPluginData('kind');
  const legacyV = slot.getPluginData('v');
  if (legacyKind === 'welder-table' && legacyV === '2') {
    console.log(
      '[welder-slide-editor] T34.4 legacy pluginData detected (v0.1.x format) — using canvas-truth',
    );
  }

  // Rows sit either directly in the Slot (legacy layout, no outer wrapper) or
  // inside a `WelderTableContent` container (current layout, border+padding).
  let rowParent: SlotNode | FrameNode = slot;
  for (let i = 0; i < slot.children.length; i++) {
    const child = slot.children[i];
    if (child.type === 'FRAME' && child.name === 'WelderTableContent') {
      rowParent = child as FrameNode;
      break;
    }
  }

  const rows: TableRowModel[] = [];
  for (let i = 0; i < rowParent.children.length; i++) {
    const rowNode = rowParent.children[i];
    if (rowNode.type !== 'FRAME') continue;
    // Also match TableHeaderRow so a re-edit does not drop the header row.
    if (rowNode.name.indexOf('TableRow') !== 0 && rowNode.name.indexOf('TableHeaderRow') !== 0)
      continue;
    const rowFrame = rowNode as FrameNode;

    const cells: TableCellModel[] = [];
    for (let j = 0; j < rowFrame.children.length; j++) {
      const cellNode = rowFrame.children[j];
      if (cellNode.type !== 'FRAME') continue;
      if (
        cellNode.name.indexOf('TableItem') !== 0 &&
        cellNode.name.indexOf('TableHeaderItem') !== 0
      )
        continue;
      const cellFrame = cellNode as FrameNode;

      // Look up the value TEXT by name — delta cells carry a second 'CellDelta'
      // TEXT; fall back to the first TEXT for cells built before the naming.
      let textNode = cellFrame.findOne(
        (n: SceneNode) => n.type === 'TEXT' && n.name === CELL_VALUE_NAME,
      );
      if (textNode === null) {
        textNode = cellFrame.findOne((n: SceneNode) => n.type === 'TEXT');
      }
      let value = '';
      if (textNode !== null && textNode.type === 'TEXT') {
        value = reconstructBulletMarkers(textNode as TextNode);
      }
      const emphasis = cellFrame.getPluginData('emphasis') === '1';
      const delta = cellFrame.getPluginData('delta');
      const cellModel: TableCellModel = { cellNodeId: cellFrame.id, value: value, emphasis: emphasis };
      if (delta !== '') cellModel.delta = delta;
      // 'check' is tri-state: '1'/'0'/unset — unset must stay undefined, not false.
      const check = cellFrame.getPluginData('check');
      if (check === '1') cellModel.check = true;
      else if (check === '0') cellModel.check = false;
      const numberBadge = cellFrame.getPluginData('badge');
      if (numberBadge !== '') cellModel.badge = numberBadge;
      cells.push(cellModel);
    }
    rows.push({ rowNodeId: rowFrame.id, cells: cells });
  }

  let scannedColumnCount = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > scannedColumnCount) scannedColumnCount = rows[i].cells.length;
  }

  return {
    slotId: slot.id,
    hasColumnHeader: readHasColumnHeader(slot),
    columnCalculations: readColumnCalculations(slot, scannedColumnCount),
    columnCalculationEmphasis: readColumnCalculationEmphasis(slot, scannedColumnCount),
    columnCalculationCurrency: readColumnCalculationCurrency(slot, scannedColumnCount),
    columnCalculationPercent: readColumnCalculationPercent(slot, scannedColumnCount),
    columnCalculationLabel: readColumnCalculationLabel(slot, scannedColumnCount),
    rows: rows,
  };
}
