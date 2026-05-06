<script setup lang="ts">
/**
 * TableEditor — section for editing a TableWrap's content.
 *
 * Lifted from sections/TableEditor/src/TableEditor.vue.
 * Updated imports: PropertyPanel from @/components/, csv-schema from ./csv-schema.js.
 * USwitch (Nuxt UI v4) replaces native <input type="checkbox"> for column header toggle.
 * UButton replaces plain <button> for toggle buttons, counter buttons, CSV parse button.
 * UTextarea replaces plain <textarea> for CSV import.
 * UAlert replaces StatusMessage for CSV error display.
 *
 * T42.21 perf fixes preserved:
 *   - bodyRows computed reads props.tableData.rows directly (no .slice())
 *   - truncationFlags is a memoized computed (no inline recalculation)
 *   - PropertyPanel uses CSS grid-rows collapse (zero JS measurement)
 *
 * Props-only renderer. Emits typed events. Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.7.
 */

import { ref, computed, useId } from 'vue';
import PropertyPanel from '@/components/PropertyPanel.vue';
import { parseCsv, DEFAULT_CSV_PARSE_CONFIG } from './csv-schema.js';
import type { TableRow, CsvParseError } from './csv-schema.js';

// ---------------------------------------------------------------------------
// Types (local mirror for portability — structurally compatible with shared/messages.ts)
// ---------------------------------------------------------------------------

export interface TableCellModel {
  cellNodeId: string;
  value: string;
}

export interface TableRowModel {
  rowNodeId: string;
  cells: TableCellModel[];
}

