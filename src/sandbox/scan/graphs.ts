// ============================================================
// scan/graphs.ts
//
// Graphs-tab scan: TableWrap/Slot-detectie + table-model, plus de
// refresh-helper die tables re-rendert na layout-verstorende mutaties.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findTableWrap, findTableSlot, findChartWrap, findChartSlot } from '../slide-machine';
import { GraphItems, TableWrapModel } from '../../shared/types';
import { applyTable, scanTableSlot } from '../editors/table/renderer';
import { applyChart, scanChartSlot } from '../editors/chart/renderer';

export function scanGraphs(slide: InstanceNode): GraphItems | null {
  // v0.1.0 wrapper-finder geeft de eerste TableWrap; in de praktijk heeft
  // een Slide-template precies één TableWrap. De instance-selector in
  // GraphsPanel kan hier later groeien wanneer we meerdere tables per
  // slide toestaan (out of scope v0.1.0).
  const instances: GraphItems['instances'] = [];

  const tableWrap = findTableWrap(slide);
  if (tableWrap !== null) {
    // T34.2: lees via findTableSlot + scanTableSlot. Wanneer de TableWrap
    // een Slot heeft, gebruiken we het Slot-id als nodeId zodat
    // `update-table` en `import-csv` direct naar de Slot kunnen.
    const slot = findTableSlot(slide);
    const tableModel: TableWrapModel | null = slot !== null ? scanTableSlot(slot) : null;
    const nodeId = slot !== null ? slot.id : tableWrap.id;
    instances.push({
      nodeId: nodeId,
      label: 'Table — ' + tableWrap.name,
      tableModel: tableModel,
      chartModel: null,
    });
  }

  // T47: ChartWrap-detectie — pluginData-truth model (verse slot krijgt
  // een default-model zodat de editor direct kan bewerken).
  const chartWrap = findChartWrap(slide);
  if (chartWrap !== null) {
    const chartSlot = findChartSlot(slide);
    if (chartSlot !== null) {
      instances.push({
        nodeId: chartSlot.id,
        label: 'Chart — ' + chartWrap.name,
        tableModel: null,
        chartModel: scanChartSlot(chartSlot),
      });
    }
  }

  if (instances.length === 0) return null;
  return {
    instances: instances,
    selectedGraphId: instances[0].nodeId,
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

/**
 * T47 — Re-render de ChartWrap-slot op een slide na layout-verstorende
 * mutaties (zelfde reden als refreshTablesOnSlide: de kaart bevriest de
 * slot-afmetingen op applyChart-moment).
 */
export async function refreshChartsOnSlide(slide: InstanceNode): Promise<void> {
  const slot = findChartSlot(slide);
  if (slot === null) return;
  if (slot.getPluginData('chartModel') === '') return;
  try {
    const model = scanChartSlot(slot);
    await applyChart(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshChartsOnSlide failed:', e);
  }
}
