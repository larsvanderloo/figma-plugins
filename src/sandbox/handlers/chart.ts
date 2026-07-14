// ============================================================
// sandbox/handlers/chart.ts
//
// Chart-messages: full-state PUT (update-chart) op een
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

// Applies binnen dit domein serialiseren: main.ts dispatcht handlers
// fire-and-forget en applyChart await tussen het clearen van de slot en
// het appenden van de nieuwe kaart. Twee snel opeenvolgende updates
// (typ-debounce ~200ms) kunnen dan interleaven — in het slechtste geval
// twee gestapelde kaarten + stale pluginData. De ketting laat elke apply
// pas starten als de vorige klaar is. Bewust per module, niet globaal:
// een trage chart-render mag tabel- of accent-writes niet blokkeren.
let queue: Promise<void> = Promise.resolve();

function noop(): void {}

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = queue.then(work);
  // Een rejection mag de ketting niet vergiftigen — de volgende apply
  // moet gewoon starten. De caller ziet de rejection alsnog via `run`
  // (main.ts post daarop de error-ack).
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
  // Óók vóór de apply: applyChart heeft awaits na het clearen
  // van de slot; een eerder-gedebouncede scan mag niet interleaven met
  // half-verwijderde clone-sublayers.
  markSelfWrite();
  await applyChart(slotNode as SlotNode, msg.desired);
  markSelfWrite();
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