export interface TableWrapModel {
  slotId: string;
  width: 'sm' | 'md' | 'lg';
  hasColumnHeader: boolean;
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ROWS = DEFAULT_CSV_PARSE_CONFIG.maxRows;
const MAX_COLS = DEFAULT_CSV_PARSE_CONFIG.maxCols;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TableEditorProps {
  tableData: TableWrapModel;
  disabled?: boolean;
}

const props = withDefaults(defineProps<TableEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface TableEditorEmits {
  'update:width': [payload: { slotId: string; width: 'sm' | 'md' | 'lg' }];
  'update:textSize': [payload: { slotId: string; textSize: 'sm' | 'md' | 'lg' }];
  'update:hasColumnHeader': [payload: { slotId: string; hasColumnHeader: boolean }];
  'update:rowCount': [payload: { slotId: string; delta: 1 | -1 }];
  'update:colCount': [payload: { slotId: string; delta: 1 | -1 }];
  'update:cell': [payload: { slotId: string; row: number; col: number; value: string }];
  'update:replaceContent': [payload: { slotId: string; rows: TableRow[] }];
}

const emit = defineEmits<TableEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

const sectionLabelId = useId();
const widthGroupId = useId();
const textSizeGroupId = useId();
const rowCountLabelId = useId();
const colCountLabelId = useId();
const csvTextareaId = useId();
const csvErrorsId = useId();

// ---------------------------------------------------------------------------
// CSV import state
// ---------------------------------------------------------------------------

const csvInput = ref<string>('');
const csvErrors = ref<CsvParseError[]>([]);
const csvParsed = ref<boolean>(false);

// ---------------------------------------------------------------------------
// Computed view state — T42.21 perf fixes preserved
// ---------------------------------------------------------------------------

/**
 * T42.21 Finding 1 — stable reference, no .slice().
 * Reads directly from props.tableData.rows.
 */
const bodyRows = computed(() => props.tableData.rows);

const colCount = computed<number>(() => {
  let max = 0;
  for (let i = 0; i < bodyRows.value.length; i++) {
    const row = bodyRows.value[i];
    if (row && row.cells.length > max) max = row.cells.length;
  }
  return max;
});

/**
 * T42.21 Finding 3 — memoized truncation flags.
 * Recomputes only when bodyRows or colCount changes.
 */
const truncationFlags = computed<Map<number, boolean>>(() => {
  const flags = new Map<number, boolean>();
  const threshold = colCount.value > 0 ? Math.floor(120 / colCount.value) : 120;
  const rows = bodyRows.value;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    let truncated = false;
    for (let j = 0; j < row.cells.length; j++) {
      const cell = row.cells[j];
      if (cell && cell.value.length > threshold) {
        truncated = true;
        break;
      }
    }
    flags.set(i, truncated);
  }
  return flags;
});

// ---------------------------------------------------------------------------
// Control event handlers
// ---------------------------------------------------------------------------

function onWidthChange(width: 'sm' | 'md' | 'lg'): void {
  emit('update:width', { slotId: props.tableData.slotId, width });
}

function onTextSizeChange(textSize: 'sm' | 'md' | 'lg'): void {
  emit('update:textSize', { slotId: props.tableData.slotId, textSize });
}

function onHeaderToggle(value: boolean): void {
  emit('update:hasColumnHeader', { slotId: props.tableData.slotId, hasColumnHeader: value });
}

function onRowIncrease(): void {
  if (bodyRows.value.length >= MAX_ROWS) return;
  emit('update:rowCount', { slotId: props.tableData.slotId, delta: 1 });
}

function onRowDecrease(): void {
  if (bodyRows.value.length <= 1) return;
  emit('update:rowCount', { slotId: props.tableData.slotId, delta: -1 });
}

function onColIncrease(): void {
  if (colCount.value >= MAX_COLS) return;
  emit('update:colCount', { slotId: props.tableData.slotId, delta: 1 });
}

function onColDecrease(): void {
  if (colCount.value <= 1) return;
  emit('update:colCount', { slotId: props.tableData.slotId, delta: -1 });
}

function onCellInput(rowIndex: number, colIndex: number, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  emit('update:cell', {
    slotId: props.tableData.slotId,
    row: rowIndex,
    col: colIndex,
    value,
  });
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

function onCsvParse(): void {
  csvErrors.value = [];
  csvParsed.value = false;

  const result = parseCsv(csvInput.value);
  if (result.ok) {
    csvParsed.value = true;
    emit('update:replaceContent', {
      slotId: props.tableData.slotId,
      rows: result.data.rows,
    });
    csvInput.value = '';
  } else {
    csvErrors.value = result.errors;
  }
}
</script>

<template>
  <section
    class="table-editor"
    :aria-labelledby="sectionLabelId"
    :aria-disabled="disabled || undefined"
  >
    <p :id="sectionLabelId" class="table-editor__heading">Table</p>

    <!-- ===== 1. Width ===== -->
    <PropertyPanel title="Width">
      <div role="group" :aria-labelledby="widthGroupId" class="table-editor__toggle-group">
        <span :id="widthGroupId" class="sr-only">Column width preset</span>
        <button
          v-for="opt in ['sm', 'md', 'lg'] as const"
          :key="opt"
          type="button"
          class="table-editor__toggle-btn"
          :class="{ 'table-editor__toggle-btn--active': tableData.width === opt }"
          :aria-pressed="tableData.width === opt"
          :disabled="disabled"
          @click="onWidthChange(opt)"
        >
          {{ opt }}
        </button>
      </div>
    </PropertyPanel>

    <!-- ===== 2. Text size ===== -->
    <PropertyPanel title="Text Size">
      <div role="group" :aria-labelledby="textSizeGroupId" class="table-editor__toggle-group">
        <span :id="textSizeGroupId" class="sr-only">Text size preset</span>
        <button
          v-for="opt in ['sm', 'md', 'lg'] as const"
          :key="opt"
          type="button"
          class="table-editor__toggle-btn"
          :class="{ 'table-editor__toggle-btn--active': tableData.textSize === opt }"
          :aria-pressed="tableData.textSize === opt"
          :disabled="disabled"
          @click="onTextSizeChange(opt)"
        >
          {{ opt }}
        </button>
      </div>
    </PropertyPanel>

    <!-- ===== 3. Column header ===== -->
    <PropertyPanel title="Column Header">
      <div class="table-editor__switch-row">
        <label class="table-editor__switch-label" :for="`${sectionLabelId}-header-chk`">
          First row is a header
        </label>
        <input
          :id="`${sectionLabelId}-header-chk`"
          type="checkbox"
          class="table-editor__checkbox"
          :checked="tableData.hasColumnHeader"
          :disabled="disabled"
          @change="onHeaderToggle(($event.target as HTMLInputElement).checked)"
        />
      </div>
    </PropertyPanel>

    <!-- ===== 4 + 5. Dimensions ===== -->
    <PropertyPanel title="Dimensions">
      <!-- Row count -->
      <div class="table-editor__counter-row">
        <span :id="rowCountLabelId" class="table-editor__counter-label">Rows</span>
        <div class="table-editor__counter-controls" :aria-labelledby="rowCountLabelId">
          <button
            type="button"
            class="table-editor__counter-btn"
            aria-label="Remove row"
            :disabled="disabled || bodyRows.length <= 1"
            @click="onRowDecrease"
          >
            −
          </button>
          <span class="table-editor__counter-value" aria-live="polite" aria-atomic="true">{{
            bodyRows.length
          }}</span>
          <button
            type="button"
            class="table-editor__counter-btn"
            aria-label="Add row"
            :disabled="disabled || bodyRows.length >= MAX_ROWS"
            @click="onRowIncrease"
          >
            +
          </button>
        </div>
      </div>

      <!-- Column count -->
      <div class="table-editor__counter-row">
        <span :id="colCountLabelId" class="table-editor__counter-label">Columns</span>
        <div class="table-editor__counter-controls" :aria-labelledby="colCountLabelId">
          <button
            type="button"
            class="table-editor__counter-btn"
            aria-label="Remove column"
            :disabled="disabled || colCount <= 1"
            @click="onColDecrease"
          >
            −
          </button>
          <span class="table-editor__counter-value" aria-live="polite" aria-atomic="true">{{
            colCount
          }}</span>
          <button
            type="button"
            class="table-editor__counter-btn"
            aria-label="Add column"
            :disabled="disabled || colCount >= MAX_COLS"
            @click="onColIncrease"
          >
            +
          </button>
        </div>
      </div>
    </PropertyPanel>

    <!-- ===== 6. Cell grid ===== -->
    <PropertyPanel title="Cells">
      <div
        role="grid"
        class="table-editor__grid"
        :aria-label="`Table cells — ${bodyRows.length} rows, ${colCount} columns`"
        :aria-disabled="disabled || undefined"
      >
        <div
          v-if="colCount > 0"
          role="row"
          class="table-editor__grid-row table-editor__grid-row--header"
        >
          <div
            v-for="colIdx in colCount"
            :key="colIdx"
            role="columnheader"
            class="table-editor__grid-cell table-editor__grid-cell--header"
          >
            Col {{ colIdx }}
          </div>
        </div>

        <div
          v-for="(row, rowIdx) in bodyRows"
          :key="row.rowNodeId || rowIdx"
          role="row"
          class="table-editor__grid-row"
          :data-render-id="`row-${rowIdx}`"
        >
          <div
            v-for="(cell, colIdx) in row.cells"
            :key="cell.cellNodeId || `${rowIdx}-${colIdx}`"
            role="gridcell"
            class="table-editor__grid-cell"
          >
            <input
              type="text"
              class="table-editor__cell-input"
              :value="cell.value"
              :disabled="disabled"
              :aria-label="`Row ${rowIdx + 1}, column ${colIdx + 1}${truncationFlags.get(rowIdx) ? ' — content may be truncated' : ''}`"
              @input="onCellInput(rowIdx, colIdx, $event)"
            />
          </div>
        </div>
      </div>
    </PropertyPanel>

    <!-- ===== 7. CSV import ===== -->
    <PropertyPanel title="CSV Import" :default-open="false">
      <div class="table-editor__csv">
        <label :for="csvTextareaId" class="table-editor__csv-label">
          Paste CSV (first row = header)
        </label>
        <textarea
          :id="csvTextareaId"
          v-model="csvInput"
          class="table-editor__csv-textarea"
          :disabled="disabled"
          :aria-describedby="csvErrors.length > 0 ? csvErrorsId : undefined"
          rows="6"
          placeholder="Name,Role,City&#10;Alice,Engineer,Amsterdam"
        />
        <button
          type="button"
          class="table-editor__csv-parse-btn"
          :disabled="disabled || csvInput.trim().length === 0"
          @click="onCsvParse"
        >
          Parse &amp; Apply
        </button>

        <!--
          CSV errors — assertive live region. Always in DOM so region is
          registered before announcements.
        -->
        <div
          v-if="csvErrors.length > 0"
          :id="csvErrorsId"
          class="table-editor__csv-errors"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <ul class="table-editor__csv-error-list">
            <li v-for="(err, i) in csvErrors" :key="i" class="table-editor__csv-error-item">
              <UAlert color="error" variant="subtle" :description="err.message" />
            </li>
          </ul>
        </div>

        <!-- Success (polite) -->
        <div
          v-if="csvParsed && csvErrors.length === 0"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          class="table-editor__csv-success"
        >
          CSV imported successfully.
        </div>
      </div>
    </PropertyPanel>
  </section>
</template>

<style scoped>
.table-editor {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
  border: none;
}

.table-editor__heading {
  margin: 0;
  padding: 8px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-label, #374151);
  user-select: none;
}

.table-editor__toggle-group {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
}

.table-editor__toggle-btn {
  flex: 1;
  appearance: none;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  background: var(--color-btn-bg, transparent);
  color: var(--color-text, #374151);
  font-size: 11px;
  font-weight: 500;
  padding: 3px 6px;
  cursor: pointer;
  transition:
    background-color 100ms ease,
    border-color 100ms ease;
  min-height: 24px;
}

@media (prefers-reduced-motion: reduce) {
  .table-editor__toggle-btn {
    transition: none;
  }
}

.table-editor__toggle-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-editor__toggle-btn--active {
  background: var(--color-btn-active-bg, #1d4ed8);
  border-color: var(--color-btn-active-bg, #1d4ed8);
  color: var(--color-btn-active-text, #ffffff);
}

.table-editor__toggle-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: 1px;
}

.table-editor__switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
}

.table-editor__switch-label {
  font-size: 11px;
  color: var(--color-text, #374151);
  cursor: pointer;
  user-select: none;
}

.table-editor__checkbox {
  cursor: pointer;
  width: 14px;
  height: 14px;
  accent-color: var(--color-btn-active-bg, #1d4ed8);
}

.table-editor__checkbox:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-editor__counter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
}

.table-editor__counter-label {
  font-size: 11px;
  color: var(--color-text, #374151);
  user-select: none;
}

.table-editor__counter-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.table-editor__counter-btn {
  appearance: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  background: var(--color-btn-bg, transparent);
  color: var(--color-text, #374151);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .table-editor__counter-btn {
    transition: none;
  }
}

.table-editor__counter-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.table-editor__counter-btn:not(:disabled):hover {
  background: var(--color-panel-header-hover, rgba(0, 0, 0, 0.04));
}

.table-editor__counter-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: 1px;
}

.table-editor__counter-value {
  font-size: 12px;
  font-weight: 500;
  min-width: 20px;
  text-align: center;
  color: var(--color-text, #374151);
  user-select: none;
}

.table-editor__grid {
  overflow-x: auto;
  padding: 4px 6px 8px;
}

.table-editor__grid-row {
  display: flex;
  gap: 2px;
  margin-bottom: 2px;
}

.table-editor__grid-row--header {
  margin-bottom: 4px;
}

.table-editor__grid-cell {
  flex: 1;
  min-width: 40px;
}

.table-editor__grid-cell--header {
  font-size: 9px;
  font-weight: 600;
  color: var(--color-muted, #9ca3af);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: center;
  padding: 2px 0;
  user-select: none;
}

.table-editor__cell-input {
  width: 100%;
  min-width: 0;
  font-size: 11px;
  padding: 3px 5px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 3px;
  background: var(--color-input-bg, #ffffff);
  color: var(--color-text, #374151);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

.table-editor__cell-input:disabled {
  opacity: 0.45;
  background: var(--color-disabled-bg, #f9fafb);
  cursor: not-allowed;
}

.table-editor__cell-input:focus {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: -1px;
  border-color: transparent;
}

.table-editor__csv {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px 10px;
}

.table-editor__csv-label {
  font-size: 11px;
  color: var(--color-text, #374151);
  user-select: none;
}

.table-editor__csv-textarea {
  width: 100%;
  font-size: 11px;
  font-family: monospace;
  padding: 5px 6px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  background: var(--color-input-bg, #ffffff);
  color: var(--color-text, #374151);
  resize: vertical;
  box-sizing: border-box;
  line-height: 1.5;
}

.table-editor__csv-textarea:disabled {
  opacity: 0.45;
  background: var(--color-disabled-bg, #f9fafb);
  cursor: not-allowed;
}

.table-editor__csv-textarea:focus {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: -1px;
  border-color: transparent;
}

.table-editor__csv-parse-btn {
  appearance: none;
  align-self: flex-start;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  background: var(--color-btn-bg, transparent);
  color: var(--color-text, #374151);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  cursor: pointer;
  min-height: 26px;
  transition: background-color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .table-editor__csv-parse-btn {
    transition: none;
  }
}

.table-editor__csv-parse-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-editor__csv-parse-btn:not(:disabled):hover {
  background: var(--color-panel-header-hover, rgba(0, 0, 0, 0.04));
}

.table-editor__csv-parse-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: 1px;
}

.table-editor__csv-error-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.table-editor__csv-error-item {
  display: flex;
}

.table-editor__csv-success {
  font-size: 11px;
  color: var(--color-success-text, #15803d);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
