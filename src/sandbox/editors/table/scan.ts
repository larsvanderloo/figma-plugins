// ============================================================
// editors/table/scan.ts
//
// Scan — lees huidige Slot-content in een TableWrapModel.
// Canvas is leading: rij/cel-structuur komt uit de FRAMEs in de Slot,
// header/calculation-flags uit pluginData (via `./plugin-data`).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

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

/**
 * Lees de huidige Slot-inhoud. Row-FRAMEs heten `TableRow-*`,
 * cell-FRAMEs `TableItem-*`; overige kinderen worden overgeslagen.
 *
 * Legacy `textSize`-pluginData wordt niet meer gelezen — fontSize
 * wordt door applyTable afgeleid uit slot.height + rows.length.
 */
// True wanneer de tekst-range [start,end) een UNORDERED-lijst is. Per regel
// bevraagd zodat gemengde bullet/prosa-cellen kloppen. getRangeListOptions kan
// figma.mixed teruggeven; dat telt niet als bullet. FIG-GUARD-01: type-check
// vóór property-access.
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

// Reconstrueer de markers-in-de-string representatie uit een TEXT-node: per
// regel een `- ` prefix wanneer die regel een UNORDERED-lijstregel is. Zo
// blijft de bullet-state (per regel) bewaard over de scan → iframe →
// re-apply round-trip, inclusief gemengde bullet/prosa-cellen.
function reconstructBulletMarkers(text: TextNode): string {
  const chars = text.characters;
  const lines = chars.split('\n');
  const out: string[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bullet = line.length > 0 && rangeIsUnordered(text, offset, offset + line.length);
    out.push(bullet ? '- ' + line : line);
    offset += line.length + 1; // +1 voor de '\n'
  }
  return out.join('\n');
}

export function scanTableSlot(slot: SlotNode): TableWrapModel {
  // Legacy-detection: oude v0.1.x slides hadden pluginData op de
  // TableWrap-INSTANCE met `kind='welder-table'` + `v='2'`; nu zit de
  // canonieke marker op de Slot zelf als `kind='welder-tablewrap'` + `v='3'`.
  // Als we een oude marker zien, log het en ga door met canvas-truth
  // (geen data-mapping, de canvas is leading).
  const legacyKind = slot.getPluginData('kind');
  const legacyV = slot.getPluginData('v');
  if (legacyKind === 'welder-table' && legacyV === '2') {
    console.log(
      '[welder-slide-editor] T34.4 legacy pluginData detected (v0.1.x format) — using canvas-truth',
    );
  }

  // Rows kunnen ofwel direct in de Slot staan (legacy layout, geen outer
  // wrapper) of genest in een `WelderTableContent`-container (huidige layout
  // met border+padding). Zoek eerst de container; fallback op slot.children.
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
    // Matcht óók TableHeaderRow zodat re-edit de header-rij niet verliest.
    if (rowNode.name.indexOf('TableRow') !== 0 && rowNode.name.indexOf('TableHeaderRow') !== 0)
      continue;
    const rowFrame = rowNode as FrameNode;

    const cells: TableCellModel[] = [];
    for (let j = 0; j < rowFrame.children.length; j++) {
      const cellNode = rowFrame.children[j];
      if (cellNode.type !== 'FRAME') continue;
      // Matcht óók TableHeaderItem (header-cells).
      if (
        cellNode.name.indexOf('TableItem') !== 0 &&
        cellNode.name.indexOf('TableHeaderItem') !== 0
      )
        continue;
      const cellFrame = cellNode as FrameNode;

      // Waarde-TEXT bij naam (delta-cellen dragen een tweede 'CellDelta'-TEXT);
      // fallback op de eerste TEXT voor cellen die vóór de naamgeving zijn gebouwd.
      let textNode = cellFrame.findOne(
        (n: SceneNode) => n.type === 'TEXT' && n.name === CELL_VALUE_NAME,
      );
      if (textNode === null) {
        textNode = cellFrame.findOne((n: SceneNode) => n.type === 'TEXT');
      }
      // Canvas stript de bullet-markers en zet UNORDERED list-styling per
      // bullet-regel (zie build-rows). Het model is leading op de
      // markers-in-de-string representatie, dus reconstrueren we de `- `
      // prefixes per regel uit de list-options. Zo blijft de (per-regel)
      // bullet-state bewaard over de scan → iframe → re-apply round-trip.
      let value = '';
      if (textNode !== null && textNode.type === 'TEXT') {
        value = reconstructBulletMarkers(textNode as TextNode);
      }
      const emphasis = cellFrame.getPluginData('emphasis') === '1';
      const delta = cellFrame.getPluginData('delta');
      const cellModel: TableCellModel = { cellNodeId: cellFrame.id, value: value, emphasis: emphasis };
      if (delta !== '') cellModel.delta = delta;
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
