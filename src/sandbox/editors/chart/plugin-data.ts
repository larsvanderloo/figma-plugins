// The chart model is pluginData-truth (unlike the table's canvas-truth): arcs/vectors
// can't be reliably re-scanned, so the full normalized model persists as JSON on the slot.

import type { ChartWrapModel } from '../../../shared/types';
import { emptyChartModel, normalizeChartModel } from '../../../shared/chart-calculations';

export function readChartModel(slot: SlotNode): ChartWrapModel {
  const raw = slot.getPluginData('chartModel');
  if (raw === '') return emptyChartModel(slot.id);
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return emptyChartModel(slot.id);
    const model = parsed as ChartWrapModel;
    model.slotId = slot.id;
    return normalizeChartModel(model);
  } catch (_e) {
    return emptyChartModel(slot.id);
  }
}

export function writeChartModel(slot: SlotNode, model: ChartWrapModel): void {
  const normalized = normalizeChartModel(model);
  slot.setPluginData('chartModel', JSON.stringify(normalized));
  slot.setPluginData('kind', 'welder-chartwrap');
  slot.setPluginData('v', '1');
}
