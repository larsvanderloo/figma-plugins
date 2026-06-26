// useGridNavigation — input refs, active-cell state and keyboard/pointer focus handling for TableGrid.

import { nextTick, onBeforeUpdate, ref, type ComputedRef } from 'vue';
import type { TableRowModel } from '../../../../shared/types';
import { bulletEnter } from '../../../../shared/table-bullets';

interface GridNavigationProps {
  rows: TableRowModel[];
}

interface GridNavigationEmit {
  (event: 'add-row-after', row: number): void;
  (event: 'cell-edit', row: number, col: number, value: string): void;
}

export function useGridNavigation(
  props: GridNavigationProps,
  columnCount: ComputedRef<number>,
  emit: GridNavigationEmit,
) {
  const inputRefs = new Map<string, HTMLTextAreaElement>();
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
      // Cmd/Ctrl+Enter adds a row after the current one and moves into it —
      // the explicit "next row" gesture.
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        emit('add-row-after', row);
        focusCell(row + 1, col);
        return;
      }
      if (event.shiftKey || event.altKey) return;
      // Apple-Notes bullet behavior: inside a bullet list, Enter continues the
      // list (fresh `- `) or, on an empty bullet, exits it. Outside a bullet
      // context bulletEnter() returns null and Enter is a normal newline.
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) {
        const result = bulletEnter(target.value, target.selectionStart);
        if (result !== null) {
          event.preventDefault();
          emit('cell-edit', row, col, result.value);
          // Restore the caret after Vue re-renders the controlled value.
          void nextTick(() => {
            const el = inputRefs.get(refKey(row, col));
            if (el !== undefined) {
              el.focus({ preventScroll: true });
              el.setSelectionRange(result.caret, result.caret);
            }
          });
        }
      }
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') return;
  }

  return {
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
  };
}
