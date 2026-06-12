<script setup lang="ts">
import { computed } from 'vue';
import type {
  TableColumnCalculationSetting,
  TableColumnSummary,
  TableRowModel,
} from '../../../../shared/types';
import {
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../../shared/table-calculations';
import { useGridNavigation } from './useGridNavigation';
import { useGridDragging } from './useGridDragging';
import { useGridMenus } from './useGridMenus';
import { createPasteHandler } from './grid-clipboard';

interface Props {
  rows: TableRowModel[];
  hasColumnHeader: boolean;
  columnCalculations: TableColumnCalculationSetting[];
  columnCalculationEmphasis: boolean[];
  columnCalculationCurrency: boolean[];
  maxRows: number;
  maxCols: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'cell-edit': [row: number, col: number, value: string];
  'cell-style': [row: number, col: number, emphasis: boolean];
  'column-calculation': [col: number, calculation: TableColumnCalculationSetting];
  'column-calculation-emphasis': [col: number, emphasis: boolean];
  'column-calculation-currency': [col: number, currency: boolean];
  'add-row-before': [row: number];
  'add-row-after': [row: number];
  'remove-row': [row: number];
  'add-column-before': [col: number];
  'add-column-after': [col: number];
  'remove-column': [col: number];
  'move-row': [from: number, to: number];
  'move-column': [from: number, to: number];
  'paste-matrix': [row: number, col: number, matrix: string[][]];
}>();

const columnCount = computed<number>(() => {
  if (props.rows.length === 0) return 1;
  return props.rows[0].cells.length > 0 ? props.rows[0].cells.length : 1;
});
const normalizedColumnCalculations = computed<TableColumnCalculationSetting[]>(() =>
  normalizeColumnCalculations(props.columnCalculations, columnCount.value),
);
const normalizedColumnCalculationEmphasis = computed<boolean[]>(() =>
  normalizeColumnEmphasis(props.columnCalculationEmphasis, columnCount.value),
);
const normalizedColumnCalculationCurrency = computed<boolean[]>(() =>
  normalizeColumnEmphasis(props.columnCalculationCurrency, columnCount.value),
);
const columnSummaries = computed<Array<TableColumnSummary | null>>(() =>
  computeTableColumnSummaries(
    props.rows,
    props.hasColumnHeader,
    normalizedColumnCalculations.value,
    columnCount.value,
    normalizedColumnCalculationEmphasis.value,
    normalizedColumnCalculationCurrency.value,
  ),
);
const hasCalculationFooter = computed<boolean>(() =>
  hasColumnCalculations(normalizedColumnCalculations.value),
);
const gridMinWidth = computed<string>(() => String(56 + columnCount.value * 160) + 'px');

const {
  setInputRef,
  focusCell,
  focusNearest,
  activeCellClass,
  focusCellFromPointer,
  clearActiveCellFromFocus,
  onCellFocusIn,
  onCellClick,
  onCellPointerDown,
  onKeydown,
} = useGridNavigation(props, columnCount, emit);

const {
  clearDragState,
  onRowDragStart,
  onColumnDragStart,
  onRowDragOver,
  onColumnDragOver,
  onRowDrop,
  onColumnDrop,
  rowDropClass,
  columnDropClass,
} = useGridDragging(props, columnCount, emit, focusCell);

const {
  columnMenuContent,
  rowMenuContent,
  cellMenuContent,
  dropdownUi,
  rowMenuItems,
  columnMenuItems,
  cellMenuItems,
  footerMenuItems,
  isCellEmphasized,
} = useGridMenus(props, emit, {
  columnCount,
  normalizedColumnCalculations,
  normalizedColumnCalculationEmphasis,
  normalizedColumnCalculationCurrency,
  focusCell,
  focusNearest,
});

const onPaste = createPasteHandler(props, emit, focusCell);

function cellLabel(row: number, col: number): string {
  if (props.hasColumnHeader && row === 0) return 'Koprij, kolom ' + String(col + 1);
  const displayRow = props.hasColumnHeader ? row : row + 1;
  return 'Rij ' + String(displayRow) + ', kolom ' + String(col + 1);
}

function rowDisplayLabel(row: number): string {
  if (props.hasColumnHeader && row === 0) return 'H';
  return String(props.hasColumnHeader ? row : row + 1);
}

function rowMenuLabel(row: number): string {
  if (props.hasColumnHeader && row === 0) return 'Koprij opties';
  const displayRow = props.hasColumnHeader ? row : row + 1;
  return 'Rij ' + String(displayRow) + ' opties';
}

// A column with a (numeric) sum calculation is right-aligned across header,
// body and footer — mirrors the canvas renderer's Notion number-column style.
function isRightAlignedColumn(col: number): boolean {
  return normalizedColumnCalculations.value[col] === 'sum';
}

function cellTextareaUi(row: number, col: number): { root: string; base: string } {
  const emphasized = isCellEmphasized(row, col);
  return {
    root: 'w-full',
    base:
      'block min-h-9 w-full resize-none rounded-none border-0 bg-transparent px-2 py-1.5 pr-8 text-sm leading-5 text-default outline-none ring-0 placeholder:text-dimmed focus:bg-transparent focus:ring-0 focus-visible:outline-none ' +
      (isRightAlignedColumn(col) ? 'text-right ' : '') +
      (props.hasColumnHeader && row === 0 ? 'font-semibold ' : '') +
      (emphasized ? 'font-semibold' : ''),
  };
}

function updateCellValue(value: unknown, row: number, col: number): void {
  emit('cell-edit', row, col, String(value ?? ''));
}
</script>

<template>
  <div
    class="overflow-x-auto rounded-sm border border-muted bg-default"
    @dragend="clearDragState"
    @paste="onPaste"
  >
    <table class="w-full table-fixed border-separate border-spacing-0 text-sm" :style="{ minWidth: gridMinWidth }">
      <caption class="sr-only">Tabelinhoud bewerken</caption>
      <colgroup>
        <col class="w-14" />
        <col v-for="j in columnCount" :key="'col-' + j" />
      </colgroup>
      <thead>
        <tr class="bg-muted/30 text-dimmed">
          <th scope="col" class="w-14 border-b border-r border-default px-1 py-1">
            <span class="sr-only">Rijen</span>
          </th>
          <th
            v-for="j in columnCount"
            :key="'head-' + j"
            scope="col"
            class="border-b border-r border-default px-1.5 py-1 text-left font-medium transition-shadow last:border-r-0"
            :class="columnDropClass(j - 1)"
            @dragover="(event: DragEvent) => onColumnDragOver(event, j - 1)"
            @drop="(event: DragEvent) => onColumnDrop(event, j - 1)"
          >
            <div
              class="flex h-7 cursor-grab items-center justify-between gap-1 active:cursor-grabbing"
              draggable="true"
              @dragstart="(event: DragEvent) => onColumnDragStart(event, j - 1)"
            >
              <span class="truncate px-1 text-xs">Kolom {{ j }}</span>
              <UDropdownMenu
                :items="columnMenuItems(j - 1)"
                :content="columnMenuContent"
                :ui="dropdownUi"
                :modal="false"
                size="xs"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-chevron-down"
                  :aria-label="'Menu voor kolom ' + j"
                  :title="'Menu voor kolom ' + j"
                />
              </UDropdownMenu>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIdx) in rows"
          :key="'row-' + rowIdx"
          class="group/row transition-colors"
          :class="[hasColumnHeader && rowIdx === 0 ? 'bg-muted/20 hover:bg-muted/30' : 'bg-default hover:bg-muted/10', rowDropClass(rowIdx)]"
          @dragover="(event: DragEvent) => onRowDragOver(event, rowIdx)"
          @drop="(event: DragEvent) => onRowDrop(event, rowIdx)"
        >
          <th
            scope="row"
            class="w-14 border-r border-muted bg-muted/20 px-1 py-0 text-center align-top"
            :class="rowIdx === rows.length - 1 ? 'border-b-0' : 'border-b border-default'"
          >
            <div class="flex h-9 items-center justify-center gap-0.5">
              <UDropdownMenu
                :items="rowMenuItems(rowIdx)"
                :content="rowMenuContent"
                :ui="dropdownUi"
                :modal="false"
                size="xs"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-grip-vertical"
                  class="cursor-grab opacity-50 transition-opacity active:cursor-grabbing group-hover/row:opacity-100 focus:opacity-100"
                  draggable="true"
                  :aria-label="rowMenuLabel(rowIdx)"
                  :title="rowMenuLabel(rowIdx)"
                  @dragstart="(event: DragEvent) => onRowDragStart(event, rowIdx)"
                />
              </UDropdownMenu>
              <span class="min-w-4 text-[11px] font-medium text-dimmed">
                {{ rowDisplayLabel(rowIdx) }}
              </span>
            </div>
          </th>
          <td
            v-for="(cell, colIdx) in row.cells"
            :key="'cell-' + rowIdx + '-' + colIdx"
            class="group/cell relative cursor-text border-r border-muted p-0 align-top transition-colors last:border-r-0 hover:bg-muted/10"
            :class="[rowIdx === rows.length - 1 ? 'border-b-0' : 'border-b border-default', activeCellClass(rowIdx, colIdx)]"
            @mousedown="(event: MouseEvent) => focusCellFromPointer(event, rowIdx, colIdx)"
            @click="(event: MouseEvent) => onCellClick(event, rowIdx, colIdx)"
            @focusin="onCellFocusIn(rowIdx, colIdx)"
            @focusout="(event: FocusEvent) => clearActiveCellFromFocus(event, rowIdx, colIdx)"
            @pointerdown="(event: PointerEvent) => onCellPointerDown(event, rowIdx, colIdx)"
          >
            <div class="relative">
              <UTextarea
                :ref="(el) => setInputRef(el, rowIdx, colIdx)"
                :model-value="cell.value"
                :data-row="rowIdx"
                :data-col="colIdx"
                :aria-label="cellLabel(rowIdx, colIdx)"
                :rows="1"
                :maxrows="8"
                :ui="cellTextareaUi(rowIdx, colIdx)"
                autoresize
                color="primary"
                fixed
                variant="none"
                wrap="soft"
                @update:model-value="(value: string) => updateCellValue(value, rowIdx, colIdx)"
                @keydown="(event: KeyboardEvent) => onKeydown(event, rowIdx, colIdx)"
              />
              <UDropdownMenu
                :items="cellMenuItems(rowIdx, colIdx)"
                :content="cellMenuContent"
                :ui="dropdownUi"
                :modal="false"
                size="xs"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-ellipsis"
                  class="absolute right-1 top-1 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/cell:opacity-70 group-hover/cell:opacity-70"
                  :aria-label="'Menu voor ' + cellLabel(rowIdx, colIdx)"
                  :title="'Menu voor ' + cellLabel(rowIdx, colIdx)"
                />
              </UDropdownMenu>
            </div>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="hasCalculationFooter">
        <tr>
          <th
            scope="row"
            class="w-14 border-r border-t border-default bg-muted/20 px-1 py-1 text-center align-top"
          >
            <span class="sr-only">Berekeningen</span>
          </th>
          <td
            v-for="(summary, summaryIdx) in columnSummaries"
            :key="'summary-' + summaryIdx"
            class="group/footer relative border-r border-t border-default px-2 py-1.5 align-top transition-colors last:border-r-0 hover:bg-muted/10"
          >
            <div v-if="summary !== null" class="flex min-h-9 items-center gap-1 pr-8">
              <UIcon
                name="i-lucide-sigma"
                class="size-3 shrink-0 text-dimmed"
                aria-hidden="true"
              />
              <span class="shrink-0 text-xs leading-5 text-dimmed">Som</span>
              <span
                class="flex-1 truncate text-right text-sm leading-5 text-default"
                :class="summary.emphasis ? 'font-semibold' : ''"
              >
                {{ summary.currency ? '€' + summary.value : summary.value }}
              </span>
            </div>
            <UDropdownMenu
              v-if="summary !== null"
              :items="footerMenuItems(summaryIdx)"
              :content="cellMenuContent"
              :ui="dropdownUi"
              :modal="false"
              size="xs"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-ellipsis"
                class="absolute right-1 top-1 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/footer:opacity-70 group-hover/footer:opacity-70"
                :aria-label="'Menu voor som van kolom ' + (summaryIdx + 1)"
                :title="'Menu voor som van kolom ' + (summaryIdx + 1)"
              />
            </UDropdownMenu>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
