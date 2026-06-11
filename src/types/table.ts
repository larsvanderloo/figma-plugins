// ============================================================
// Table-editor types — v0.2.0 Slot-based (T34.1)
//
// Nieuwe types voor de Slot-gebaseerde TableWrap-rewrite (T34). De
// plugin bouwt zelf FRAMEs + TEXT-nodes binnen de SlotNode, in plaats
// van library-components of vaste varianten.
// ============================================================

/**
 * Top-level model voor een bewerkbare TableWrap-instance.
 * `slotId` verwijst naar de SlotNode binnen de TableWrap-INSTANCE.
 */
export interface TableWrapModel {
  /** Figma SlotNode ID binnen de TableWrap-INSTANCE. */
  slotId: string;
  /** Kolombreedte-preset van de tabel. */
  width: 'sm' | 'md' | 'lg';
  /**
   * T40 — wanneer true krijgt rij 0 een header-treatment: HUG-vertical,
   * gecentreerde tekst, dimmer-color, divider eronder. Body-rijen (1+)
   * delen het restant van de container-hoogte via FILL.
   * Default: false (bestaande tabellen blijven onveranderd).
   */
  hasColumnHeader: boolean;
  /**
   * T42.9 — tekst-grootte multiplier op de hoogte-formule.
   * sm = 0.75×, md = 1.0× (default), lg = 1.25×.
   * Was eerder verwijderd in T39.2 toen height-only formula werd
   * geïntroduceerd; teruggebracht omdat user-controle nodig blijkt.
   */
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

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
}
