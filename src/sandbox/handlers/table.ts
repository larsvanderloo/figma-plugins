// ============================================================
// sandbox/handlers/table.ts
//
// Table-messages: full-state PUT (update-table) en CSV-import
// (import-csv) op een TableWrap-SlotNode.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { postToUI } from '../bridge';
import { findSlideById } from '../slides';
import { applyTable } from '../../editors/table/renderer';
import { importCSV } from '../../editors/table/csv';
import type { UIToPluginMessage } from '../../types';

export async function handleUpdateTable(
  msg: Extract<UIToPluginMessage, { type: 'update-table' }>,
): Promise<void> {
  // T34.2: Slot-based full-state PUT. msg.slotId adresseert de SlotNode
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
  await applyTable(slotNode as SlotNode, msg.desired);
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
  // T34.2 / T39.2: parse + truncate + applyTable. Width blijft behouden
  // (gelezen uit pluginData) — import verandert alleen row/cel-inhoud.
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
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.slotId,
  });
  return;
}
