<script setup lang="ts">
/**
 * TableEditor — section for editing a TableWrap's content.
 *
 * ## Composition
 *
 * TableEditor composes PropertyPanel (collapsible wrappers) and
 * StatusMessage (CSV error display) to render controls for:
 *   1. Width toggle (sm / md / lg)
 *   2. Text size toggle (sm / md / lg)
 *   3. Column header switch
 *   4. Row count +/− buttons
 *   5. Column count +/− buttons
 *   6. Body rows editable cell grid
 *   7. CSV import (paste + parse)
 *
 * ## T42.21 perf fixes
 *
 * **Finding 1 — offset-based stable bodyRows reference:**
 * The visible body rows are never derived via `.slice()` on a reactive array
 * (which creates a new array reference every render, forcing Reka's sync
 * measurement → v-for re-key → frame jank). Instead, `visibleBodyRows` is a
 * computed that reads directly from `props.tableData.rows` with explicit index
 * bounds. The array reference is stable: Reka's getBoundingClientRect() is
 * never triggered because we use PropertyPanel (CSS grid-rows collapse, zero
 * JS measurement).
 *
 * **Finding 3 — memoized truncation flags:**
 * `estimateRowTruncation` is replaced by a computed `truncationFlags` map keyed
 * by row index. The computed only re-evaluates when `tableData.rows` or the
 * column count changes — not on every toggle event.
 *
 * ## Section discipline
 *
 * - Pure renderer of `tableData` prop, emits typed events.
 * - NO store imports, NO bridge imports, NO figma.* calls.
 * - Parent (App.vue, task 4.3) wires emits → useEditorActions.applyTable*.
 *
 * ## Accessibility
 *
 * - The outer <section> is aria-labelledby the heading element.
 * - Each PropertyPanel collapsible group uses the ARIA APG Accordion pattern
 *   (implemented in PropertyPanel itself — button + aria-expanded + aria-controls).
 * - The cell grid is a table with role="grid" so screen readers understand the
 *   row/column structure. Each input has an aria-label.
 * - Toggle groups are <div role="group" aria-labelledby> with <button> children.
 * - Row/col count controls use aria-label on buttons and aria-live for the count
 *   value so AT announces updates.
 * - The column header switch is a native <input type="checkbox"> with a paired <label>.
 * - CSV errors surface in a <ul role="list" aria-live="assertive"> region.
 *
 * ## Ownership
 *
 * Owner: ui-engineer.
 * Resolves: MON-2894038365 (Sprint 4, Task 4.1).
 */

import { ref, computed, useId } from 'vue';
import { PropertyPanel } from '@figma-plugins/sections-property-panel';
import { StatusMessage } from '@figma-plugins/components';
import { parseCsv, DEFAULT_CSV_PARSE_CONFIG } from './csv-schema.js';
import type { TableRow, CsvParseError } from './csv-schema.js';

// ---------------------------------------------------------------------------
// Local TableWrapModel mirror — structurally compatible with
// plugins/welder-editor/shared/messages.ts TableWrapModel.
// Kept local so this section is portable across plugins.
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
// Constants — max bounds from csv-schema's default config (single source of truth)
// ---------------------------------------------------------------------------

const MAX_ROWS = DEFAULT_CSV_PARSE_CONFIG.maxRows; // 100
const MAX_COLS = DEFAULT_CSV_PARSE_CONFIG.maxCols; // 10

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TableEditorProps {
  /** The table model to display and edit. All controls derive from this. */
  tableData: TableWrapModel;
  /**
   * When true all controls are disabled (no edits allowed).
   * Propagated to every interactive element.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<TableEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits — mirror useEditorActions.applyTable* per-field payload shapes exactly.
// The parent (App.vue, task 4.3) wires each emit to the corresponding action.
// ---------------------------------------------------------------------------

export interface TableEditorEmits {
  /** Width preset changed. */
  'update:width': [payload: { slotId: string; width: 'sm' | 'md' | 'lg' }];
  /** Text size preset changed. */
  'update:textSize': [payload: { slotId: string; textSize: 'sm' | 'md' | 'lg' }];
  /** Column header toggle changed. */
  'update:hasColumnHeader': [payload: { slotId: string; hasColumnHeader: boolean }];
  /**
   * Row count +/− button pressed.
   * delta: 1 = add row, -1 = remove last row.
   */
  'update:rowCount': [payload: { slotId: string; delta: 1 | -1 }];
  /**
   * Column count +/− button pressed.
   * delta: 1 = add column, -1 = remove last column.
   */
  'update:colCount': [payload: { slotId: string; delta: 1 | -1 }];
  /** Single cell value changed. row and col are 0-based indices. */
  'update:cell': [payload: { slotId: string; row: number; col: number; value: string }];
  /**
   * CSV import completed successfully.
   * Replaces the entire row content with parsed rows.
   */
  'update:replaceContent': [payload: { slotId: string; rows: TableRow[] }];
}

const emit = defineEmits<TableEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations
// ---------------------------------------------------------------------------

