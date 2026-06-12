<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type {
  TableWrapModel,
  TableRowModel,
  TableCellModel,
  TableColumnCalculationSetting,
} from '../../../shared/types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../shared/constants';
import { tokenize } from '../../../shared/csv';
import {
  columnCalculationsEqual,
  columnEmphasisEqual,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';
import { debugLog } from '../../../shared/debug';
import { useNotifications } from '../../stores/useNotifications';
import TableGrid from './table/TableGrid.vue';
import WCard from '../ui/WCard.vue';

const notifications = useNotifications();

interface Props {
  modelValue: TableWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TableWrapModel];
  'import-csv': [csv: string];
}>();

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

const localHasColumnHeader = ref<boolean>(props.modelValue.hasColumnHeader);
const localRows = ref<TableRowModel[]>(cloneRows(props.modelValue.rows));
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

const canAddRow = computed<boolean>(() => localRows.value.length < TABLE_MAX_ROWS);
const currentCols = computed<number>(() => columnCountForRows(localRows.value));
const canAddColumn = computed<boolean>(
  () => localRows.value.length > 0 && currentCols.value < TABLE_MAX_COLS,
);
const gridStatus = ref<string>('');
watch(
  () => props.modelValue.hasColumnHeader,
  (next) => {
    if (next !== localHasColumnHeader.value) localHasColumnHeader.value = next;
  },
);
function rowsDiffer(a: TableRowModel[], b: TableRowModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].cells.length !== b[i].cells.length) return true;
    for (let j = 0; j < a[i].cells.length; j++) {
      if (a[i].cells[j].value !== b[i].cells[j].value) return true;
      if ((a[i].cells[j].emphasis === true) !== (b[i].cells[j].emphasis === true)) return true;
    }
  }
  return false;
}

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
}

let echoExpected = false;
let echoResetTimer: ReturnType<typeof setTimeout> | null = null;
let pendingReason = '';

watch(
  () => props.modelValue.rows,
  (next) => {
    if (echoExpected) return;
    if (rowsDiffer(next, localRows.value)) {
      localRows.value = cloneRows(next);
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
      for (let j = 0; j < rows[0].cells.length; j++) delete rows[0].cells[j].emphasis;
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
    emit('update:modelValue', {
      slotId: props.modelValue.slotId,
      hasColumnHeader: localHasColumnHeader.value,
      columnCalculations: columnCalculations,
      columnCalculationEmphasis: columnCalculationEmphasis,
      columnCalculationCurrency: columnCalculationCurrency,
      rows: rows,
    });
  }, 200);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  if (lastImportTimer !== null) clearTimeout(lastImportTimer);
  if (echoResetTimer !== null) clearTimeout(echoResetTimer);
});
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
  // Nadruk staat standaard aan voor een nieuwe som; bij verwijderen reset.
  localColumnCalculationEmphasis.value[j] = next === 'sum';
  if (next !== 'sum') localColumnCalculationCurrency.value[j] = false;
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
  announce(currency ? 'Euroteken tonen' : 'Euroteken verbergen');
  scheduleEmit('column-calculation-currency');
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

function matrixColumnCount(matrix: string[][]): number {
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].length > count) count = matrix[i].length;
  }
  return count;
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
const csvText = ref<string>('');
const csvUploadFile = ref<File | null>(null);
const csvError = ref<string>('');

function validateCSV(text: string): string {
  const rows = tokenize(text).rows;
  const nonEmpty = rows.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return 'CSV is leeg.';
  if (nonEmpty.length > TABLE_MAX_ROWS) {
    return `Maximum ${TABLE_MAX_ROWS} rijen — CSV heeft er ${nonEmpty.length}.`;
  }
  for (let i = 0; i < nonEmpty.length; i++) {
    const cellCount = nonEmpty[i].length;
    if (cellCount > TABLE_MAX_COLS) {
      return `Rij ${i + 1}: ${cellCount} kolommen — max ${TABLE_MAX_COLS}.`;
    }
  }
  return '';
}
const lastImport = ref<{ fileName: string | null; rows: number; cols: number } | null>(null);
let lastImportTimer: ReturnType<typeof setTimeout> | null = null;

function clearLastImport(): void {
  lastImport.value = null;
  if (lastImportTimer !== null) {
    clearTimeout(lastImportTimer);
    lastImportTimer = null;
  }
}

