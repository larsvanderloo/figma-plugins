import { PluginToUIMessage } from '../shared/types';
import { debugMessage } from '../shared/debug';

export function postToUI(msg: PluginToUIMessage): void {
  debugMessage('plugin->ui', msg);
  figma.ui.postMessage(msg);
}

// Suppresses documentchange re-scans right after our own mutations, which would
// clobber in-progress typing in the iframe. 1500ms: apply can run 600-1200ms plus
// the 200ms postSlideContent debounce; a 500ms window let the re-scan slip through.
// Cmd+Z inside the window is also suppressed (self-corrects on next documentchange).
const SELF_WRITE_WINDOW_MS = 1500;
let lastSelfWriteAt = 0;

export function markSelfWrite(): void {
  lastSelfWriteAt = Date.now();
}

export function isWithinSelfWriteWindow(): boolean {
  return Date.now() - lastSelfWriteAt < SELF_WRITE_WINDOW_MS;
}
