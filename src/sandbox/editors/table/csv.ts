// ============================================================
// editors/table/csv.ts
//
// CSV-import → applyTable-adapter.
//
// Parsing leunt op de gedeelde RFC 4180-achtige tokenizer in
// `csv/`. Die module ondersteunt:
//   - dialect-detectie (',' / ';' / tab)
//   - quoted cells met embedded comma's én quotes (""-escape)
//   - meerregelige cellen binnen quotes
//
// De vorige `line.split(',')`-implementatie brak op alledaagse CSV-
// formats — bv. een cel "Acme, Inc.,100" werd in 3 cellen geknipt en
// liet de quotes letterlijk op de waarde staan.
//
// Truncate naar TABLE_MAX_ROWS rijen en TABLE_MAX_COLS kolommen (flat
// max — de Slot-breedte rendert altijd full-width per surface).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableWrapModel, TableRowModel, TableCellModel } from '../../../shared/types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../shared/constants';
import { tokenize } from '../../../shared/csv';
import {
  applyTable,
  readColumnCalculations,
  readColumnCalculationEmphasis,
  readColumnCalculationCurrency,
  readColumnCalculationPercent,
  readColumnCalculationLabel,
} from './renderer';

function readHasColumnHeader(slot: SlotNode): boolean {
  // '1' = true, alles anders (incl. afwezig) = false (default).
  return slot.getPluginData('hasColumnHeader') === '1';
}

export async function importCSV(slot: SlotNode, csv: string): Promise<void> {
  const hasColumnHeader = readHasColumnHeader(slot);

  const tokenized = tokenize(csv);
  const rows: TableRowModel[] = [];
  for (let i = 0; i < tokenized.rows.length && rows.length < TABLE_MAX_ROWS; i++) {
    const row = tokenized.rows[i];
    // Tokenizer preserves empty rows (caller's responsibility to filter).
    // Skip rows that are entirely empty cells — matches the previous
    // behaviour where pure-blank lines were dropped.
    let allEmpty = true;
    for (let j = 0; j < row.length; j++) {
      if (row[j].length > 0) {
        allEmpty = false;
        break;
      }
    }
    if (allEmpty) continue;

    const cells: TableCellModel[] = [];
    for (let j = 0; j < row.length && cells.length < TABLE_MAX_COLS; j++) {
      // Input-cap verwijderd; truncation gebeurt rendertime via
      // maxLines+textTruncation in renderer.ts.
      cells.push({ cellNodeId: '', value: row[j].trim() });
    }
    if (cells.length > 0) {
      rows.push({ rowNodeId: '', cells: cells });
    }
  }
  let columnCount = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > columnCount) columnCount = rows[i].cells.length;
  }

  const desired: TableWrapModel = {
    slotId: slot.id,
    hasColumnHeader: hasColumnHeader,
    columnCalculations: readColumnCalculations(slot, columnCount),
    columnCalculationEmphasis: readColumnCalculationEmphasis(slot, columnCount),
    columnCalculationCurrency: readColumnCalculationCurrency(slot, columnCount),
    columnCalculationPercent: readColumnCalculationPercent(slot, columnCount),
    columnCalculationLabel: readColumnCalculationLabel(slot, columnCount),
    rows: rows,
  };
  await applyTable(slot, desired);
}
