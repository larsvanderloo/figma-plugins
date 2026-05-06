<script setup lang="ts">
/**
 * TableEditor — section for editing a TableWrap's content.
 *
 * ## Composition (Sprint 5 Wave 3 — MON-2894506892)
 *
 * TableEditor composes PropertyPanel (collapsible wrappers) and Nuxt UI v4
 * primitives (UFormField, UButton, USwitch, UInput, UTextarea, UAlert) to
 * render controls for:
 *   1. Width toggle (sm / md / lg) — UButton toggle group inside UFormField
 *   2. Text size toggle (sm / md / lg) — UButton toggle group inside UFormField
 *   3. Column header switch — USwitch inside UFormField
 *   4. Row count +/− buttons — UButton variant="ghost" icon="i-lucide-plus/minus"
 *   5. Column count +/− buttons — UButton variant="ghost" icon="i-lucide-plus/minus"
 *   6. Body rows editable cell grid — UInput per cell
 *   7. CSV import (paste + parse) — UTextarea + UButton + UAlert for errors
 *
 * ## T42.21 perf fixes — PRESERVED
 *
 * **Finding 1 — offset-based stable bodyRows reference:**
 * The visible body rows are never derived via `.slice()` on a reactive array
 * (which creates a new array reference every render, forcing Reka's sync
 * measurement → v-for re-key → frame jank). Instead, `bodyRows` is a
 * computed that reads directly from `props.tableData.rows`. The array
 * reference is stable: no new array reference is created on each render cycle.
 *
 * **Finding 3 — memoized truncation flags:**
 * `truncationFlags` is a computed Map keyed by row index. The computed only
 * re-evaluates when `tableData.rows` or the column count changes — not on
 * every toggle event.
 *
 * ## Section discipline
 *
 * - Pure renderer of `tableData` prop, emits typed events.
 * - NO store imports, NO bridge imports, NO figma.* calls.
 * - Parent (App.vue) wires emits → useEditorActions.applyTable*.
 *
 * ## Accessibility
 *
 * - The outer <section> is aria-labelledby the heading element.
 * - Each PropertyPanel collapsible group uses the ARIA APG Accordion pattern.
 * - The cell grid is a table with role="grid" so screen readers understand the
 *   row/column structure. Each UInput has an aria-label.
 * - Width and Text Size toggle groups are <div role="group" aria-labelledby>.
 * - USwitch (column header) renders with role="switch" (Reka SwitchRoot).
 * - Row/col count controls use aria-label on UButton and aria-live for count.
 * - CSV errors surface in a role="alert" aria-live="assertive" region.
 *
 * ## Nuxt UI primitives map
 *
 * | Before                        | After                                            |
 * | ----------------------------- | ------------------------------------------------ |
 * | native <button> (width)       | <UButton variant="solid|subtle"> in UFormField   |
 * | native <button> (textSize)    | <UButton variant="solid|subtle"> in UFormField   |
 * | <input type="checkbox">       | <USwitch> in UFormField label="First row…"       |
 * | native <button> +/- row/col   | <UButton variant="ghost" icon="i-lucide-…">      |
 * | <input type="text"> cell      | <UInput> with aria-label="Row X, column Y"       |
 * | <textarea> CSV paste          | <UTextarea> rows="3" placeholder="Name,Role…"    |
 * | hand-rolled error div         | <UAlert color="error" variant="subtle">           |
 *
 * ## Ownership
 *
 * Owner: ui-engineer.
 * Resolves: MON-2894506892 (Sprint 5, Task 5.7).
 */

import { ref, computed, useId } from 'vue';
import PropertyPanel from './PropertyPanel.vue';
import { parseCsv, DEFAULT_CSV_PARSE_CONFIG } from './csv-schema.js';
import type { TableRow, CsvParseError } from './csv-schema.js';
import type { TableCellModel, TableRowModel, TableWrapModel } from './types.js';

