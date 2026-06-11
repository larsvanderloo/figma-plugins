// ============================================================
// scan/graphs.ts
//
// Graphs-tab scan: TableWrap/Slot-detectie + table-model, plus de
// refresh-helper die tables re-rendert na layout-verstorende mutaties.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findTableWrap, findTableSlot } from '../slide-machine';
import { GraphItems, TableWrapModel } from '../../shared/types';
import { applyTable, scanTableSlot } from '../editors/table/renderer';

export function scanGraphs(slide: InstanceNode): GraphItems | null {
  // v0.1.0 wrapper-finder geeft de eerste TableWrap; in de praktijk heeft
  // een Slide-template precies één TableWrap. De instance-selector in
  // GraphsPanel kan hier later groeien wanneer we meerdere tables per
  // slide toestaan (out of scope v0.1.0).
  const tableWrap = findTableWrap(slide);
  if (tableWrap === null) return null;

  // T34.2: lees via findTableSlot + scanTableSlot. Wanneer de TableWrap
  // een Slot heeft, gebruiken we het Slot-id als nodeId zodat
  // `update-table` en `import-csv` direct naar de Slot kunnen.
  const slot = findTableSlot(slide);
  const tableModel: TableWrapModel | null = slot !== null ? scanTableSlot(slot) : null;
  const nodeId = slot !== null ? slot.id : tableWrap.id;

  const instance: GraphItems['instances'][number] = {
    nodeId: nodeId,
    label: 'Table — ' + tableWrap.name,
    tableModel: tableModel,
  };

  return {
    instances: [instance],
    selectedGraphId: nodeId,
  };
}

/**
 * T39.3 — Re-render TableWraps op een slide na een mutatie die de slide-
 * layout heeft kunnen veranderen (bv. CopyWrap-tekst korter/langer).
 *
 * Container.resize bevriest slot.height op het moment van applyTable.
 * Als de slot daarna reflowt, blijft de container op de oude snapshot.
 * Deze helper scant + re-applyt de TableWrap-slot op de slide zodat
 * fontSize + container-hoogte de actuele slot.height pakken.
 *
 * Geen-op als de slide geen TableWrap/Slot heeft of het model leeg is.
 * Errors worden stilletjes gelogd; mag de caller-flow niet meeslepen.
 */
export async function refreshTablesOnSlide(slide: InstanceNode): Promise<void> {
  const slot = findTableSlot(slide);
  if (slot === null) return;
  try {
    const model = scanTableSlot(slot);
    if (model.rows.length === 0) return;
    await applyTable(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshTablesOnSlide failed:', String(e));
  }
}
