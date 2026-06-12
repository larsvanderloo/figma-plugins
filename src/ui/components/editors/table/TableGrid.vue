<script setup lang="ts">
import { computed, nextTick, onBeforeUpdate, ref } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import type {
  TableColumnCalculationSetting,
  TableColumnSummary,
  TableRowModel,
} from '../../../../shared/types';
import { tokenize } from '../../../../shared/csv';
import {
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../../shared/table-calculations';

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
const inputRefs = new Map<string, HTMLTextAreaElement>();
const columnMenuContent = { align: 'start', side: 'bottom', sideOffset: 4 } as const;
const rowMenuContent = { align: 'start', side: 'right', sideOffset: 4 } as const;
const cellMenuContent = { align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 80 } as const;
const dropdownUi = { content: 'z-50 w-56 pointer-events-auto' } as const;
const dragging = ref<{ type: 'row' | 'column'; from: number } | null>(null);
const rowDropTarget = ref<{ index: number; side: 'before' | 'after' } | null>(null);
const columnDropTarget = ref<{ index: number; side: 'before' | 'after' } | null>(null);
const activeCell = ref<{ row: number; col: number } | null>(null);

onBeforeUpdate(() => {
  inputRefs.clear();
});

function refKey(row: number, col: number): string {
  return String(row) + '-' + String(col);
}

function setInputRef(el: unknown, row: number, col: number): void {
  const target = textareaElement(el);
  if (target !== null) inputRefs.set(refKey(row, col), target);
}

function textareaElement(el: unknown): HTMLTextAreaElement | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el === null || typeof el !== 'object') return null;
  const exposed = el as {
    textareaRef?: HTMLTextAreaElement | { value?: HTMLTextAreaElement | null } | null;
  };
  if (exposed.textareaRef instanceof HTMLTextAreaElement) return exposed.textareaRef;
  if (
    exposed.textareaRef !== null &&
    typeof exposed.textareaRef === 'object' &&
    exposed.textareaRef.value instanceof HTMLTextAreaElement
  ) {
    return exposed.textareaRef.value;
  }
  return null;
}

function focusCell(row: number, col: number): void {
  setActiveCell(row, col);
  void nextTick(() => {
    const target = inputRefs.get(refKey(row, col));
    if (target !== undefined) {
      target.focus({ preventScroll: true });
      target.select();
    }
  });
}

function setActiveCell(row: number, col: number): void {
  activeCell.value = { row, col };
}

function clearActiveCell(row: number, col: number): void {
  if (activeCell.value?.row === row && activeCell.value.col === col) activeCell.value = null;
}

function isActiveCell(row: number, col: number): boolean {
  return activeCell.value?.row === row && activeCell.value.col === col;
}

function activeCellClass(row: number, col: number): string {
  return isActiveCell(row, col) ? 'bg-primary/5 ring-2 ring-inset ring-primary/60' : '';
}

function isInteractiveCellTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="menuitem"]') !== null;
}

function focusCellFromPointer(event: MouseEvent, row: number, col: number): void {
  if (isInteractiveCellTarget(event.target)) return;
  event.preventDefault();
  setActiveCell(row, col);
  const target = inputRefs.get(refKey(row, col));
  if (target !== undefined) {
    target.focus({ preventScroll: true });
    target.select();
    return;
  }
  focusCell(row, col);
}

function clearActiveCellFromFocus(event: FocusEvent, row: number, col: number): void {
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof HTMLElement && next instanceof Node && current.contains(next)) return;
  clearActiveCell(row, col);
}

function onCellFocusIn(row: number, col: number): void {
  setActiveCell(row, col);
}

function onCellClick(event: MouseEvent, row: number, col: number): void {
  if (isInteractiveCellTarget(event.target)) return;
  focusCellFromPointer(event, row, col);
}

function onCellPointerDown(event: PointerEvent, row: number, col: number): void {
  const target = event.target;
  if (target instanceof Element && target.closest('textarea') !== null) setActiveCell(row, col);
}

function clampColumn(col: number): number {
  if (col < 0) return 0;
  const max = columnCount.value - 1;
  return col > max ? max : col;
}

function focusNearest(row: number, col: number): void {
  if (props.rows.length === 0) return;
  const maxRow = props.rows.length - 1;
  const nextRow = row < 0 ? 0 : row > maxRow ? maxRow : row;
  focusCell(nextRow, clampColumn(col));
}

function cellLabel(row: number, col: number): string {
  if (props.hasColumnHeader && row === 0) return 'Koprij, kolom ' + String(col + 1);
  const displayRow = props.hasColumnHeader ? row : row + 1;
  return 'Rij ' + String(displayRow) + ', kolom ' + String(col + 1);
}

