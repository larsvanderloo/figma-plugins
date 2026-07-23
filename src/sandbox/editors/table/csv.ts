// Parses via the shared RFC 4180-ish tokenizer in `csv/`; a naive
// line.split(',') breaks on quoted cells with embedded commas/quotes.

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
import { readHasColumnHeader } from './plugin-data';

export async function importCSV(slot: SlotNode, csv: string): Promise<void> {
  const hasColumnHeader = readHasColumnHeader(slot);

  const tokenized = tokenize(csv);
  const rows: TableRowModel[] = [];
  for (let i = 0; i < tokenized.rows.length && rows.length < TABLE_MAX_ROWS; i++) {
    const row = tokenized.rows[i];
    // The tokenizer preserves fully-blank rows; filtering them is our job.
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
      // No length cap here; cell text truncates render-side (maxLines + textTruncation in renderer.ts).
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
