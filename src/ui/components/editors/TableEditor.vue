<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { TableWrapModel, TableRowModel, TableCellModel } from '../../../types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS, TABLE_WIDTHS } from '../../../constants';
import { tokenize } from '../../../csv';
import { useNotifications } from '../../stores/useNotifications';
import WInput from '../ui/WInput.vue';

const notifications = useNotifications();

interface Props {
  modelValue: TableWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TableWrapModel];
  'import-csv': [csv: string];
}>();

type SizeKey = 'sm' | 'md' | 'lg';

const SIZE_OPTIONS: Array<{ value: SizeKey; label: string }> = [
  { value: 'sm', label: 'Klein' },
  { value: 'md', label: 'Middel' },
  { value: 'lg', label: 'Groot' },
];
function cloneRows(rows: TableRowModel[]): TableRowModel[] {
  let maxLen = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > maxLen) maxLen = rows[i].cells.length;
  }
  const out: TableRowModel[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells: TableCellModel[] = [];
    for (let j = 0; j < rows[i].cells.length; j++) {
      cells.push({
        cellNodeId: rows[i].cells[j].cellNodeId,
        value: rows[i].cells[j].value,
      });
    }
    while (cells.length < maxLen) cells.push({ cellNodeId: '', value: '' });
    out.push({ rowNodeId: rows[i].rowNodeId, cells: cells });
  }
  return out;
}
function estimateRowTruncation(
  row: TableRowModel,
  width: SizeKey,
  cellCount: number,
  rowCount: number,
  textSize: SizeKey,
): boolean {
  const containerWidth = TABLE_WIDTHS[width];
  const cellWidth =
    (containerWidth - 64 - (Math.max(cellCount, 1) - 1) * 56) / Math.max(cellCount, 1);
  const ASSUMED_SLOT_HEIGHT = 600;
  const rowHeight = (ASSUMED_SLOT_HEIGHT - 48) / Math.max(rowCount, 1);

  const config =
    textSize === 'sm'
      ? { mult: 0.55, bodyMax: 16 }
      : textSize === 'lg'
        ? { mult: 1.3, bodyMax: 36 }
        : { mult: 1.0, bodyMax: 24 };
  const fs = Math.min(config.bodyMax, Math.round(rowHeight * 0.3 * config.mult));

  const charsPerLine = cellWidth / (fs * 0.55);
  const maxLines = Math.floor((rowHeight - 56) / (fs * 1.4));
  const safeChars = Math.max(charsPerLine * Math.max(maxLines, 1), 10);

  return row.cells.some((c) => c.value.length > safeChars);
}

const localWidth = ref<SizeKey>(props.modelValue.width);
const localTextSize = ref<SizeKey>(props.modelValue.textSize);
const localHasColumnHeader = ref<boolean>(props.modelValue.hasColumnHeader);
const localRows = ref<TableRowModel[]>(cloneRows(props.modelValue.rows));

const maxCols = computed<number>(() => TABLE_MAX_COLS[localWidth.value]);
const canAddRow = computed<boolean>(() => localRows.value.length < TABLE_MAX_ROWS);
const currentCols = computed<number>(() =>
  localRows.value.length > 0 ? localRows.value[0].cells.length : 0,
);
const canAddColumn = computed<boolean>(
  () => localRows.value.length > 0 && currentCols.value < maxCols.value,
);
const bodyRowOffset = computed<number>(() => (localHasColumnHeader.value ? 1 : 0));
const truncationFlags = computed<{ header: boolean; body: boolean[] }>(() => {
  const w = localWidth.value;
  const ts = localTextSize.value;
  const cc = currentCols.value;
  const rc = localRows.value.length;
  const header =
    localHasColumnHeader.value && rc > 0
      ? estimateRowTruncation(localRows.value[0], w, cc, rc, ts)
      : false;
  const body: boolean[] = [];
  for (let i = 0; i < localRows.value.length; i++) {
    body.push(estimateRowTruncation(localRows.value[i], w, cc, rc, ts));
  }
  return { header: header, body: body };
});
watch(
  () => props.modelValue.width,
  (next) => {
    if (next !== localWidth.value) localWidth.value = next;
  },
);

watch(
  () => props.modelValue.hasColumnHeader,
  (next) => {
    if (next !== localHasColumnHeader.value) localHasColumnHeader.value = next;
  },
);

