// ============================================================
// components/editors/table/useTableEditorState.ts
//
// Local mirror of the TableWrapModel for the table editor: editable
// copies of rows, header flag and column-calculation settings.
//
// Syncs from incoming props behind an echo guard (our own emits
// bounce back over the message bus) and debounces the outgoing
// `update:modelValue` emit via scheduleEmit.
// ============================================================

import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type {
  TableWrapModel,
  TableRowModel,
  TableCellModel,
  TableColumnCalculationSetting,
} from '../../../../shared/types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../../shared/constants';
import {
  columnCalculationsEqual,
  columnEmphasisEqual,
  columnLabelsEqual,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
  normalizeColumnLabels,
} from '../../../../shared/table-calculations';
import { debugLog } from '../../../../shared/debug';

export interface TableEditorProps {
  modelValue: TableWrapModel;
}

function cloneRows(rows: TableRowModel[]): TableRowModel[] {
  let maxLen = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > maxLen) maxLen = rows[i].cells.length;
  }
  const out: TableRowModel[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells: TableCellModel[] = [];
    for (let j = 0; j < rows[i].cells.length; j++) {
      const cell: TableCellModel = {
        cellNodeId: rows[i].cells[j].cellNodeId,
        value: rows[i].cells[j].value,
      };
      if (rows[i].cells[j].emphasis === true) cell.emphasis = true;
      const delta = rows[i].cells[j].delta;
      if (typeof delta === 'string' && delta.trim() !== '') cell.delta = delta;
      cells.push(cell);
    }
    while (cells.length < maxLen) cells.push({ cellNodeId: '', value: '' });
    out.push({ rowNodeId: rows[i].rowNodeId, cells: cells });
  }
  return out;
}

function columnCountForRows(rows: TableRowModel[]): number {
  if (rows.length === 0) return 1;
  return rows[0].cells.length > 0 ? rows[0].cells.length : 1;
}

// Guarantee the local grid always has at least one editable row. A scanned
// TableWrap with no content scans to 0 rows, which would render an empty,
// un-editable grid (no cells to focus/type into). Seed a single empty row of
// `cols` columns so the editor is always usable; the canvas only renders
// non-empty rows, so this seed costs nothing visually until the user types.
function ensureNonEmpty(rows: TableRowModel[], cols: number): TableRowModel[] {
  if (rows.length > 0) return rows;
  const safeCols = cols > 0 ? cols : 1;
  const cells: TableCellModel[] = [];
  for (let j = 0; j < safeCols; j++) cells.push({ cellNodeId: '', value: '' });
  return [{ rowNodeId: '', cells: cells }];
}

function rowsDiffer(a: TableRowModel[], b: TableRowModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].cells.length !== b[i].cells.length) return true;
    for (let j = 0; j < a[i].cells.length; j++) {
      if (a[i].cells[j].value !== b[i].cells[j].value) return true;
      if ((a[i].cells[j].emphasis === true) !== (b[i].cells[j].emphasis === true)) return true;
      const aDelta = typeof a[i].cells[j].delta === 'string' ? a[i].cells[j].delta : '';
      const bDelta = typeof b[i].cells[j].delta === 'string' ? b[i].cells[j].delta : '';
      if (aDelta !== bDelta) return true;
    }
  }
  return false;
}

