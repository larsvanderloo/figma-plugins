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

export async function handleUpdateTable(
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
  figma.commitUndo();
  // Fast-path: when only cell text changed (structure intact — the common case
  // while typing), write text in place and skip the full clear+rebuild. Fonts
  // must be loaded first because setting `.characters` on existing nodes needs
  // their fonts available. Falls back to the full PUT on any structural change.
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  let appliedInPlace = false;
  try {
    appliedInPlace = applyTableTextOnly(slotNode as SlotNode, msg.desired);
  } catch (_e) {
    appliedInPlace = false;
  }
  if (!appliedInPlace) {
    await applyTable(slotNode as SlotNode, msg.desired);
  }
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  return;
}

export async function handleImportCsv(
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
