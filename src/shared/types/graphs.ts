import type { TableWrapModel } from './table';
import type { ChartWrapModel } from './chart';

export interface GraphInstance {
  /** Slot-node id inside the TableWrap instance, not the wrapper id — used verbatim by the `update-table` / `import-csv` bridge messages. */
  nodeId: string;
  /** Human-readable name ("Table 1"), composed by the sandbox, not the UI. */
  label: string;
  /**
   * `null` when the TableWrap has no Slot or the scan finds no rows.
   * Exactly one of tableModel/chartModel is non-null per instance.
   */
  tableModel: TableWrapModel | null;
  /**
   * `null` for table instances or when the ChartWrap has no Slot; fresh
   * charts get a scan-provided default model so the editor can edit at once.
   */
  chartModel?: ChartWrapModel | null;
}

export interface GraphItems {
  /**
   * Render order, length >= 1 — a slide with no table wrappers is
   * `graphs: null` in PluginView, never an empty list here.
   */
  instances: GraphInstance[];
  /**
   * UI-only state, mutated client-side in usePluginView — the sandbox never
   * needs to know which instance is open. Defaults to the first instance.
   */
  selectedGraphId: string;
}
