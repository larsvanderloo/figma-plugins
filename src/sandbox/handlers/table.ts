import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById, summaryForSlide } from '../slides';
import { scanSlide } from '../scan/slide-scan';
import { applyTable } from '../editors/table/renderer';
import { applyTableTextOnly } from '../editors/table/apply-text';
import { importCSV } from '../editors/table/csv';
import type { UIToPluginMessage } from '../../shared/types';

// Serialize applies: main.ts dispatches fire-and-forget and applyTable awaits
// between clearing the slot and appending the rebuild, so two rapid updates can
// interleave and stack two tables. Per module on purpose — a slow table render
// must not block accent or chart writes.
let queue: Promise<void> = Promise.resolve();

function noop(): void {}

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = queue.then(work);
  // A rejection must not poison the chain; the caller still sees it via `run`
  // (main.ts posts the error ack on it).
  queue = run.then(noop, noop);
  return run;
}

export function handleUpdateTable(
  msg: Extract<UIToPluginMessage, { type: 'update-table' }>,
): Promise<void> {
  return enqueue(function () {
    return runUpdateTable(msg);
  });
}

async function runUpdateTable(
  msg: Extract<UIToPluginMessage, { type: 'update-table' }>,
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
      error: 'Table slot not found: ' + msg.slotId,
    });
    return;
  }
  // A settle pass is a reconciliation render after a typing burst, not a user
  // action — no new undo step, so cmd+Z reverts the edit itself instead of a
  // visually identical rebuild first.
  if (!msg.settle) figma.commitUndo();
  // Fonts must be loaded before setting `.characters` on existing nodes. The
  // fast path writes text in place when structure is intact (the common case
  // while typing); a settle pass skips it on purpose — its point is the full
  // render (font-fit, column autofit, padding) that in-place writes defer.
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  let appliedInPlace = false;
  if (msg.settle !== true) {
    try {
      appliedInPlace = applyTableTextOnly(slotNode as SlotNode, msg.desired);
    } catch (_e) {
      appliedInPlace = false;
    }
  }
  // Fast-path edits never overflow (they bail to full render on any row-height
  // change); only the full applyTable() reports the overflow-at-min-font state.
  let overflowed = false;
  if (!appliedInPlace) {
    overflowed = await applyTable(slotNode as SlotNode, msg.desired);
  }
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
    tableOverflow: overflowed,
  });
  return;
}

export function handleImportCsv(
  msg: Extract<UIToPluginMessage, { type: 'import-csv' }>,
): Promise<void> {
  return enqueue(function () {
    return runImportCsv(msg);
  });
}

async function runImportCsv(
  msg: Extract<UIToPluginMessage, { type: 'import-csv' }>,
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
      error: 'Table slot not found: ' + msg.slotId,
    });
    return;
  }
  figma.commitUndo();
  await importCSV(slotNode as SlotNode, msg.csv);
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  // The UI only sent raw CSV so it lacks the parsed rows, and markSelfWrite()
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
