import { tokenize } from '../../../../shared/csv';

interface GridClipboardProps {
  maxRows: number;
  maxCols: number;
}

type GridClipboardEmit = (event: 'paste-matrix', row: number, col: number, matrix: string[][]) => void;

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const out = rows.slice();
  while (out.length > 0) {
    const row = out[out.length - 1];
    let allEmpty = true;
    for (let i = 0; i < row.length; i++) {
      if (row[i].length > 0) {
        allEmpty = false;
        break;
      }
    }
    if (!allEmpty) break;
    out.pop();
  }
  return out;
}

function matrixColumnCount(matrix: string[][]): number {
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].length > count) count = matrix[i].length;
  }
  return count;
}

export function createPasteHandler(
  props: GridClipboardProps,
  emit: GridClipboardEmit,
  focusCell: (row: number, col: number) => void,
): (event: ClipboardEvent) => void {
  function onPaste(event: ClipboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    const rowAttr = target.dataset.row;
    const colAttr = target.dataset.col;
    if (rowAttr === undefined || colAttr === undefined) return;
    const text = event.clipboardData !== null ? event.clipboardData.getData('text/plain') : '';
    if (text === '') return;

    // Only spread across cells when the paste carries TABs (real spreadsheet data);
    // a newline-only paste is a paragraph and falls through to the default single-cell paste.
    if (text.indexOf('\t') === -1) return;

    const matrix = trimTrailingEmptyRows(tokenize(text).rows);
    if (matrix.length === 0) return;
    const matrixCols = matrixColumnCount(matrix);
    if (matrixCols === 0) return;
    if (matrix.length === 1 && matrix[0].length === 1) return;

    event.preventDefault();
    const row = Number(rowAttr);
    const col = Number(colAttr);
    emit('paste-matrix', row, col, matrix);

    const targetRow = Math.min(row + matrix.length - 1, props.maxRows - 1);
    const targetCol = Math.min(col + matrixCols - 1, props.maxCols - 1);
    focusCell(targetRow, targetCol);
  }

  return onPaste;
}
