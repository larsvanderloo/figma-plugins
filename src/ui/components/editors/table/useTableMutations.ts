import { ref } from 'vue';
import type {
  TableRowModel,
  TableCellModel,
  TableColumnCalculationSetting,
} from '../../../../shared/types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../../shared/constants';
import { useNotifications } from '../../../stores/useNotifications';
import type { useTableEditorState } from './useTableEditorState';

function matrixColumnCount(matrix: string[][]): number {
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].length > count) count = matrix[i].length;
  }
  return count;
}

export function useTableMutations(state: ReturnType<typeof useTableEditorState>) {
  const notifications = useNotifications();
  const {
    localHasColumnHeader,
    localRows,
    localColumnCalculations,
    localColumnCalculationEmphasis,
    localColumnCalculationCurrency,
    localColumnCalculationPercent,
    localColumnCalculationLabel,
    canAddRow,
    currentCols,
    canAddColumn,
    normalizeLocalColumnCalculations,
    scheduleEmit,
  } = state;

  const gridStatus = ref<string>('');

  function setHasColumnHeader(v: boolean): void {
    if (localHasColumnHeader.value === v) return;
    localHasColumnHeader.value = v;
    if (v && localRows.value.length > 0) {
      for (let j = 0; j < localRows.value[0].cells.length; j++) {
        delete localRows.value[0].cells[j].emphasis;
      }
    }
    scheduleEmit('header-toggle');
  }

  function announce(message: string): void {
    gridStatus.value = '';
    requestAnimationFrame(() => {
      gridStatus.value = message;
    });
  }

  function materializeRow(): number {
    if (!canAddRow.value) return -1;
    const cellCount = currentCols.value > 0 ? Math.min(currentCols.value, TABLE_MAX_COLS) : 1;
    const cells: TableCellModel[] = [];
    for (let j = 0; j < cellCount; j++) cells.push({ cellNodeId: '', value: '' });
    localRows.value.push({ rowNodeId: '', cells: cells });
    return localRows.value.length - 1;
  }

  function createEmptyRow(): TableRowModel {
    const cellCount = currentCols.value > 0 ? Math.min(currentCols.value, TABLE_MAX_COLS) : 1;
    const cells: TableCellModel[] = [];
    for (let j = 0; j < cellCount; j++) cells.push({ cellNodeId: '', value: '' });
    return { rowNodeId: '', cells: cells };
  }

  function insertRowAfter(i: number): void {
    if (!canAddRow.value) return;
    const index = i < 0 ? 0 : i + 1;
    localRows.value.splice(index, 0, createEmptyRow());
    announce('Rij toegevoegd');
    scheduleEmit('add-row');
  }

  function insertRowBefore(i: number): void {
    if (!canAddRow.value) return;
    const index = i < 0 ? 0 : i;
    localRows.value.splice(index, 0, createEmptyRow());
    announce('Rij toegevoegd');
    scheduleEmit('add-row');
  }

  function ensureColumnCount(nextCount: number): void {
    const capped = nextCount > TABLE_MAX_COLS ? TABLE_MAX_COLS : nextCount;
    for (let i = 0; i < localRows.value.length; i++) {
      while (localRows.value[i].cells.length < capped) {
        localRows.value[i].cells.push({ cellNodeId: '', value: '' });
      }
    }
    normalizeLocalColumnCalculations();
  }

  function removeRow(i: number): void {
    if (i < 0 || i >= localRows.value.length) return;
    if (localRows.value.length <= 1) return;
    localRows.value.splice(i, 1);
    if (localHasColumnHeader.value && i === 0) {
      announce('Koprij verwijderd');
    } else {
      const label = localHasColumnHeader.value ? i : i + 1;
      announce('Rij ' + String(label) + ' verwijderd');
    }
    scheduleEmit('remove-row');
  }

  function moveRow(from: number, to: number): void {
    if (from < 0 || from >= localRows.value.length) return;
    const cappedTo = to < 0 ? 0 : to > localRows.value.length ? localRows.value.length : to;
    if (cappedTo === from || cappedTo === from + 1) return;
    const moved = localRows.value.splice(from, 1)[0];
    if (moved === undefined) return;
    const insertAt = from < cappedTo ? cappedTo - 1 : cappedTo;
    localRows.value.splice(insertAt, 0, moved);
    announce('Rij verplaatst');
    scheduleEmit('move-row');
  }

  function insertColumnAfter(j: number): void {
    if (!canAddColumn.value) return;
    const index = j < 0 ? 0 : j + 1;
    for (let i = 0; i < localRows.value.length; i++) {
      localRows.value[i].cells.splice(index, 0, { cellNodeId: '', value: '' });
    }
    localColumnCalculations.value.splice(index, 0, null);
    localColumnCalculationEmphasis.value.splice(index, 0, false);
    localColumnCalculationCurrency.value.splice(index, 0, false);
    localColumnCalculationPercent.value.splice(index, 0, false);
    localColumnCalculationLabel.value.splice(index, 0, '');
    normalizeLocalColumnCalculations();
    announce('Kolom toegevoegd');
    scheduleEmit('add-column');
  }

  function insertColumnBefore(j: number): void {
    if (!canAddColumn.value) return;
    const index = j < 0 ? 0 : j;
    for (let i = 0; i < localRows.value.length; i++) {
      localRows.value[i].cells.splice(index, 0, { cellNodeId: '', value: '' });
    }
    localColumnCalculations.value.splice(index, 0, null);
    localColumnCalculationEmphasis.value.splice(index, 0, false);
    localColumnCalculationCurrency.value.splice(index, 0, false);
    localColumnCalculationPercent.value.splice(index, 0, false);
    localColumnCalculationLabel.value.splice(index, 0, '');
    normalizeLocalColumnCalculations();
    announce('Kolom toegevoegd');
    scheduleEmit('add-column');
  }

  function removeColumn(j: number): void {
    if (j < 0 || j >= currentCols.value) return;
    if (currentCols.value <= 1) return;
    for (let i = 0; i < localRows.value.length; i++) {
      if (j < localRows.value[i].cells.length) {
        localRows.value[i].cells.splice(j, 1);
      }
    }
    localColumnCalculations.value.splice(j, 1);
    localColumnCalculationEmphasis.value.splice(j, 1);
    localColumnCalculationCurrency.value.splice(j, 1);
    localColumnCalculationPercent.value.splice(j, 1);
    localColumnCalculationLabel.value.splice(j, 1);
    normalizeLocalColumnCalculations();
    announce('Kolom ' + String(j + 1) + ' verwijderd');
    scheduleEmit('remove-column');
  }

  function moveColumn(from: number, to: number): void {
    if (from < 0 || from >= currentCols.value) return;
    const cappedTo = to < 0 ? 0 : to > currentCols.value ? currentCols.value : to;
    if (cappedTo === from || cappedTo === from + 1) return;
    const insertAt = from < cappedTo ? cappedTo - 1 : cappedTo;
    for (let i = 0; i < localRows.value.length; i++) {
      const moved = localRows.value[i].cells.splice(from, 1)[0];
      if (moved === undefined) continue;
      localRows.value[i].cells.splice(insertAt, 0, moved);
    }
    const movedCalculation = localColumnCalculations.value.splice(from, 1)[0];
    localColumnCalculations.value.splice(insertAt, 0, movedCalculation === undefined ? null : movedCalculation);
    const movedEmphasis = localColumnCalculationEmphasis.value.splice(from, 1)[0];
    localColumnCalculationEmphasis.value.splice(insertAt, 0, movedEmphasis === true);
    const movedCurrency = localColumnCalculationCurrency.value.splice(from, 1)[0];
    localColumnCalculationCurrency.value.splice(insertAt, 0, movedCurrency === true);
    const movedPercent = localColumnCalculationPercent.value.splice(from, 1)[0];
    localColumnCalculationPercent.value.splice(insertAt, 0, movedPercent === true);
    const movedLabel = localColumnCalculationLabel.value.splice(from, 1)[0];
    localColumnCalculationLabel.value.splice(insertAt, 0, typeof movedLabel === 'string' ? movedLabel : '');
    normalizeLocalColumnCalculations();
    announce('Kolom verplaatst');
    scheduleEmit('move-column');
  }

  function setColumnCalculation(j: number, calculation: TableColumnCalculationSetting): void {
    if (j < 0 || j >= currentCols.value) return;
    normalizeLocalColumnCalculations();
    const next = calculation === 'sum' ? 'sum' : null;
    if (localColumnCalculations.value[j] === next) return;
    localColumnCalculations.value[j] = next;
    // Deliberately overwrites any prior emphasis: a new sum starts emphasized, removal resets.
    localColumnCalculationEmphasis.value[j] = next === 'sum';
    // A sum column shows the computed value, so free label text is cleared.
    if (next === 'sum') localColumnCalculationLabel.value[j] = '';
    if (next !== 'sum') {
      localColumnCalculationCurrency.value[j] = false;
      localColumnCalculationPercent.value[j] = false;
    }
    announce(next === 'sum' ? 'Som toegevoegd' : 'Som verwijderd');
    scheduleEmit('column-calculation');
  }

  function setColumnCalculationEmphasis(j: number, emphasis: boolean): void {
    if (j < 0 || j >= currentCols.value) return;
    normalizeLocalColumnCalculations();
    if (localColumnCalculationEmphasis.value[j] === emphasis) return;
    localColumnCalculationEmphasis.value[j] = emphasis;
    announce(emphasis ? 'Som benadrukt' : 'Nadruk verwijderd');
    scheduleEmit('column-calculation-emphasis');
  }

  function setColumnCalculationCurrency(j: number, currency: boolean): void {
    if (j < 0 || j >= currentCols.value) return;
    normalizeLocalColumnCalculations();
    if (localColumnCalculationCurrency.value[j] === currency) return;
    localColumnCalculationCurrency.value[j] = currency;
    if (currency) localColumnCalculationPercent.value[j] = false;
    announce(currency ? 'Euroteken tonen' : 'Euroteken verbergen');
    scheduleEmit('column-calculation-currency');
  }

  function setColumnCalculationPercent(j: number, percent: boolean): void {
    if (j < 0 || j >= currentCols.value) return;
    normalizeLocalColumnCalculations();
    if (localColumnCalculationPercent.value[j] === percent) return;
    localColumnCalculationPercent.value[j] = percent;
    if (percent) localColumnCalculationCurrency.value[j] = false;
    announce(percent ? 'Procentteken tonen' : 'Procentteken verbergen');
    scheduleEmit('column-calculation-percent');
  }

  function setColumnLabel(j: number, label: string): void {
    if (j < 0 || j >= currentCols.value) return;
    normalizeLocalColumnCalculations();
    if (localColumnCalculationLabel.value[j] === label) return;
    localColumnCalculationLabel.value[j] = label;
    scheduleEmit('column-calculation-label');
  }

  function updateCell(i: number, j: number, value: string): void {
    if (i === localRows.value.length) {
      if (value === '') return;
      const materialized = materializeRow();
      if (materialized < 0) return;
      i = materialized;
      announce('Rij toegevoegd');
    }
    if (j >= currentCols.value) ensureColumnCount(j + 1);
    const row = localRows.value[i];
    if (row === undefined) return;
    const cell = row.cells[j];
    if (cell === undefined || cell.value === value) return;
    cell.value = value;
    scheduleEmit('cell-edit');
  }

  function setCellEmphasis(i: number, j: number, emphasis: boolean): void {
    if (i < 0 || i >= localRows.value.length) return;
    if (j >= currentCols.value) return;
    if (localHasColumnHeader.value && i === 0) return;
    const cell = localRows.value[i]?.cells[j];
    if (cell === undefined) return;
    if ((cell.emphasis === true) === emphasis) return;
    if (emphasis) {
      cell.emphasis = true;
      announce('Cel benadrukt');
    } else {
      delete cell.emphasis;
      announce('Cel niet meer benadrukt');
    }
    scheduleEmit('cell-style');
  }

  function setCellDelta(i: number, j: number, value: string): void {
    if (i < 0 || i >= localRows.value.length) return;
    if (j >= currentCols.value) return;
    if (localHasColumnHeader.value && i === 0) return;
    const cell = localRows.value[i]?.cells[j];
    if (cell === undefined) return;
    const trimmed = value.trim();
    const current = typeof cell.delta === 'string' ? cell.delta : '';
    if (current === trimmed) return;
    if (trimmed === '') {
      delete cell.delta;
      announce('Delta verwijderd');
    } else {
      cell.delta = trimmed;
      announce('Delta ingesteld');
    }
    scheduleEmit('cell-delta');
  }

  function setCellCheck(i: number, j: number, state: boolean | null): void {
    if (i < 0 || i >= localRows.value.length) return;
    if (j >= currentCols.value) return;
    if (localHasColumnHeader.value && i === 0) return;
    const cell = localRows.value[i]?.cells[j];
    if (cell === undefined) return;
    const current = cell.check === true ? true : cell.check === false ? false : null;
    if (current === state) return;
    if (state === null) {
      delete cell.check;
      announce('Vinkje verwijderd');
    } else {
      cell.check = state;
      announce(state ? 'Aangevinkt' : 'Uitgevinkt');
    }
    scheduleEmit('cell-check');
  }

  function setCellBadge(i: number, j: number, value: string): void {
    if (i < 0 || i >= localRows.value.length) return;
    if (j >= currentCols.value) return;
    if (localHasColumnHeader.value && i === 0) return;
    const cell = localRows.value[i]?.cells[j];
    if (cell === undefined) return;
    const trimmed = value.trim();
    const current = typeof cell.badge === 'string' ? cell.badge : '';
    if (current === trimmed) return;
    if (trimmed === '') {
      delete cell.badge;
      announce('Badge verwijderd');
    } else {
      cell.badge = trimmed;
      announce('Badge ingesteld');
    }
    scheduleEmit('cell-badge');
  }

  // Bulk row/column ops write each body cell individually — the model has no
  // row/column-level state, keeping the render/scan/fast-path round-trip per cell.

  function bodyCellsInRow(i: number): TableCellModel[] {
    if (i < 0 || i >= localRows.value.length) return [];
    if (localHasColumnHeader.value && i === 0) return [];
    const row = localRows.value[i];
    return row !== undefined ? row.cells : [];
  }

  function bodyCellsInColumn(j: number): TableCellModel[] {
    if (j < 0 || j >= currentCols.value) return [];
    const out: TableCellModel[] = [];
    for (let i = 0; i < localRows.value.length; i++) {
      if (localHasColumnHeader.value && i === 0) continue;
      const cell = localRows.value[i]?.cells[j];
      if (cell !== undefined) out.push(cell);
    }
    return out;
  }

  function applyEmphasis(cells: TableCellModel[], on: boolean): boolean {
    let changed = false;
    for (const cell of cells) {
      if ((cell.emphasis === true) === on) continue;
      if (on) cell.emphasis = true;
      else delete cell.emphasis;
      changed = true;
    }
    return changed;
  }

  function applyCheck(cells: TableCellModel[], state: boolean | null): boolean {
    let changed = false;
    for (const cell of cells) {
      const current = cell.check === true ? true : cell.check === false ? false : null;
      if (current === state) continue;
      if (state === null) delete cell.check;
      else cell.check = state;
      changed = true;
    }
    return changed;
  }

  // Bulk badge toggles presence only: on seeds '0' where no badge exists (existing
  // values are kept), off removes all; the value itself is typed per cell.
  function applyBadge(cells: TableCellModel[], on: boolean): boolean {
    let changed = false;
    for (const cell of cells) {
      const has = typeof cell.badge === 'string' && cell.badge.trim() !== '';
      if (on && !has) {
        cell.badge = '0';
        changed = true;
      } else if (!on && has) {
        delete cell.badge;
        changed = true;
      }
    }
    return changed;
  }

  function setRowEmphasis(i: number, on: boolean): void {
    if (!applyEmphasis(bodyCellsInRow(i), on)) return;
    announce(on ? 'Rij benadrukt' : 'Nadruk van rij verwijderd');
    scheduleEmit('row-style');
  }

  function setColumnEmphasis(j: number, on: boolean): void {
    if (!applyEmphasis(bodyCellsInColumn(j), on)) return;
    announce(on ? 'Kolom benadrukt' : 'Nadruk van kolom verwijderd');
    scheduleEmit('column-style');
  }

  function setRowCheck(i: number, state: boolean | null): void {
    if (!applyCheck(bodyCellsInRow(i), state)) return;
    announce(state === null ? 'Vinkjes van rij verwijderd' : state ? 'Rij aangevinkt' : 'Rij uitgevinkt');
    scheduleEmit('row-check');
  }

  function setColumnCheck(j: number, state: boolean | null): void {
    if (!applyCheck(bodyCellsInColumn(j), state)) return;
    announce(
      state === null ? 'Vinkjes van kolom verwijderd' : state ? 'Kolom aangevinkt' : 'Kolom uitgevinkt',
    );
    scheduleEmit('column-check');
  }

  function setRowBadge(i: number, on: boolean): void {
    if (!applyBadge(bodyCellsInRow(i), on)) return;
    announce(on ? 'Badges aan rij toegevoegd' : 'Badges van rij verwijderd');
    scheduleEmit('row-badge');
  }

  function setColumnBadge(j: number, on: boolean): void {
    if (!applyBadge(bodyCellsInColumn(j), on)) return;
    announce(on ? 'Badges aan kolom toegevoegd' : 'Badges van kolom verwijderd');
    scheduleEmit('column-badge');
  }

  function pasteMatrix(i: number, j: number, matrix: string[][]): void {
    if (matrix.length === 0) return;
    const matrixCols = matrixColumnCount(matrix);
    if (matrixCols === 0) return;

    if (i === localRows.value.length) {
      const materialized = materializeRow();
      if (materialized < 0) return;
      i = materialized;
    }

    const neededRowsRaw = i + matrix.length;
    const neededColsRaw = j + matrixCols;
    const neededRows = neededRowsRaw > TABLE_MAX_ROWS ? TABLE_MAX_ROWS : neededRowsRaw;
    const neededCols = neededColsRaw > TABLE_MAX_COLS ? TABLE_MAX_COLS : neededColsRaw;

    while (localRows.value.length < neededRows) {
      const cells: TableCellModel[] = [];
      const cellCount = currentCols.value > 0 ? currentCols.value : 1;
      for (let c = 0; c < cellCount; c++) cells.push({ cellNodeId: '', value: '' });
      localRows.value.push({ rowNodeId: '', cells: cells });
    }
    ensureColumnCount(neededCols);

    let writtenRows = 0;
    let writtenCols = 0;
    for (let r = 0; r < matrix.length && i + r < TABLE_MAX_ROWS; r++) {
      const row = localRows.value[i + r];
      if (row === undefined) break;
      writtenRows += 1;
      const source = matrix[r];
      for (let c = 0; c < source.length && j + c < TABLE_MAX_COLS; c++) {
        const cell = row.cells[j + c];
        if (cell === undefined) continue;
        cell.value = source[c].trim();
        if (c + 1 > writtenCols) writtenCols = c + 1;
      }
    }

    const truncated = neededRowsRaw > TABLE_MAX_ROWS || neededColsRaw > TABLE_MAX_COLS;
    if (truncated) {
      notifications.pushInfo(
        'Plakken afgekapt',
        'Max ' + String(TABLE_MAX_ROWS) + ' rijen · ' + String(TABLE_MAX_COLS) + ' kolommen.',
      );
      announce(
        'Plakken afgekapt op ' +
          String(TABLE_MAX_ROWS) +
          ' rijen en ' +
          String(TABLE_MAX_COLS) +
          ' kolommen',
      );
    } else {
      announce('Geplakt: ' + String(writtenRows) + ' rijen x ' + String(writtenCols) + ' kolommen');
    }
    scheduleEmit('paste-matrix');
  }

  return {
    gridStatus,
    setHasColumnHeader,
    updateCell,
    setCellEmphasis,
    setCellDelta,
    setCellCheck,
    setCellBadge,
    setRowEmphasis,
    setColumnEmphasis,
    setRowCheck,
    setColumnCheck,
    setRowBadge,
    setColumnBadge,
    setColumnCalculation,
    setColumnCalculationEmphasis,
    setColumnCalculationCurrency,
    setColumnCalculationPercent,
    setColumnLabel,
    insertRowBefore,
    insertRowAfter,
    removeRow,
    insertColumnBefore,
    insertColumnAfter,
    removeColumn,
    moveRow,
    moveColumn,
    pasteMatrix,
  };
}
