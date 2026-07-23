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
   * Primary swatch hex, resolved sandbox-side from the collection's first COLOR
   * variable (one `VARIABLE_ALIAS` hop); null when no color variable or broken alias.
   */
  swatchPrimary: string | null;
  /** Hex color for the secondary swatch tile (second COLOR variable). */
  swatchSecondary: string | null;
}
