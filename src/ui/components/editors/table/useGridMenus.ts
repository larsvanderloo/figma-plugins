import type { ComputedRef } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import type { TableColumnCalculationSetting, TableRowModel } from '../../../../shared/types';
import { DELTA_ARROW_UP, DELTA_ARROW_DOWN, setDeltaArrow } from '../../../../shared/table-delta';
import {
  cellMarkerType,
  markerPrefix,
  setLineMarkers,
  stripBulletMarkers,
  type LineMarkerType,
} from '../../../../shared/table-bullets';

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
  (event: 'cell-check', row: number, col: number, state: boolean | null): void;
  (event: 'cell-badge', row: number, col: number, value: string): void;
  (event: 'row-emphasis', row: number, on: boolean): void;
  (event: 'column-emphasis', col: number, on: boolean): void;
  (event: 'row-check', row: number, state: boolean | null): void;
  (event: 'column-check', col: number, state: boolean | null): void;
  (event: 'row-badge', row: number, on: boolean): void;
  (event: 'column-badge', col: number, on: boolean): void;
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
        { label: 'Opmaak', type: 'label' },
        {
          label: 'Rij benadrukken',
          icon: 'i-lucide-bold',
          disabled: !canStyleCell(row),
          onSelect: () => emit('row-emphasis', row, true),
        },
        {
          label: 'Nadruk verwijderen',
          icon: 'i-lucide-remove-formatting',
          disabled: !canStyleCell(row),
          onSelect: () => emit('row-emphasis', row, false),
        },
        {
          label: 'Vinkjes',
          icon: 'i-lucide-circle-check',
          disabled: !canStyleCell(row),
          children: [
            {
              label: 'Aangevinkt',
              icon: 'i-lucide-circle-check',
              onSelect: () => emit('row-check', row, true),
            },
            {
              label: 'Uitgevinkt',
              icon: 'i-lucide-circle',
              onSelect: () => emit('row-check', row, false),
            },
            {
              label: 'Vinkjes verwijderen',
              icon: 'i-lucide-circle-off',
              onSelect: () => emit('row-check', row, null),
            },
          ],
        },
        {
          label: 'Badges',
          icon: 'i-lucide-hash',
          disabled: !canStyleCell(row),
          children: [
            {
              label: 'Badges toevoegen',
              icon: 'i-lucide-plus',
              onSelect: () => emit('row-badge', row, true),
            },
            {
              label: 'Badges verwijderen',
              icon: 'i-lucide-minus',
              onSelect: () => emit('row-badge', row, false),
            },
          ],
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
        { label: 'Opmaak', type: 'label' },
        {
          label: 'Kolom benadrukken',
          icon: 'i-lucide-bold',
          onSelect: () => emit('column-emphasis', col, true),
        },
        {
          label: 'Nadruk verwijderen',
          icon: 'i-lucide-remove-formatting',
          onSelect: () => emit('column-emphasis', col, false),
        },
        {
          label: 'Vinkjes',
          icon: 'i-lucide-circle-check',
          children: [
            {
              label: 'Aangevinkt',
              icon: 'i-lucide-circle-check',
              onSelect: () => emit('column-check', col, true),
            },
            {
              label: 'Uitgevinkt',
              icon: 'i-lucide-circle',
              onSelect: () => emit('column-check', col, false),
            },
            {
              label: 'Vinkjes verwijderen',
              icon: 'i-lucide-circle-off',
              onSelect: () => emit('column-check', col, null),
            },
          ],
        },
        {
          label: 'Badges',
          icon: 'i-lucide-hash',
          children: [
            {
              label: 'Badges toevoegen',
              icon: 'i-lucide-plus',
              onSelect: () => emit('column-badge', col, true),
            },
            {
              label: 'Badges verwijderen',
              icon: 'i-lucide-minus',
              onSelect: () => emit('column-badge', col, false),
            },
          ],
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
          label: 'Lijst',
          icon: 'i-lucide-list',
          children: [
            {
              label: 'Opsommingstekens',
              icon: 'i-lucide-list',
              onSelect: () => setCellMarkers(row, col, 'bullet'),
            },
            {
              label: 'Vinkjes (' + markerPrefix('check').trim() + ')',
              icon: 'i-lucide-check',
              onSelect: () => setCellMarkers(row, col, 'check'),
            },
            {
              label: 'Kruisjes (' + markerPrefix('cross').trim() + ')',
              icon: 'i-lucide-x',
              onSelect: () => setCellMarkers(row, col, 'cross'),
            },
            {
              label: 'Lijst verwijderen',
              icon: 'i-lucide-list-x',
              disabled: cellMarkerType(cellValue(row, col)) === null,
              onSelect: () => clearCellMarkers(row, col),
            },
          ],
        },
        {
          label: 'Vinkje',
          icon: 'i-lucide-circle-check',
          children: [
            {
              label: 'Aangevinkt',
              icon: 'i-lucide-circle-check',
              onSelect: () => emit('cell-check', row, col, true),
            },
            {
              label: 'Uitgevinkt',
              icon: 'i-lucide-circle',
              onSelect: () => emit('cell-check', row, col, false),
            },
            {
              label: 'Vinkje verwijderen',
              icon: 'i-lucide-circle-off',
              disabled: cellCheck(row, col) === null,
              onSelect: () => emit('cell-check', row, col, null),
            },
          ],
        },
        {
          label: cellBadge(row, col) === '' ? 'Badge toevoegen' : 'Badge verwijderen',
          icon: 'i-lucide-hash',
          onSelect: () => emit('cell-badge', row, col, cellBadge(row, col) === '' ? '0' : ''),
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

  // Replaces markers of any other type, so switching list type is one action. On canvas,
  // bullets get Figma's list style; ✓/✗ stay literal glyphs (Figma has no check list style).
  function setCellMarkers(row: number, col: number, type: LineMarkerType): void {
    if (!canStyleCell(row)) return;
    emit('cell-edit', row, col, setLineMarkers(cellValue(row, col), type));
    focusCell(row, col);
  }

  function clearCellMarkers(row: number, col: number): void {
    if (!canStyleCell(row)) return;
    emit('cell-edit', row, col, stripBulletMarkers(cellValue(row, col)));
    focusCell(row, col);
  }

  function cellDelta(row: number, col: number): string {
    const cell = props.rows[row]?.cells[col];
    return cell !== undefined && typeof cell.delta === 'string' ? cell.delta : '';
  }

  function cellCheck(row: number, col: number): boolean | null {
    const cell = props.rows[row]?.cells[col];
    if (cell === undefined) return null;
    return cell.check === true ? true : cell.check === false ? false : null;
  }

  function cellBadge(row: number, col: number): string {
    const cell = props.rows[row]?.cells[col];
    return cell !== undefined && typeof cell.badge === 'string' ? cell.badge : '';
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

  // Currency and percent are mutually exclusive; useTableMutations enforces that, not this menu.
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