function rowRemoveLabel(row: number): string {
  if (props.hasColumnHeader && row === 0) return 'Verwijder koprij';
  const displayRow = props.hasColumnHeader ? row : row + 1;
  return 'Verwijder rij ' + String(displayRow);
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

function rowMenuItems(row: number): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Rij erboven invoegen',
        icon: 'i-lucide-arrow-up-to-line',
        disabled: props.rows.length >= props.maxRows,
        onSelect: () => addRowBefore(row, 0),
      },
      {
        label: 'Rij eronder invoegen',
        icon: 'i-lucide-arrow-down-to-line',
        disabled: props.rows.length >= props.maxRows,
        onSelect: () => addRowAfter(row, 0),
      },
    ],
    [
      {
        label: rowRemoveLabel(row),
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.rows.length <= 1,
        onSelect: () => removeRow(row, 0),
      },
    ],
  ];
}

function columnMenuItems(col: number): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Kolom links invoegen',
        icon: 'i-lucide-panel-left',
        disabled: columnCount.value >= props.maxCols,
        onSelect: () => addColumnBefore(col),
      },
      {
        label: 'Kolom rechts invoegen',
        icon: 'i-lucide-panel-right',
        disabled: columnCount.value >= props.maxCols,
        onSelect: () => addColumnAfter(col),
      },
    ],
    [
      { label: 'Berekeningen', type: 'label' },
      {
        label: normalizedColumnCalculations.value[col] === 'sum' ? 'Som verwijderen' : 'Som berekenen',
        icon: 'i-lucide-sigma',
        onSelect: () =>
          setColumnCalculation(col, normalizedColumnCalculations.value[col] === 'sum' ? null : 'sum'),
      },
      { label: 'Gemiddelde', icon: 'i-lucide-divide', disabled: true },
      { label: 'Aantal', icon: 'i-lucide-hash', disabled: true },
    ],
    [
      {
        label: 'Kolom verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: columnCount.value <= 1,
        onSelect: () => removeColumn(col),
      },
    ],
  ];
}

function isCellEmphasized(row: number, col: number): boolean {
  if (!canStyleCell(row)) return false;
  return props.rows[row]?.cells[col]?.emphasis === true;
}

