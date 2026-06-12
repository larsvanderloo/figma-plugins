// ============================================================
// editors/chart/csv.ts
//
// CSV-import voor een ChartWrap-Slot (T50). Skeleton: parser volgt in
// een vervolgstap; tot die tijd re-applyt import het huidige model
// zodat de message-flow end-to-end staat.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { applyChart, readChartModel } from './renderer';

export async function importChartCSV(slot: SlotNode, _csv: string): Promise<void> {
  const model = readChartModel(slot);
  await applyChart(slot, model);
}
