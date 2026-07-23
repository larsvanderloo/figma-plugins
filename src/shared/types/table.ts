/** Model for an editable TableWrap instance; the plugin builds its own FRAME/TEXT tree inside the Slot. */
export interface TableWrapModel {
  /** Figma SlotNode id inside the TableWrap instance. */
  slotId: string;
  /** True gives row 0 header treatment (header typography + divider). Default false. */
  hasColumnHeader: boolean;
  /** Per-column footer calculation; null = no footer value for that column. */
  columnCalculations?: TableColumnCalculationSetting[];
  /** Per-column bold styling for the footer value. */
  columnCalculationEmphasis?: boolean[];
  /** Per-column `€` prefix on the footer value; mutually exclusive with percent (UI-enforced). */
  columnCalculationCurrency?: boolean[];
  /** Per-column `%` suffix on the footer value; mutually exclusive with currency (UI-enforced). */
  columnCalculationPercent?: boolean[];
  /**
   * Footer label for columns WITHOUT a sum (e.g. "Totaal"); ignored on sum
   * columns, empty string = no label.
   */
  columnCalculationLabel?: string[];
  rows: TableRowModel[];
}

export interface TableRowModel {
  /** FRAME id of the existing row frame in the Slot; empty for new rows. */
  rowNodeId: string;
  cells: TableCellModel[];
}

export interface TableCellModel {
  /** FRAME id of the existing cell frame in the row; empty for new cells. */
  cellNodeId: string;
  value: string;
  /** Per-cell bold styling. Default false. */
  emphasis?: boolean;
  /**
   * Delta chip under the value; a leading ▲/▼ encodes direction (same
   * convention as the chart delta badge). Empty/undefined = no chip. Body cells only.
   */
  delta?: string;
  /**
   * Check icon left of the value: true = circle-check, false = circle,
   * undefined = none. Body cells only.
   */
  check?: boolean;
  /** Free-text chip right of the value (no direction arrow). Empty/undefined = none. Body cells only. */
  badge?: string;
}

export type TableColumnCalculation = 'sum';
export type TableColumnCalculationSetting = TableColumnCalculation | null;

export interface TableColumnSummary {
  calculation: TableColumnCalculation;
  value: string;
  numericValue: number;
  numericCount: number;
  /** When true, the footer value renders bold. */
  emphasis: boolean;
  /** When true, `value` gets a `€` prefix. */
  currency: boolean;
  /** When true, `value` gets a `%` suffix. */
  percent: boolean;
}