watch(
  () => props.modelValue.textSize,
  (next) => {
    if (next !== localTextSize.value) localTextSize.value = next;
  },
);
function rowsDiffer(a: TableRowModel[], b: TableRowModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].cells.length !== b[i].cells.length) return true;
    if (a[i].rowNodeId !== b[i].rowNodeId) return true;
    for (let j = 0; j < a[i].cells.length; j++) {
      if (a[i].cells[j].value !== b[i].cells[j].value) return true;
      if (a[i].cells[j].cellNodeId !== b[i].cells[j].cellNodeId) return true;
    }
  }
  return false;
}
let echoExpected = false;
let echoResetTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue.rows,
  (next) => {
    if (echoExpected) return;
    if (rowsDiffer(next, localRows.value)) localRows.value = cloneRows(next);
  },
);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    echoExpected = true;
    if (echoResetTimer !== null) clearTimeout(echoResetTimer);
    echoResetTimer = setTimeout(() => {
      echoExpected = false;
      echoResetTimer = null;
    }, 2000);
    emit('update:modelValue', {
      slotId: props.modelValue.slotId,
      width: localWidth.value,
      hasColumnHeader: localHasColumnHeader.value,
      textSize: localTextSize.value,
      rows: cloneRows(localRows.value),
    });
  }, 200);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  if (lastImportTimer !== null) clearTimeout(lastImportTimer);
  if (echoResetTimer !== null) clearTimeout(echoResetTimer);
});
function setWidth(w: SizeKey): void {
  if (localWidth.value === w) return;
  localWidth.value = w;
  scheduleEmit();
}

function setHasColumnHeader(v: boolean): void {
  if (localHasColumnHeader.value === v) return;
  localHasColumnHeader.value = v;
  scheduleEmit();
}

function setTextSize(s: SizeKey): void {
  if (localTextSize.value === s) return;
  localTextSize.value = s;
  scheduleEmit();
}

function onWidthChange(value: string | number | undefined): void {
  if (value === 'sm' || value === 'md' || value === 'lg') setWidth(value);
}

function onTextSizeChange(value: string | number | undefined): void {
  if (value === 'sm' || value === 'md' || value === 'lg') setTextSize(value);
}

function addRow(): void {
  if (!canAddRow.value) return;
  const cellCount = currentCols.value > 0 ? Math.min(currentCols.value, maxCols.value) : 1;
  const cells: TableCellModel[] = [];
  for (let j = 0; j < cellCount; j++) cells.push({ cellNodeId: '', value: '' });
  localRows.value.push({ rowNodeId: '', cells: cells });
  scheduleEmit();
}

function removeRow(i: number): void {
  if (i < 0 || i >= localRows.value.length) return;
  localRows.value.splice(i, 1);
  scheduleEmit();
}

function addColumn(): void {
  if (!canAddColumn.value) return;
  for (let i = 0; i < localRows.value.length; i++) {
    localRows.value[i].cells.push({ cellNodeId: '', value: '' });
  }
  scheduleEmit();
}

function removeColumn(j: number): void {
  if (j < 0 || j >= currentCols.value) return;
  for (let i = 0; i < localRows.value.length; i++) {
    if (j < localRows.value[i].cells.length) {
      localRows.value[i].cells.splice(j, 1);
    }
  }
  scheduleEmit();
}

