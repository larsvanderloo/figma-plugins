// ============================================================
// editors/table/csv.ts
//
// CSV-import → applyTable-adapter (T34.2).
//
// Plat CSV-parse: split op line-endings (CRLF of LF), split elke rij op
// komma's, trim whitespace. Geen quoted-field escaping (out-of-scope voor
// v0.2.0; user kan bij foute cellen nog handmatig corrigeren).
//
// Truncate naar TABLE_MAX_ROWS rijen en TABLE_MAX_COLS[width] kolommen.
// De Slot-width wordt niet gewijzigd door import — user blijft in control
// via de width-picker.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableWrapModel, TableRowModel, TableCellModel } from '../../types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../constants';
import { applyTable } from './renderer';

type WidthKey = 'sm' | 'md' | 'lg';

function readWidth(slot: SlotNode): WidthKey {
  const v = slot.getPluginData('width');
  if (v === 'sm' || v === 'md' || v === 'lg') return v;
  return 'md';
}

function readHasColumnHeader(slot: SlotNode): boolean {
  // T40: '1' = true, alles anders (incl. afwezig) = false (default).
  return slot.getPluginData('hasColumnHeader') === '1';
}

function readTextSize(slot: SlotNode): 'sm' | 'md' | 'lg' {
  // T42.9: textSize-preset terug, default 'md'.
  const v = slot.getPluginData('textSize');
  if (v === 'sm' || v === 'md' || v === 'lg') return v;
  return 'md';
}

export async function importCSV(slot: SlotNode, csv: string): Promise<void> {
  const width = readWidth(slot);
  const hasColumnHeader = readHasColumnHeader(slot);
  const textSize = readTextSize(slot);
  const maxCols = TABLE_MAX_COLS[width];

  const lines = csv.split(/\r?\n/);
  const rows: TableRowModel[] = [];
  for (let i = 0; i < lines.length && rows.length < TABLE_MAX_ROWS; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    const fields = line.split(',');
    const cells: TableCellModel[] = [];
    for (let j = 0; j < fields.length && cells.length < maxCols; j++) {
      // T42.16: input-cap verwijderd; truncation gebeurt rendertime via
      // maxLines+textTruncation in renderer.ts.
      cells.push({ cellNodeId: '', value: fields[j].trim() });
    }
    if (cells.length > 0) {
      rows.push({ rowNodeId: '', cells: cells });
    }
  }

  const desired: TableWrapModel = {
    slotId: slot.id,
    width: width,
    hasColumnHeader: hasColumnHeader,
    textSize: textSize,
    rows: rows,
  };
  await applyTable(slot, desired);
}
