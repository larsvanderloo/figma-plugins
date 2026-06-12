// ============================================================
// sandbox/handlers/chart.ts
//
// Chart-messages (T47): full-state PUT (update-chart) op een
// ChartWrap-SlotNode. Zelfde patroon als handlers/table.ts.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById, summaryForSlide } from '../slides';
import { scanSlide } from '../scan/slide-scan';
import { applyChart } from '../editors/chart/renderer';
import { importChartCSV } from '../editors/chart/csv';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleUpdateChart(
  msg: Extract<UIToPluginMessage, { type: 'update-chart' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  const slotNode = await figma.getNodeByIdAsync(msg.slotId);
  if (slotNode === null || slotNode.type !== 'SLOT') {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Chart slot not found: ' + msg.slotId,
    });
    return;
  }
  figma.commitUndo();
  await applyChart(slotNode as SlotNode, msg.desired);
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  return;
}

export async function handleImportChartCsv(
  msg: Extract<UIToPluginMessage, { type: 'import-chart-csv' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  const slotNode = await figma.getNodeByIdAsync(msg.slotId);
  if (slotNode === null || slotNode.type !== 'SLOT') {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Chart slot not found: ' + msg.slotId,
    });
    return;
  }
  figma.commitUndo();
  await importChartCSV(slotNode as SlotNode, msg.csv);
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  // Re-sync de iframe-grid met de geïmporteerde data. De UI stuurde
  // alleen ruwe CSV-tekst, dus kent het geparste model niet; de
  // documentchange-route is bovendien onderdrukt door markSelfWrite().
  // Expliciete scan + slide-loaded post — zelfde patroon als
  // handleImportCsv in handlers/table.ts.
  try {
    const scan = await scanSlide(slide);
    postToUI({
      type: 'slide-loaded',
      summary: summaryForSlide(slide),
      general: scan.general,
      content: scan.content,
      graphs: scan.graphs,
    });
  } catch (err: unknown) {
    console.log('[welder-slide-editor] post-import scanSlide failed:', err);
  }
  return;
}