export function useTableEditorState(
  props: TableEditorProps,
  emit: (event: 'update:modelValue', value: TableWrapModel) => void,
) {
  const localHasColumnHeader = ref<boolean>(props.modelValue.hasColumnHeader);
  const localRows = ref<TableRowModel[]>(
    ensureNonEmpty(
      cloneRows(props.modelValue.rows),
      columnCountForRows(props.modelValue.rows),
    ),
  );
  const localColumnCalculations = ref<TableColumnCalculationSetting[]>(
    normalizeColumnCalculations(
      props.modelValue.columnCalculations,
      columnCountForRows(props.modelValue.rows),
    ),
  );
  const localColumnCalculationEmphasis = ref<boolean[]>(
    normalizeColumnEmphasis(
      props.modelValue.columnCalculationEmphasis,
      columnCountForRows(props.modelValue.rows),
    ),
  );
  const localColumnCalculationCurrency = ref<boolean[]>(
    normalizeColumnEmphasis(
      props.modelValue.columnCalculationCurrency,
      columnCountForRows(props.modelValue.rows),
    ),
  );
  const localColumnCalculationPercent = ref<boolean[]>(
    normalizeColumnEmphasis(
      props.modelValue.columnCalculationPercent,
      columnCountForRows(props.modelValue.rows),
    ),
  );
  const localColumnCalculationLabel = ref<string[]>(
    normalizeColumnLabels(
      props.modelValue.columnCalculationLabel,
      columnCountForRows(props.modelValue.rows),
    ),
  );

  const canAddRow = computed<boolean>(() => localRows.value.length < TABLE_MAX_ROWS);
  const currentCols = computed<number>(() => columnCountForRows(localRows.value));
  const canAddColumn = computed<boolean>(
    () => localRows.value.length > 0 && currentCols.value < TABLE_MAX_COLS,
  );
  watch(
    () => props.modelValue.hasColumnHeader,
    (next) => {
      if (next !== localHasColumnHeader.value) localHasColumnHeader.value = next;
    },
  );

  function normalizeLocalColumnCalculations(): void {
    localColumnCalculations.value = normalizeColumnCalculations(
      localColumnCalculations.value,
      currentCols.value,
    );
    localColumnCalculationEmphasis.value = normalizeColumnEmphasis(
      localColumnCalculationEmphasis.value,
      currentCols.value,
    );
    localColumnCalculationCurrency.value = normalizeColumnEmphasis(
      localColumnCalculationCurrency.value,
      currentCols.value,
    );
    localColumnCalculationPercent.value = normalizeColumnEmphasis(
      localColumnCalculationPercent.value,
      currentCols.value,
    );
    localColumnCalculationLabel.value = normalizeColumnLabels(
      localColumnCalculationLabel.value,
      currentCols.value,
    );
  }

  let echoExpected = false;
  let echoResetTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingReason = '';

  watch(
    () => props.modelValue.rows,
    (next) => {
      if (echoExpected) return;
      if (rowsDiffer(next, localRows.value)) {
        localRows.value = ensureNonEmpty(cloneRows(next), columnCountForRows(next));
        normalizeLocalColumnCalculations();
      }
    },
  );
  watch(
    () => props.modelValue.columnCalculations,
    (next) => {
      if (echoExpected) return;
      if (!columnCalculationsEqual(next, localColumnCalculations.value, currentCols.value)) {
        localColumnCalculations.value = normalizeColumnCalculations(next, currentCols.value);
      }
    },
  );
  watch(
    () => props.modelValue.columnCalculationEmphasis,
    (next) => {
      if (echoExpected) return;
      if (!columnEmphasisEqual(next, localColumnCalculationEmphasis.value, currentCols.value)) {
        localColumnCalculationEmphasis.value = normalizeColumnEmphasis(next, currentCols.value);
      }
    },
  );
  watch(
    () => props.modelValue.columnCalculationCurrency,
    (next) => {
      if (echoExpected) return;
      if (!columnEmphasisEqual(next, localColumnCalculationCurrency.value, currentCols.value)) {
        localColumnCalculationCurrency.value = normalizeColumnEmphasis(next, currentCols.value);
      }
    },
  );
  watch(
    () => props.modelValue.columnCalculationPercent,
    (next) => {
      if (echoExpected) return;
      if (!columnEmphasisEqual(next, localColumnCalculationPercent.value, currentCols.value)) {
        localColumnCalculationPercent.value = normalizeColumnEmphasis(next, currentCols.value);
      }
    },
  );
  watch(
    () => props.modelValue.columnCalculationLabel,
    (next) => {
      if (echoExpected) return;
      if (!columnLabelsEqual(next, localColumnCalculationLabel.value, currentCols.value)) {
        localColumnCalculationLabel.value = normalizeColumnLabels(next, currentCols.value);
      }
    },
  );
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleEmit(reason: string): void {
    pendingReason = reason;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      echoExpected = true;
      if (echoResetTimer !== null) clearTimeout(echoResetTimer);
      echoResetTimer = setTimeout(() => {
        echoExpected = false;
        echoResetTimer = null;
      }, 2000);
      debugLog('table-editor', 'emit-update', {
        reason: pendingReason,
        slotId: props.modelValue.slotId,
        rows: localRows.value.length,
        cols: currentCols.value,
      });
      const rows = cloneRows(localRows.value);
      if (localHasColumnHeader.value && rows.length > 0) {
        // Koprij draagt geen per-cell emphasis of delta-badge.
        for (let j = 0; j < rows[0].cells.length; j++) {
          delete rows[0].cells[j].emphasis;
          delete rows[0].cells[j].delta;
        }
      }
      const columnCalculations = normalizeColumnCalculations(
        localColumnCalculations.value,
        currentCols.value,
      );
      const columnCalculationEmphasis = normalizeColumnEmphasis(
        localColumnCalculationEmphasis.value,
        currentCols.value,
      );
      const columnCalculationCurrency = normalizeColumnEmphasis(
        localColumnCalculationCurrency.value,
        currentCols.value,
      );
      const columnCalculationPercent = normalizeColumnEmphasis(
        localColumnCalculationPercent.value,
        currentCols.value,
      );
      const columnCalculationLabel = normalizeColumnLabels(
        localColumnCalculationLabel.value,
        currentCols.value,
      );
      emit('update:modelValue', {
        slotId: props.modelValue.slotId,
        hasColumnHeader: localHasColumnHeader.value,
        columnCalculations: columnCalculations,
        columnCalculationEmphasis: columnCalculationEmphasis,
        columnCalculationCurrency: columnCalculationCurrency,
        columnCalculationPercent: columnCalculationPercent,
        columnCalculationLabel: columnCalculationLabel,
        rows: rows,
      });
    }, 200);
  }

  onBeforeUnmount(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (echoResetTimer !== null) clearTimeout(echoResetTimer);
  });

  return {
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
  };
}
