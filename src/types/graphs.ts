// ============================================================
// Graphs-tab — table-instance selector
//
// Per §12-Q1 (2026-04-23): één Graphs-tab met instance-selector die alle
// TableWrap-instances op de slide kan tonen. `selectedGraphId` verwijst
// naar het geselecteerde wrapper-id wanneer er meerdere tables zijn.
// ============================================================

import type { TableWrapModel } from './table';

/**
 * Eén bewerkbaar TableWrap-instance binnen de Graphs-tab.
 *
 * `nodeId` is het Slot-id binnen de TableWrap-INSTANCE (het Slot-id wordt
 * direct gebruikt door `update-table` en `import-csv` bridge-messages).
 */
export interface GraphInstance {
  nodeId: string;
  /** Menselijk leesbare naam, bv. "Table 1". Samengesteld door main-thread. */
  label: string;
  /**
   * Slot-based table-model. `null` wanneer de TableWrap geen Slot bevat
   * (nieuwe variant zonder inhoud) óf wanneer de scan geen rijen vindt.
   */
  tableModel: TableWrapModel | null;
}

export interface GraphItems {
  /**
   * Alle TableWrap-instances op de slide (op render-volgorde). Lengte >=1;
   * wanneer de slide geen table-wrappers heeft is het omhullende
   * `graphs`-veld in PluginView `null` i.p.v. deze lijst leeg.
   */
  instances: GraphInstance[];
  /**
   * Geselecteerd instance-id — UI-state. Default: eerste instance. Mutatie
   * verloopt client-side in usePluginView; main-thread hoeft niet te weten
   * welke instance open staat.
   */
  selectedGraphId: string;
}