function updateCell(i: number, j: number, value: string): void {
  const row = localRows.value[i];
  if (row === undefined) return;
  const cell = row.cells[j];
  if (cell === undefined || cell.value === value) return;
  cell.value = value;
  scheduleEmit();
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
    if (cellCount > maxCols.value) {
      return `Rij ${i + 1}: ${cellCount} kolommen — max ${maxCols.value} bij breedte ${localWidth.value}.`;
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
  <UCard title="Weergave">
    <UFormField name="table-width" label="Breedte">
      <URadioGroup
        :model-value="localWidth"
        :items="SIZE_OPTIONS"
        value-key="value"
        variant="table"
        orientation="horizontal"
        indicator="hidden"
        @update:model-value="onWidthChange"
      />
    </UFormField>
    <UFormField name="table-text-size" label="Tekstgrootte">
      <URadioGroup
        :model-value="localTextSize"
        :items="SIZE_OPTIONS"
        value-key="value"
        variant="card"
        orientation="horizontal"
        indicator="hidden"
        @update:model-value="onTextSizeChange"
      >
        <template #label="{ item }">
          <span
            class="flex flex-col items-center gap-1 px-3 py-2 transition-colors"
            :class="
              localTextSize === item.value
                ? 'bg-primary/5 text-primary'
                : 'bg-default text-default hover:bg-elevated'
            "
          >
            <span
              class="font-semibold"
              :class="item.value === 'sm' ? 'text-xs' : item.value === 'lg' ? 'text-xl' : 'text-base'"
            >Aa</span>
            <span class="text-xs text-muted">{{ item.label }}</span>
          </span>
        </template>
      </URadioGroup>
    </UFormField>
  </UCard>

  <UCard title="Rijen &amp; kolommen">
    <div class="flex items-center gap-3">
      <span class="text-xs text-muted">{{ localRows.length }} / {{ TABLE_MAX_ROWS }} rijen</span>
      <span class="text-xs text-muted">{{ currentCols }} / {{ maxCols }} kolommen</span>
    </div>

    <div class="space-y-4">
      <UEmpty
        v-if="localRows.length === 0"
        icon="i-lucide-table"
        description="Tabel is leeg — voeg een rij toe om te starten."
        variant="naked"
        size="sm"
      >
        <template #actions>
          <UButton color="neutral" variant="soft" icon="i-lucide-plus" @click="addRow">
            Eerste rij toevoegen
          </UButton>
        </template>
      </UEmpty>

      <template v-else>
        <div class="space-y-4">
          <span class="text-xs font-medium text-muted">Kolommen</span>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="j in currentCols"
              :key="'colchip-' + j"
              color="neutral"
              variant="subtle"
              trailing-icon="i-lucide-x"
              :aria-label="`Verwijder kolom ${j}`"
              @click="removeColumn(j - 1)"
              >Kolom {{ j }}</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              :disabled="!canAddColumn"
              @click="addColumn"
              >Kolom toevoegen</UButton
            >
          </div>
        </div>

        <div class="space-y-4">
          <UCard>
            <template #title>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-default">Koprij</span>
                  <UBadge
                    v-if="truncationFlags.header"
                    color="secondary"
                    variant="soft"
                    icon="i-lucide-alert-triangle"
                    aria-label="Tekst afgebroken"
                  />
                </div>
                <USwitch
                  :model-value="localHasColumnHeader"
                  aria-label="Koprij tonen"
                  @update:model-value="(v: boolean) => setHasColumnHeader(v)"
                />
              </div>
            </template>

            <UCollapsible :open="localHasColumnHeader">
              <template #content>
                <div
                  v-if="localRows.length > 0"
                  class="bg-elevated"
                >
                  <USeparator />
                  <div class="space-y-4 px-4 py-3">
                    <div
                      v-for="(cell, j) in localRows[0].cells"
                      :key="cell.cellNodeId !== '' ? cell.cellNodeId : 'kolomkop-' + j"
                      class="grid grid-cols-[80px_1fr] items-center gap-3"
                    >
                      <span class="text-xs font-medium text-muted">Kolom {{ j + 1 }}</span>
                      <WInput
                        :model-value="cell.value"
                        :placeholder="`Waarde voor kolom ${j + 1}`"
                        @update:model-value="(v: string) => updateCell(0, j, v)"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </UCollapsible>
          </UCard>

          <template
            v-for="(row, idx) in localRows"
            :key="row.rowNodeId !== '' ? row.rowNodeId : 'row-' + idx"
          >
            <UCard
              v-if="idx >= bodyRowOffset"
            >
              <template #title>
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-default"
                      >Rij {{ idx + 1 - bodyRowOffset }}</span
                    >
                    <UBadge
                      v-if="truncationFlags.body[idx]"
                      color="secondary"
                      variant="soft"
                      icon="i-lucide-alert-triangle"
                      aria-label="Tekst afgebroken"
                    />
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    :aria-label="`Verwijder rij ${idx + 1 - bodyRowOffset}`"
                    @click="removeRow(idx)"
                  />
                </div>
              </template>

              <div
                v-for="(cell, j) in row.cells"
                :key="cell.cellNodeId !== '' ? cell.cellNodeId : 'row-' + idx + '-' + j"
                class="grid grid-cols-[80px_1fr] items-center gap-3"
              >
                <span class="text-xs font-medium text-muted">Kolom {{ j + 1 }}</span>
                <WInput
                  :model-value="cell.value"
                  :placeholder="`Waarde voor kolom ${j + 1}`"
                  @update:model-value="(v: string) => updateCell(idx, j, v)"
                />
              </div>
            </UCard>
          </template>
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-plus"
            :disabled="!canAddRow"
            block
            @click="addRow"
            >Rij toevoegen</UButton
          >
        </div>
      </template>
    </div>
  </UCard>

  <UCard title="CSV importeren">
    <UFileUpload
      v-model="csvUploadFile"
      accept=".csv,text/csv"
      icon="i-lucide-folder-plus"
      label="Sleep je CSV hier of klik om te bladeren"
      :description="`Max ${TABLE_MAX_ROWS} rijen · ${maxCols} kolommen bij breedte ${localWidth}.`"
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
      Max {{ TABLE_MAX_ROWS }} rijen · {{ maxCols }} kolommen bij breedte {{ localWidth }}.
    </div>
  </UCard>
</template>
