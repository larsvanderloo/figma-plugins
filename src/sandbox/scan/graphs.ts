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
  // A slide can carry several wraps; each becomes its own Graphs-tab
  // instance (the UI's instance selector appears from 2, hence the numbering).
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
 * Re-render TableWraps after a mutation that may have reflowed the slide
 * (e.g. CopyWrap text changing length): applyTable freezes the container
 * on the slot dimensions at apply time, so a later reflow leaves it stale.
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
  // Runs on every CopyWrap keystroke and applyTable is a visibly flashing
  // clear+rebuild, so skip while the frozen container still matches the slot.
  // Unlike charts there is no force path: table colors are variable-bound
  // and follow theme switches on their own.
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
    /* stale node throws on property access — fall through to re-apply */
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
 * Same reason as refreshTablesOnSlide: applyChart freezes the card on the
 * slot dimensions at apply time.
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
  // Runs on every CopyWrap keystroke; a full clear+rebuild flashes visibly,
  // so skip on unchanged dimensions. Theme switches force a re-render:
  // ramp colors are rendertime RGB and do not follow the mode on their own.
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
    /* stale node throws on property access — fall through to re-apply */
   }
  }
  try {
    // Mark the self-write before the rebuild starts (see handlers/chart.ts).
    markSelfWrite();
    const model = scanChartSlot(slot);
    await applyChart(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshChartsOnSlide failed:', e);
  }
}
