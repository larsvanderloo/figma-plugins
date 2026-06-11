// ============================================================
// sandbox/bridge.ts
//
// Sandbox-kant van de message-bus: het typed post-kanaal naar de
// iframe, plus de self-write window die documentchange-gedreven
// re-scans onderdrukt vlak na eigen mutaties (anders clobbert de
// re-scan in-progress typing in de iframe).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { PluginToUIMessage } from '../types';
import { debugMessage } from '../debug';

export function postToUI(msg: PluginToUIMessage): void {
  debugMessage('plugin->ui', msg);
  figma.ui.postMessage(msg);
}

// Self-write suppression. Waarom 1500ms: library updates triggeren
// repeated importVariableByKeyAsync / importComponentByKeyAsync failure
// timeouts, en apply kan 600-1200ms draaien. Een 500ms window liet de
// post-apply documentchange-re-scan erdoorheen glippen, wat in-progress
// typing clobberde. 1500ms dekt de worst-case apply plus de 200ms
// postSlideContent-debounce met marge. Cmd+Z binnen 1500ms van een
// self-write wordt ook onderdrukt (acceptabel — zelfcorrigerend op de
// volgende documentchange).
const SELF_WRITE_WINDOW_MS = 1500;
let lastSelfWriteAt = 0;

export function markSelfWrite(): void {
  lastSelfWriteAt = Date.now();
}

/** True binnen de suppress-window na een eigen document-mutatie. */
export function isWithinSelfWriteWindow(): boolean {
  return Date.now() - lastSelfWriteAt < SELF_WRITE_WINDOW_MS;
}
