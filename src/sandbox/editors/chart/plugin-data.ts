// ============================================================
// editors/chart/plugin-data.ts
//
// Chart-model persistentie op de ChartWrap-Slot. Anders dan de tabel
// (canvas-truth) is het chart-model pluginData-truth: arcs/vectors
// zijn niet betrouwbaar terug te scannen, dus applyChart schrijft het
// volledige genormaliseerde model als JSON en scanChartSlot leest het
// daar terug. Marker: kind 'welder-chartwrap', v '1'.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

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
