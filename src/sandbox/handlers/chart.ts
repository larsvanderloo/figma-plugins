import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById, summaryForSlide } from '../slides';
import { scanSlide } from '../scan/slide-scan';
import { applyChart } from '../editors/chart/renderer';
import { importChartCSV } from '../editors/chart/csv';
import type { UIToPluginMessage } from '../../shared/types';

// Serialize applies: main.ts dispatches fire-and-forget and applyChart awaits
// between clearing the slot and appending the new card, so rapid updates could
// interleave (stacked cards, stale pluginData). Deliberately per module, not
// global — a slow chart render must not block table or accent writes.
let queue: Promise<void> = Promise.resolve();

function noop(): void {}

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = queue.then(work);
  // A rejection must not poison the chain; the caller still sees it via
  // `run` (main.ts posts the error ack on it).
  queue = run.then(noop, noop);
  return run;
}

export function handleUpdateChart(
  msg: Extract<UIToPluginMessage, { type: 'update-chart' }>,
): Promise<void> {
  return enqueue(function () {
    return runUpdateChart(msg);
  });
}

async function runUpdateChart(
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
  // Also before the apply: applyChart has awaits after clearing the slot; an
  // earlier-debounced scan must not interleave with half-removed clone sublayers.
  markSelfWrite();
  const rebuilt = await applyChart(slotNode as SlotNode, msg.desired);
  markSelfWrite();
  if (!rebuilt) {
    // applyChart left canvas and pluginData untouched (library vars missing).
    // ok:false WITH targetId so the UI knows the optimistically written store
    // and the canvas diverge for this slot, and neutralizes the duplicate guard.
    postToUI({
      type: 'target-updated',
      ok: false,
      targetId: msg.slotId,
      error: 'Chart library variables missing; rebuild skipped',
    });
    return;
  }
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  return;
}

export function handleImportChartCsv(
  msg: Extract<UIToPluginMessage, { type: 'import-chart-csv' }>,
): Promise<void> {
  return enqueue(function () {
    return runImportChartCsv(msg);
  });
}

async function runImportChartCsv(
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
  markSelfWrite();
  await importChartCSV(slotNode as SlotNode, msg.csv);
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  // The UI only sent raw CSV so it lacks the parsed model, and markSelfWrite()
  // suppresses the documentchange route — re-sync the grid with an explicit
  // scan + slide-loaded post.
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
