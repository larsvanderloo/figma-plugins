// ============================================================
// Table-editor types — Slot-based
//
// Types voor de Slot-gebaseerde TableWrap. De plugin bouwt zelf
// FRAMEs + TEXT-nodes binnen de SlotNode, in plaats van
// library-components of vaste varianten.
// ============================================================

/**
 * Top-level model voor een bewerkbare TableWrap-instance.
 * `slotId` verwijst naar de SlotNode binnen de TableWrap-INSTANCE.
 */
export interface TableWrapModel {
  /** Figma SlotNode ID binnen de TableWrap-INSTANCE. */
  slotId: string;
  /**
   * Wanneer true krijgt rij 0 een header-treatment: HUG-vertical,
   * header-typografie, divider eronder. Body-rijen (1+)
   * delen het restant van de container-hoogte via FILL.
   * Default: false (bestaande tabellen blijven onveranderd).
   */
  hasColumnHeader: boolean;
  /**
   * Per-column footer calculation, inspired by Notion database table
   * calculations. `null` means no footer value for that column.
   */
  columnCalculations?: TableColumnCalculationSetting[];
  /**
   * Per-column emphasis for the footer/calculation value. Mirrors the
   * per-cell `emphasis` flag but applies only to that column's footer
   * value. `true` renders the sum in the emphasized (bold) style.
   */
  columnCalculationEmphasis?: boolean[];
  /**
   * Per-column currency formatting for the footer/calculation value.
   * `true` renders the sum with a `€` prefix (UI footer + canvas).
   * Mutually exclusive with `columnCalculationPercent` (UI-enforced).
   */
  columnCalculationCurrency?: boolean[];
  /**
   * Per-column percent formatting for the footer/calculation value.
   * `true` renders the sum with a `%` suffix (UI footer + canvas).
   * Mutually exclusive with `columnCalculationCurrency` (UI-enforced).
   */
  columnCalculationPercent?: boolean[];
  /**
   * Per-column footer label text. Only used for columns WITHOUT a sum:
   * the footer row then shows this editable label (e.g. "Totaal") instead
   * of an empty cell. Ignored for sum columns (those show the computed
   * value). Empty string = no label.
   */
  columnCalculationLabel?: string[];
  rows: TableRowModel[];
}

// `width`-preset (sm/md/lg) en `textSize`-multiplier verwijderd.
// De tabel rendert full-width binnen de actuele Slot-breedte; kolommen verdelen die breedte via
// autofit. FontSize komt uit de hoogte-formule in renderer.ts.

/** Eén rij binnen een TableWrapModel. */
export interface TableRowModel {
  /** FRAME-id van de bestaande row-FRAME binnen de Slot; leeg bij nieuwe rijen. */
  rowNodeId: string;
  cells: TableCellModel[];
}

/** Eén cel binnen een TableRowModel. */
export interface TableCellModel {
  /** FRAME-id van de bestaande cell-FRAME binnen de row; leeg bij nieuwe cellen. */
  cellNodeId: string;
  value: string;
  /** Per-cell visual emphasis. Default false; set through the table UI. */
  emphasis?: boolean;
  /**
   * Per-cell delta badge — vrije tekst die de editor typt (bv. `+12%`),
   * onder de waarde gerenderd in Text Dimmer-kleur met een ▲/▼-prefix.
   * Een ▲/▼ vooraan bepaalt de richting (zelfde conventie als de
   * chart-delta-badge); leeg/undefined → geen badge. Body-cellen alleen.
   */
  delta?: string;
}

export type TableColumnCalculation = 'sum';
export type TableColumnCalculationSetting = TableColumnCalculation | null;

export interface TableColumnSummary {
  calculation: TableColumnCalculation;
  value: string;
  numericValue: number;
  numericCount: number;
  /** When true, the footer value renders in the emphasized (bold) style. */
  emphasis: boolean;
  /** When true, `value` is formatted as currency (`€` prefix). */
  currency: boolean;
  /** When true, `value` is formatted as a percentage (`%` suffix). */
  percent: boolean;
}