// Re-export so consumers can import from TableEditor.vue for convenience.
export type { TableCellModel, TableRowModel, TableWrapModel };

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
// The parent (App.vue) wires each emit to the corresponding action.
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
 * This is informational only (drives aria-label tooltip text); the renderer
 * handles visual truncation.
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

function onCellInput(rowIndex: number, colIndex: number, value: string): void {
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
         1. Width — UButton toggle group inside UFormField
         ====================================================================== -->
    <PropertyPanel title="Width">
      <UFormField name="table-width" class="table-editor__form-field">
        <div role="group" :aria-labelledby="widthGroupId" class="table-editor__toggle-group">
          <span :id="widthGroupId" class="sr-only">Column width preset</span>
          <UButton
            v-for="opt in ['sm', 'md', 'lg'] as const"
            :key="opt"
            color="neutral"
            size="sm"
            :variant="tableData.width === opt ? 'solid' : 'subtle'"
            :aria-pressed="tableData.width === opt"
            :disabled="disabled ?? false"
            class="table-editor__toggle-btn"
            @click="onWidthChange(opt)"
          >
            {{ opt }}
          </UButton>
        </div>
      </UFormField>
    </PropertyPanel>

    <!-- ======================================================================
         2. Text size — UButton toggle group inside UFormField
         ====================================================================== -->
    <PropertyPanel title="Text Size">
      <UFormField name="table-text-size" class="table-editor__form-field">
        <div role="group" :aria-labelledby="textSizeGroupId" class="table-editor__toggle-group">
          <span :id="textSizeGroupId" class="sr-only">Text size preset</span>
          <UButton
            v-for="opt in ['sm', 'md', 'lg'] as const"
            :key="opt"
            color="neutral"
            size="sm"
            :variant="tableData.textSize === opt ? 'solid' : 'subtle'"
            :aria-pressed="tableData.textSize === opt"
            :disabled="disabled ?? false"
            class="table-editor__toggle-btn"
            @click="onTextSizeChange(opt)"
          >
            {{ opt }}
          </UButton>
        </div>
      </UFormField>
    </PropertyPanel>

    <!-- ======================================================================
         3. Column header — USwitch with built-in label prop.
         USwitch renders a Reka SwitchRoot (<button role="switch">) + a Reka
         Label (via its own `label` prop). NOT wrapped in UFormField, which
         would inject a `name` and create a hidden <input> with no associated
         label — causing an axe WCAG violation (critical: label).
         ====================================================================== -->
    <PropertyPanel title="Column Header">
      <div class="table-editor__switch-field">
        <USwitch
          :model-value="tableData.hasColumnHeader"
          :disabled="disabled ?? false"
          size="sm"
          label="First row is a header"
          @update:model-value="onHeaderToggle"
        />
      </div>
    </PropertyPanel>

    <!-- ======================================================================
         4 + 5. Row count and Column count — UButton ghost +/-
         ====================================================================== -->
    <PropertyPanel title="Dimensions">
      <!-- Row count -->
      <div class="table-editor__counter-row">
        <span :id="rowCountLabelId" class="table-editor__counter-label">Rows</span>
        <div class="table-editor__counter-controls" :aria-labelledby="rowCountLabelId">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-minus"
            size="xs"
            aria-label="Remove row"
            :disabled="disabled || bodyRows.length <= 1"
            @click="onRowDecrease"
          />
          <span class="table-editor__counter-value" aria-live="polite" aria-atomic="true">{{
            bodyRows.length
          }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            size="xs"
            aria-label="Add row"
            :disabled="disabled || bodyRows.length >= MAX_ROWS"
            @click="onRowIncrease"
          />
        </div>
      </div>

      <!-- Column count -->
      <div class="table-editor__counter-row">
        <span :id="colCountLabelId" class="table-editor__counter-label">Columns</span>
        <div class="table-editor__counter-controls" :aria-labelledby="colCountLabelId">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-minus"
            size="xs"
            aria-label="Remove column"
            :disabled="disabled || colCount <= 1"
            @click="onColDecrease"
          />
          <span class="table-editor__counter-value" aria-live="polite" aria-atomic="true">{{
            colCount
          }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            size="xs"
            aria-label="Add column"
            :disabled="disabled || colCount >= MAX_COLS"
            @click="onColIncrease"
          />
        </div>
      </div>
    </PropertyPanel>

    <!-- ======================================================================
         6. Body rows editable cell grid — UInput per cell
         ====================================================================== -->
    <PropertyPanel title="Cells">
      <!--
        role="grid" communicates the row/column structure to AT.
        Each cell UInput has an aria-label describing its position.
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
            <UInput
              :model-value="cell.value"
              :disabled="disabled ?? false"
              size="sm"
              :aria-label="`Row ${rowIdx + 1}, column ${colIdx + 1}${truncationFlags.get(rowIdx) ? ' — content may be truncated' : ''}`"
              class="table-editor__cell-input"
              @update:model-value="(v: string) => onCellInput(rowIdx, colIdx, v)"
            />
          </div>
        </div>
      </div>
    </PropertyPanel>

    <!-- ======================================================================
         7. CSV import — UTextarea + UButton + UAlert for errors
         ====================================================================== -->
    <PropertyPanel title="CSV Import" :default-open="false">
      <div class="table-editor__csv">
        <!--
          CSV textarea — explicit label association via for/id pattern.
          UFormField's inject-based id wiring is unreliable in standalone
          vitest/jsdom (no Nuxt app context). A native <label>+id pattern
          gives testing-library the accessible name it needs.
        -->
        <label :for="csvTextareaId" class="table-editor__csv-label">
          Paste CSV (first row = header)
        </label>
        <UTextarea
          :id="csvTextareaId"
          v-model="csvInput"
          :disabled="disabled ?? false"
          :rows="3"
          placeholder="Name,Role,City&#10;Alice,Engineer,Amsterdam"
          :aria-describedby="csvErrors.length > 0 ? csvErrorsId : undefined"
          class="table-editor__csv-textarea"
        />

        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          :disabled="disabled || csvInput.trim().length === 0"
          class="table-editor__csv-parse-btn"
          @click="onCsvParse"
        >
          Parse &amp; Apply
        </UButton>

        <!--
          CSV errors — assertive live region so AT immediately announces
          parse failures. The element is always in the DOM to avoid the
          "live region not registered" AT miss.
          UAlert renders a <div>; the role="alert" + aria-live are added
          on the wrapper so the assertive region is always present.
        -->
        <div
          :id="csvErrorsId"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          class="table-editor__csv-errors"
        >
          <template v-if="csvErrors.length > 0">
            <UAlert
              v-for="(err, i) in csvErrors"
              :key="i"
              color="error"
              variant="subtle"
              :description="err.message"
              class="table-editor__csv-error-item"
            />
          </template>
        </div>

        <!-- Success status (polite) — rendered when last parse succeeded -->
        <p
          v-if="csvParsed && csvErrors.length === 0"
          role="status"
          aria-live="polite"
          class="table-editor__csv-success"
        >
          CSV imported successfully.
        </p>
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
   Form field wrappers
   --------------------------------------------------------------------------- */

.table-editor__form-field {
  padding: 6px 10px;
}

.table-editor__switch-field {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ---------------------------------------------------------------------------
   Toggle group (width / text size) — UButton rows
   --------------------------------------------------------------------------- */

.table-editor__toggle-group {
  display: flex;
  gap: 4px;
}

.table-editor__toggle-btn {
  flex: 1;
  min-height: 24px;
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

.table-editor__csv-field {
  width: 100%;
}

.table-editor__csv-label {
  font-size: 11px;
  color: var(--color-text, #374151);
  user-select: none;
}

.table-editor__csv-textarea {
  width: 100%;
  font-family: monospace;
}

.table-editor__csv-parse-btn {
  align-self: flex-start;
}

.table-editor__csv-errors {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table-editor__csv-error-item {
  width: 100%;
}

.table-editor__csv-success {
  margin: 0;
  font-size: 11px;
  color: var(--color-success, #16a34a);
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
