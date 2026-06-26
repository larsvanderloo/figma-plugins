// useGridMenus — column/row/cell/footer dropdown-menu builders + their emit-and-refocus actions for TableGrid.

import type { ComputedRef } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import type { TableColumnCalculationSetting, TableRowModel } from '../../../../shared/types';
import { DELTA_ARROW_UP, DELTA_ARROW_DOWN, setDeltaArrow } from '../../../../shared/table-delta';
import { hasBulletLine, addBulletMarkers, stripBulletMarkers } from '../../../../shared/table-bullets';

interface GridMenusProps {
  rows: TableRowModel[];
  hasColumnHeader: boolean;
  maxRows: number;
  maxCols: number;
}

type GridMenusEmit = {
  (event: 'cell-edit', row: number, col: number, value: string): void;
  (event: 'cell-style', row: number, col: number, emphasis: boolean): void;
  (event: 'cell-delta', row: number, col: number, value: string): void;
  (event: 'column-calculation', col: number, calculation: TableColumnCalculationSetting): void;
  (event: 'column-calculation-emphasis', col: number, emphasis: boolean): void;
  (event: 'column-calculation-currency', col: number, currency: boolean): void;
  (event: 'column-calculation-percent', col: number, percent: boolean): void;
  (event: 'add-row-before', row: number): void;
  (event: 'add-row-after', row: number): void;
  (event: 'remove-row', row: number): void;
  (event: 'add-column-before', col: number): void;
  (event: 'add-column-after', col: number): void;
  (event: 'remove-column', col: number): void;
};

interface GridMenusDeps {
  columnCount: ComputedRef<number>;
  normalizedColumnCalculations: ComputedRef<TableColumnCalculationSetting[]>;
  normalizedColumnCalculationEmphasis: ComputedRef<boolean[]>;
  normalizedColumnCalculationCurrency: ComputedRef<boolean[]>;
  normalizedColumnCalculationPercent: ComputedRef<boolean[]>;
  focusCell: (row: number, col: number) => void;
  focusNearest: (row: number, col: number) => void;
}

export function useGridMenus(props: GridMenusProps, emit: GridMenusEmit, deps: GridMenusDeps) {
  const {
    columnCount,
    normalizedColumnCalculations,
    normalizedColumnCalculationEmphasis,
    normalizedColumnCalculationCurrency,
    normalizedColumnCalculationPercent,
    focusCell,
    focusNearest,
  } = deps;

  const columnMenuContent = { align: 'start', side: 'bottom', sideOffset: 4 } as const;
  const rowMenuContent = { align: 'start', side: 'right', sideOffset: 4 } as const;
  const cellMenuContent = { align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 80 } as const;
  const dropdownUi = { content: 'z-50 w-56 pointer-events-auto' } as const;

  function rowRemoveLabel(row: number): string {
    if (props.hasColumnHeader && row === 0) return 'Verwijder koprij';
    const displayRow = props.hasColumnHeader ? row : row + 1;
    return 'Verwijder rij ' + String(displayRow);
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
        {
          label: isCellBulleted(row, col) ? 'Opsomming verwijderen' : 'Opsommingstekens',
          icon: 'i-lucide-list',
          onSelect: () => toggleCellBullets(row, col),
        },
        {
          label: 'Delta',
          icon: 'i-lucide-trending-up',
          children: [
            {
              label: 'Pijl omhoog',
              icon: 'i-lucide-arrow-up',
              onSelect: () => setCellDeltaArrow(row, col, DELTA_ARROW_UP),
            },
            {
              label: 'Pijl omlaag',
              icon: 'i-lucide-arrow-down',
              onSelect: () => setCellDeltaArrow(row, col, DELTA_ARROW_DOWN),
            },
            {
              label: 'Pijl verwijderen',
              icon: 'i-lucide-eraser',
              onSelect: () => setCellDeltaArrow(row, col, null),
            },
          ],
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

  function clearCell(row: number, col: number): void {
    emit('cell-edit', row, col, '');
    focusCell(row, col);
  }

  function setCellEmphasis(row: number, col: number, emphasis: boolean): void {
    if (!canStyleCell(row)) return;
    emit('cell-style', row, col, emphasis);
    focusCell(row, col);
  }

  function cellValue(row: number, col: number): string {
    const cell = props.rows[row]?.cells[col];
    return cell !== undefined && typeof cell.value === 'string' ? cell.value : '';
  }

  function isCellBulleted(row: number, col: number): boolean {
    return hasBulletLine(cellValue(row, col));
  }

  // Toggle the cell between bullets and plain lines. If any line is already a
  // bullet, strip them all; otherwise add a `- ` to every non-empty line. The
  // canvas renderer applies the Figma list-style per bulleted line; here we
  // only edit the markers so the round trip and the toggle agree.
  function toggleCellBullets(row: number, col: number): void {
    if (!canStyleCell(row)) return;
    const value = cellValue(row, col);
    const next = hasBulletLine(value) ? stripBulletMarkers(value) : addBulletMarkers(value);
    emit('cell-edit', row, col, next);
    focusCell(row, col);
  }

  function cellDelta(row: number, col: number): string {
    const cell = props.rows[row]?.cells[col];
    return cell !== undefined && typeof cell.delta === 'string' ? cell.delta : '';
  }

  function setCellDeltaArrow(row: number, col: number, arrow: string | null): void {
    if (!canStyleCell(row)) return;
    emit('cell-delta', row, col, setDeltaArrow(cellDelta(row, col), arrow));
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

  function isColumnCalculationPercent(col: number): boolean {
    return normalizedColumnCalculationPercent.value[col] === true;
  }

  function setColumnCalculationPercent(col: number, percent: boolean): void {
    emit('column-calculation-percent', col, percent);
  }

  // Footer/sum cell exposes the emphasis toggle (mirroring the per-cell
  // "Cel benadrukken" action) plus currency/percent toggles for the sum
  // value (mutually exclusive, enforced in useTableMutations).
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
        {
          label: isColumnCalculationPercent(col) ? 'Procentteken verbergen' : 'Procentteken tonen',
          icon: 'i-lucide-percent',
          onSelect: () => setColumnCalculationPercent(col, !isColumnCalculationPercent(col)),
        },
      ],
    ];
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

  return {
    columnMenuContent,
    rowMenuContent,
    cellMenuContent,
    dropdownUi,
    rowMenuItems,
    columnMenuItems,
    cellMenuItems,
    footerMenuItems,
    isCellEmphasized,
  };
}