function canStyleCell(row: number): boolean {
  return !(props.hasColumnHeader && row === 0);
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

function cellMenuItems(row: number, col: number): DropdownMenuItem[][] {
  const items: DropdownMenuItem[][] = [
    [
      {
        label: 'Cel leegmaken',
        icon: 'i-lucide-eraser',
        disabled: props.rows[row]?.cells[col]?.value === '',
        onSelect: () => clearCell(row, col),
      },
    ],
  ];
  if (canStyleCell(row)) {
    items.push([
      {
        label: isCellEmphasized(row, col) ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => setCellEmphasis(row, col, !isCellEmphasized(row, col)),
      },
    ]);
  }
  items.push(
    [
      {
        label: 'Rij erboven invoegen',
        icon: 'i-lucide-arrow-up-to-line',
        disabled: props.rows.length >= props.maxRows,
        onSelect: () => addRowBefore(row, col),
      },
      {
        label: 'Rij eronder invoegen',
        icon: 'i-lucide-arrow-down-to-line',
        disabled: props.rows.length >= props.maxRows,
        onSelect: () => addRowAfter(row, col),
      },
      {
        label: 'Kolom links invoegen',
        icon: 'i-lucide-panel-left',
        disabled: columnCount.value >= props.maxCols,
        onSelect: () => addColumnBefore(col),
      },
      {
        label: 'Kolom rechts invoegen',
        icon: 'i-lucide-panel-right',
        disabled: columnCount.value >= props.maxCols,
        onSelect: () => addColumnAfter(col),
      },
    ],
    [
      {
        label: rowRemoveLabel(row),
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.rows.length <= 1,
        onSelect: () => removeRow(row, col),
      },
      {
        label: 'Kolom verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: columnCount.value <= 1,
        onSelect: () => removeColumn(col),
      },
    ],
  );
  return items;
}

function updateCellValue(value: unknown, row: number, col: number): void {
  emit('cell-edit', row, col, String(value ?? ''));
}

function clearCell(row: number, col: number): void {
  emit('cell-edit', row, col, '');
  focusCell(row, col);
}

function setCellEmphasis(row: number, col: number, emphasis: boolean): void {
  if (!canStyleCell(row)) return;
  emit('cell-style', row, col, emphasis);
  focusCell(row, col);
}

function setColumnCalculation(col: number, calculation: TableColumnCalculationSetting): void {
  emit('column-calculation', col, calculation);
}

function isColumnCalculationEmphasized(col: number): boolean {
  return normalizedColumnCalculationEmphasis.value[col] === true;
}

function setColumnCalculationEmphasis(col: number, emphasis: boolean): void {
  emit('column-calculation-emphasis', col, emphasis);
}

function isColumnCalculationCurrency(col: number): boolean {
  return normalizedColumnCalculationCurrency.value[col] === true;
}

function setColumnCalculationCurrency(col: number, currency: boolean): void {
  emit('column-calculation-currency', col, currency);
}

// Footer/sum cell exposes the emphasis toggle (mirroring the per-cell
// "Cel benadrukken" action) plus a currency toggle for the sum value.
function footerMenuItems(col: number): DropdownMenuItem[][] {
  return [
    [
      {
        label: isColumnCalculationEmphasized(col) ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => setColumnCalculationEmphasis(col, !isColumnCalculationEmphasized(col)),
      },
      {
        label: isColumnCalculationCurrency(col) ? 'Euroteken verbergen' : 'Euroteken tonen',
        icon: 'i-lucide-euro',
        onSelect: () => setColumnCalculationCurrency(col, !isColumnCalculationCurrency(col)),
      },
    ],
  ];
}

function onEnter(row: number, col: number): void {
  const nextRow = row + 1;
  if (nextRow < props.rows.length) {
    focusCell(nextRow, col);
  }
}

function moveFromCell(row: number, col: number, deltaRow: number, deltaCol: number): void {
  let nextRow = row + deltaRow;
  let nextCol = col + deltaCol;

  if (nextCol >= columnCount.value) {
    nextCol = 0;
    nextRow += 1;
  } else if (nextCol < 0) {
    nextCol = columnCount.value - 1;
    nextRow -= 1;
  }

  if (nextRow >= props.rows.length) return;
  focusNearest(nextRow, nextCol);
}

function onKeydown(event: KeyboardEvent, row: number, col: number): void {
  if (event.key === 'Escape') {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) target.blur();
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    if (!event.shiftKey && row === props.rows.length - 1 && col === columnCount.value - 1) {
      emit('add-row-after', row);
      focusCell(row + 1, 0);
      return;
    }
    moveFromCell(row, col, 0, event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === 'Enter') {
    if (event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      emit('add-row-after', row);
      focusCell(row + 1, col);
      return;
    }
    onEnter(row, col);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') return;
}

function addColumnAfter(col: number): void {
  emit('add-column-after', col);
  focusCell(0, col + 1);
}

function addColumnBefore(col: number): void {
  emit('add-column-before', col);
  focusCell(0, col);
}

function removeColumn(col: number): void {
  emit('remove-column', col);
  focusNearest(0, col - 1);
}

function addRowBefore(row: number, col: number): void {
  emit('add-row-before', row);
  focusCell(row, col);
}

function addRowAfter(row: number, col: number): void {
  emit('add-row-after', row);
  focusCell(row + 1, col);
}

function removeRow(row: number, col: number): void {
  emit('remove-row', row);
  focusNearest(row, col);
}

function setDragData(event: DragEvent, type: 'row' | 'column', index: number): void {
  dragging.value = { type, from: index };
  if (event.dataTransfer === null) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', type + ':' + String(index));
}

function clearDragState(): void {
  dragging.value = null;
  rowDropTarget.value = null;
  columnDropTarget.value = null;
}

function dragInsertSide(event: DragEvent, axis: 'x' | 'y'): 'before' | 'after' {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return 'before';
  const rect = target.getBoundingClientRect();
  if (axis === 'x') {
    return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
  }
  return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

function onRowDragStart(event: DragEvent, row: number): void {
  if (props.rows.length <= 1) return;
  setDragData(event, 'row', row);
}

function onColumnDragStart(event: DragEvent, col: number): void {
  if (columnCount.value <= 1) return;
  setDragData(event, 'column', col);
}

function onRowDragOver(event: DragEvent, row: number): void {
  if (dragging.value?.type !== 'row') return;
  event.preventDefault();
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
  rowDropTarget.value = { index: row, side: dragInsertSide(event, 'y') };
}

function onColumnDragOver(event: DragEvent, col: number): void {
  if (dragging.value?.type !== 'column') return;
  event.preventDefault();
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
  columnDropTarget.value = { index: col, side: dragInsertSide(event, 'x') };
}

function onRowDrop(event: DragEvent, row: number): void {
  if (dragging.value?.type !== 'row') return;
  event.preventDefault();
  const side = rowDropTarget.value?.index === row ? rowDropTarget.value.side : dragInsertSide(event, 'y');
  const to = side === 'after' ? row + 1 : row;
  const focusRow = dragging.value.from < to ? to - 1 : to;
  emit('move-row', dragging.value.from, to);
  focusCell(focusRow, 0);
  clearDragState();
}

function onColumnDrop(event: DragEvent, col: number): void {
  if (dragging.value?.type !== 'column') return;
  event.preventDefault();
  const side =
    columnDropTarget.value?.index === col ? columnDropTarget.value.side : dragInsertSide(event, 'x');
  const to = side === 'after' ? col + 1 : col;
  const focusCol = dragging.value.from < to ? to - 1 : to;
  emit('move-column', dragging.value.from, to);
  focusCell(0, focusCol);
  clearDragState();
}

function rowDropClass(row: number): string {
  if (rowDropTarget.value?.index !== row) return '';
  return 'bg-primary/5 ring-2 ring-inset ring-primary/60';
}

function columnDropClass(col: number): string {
  if (columnDropTarget.value?.index !== col) return '';
  return 'bg-primary/5 ring-2 ring-inset ring-primary/60';
}

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

function onPaste(event: ClipboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  const rowAttr = target.dataset.row;
  const colAttr = target.dataset.col;
  if (rowAttr === undefined || colAttr === undefined) return;
  const text = event.clipboardData !== null ? event.clipboardData.getData('text/plain') : '';
  if (text === '') return;

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