function recordImport(text: string, fileName: string | null): void {
  const rows = tokenize(text).rows.filter((r) => r.some((c) => c.length > 0));
  const cols = rows.reduce((m, r) => (r.length > m ? r.length : m), 0);
  lastImport.value = { fileName, rows: rows.length, cols };
  if (lastImportTimer !== null) clearTimeout(lastImportTimer);
  lastImportTimer = setTimeout(clearLastImport, 10_000);
}

function applyCSV(fileName: string | null = null): void {
  const text = csvText.value.trim();
  if (text === '') return;
  const err = validateCSV(text);
  if (err !== '') {
    csvError.value = err;
    notifications.pushError('CSV-import mislukt', err);
    return;
  }
  csvError.value = '';
  emit('import-csv', text);
  recordImport(text, fileName);
  csvText.value = '';
}

function onCsvFileChange(file: File | null | undefined): void {
  if (file === null || file === undefined) return;
  clearLastImport();
  const reader = new FileReader();
  reader.onload = () => {
    csvText.value = String(reader.result !== null ? reader.result : '');
    applyCSV(file.name);
    csvUploadFile.value = null;
  };
  reader.readAsText(file);
}
watch(
  () => props.modelValue.slotId,
  () => {
    clearLastImport();
  },
);

watch(csvText, () => {
  if (csvError.value !== '') csvError.value = '';
});
</script>

<template>
  <WCard>
    <div class="flex items-center gap-3">
      <span class="text-xs text-muted">{{ localRows.length }} / {{ TABLE_MAX_ROWS }} rijen</span>
      <span class="text-xs text-muted">{{ currentCols }} / {{ TABLE_MAX_COLS }} kolommen</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">Koprij</span>
        <USwitch
          :model-value="localHasColumnHeader"
          aria-label="Koprij tonen"
          size="xs"
          @update:model-value="(v: boolean) => setHasColumnHeader(v)"
        />
      </div>
    </div>

    <TableGrid
      :rows="localRows"
      :has-column-header="localHasColumnHeader"
      :column-calculations="localColumnCalculations"
      :column-calculation-emphasis="localColumnCalculationEmphasis"
      :column-calculation-currency="localColumnCalculationCurrency"
      :max-rows="TABLE_MAX_ROWS"
      :max-cols="TABLE_MAX_COLS"
      @cell-edit="updateCell"
      @cell-style="setCellEmphasis"
      @column-calculation="setColumnCalculation"
      @column-calculation-emphasis="setColumnCalculationEmphasis"
      @column-calculation-currency="setColumnCalculationCurrency"
      @add-row-before="insertRowBefore"
      @add-row-after="insertRowAfter"
      @remove-row="removeRow"
      @add-column-before="insertColumnBefore"
      @add-column-after="insertColumnAfter"
      @remove-column="removeColumn"
      @move-row="moveRow"
      @move-column="moveColumn"
      @paste-matrix="pasteMatrix"
    />

    <div class="sr-only" aria-live="polite">{{ gridStatus }}</div>

    <USeparator />

    <UFileUpload
      v-model="csvUploadFile"
      accept=".csv,text/csv"
      icon="i-lucide-folder-plus"
      label="Sleep je CSV hier of klik om te bladeren"
      :description="`Max ${TABLE_MAX_ROWS} rijen · ${TABLE_MAX_COLS} kolommen.`"
      color="neutral"
      :preview="false"
      reset
      @update:model-value="onCsvFileChange"
    >
      <template #actions="{ open }">
        <UButton color="neutral" variant="outline" @click.stop.prevent="open()">
          Bestand kiezen
        </UButton>
      </template>
    </UFileUpload>

    <div v-if="csvError !== ''" class="text-xs text-error">{{ csvError }}</div>
    <div
      v-else-if="lastImport !== null"
      class="flex min-w-0 items-center gap-1.5 text-xs text-success"
    >
      <UIcon name="i-lucide-check" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">
        Geïmporteerd<template v-if="lastImport.fileName">: {{ lastImport.fileName }}</template>
        · {{ lastImport.rows }} {{ lastImport.rows === 1 ? 'rij' : 'rijen' }}
        · {{ lastImport.cols }} {{ lastImport.cols === 1 ? 'kolom' : 'kolommen' }}
      </span>
    </div>
    <div v-else class="text-xs text-muted">
      Max {{ TABLE_MAX_ROWS }} rijen · {{ TABLE_MAX_COLS }} kolommen.
    </div>
  </WCard>
</template>
