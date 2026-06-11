// ============================================================
// Theme-types — slide-level Theme-collection mode binding
// (zie `GeneralSections.theme` in general.ts).
// ============================================================

export interface ThemeSection {
  collectionId: string;
  collectionName: string;
  explicitModeId: string | null;
  resolvedModeId: string;
  modes: ReadonlyArray<ThemeMode>;
}

export interface ThemeMode {
  id: string;
  name: string;
  /**
   * Hex color for the mode's swatch (primary tile). Resolved sandbox-side
   * from the first COLOR variable in the Theme collection, with one hop
   * of `VARIABLE_ALIAS` resolution. `null` when the color can't be
   * resolved (collection has zero color variables, alias chain is broken).
   */
  swatchPrimary: string | null;
  /** Hex color for the secondary swatch tile (second COLOR variable). */
  swatchSecondary: string | null;
}
