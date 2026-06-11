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
  /**
   * T40 — wanneer true krijgt rij 0 een header-treatment: HUG-vertical,
   * gecentreerde tekst, dimmer-color, divider eronder. Body-rijen (1+)
   * delen het restant van de container-hoogte via FILL.
   * Default: false (bestaande tabellen blijven onveranderd).
   */
  hasColumnHeader: boolean;
  rows: TableRowModel[];
}

// T44: `width`-preset (sm/md/lg) en `textSize`-multiplier (T42.9) verwijderd.
// Breedte wordt rendertime afgeleid uit het kolom-aantal (zie
// tableWidthForSurface in shared/constants.ts); fontSize uit de
// hoogte-formule in renderer.ts (getFontSizes — de eerdere 'md'-clamps).

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