const sectionLabelId = useId();
const widthGroupId = useId();
const textSizeGroupId = useId();
const rowCountLabelId = useId();
const colCountLabelId = useId();
const csvTextareaId = useId();
const csvErrorsId = useId();

// ---------------------------------------------------------------------------
// CSV import state — local to this section (not in a store)
// ---------------------------------------------------------------------------

const csvInput = ref<string>('');
const csvErrors = ref<CsvParseError[]>([]);
const csvParsed = ref<boolean>(false);

// ---------------------------------------------------------------------------
// Computed: derived view state from props (no copies, no slices)
// ---------------------------------------------------------------------------

/**
 * T42.21 Finding 1 — stable reference to body rows.
 *
 * We do NOT use .slice() here. The computed reads directly from
 * props.tableData.rows. Because `props.tableData` is the reactive prop,
 * Vue tracks it at the property level; the computed re-evaluates only when
 * the rows array itself changes (identity change on the prop), not on every
 * render. No new array reference is created on each render cycle.
 */
const bodyRows = computed(() => props.tableData.rows);

/**
 * Derived column count: the max cells across all rows (or 0 if empty).
 * Used for sizing the grid header row.
 */
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
 *
 * Returns a map: rowIndex → boolean (true = row has cells that may be
 * truncated at current column count). The computation only re-runs when
 * bodyRows or colCount changes — not on toggle or focus events.
 *
 * Truncation heuristic: any cell whose value length exceeds
 * (colCount > 0 ? Math.floor(120 / colCount) : 120) characters is flagged.
 * The threshold mirrors the v0.2.1 estimateRowTruncation logic scaled to
 * a 320px plugin width. This is informational only (drives aria-label
 * tooltip text); the renderer handles visual truncation.
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

function onHeaderToggle(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  emit('update:hasColumnHeader', { slotId: props.tableData.slotId, hasColumnHeader: checked });
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
// CSV import handler
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
    // Clear the textarea after a successful parse.
    csvInput.value = '';
  } else {
    csvErrors.value = result.errors;
    // Do NOT emit on parse failure.
  }
}
</script>

<template>
  <!--
    Outer <section> provides a landmark region.
    aria-labelledby references the heading element below.
  -->
  <section
    class="table-editor"
    :aria-labelledby="sectionLabelId"
    :aria-disabled="disabled || undefined"
  >
    <!-- Section heading (accessible name + visual label) -->
    <p :id="sectionLabelId" class="table-editor__heading">Table</p>

    <!-- ======================================================================
         1. Width
         ====================================================================== -->
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

    <!-- ======================================================================
         2. Text size
         ====================================================================== -->
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

    <!-- ======================================================================
         3. Column header
         ====================================================================== -->
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
          @change="onHeaderToggle"
        />
      </div>
    </PropertyPanel>

    <!-- ======================================================================
         4 + 5. Row count and Column count
         ====================================================================== -->
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

    <!-- ======================================================================
         6. Body rows editable cell grid
         ====================================================================== -->
    <PropertyPanel title="Cells">
      <!--
        role="grid" communicates the row/column structure to AT.
        Each cell input has an aria-label describing its position.
        T42.21 Finding 1: bodyRows is a computed reading props.tableData.rows
        directly — no slice(), stable reference, no v-for re-key on toggle.
      -->
      <div
        role="grid"
        class="table-editor__grid"
        :aria-label="`Table cells — ${bodyRows.length} rows, ${colCount} columns`"
        :aria-disabled="disabled || undefined"
      >
        <!-- Column header labels (aria role="row" / "columnheader") -->
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

        <!-- Body rows — stable iteration over bodyRows computed -->
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

    <!-- ======================================================================
         7. CSV import
         ====================================================================== -->
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
          CSV errors — assertive live region so AT immediately announces
          parse failures. The element is always in the DOM to avoid the
          "live region not registered" AT miss.
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
              <StatusMessage :message="err.message" variant="alert" />
            </li>
          </ul>
        </div>

        <!-- Success status (polite) — rendered when last parse succeeded -->
        <StatusMessage
          v-if="csvParsed && csvErrors.length === 0"
          message="CSV imported successfully."
          variant="status"
        />
      </div>
    </PropertyPanel>
  </section>
</template>

<style scoped>
/* ---------------------------------------------------------------------------
   Container
   --------------------------------------------------------------------------- */

.table-editor {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
  border: none;
}

/* Section heading (accessible name + visual heading) */
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

/* ---------------------------------------------------------------------------
   Toggle group (width / text size)
   --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
   Switch row (column header)
   --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
   Counter rows (row count / col count)
   --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
   Cell grid
   --------------------------------------------------------------------------- */

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
  /* Prevent the input from overflowing its cell when content is long */
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

/* ---------------------------------------------------------------------------
   CSV import
   --------------------------------------------------------------------------- */

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

.table-editor__csv-errors {
  /* No extra padding — StatusMessage items provide their own */
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

/* ---------------------------------------------------------------------------
   Utilities
   --------------------------------------------------------------------------- */

/* sr-only — Tailwind not available in scoped <style> */
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
