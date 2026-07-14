// ============================================================
// scan/graphs.ts
//
// Graphs-tab scan: TableWrap/Slot-detectie + table-model, plus de
// refresh-helper die tables re-rendert na layout-verstorende mutaties.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite } from '../bridge';
import {
  findAllChartWraps,
  findAllTableWraps,
  findSlotInWrap,
} from '../slide-machine';
import { GraphItems, TableWrapModel } from '../../shared/types';
import { applyTable, scanTableSlot } from '../editors/table/renderer';
import { applyChart, scanChartSlot } from '../editors/chart/renderer';

export function scanGraphs(slide: InstanceNode): GraphItems | null {
  // Slides/whitepapers kunnen MEERDERE wrappers dragen; elke
  // TableWrap/ChartWrap wordt een eigen instance in de Graphs-tab
  // (instance-selector verschijnt vanaf 2).
  const instances: GraphItems['instances'] = [];

  const tableWraps = findAllTableWraps(slide);
  for (let i = 0; i < tableWraps.length; i++) {
    const slot = findSlotInWrap(tableWraps[i]);
    const tableModel: TableWrapModel | null = slot !== null ? scanTableSlot(slot) : null;
    instances.push({
      nodeId: slot !== null ? slot.id : tableWraps[i].id,
      label: tableWraps.length > 1 ? 'Tabel ' + String(i + 1) : 'Tabel',
      tableModel: tableModel,
      chartModel: null,
    });
  }

  const chartWraps = findAllChartWraps(slide);
  for (let i = 0; i < chartWraps.length; i++) {
    const slot = findSlotInWrap(chartWraps[i]);
    if (slot === null) continue;
    instances.push({
      nodeId: slot.id,
      label: chartWraps.length > 1 ? 'Grafiek ' + String(i + 1) : 'Grafiek',
      tableModel: null,
      chartModel: scanChartSlot(slot),
    });
  }

  if (instances.length === 0) return null;
  return {
    instances: instances,
    selectedGraphId: instances[0].nodeId,
  };
}

/**
 * Re-render TableWraps op een slide na een mutatie die de slide-
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
  const wraps = findAllTableWraps(slide);
  for (let w = 0; w < wraps.length; w++) {
    await refreshTableSlot(wraps[w]);
  }
}

async function refreshTableSlot(wrap: InstanceNode): Promise<void> {
  const slot = findSlotInWrap(wrap);
  if (slot === null) return;
  // Alleen re-renderen wanneer de slot-afmetingen écht zijn veranderd
  // (zelfde guard als refreshChartSlot): deze refresh draait op elke
  // CopyWrap-keystroke en applyTable is een full clear+rebuild die
  // zichtbaar flitst. applyTable bevriest de container op de slot-
  // afmetingen op apply-moment (resolveTableRenderWidth → slot.width,
  // resize → slot.height), dus gelijke afgeronde afmetingen = geen
  // reflow, niets te doen. Geen force-pad zoals bij charts: tabel-
  // kleuren zijn variable-bound en volgen theme-switches vanzelf.
  try {
    if (slot.children.length > 0) {
      const container = slot.children[0];
      if (
        container.name === 'WelderTableContent' &&
        Math.round(container.width) === Math.round(slot.width) &&
        Math.round(container.height) === Math.round(slot.height)
      ) {
        return;
      }
    }
  } catch (_e) {
    /* stale node — gewoon doorgaan met re-apply */
  }
  try {
    const model = scanTableSlot(slot);
    if (model.rows.length === 0) return;
    await applyTable(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshTablesOnSlide failed:', String(e));
  }
}

/**
 * Re-render de ChartWrap-slot op een slide na layout-verstorende
 * mutaties (zelfde reden als refreshTablesOnSlide: de kaart bevriest de
 * slot-afmetingen op applyChart-moment).
 */
export async function refreshChartsOnSlide(
  slide: InstanceNode,
  force?: boolean,
): Promise<void> {
  const wraps = findAllChartWraps(slide);
  for (let w = 0; w < wraps.length; w++) {
    await refreshChartSlot(wraps[w], force === true);
  }
}

async function refreshChartSlot(wrap: InstanceNode, force: boolean): Promise<void> {
  const slot = findSlotInWrap(wrap);
  if (slot === null) return;
  if (slot.getPluginData('chartModel') === '') return;
  // Alleen re-renderen wanneer de slot-afmetingen écht zijn
  // veranderd: deze refresh draait op elke CopyWrap-keystroke en een
  // full clear+rebuild flitst zichtbaar. Theme-switch forceert
  // (force=true) een re-render — de ramp-kleuren zijn rendertime-RGB en
  // volgen de mode niet vanzelf, ondanks gelijke afmetingen.
  if (!force) {
   try {
    if (slot.children.length > 0) {
      const card = slot.children[0];
      if (
        card.name === 'WelderChartContent' &&
        Math.round(card.width) === Math.round(slot.width) &&
        Math.round(card.height) === Math.round(slot.height)
      ) {
        return;
      }
     }
   } catch (_e) {
    /* stale node — gewoon doorgaan met re-apply */
   }
  }
  try {
    // Suppressie vóór de rebuild (zie handlers/chart.ts).
    markSelfWrite();
    const model = scanChartSlot(slot);
    await applyChart(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshChartsOnSlide failed:', e);
  }
}
