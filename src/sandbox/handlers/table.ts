// ============================================================
// sandbox/handlers/table.ts
//
// Table-messages: full-state PUT (update-table) en CSV-import
// (import-csv) op een TableWrap-SlotNode.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById, summaryForSlide } from '../slides';
import { scanSlide } from '../scan/slide-scan';
import { applyTable } from '../editors/table/renderer';
import { applyTableTextOnly } from '../editors/table/apply-text';
import { importCSV } from '../editors/table/csv';
import type { UIToPluginMessage } from '../../shared/types';

// Applies binnen dit domein serialiseren: main.ts dispatcht handlers
// fire-and-forget en applyTable await tussen het clearen van de slot en
// het appenden van de herbouwde tabel. Twee snel opeenvolgende updates
// (typ-debounce ~200ms) kunnen dan interleaven — in het slechtste geval
// twee gestapelde tabellen + stale canvas-truth. De ketting laat elke
// apply pas starten als de vorige klaar is. Bewust per module, niet
// globaal: een trage tabel-render mag accent- of chart-writes niet
// blokkeren.
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
  // Slot-based full-state PUT. msg.slotId adresseert de SlotNode
  // rechtstreeks (de UI ontving 'm via `GraphInstance.nodeId`).
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
  // Settle-pass (msg.settle): reconciliatie-render ná een typ-burst, geen
  // user-actie — geen nieuwe undo-stap, zodat cmd+Z direct de edit zelf
  // terugdraait i.p.v. eerst een visueel identieke rebuild.
  if (!msg.settle) figma.commitUndo();
  // Fast-path: when only cell text changed (structure intact — the common case
  // while typing), write text in place and skip the full clear+rebuild. Fonts
  // must be loaded first because setting `.characters` on existing nodes needs
  // their fonts available. Falls back to the full PUT on any structural change.
  // A settle-pass skips the fast path on purpose: its whole point is the full
  // render (font-fit + column-autofit + padding) that in-place writes defer.
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
  // Parse + truncate + applyTable. Import verandert alleen
  // row/cel-inhoud; de tabel rendert rendertime full-width per surface.
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
  // Re-sync de iframe-grid met de geïmporteerde data. De UI stuurde
  // alleen ruwe CSV-tekst, dus kent de geparste rijen niet; de
  // documentchange-route is bovendien onderdrukt door markSelfWrite().
  // Expliciete scan + slide-loaded post — zelfde patroon als
  // handleTriggerUndo in handlers/slide.ts.
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
