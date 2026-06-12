// ============================================================
// sandbox/handlers/chart.ts
//
// Chart-messages (T47): full-state PUT (update-chart) op een
// ChartWrap-SlotNode. Zelfde patroon als handlers/table.ts.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById } from '../slides';
import { applyChart } from '../editors/chart/renderer';
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
