// useGridDragging — row/column drag-and-drop reorder state + handlers for TableGrid.

import { ref, type ComputedRef } from 'vue';
import type { TableRowModel } from '../../../../shared/types';

interface GridDraggingProps {
  rows: TableRowModel[];
}

type GridDraggingEmit = {
  (event: 'move-row', from: number, to: number): void;
  (event: 'move-column', from: number, to: number): void;
};

export function useGridDragging(
  props: GridDraggingProps,
  columnCount: ComputedRef<number>,
  emit: GridDraggingEmit,
  focusCell: (row: number, col: number) => void,
) {
  const dragging = ref<{ type: 'row' | 'column'; from: number } | null>(null);
  const rowDropTarget = ref<{ index: number; side: 'before' | 'after' } | null>(null);
  const columnDropTarget = ref<{ index: number; side: 'before' | 'after' } | null>(null);

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

  return {
    clearDragState,
    onRowDragStart,
    onColumnDragStart,
    onRowDragOver,
    onColumnDragOver,
    onRowDrop,
    onColumnDrop,
    rowDropClass,
    columnDropClass,
  };
}
