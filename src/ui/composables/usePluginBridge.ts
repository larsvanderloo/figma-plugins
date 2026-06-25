// ============================================================
// usePluginBridge — UI-iframe <-> plugin-main postMessage-bridge.
//
// Generieke, type-safe wrapper rond het Figma plugin <-> iframe
// postMessage-protocol (FIG-MSG-01):
//
//   UI → plugin:   parent.postMessage({ pluginMessage: msg }, '*')
//   Plugin → UI:   window message event, payload in event.data.pluginMessage
//
// In tegenstelling tot de per-handler-API van welder-table's
// usePluginBridge biedt deze compose-laag een bewust smalle, uniforme
// `post(msg)` + `onMessage(handler)` API — handlers worden in de
// store-laag (usePluginView) gedispatcht op msg.type. Dit past
// beter bij de grotere discriminated-union (4 inbound / 7 outbound
// types) zonder N callback-slots te hoeven bijhouden.
//
// Inbound messages are handled by one window-level listener and fanned out
// to composable subscribers. This keeps debug logging and message unwrapping
// O(1) per plugin message even when several stores/editors subscribe.
//
// Auto-unsubscribe: wanneer de composable binnen een Vue `setup()` wordt
// aangeroepen registreert elke `onMessage` zich automatisch in `onUnmounted`.
// Buiten een setup-context (bv. unit-test) retourneert onMessage de
// unsubscribe-fn die de caller zelf aanroept.
// ============================================================

import { computed, getCurrentInstance, onUnmounted, ref, type ComputedRef } from 'vue';
import { debugLog, debugMessage, isPluginDebugEnabled } from '../../shared/debug';
import type { PluginToUIMessage, UIToPluginMessage } from '../../shared/types';

/** Handler voor een inkomend plugin-bericht. */
type PluginMessageHandler = (msg: PluginToUIMessage) => void;

/** Opruim-functie die de listener weer afmeldt. */
type Unsubscribe = () => void;

/** Envelope die Figma om elk iframe-bericht plaatst. */
interface PluginMessageEnvelope {
  pluginMessage?: unknown;
}

export interface PluginBridge {
  /** Stuur een typed bericht naar de plugin-main-thread. */
  post: (msg: UIToPluginMessage) => void;
  /**
   * Registreer een handler voor inkomende plugin-berichten.
   * Retourneert een unsubscribe-fn; wanneer we binnen een Vue setup
   * draaien wordt die ook automatisch in onUnmounted aangeroepen.
   */
  onMessage: (handler: PluginMessageHandler) => Unsubscribe;
}

const pluginMessageHandlers = new Set<PluginMessageHandler>();
let isWindowMessageListenerAttached = false;

interface PendingBridgePerf {
  id: number;
  type: string;
  requestId: string | null;
  startedAt: number;
}

const pendingBridgeByRequestId = new Map<string, PendingBridgePerf>();
const pendingBridgeQueue: PendingBridgePerf[] = [];
let nextBridgePerfId = 1;

const MAX_PENDING_BRIDGE_PERF_AGE_MS = 15000;

function readMessageType(msg: unknown): string {
  if (msg === null || msg === undefined || typeof msg !== 'object') return 'unknown';
  const typed = msg as { type?: unknown };
  return typeof typed.type === 'string' ? typed.type : 'unknown';
}

function readRequestId(msg: unknown): string | null {
  if (msg === null || msg === undefined || typeof msg !== 'object') return null;
  const typed = msg as { requestId?: unknown };
  return typeof typed.requestId === 'string' && typed.requestId.length > 0 ? typed.requestId : null;
}

function shouldTrackRoundtrip(msg: UIToPluginMessage): boolean {
  if (msg.type === 'ui-ready') return false;
  if (msg.type === 'set-icon-recents') return false;
  if (msg.type === 'resize-ui') return false;
  if (msg.type === 'export-document') return false;
  if (msg.type === 'trigger-undo') return false;
  if (msg.type === 'close') return false;
  return true;
}

function pruneBridgePerf(now: number): void {
  while (
    pendingBridgeQueue.length > 0 &&
    now - pendingBridgeQueue[0].startedAt > MAX_PENDING_BRIDGE_PERF_AGE_MS
  ) {
    const stale = pendingBridgeQueue.shift()!;
    if (stale.requestId !== null) {
      pendingBridgeByRequestId.delete(stale.requestId);
    }
    debugLog('perf', 'ui-roundtrip-timeout', {
      id: stale.id,
      type: stale.type,
      requestId: stale.requestId,
      ageMs: now - stale.startedAt,
    });
  }
}

function trackBridgePost(msg: UIToPluginMessage): void {
  if (!isPluginDebugEnabled()) return;
  if (!shouldTrackRoundtrip(msg)) return;
  const now = Date.now();
  pruneBridgePerf(now);
  const pending: PendingBridgePerf = {
    id: nextBridgePerfId++,
    type: msg.type,
    requestId: readRequestId(msg),
    startedAt: now,
  };
  pendingBridgeQueue.push(pending);
  if (pending.requestId !== null) {
    pendingBridgeByRequestId.set(pending.requestId, pending);
  }
  debugLog('perf', 'ui-post', {
    id: pending.id,
    type: pending.type,
    requestId: pending.requestId,
  });
}

function settleBridgeRoundtrip(msg: PluginToUIMessage): void {
  if (!isPluginDebugEnabled()) return;
  if (msg.type !== 'target-updated') return;
  const now = Date.now();
  pruneBridgePerf(now);

  let pending: PendingBridgePerf | null = null;
  const requestId = readRequestId(msg);
  if (requestId !== null) {
    const byRequest = pendingBridgeByRequestId.get(requestId);
    if (byRequest !== undefined) {
      pending = byRequest;
      pendingBridgeByRequestId.delete(requestId);
      const idx = pendingBridgeQueue.indexOf(byRequest);
      if (idx >= 0) pendingBridgeQueue.splice(idx, 1);
    }
  }

  if (pending === null && pendingBridgeQueue.length > 0) {
    pending = pendingBridgeQueue.shift()!;
    if (pending.requestId !== null) {
      pendingBridgeByRequestId.delete(pending.requestId);
    }
  }

  if (pending === null) {
    debugLog('perf', 'ui-roundtrip-unmatched', {
      requestId: requestId,
      ok: msg.ok,
      targetId: msg.targetId,
      error: msg.error,
    });
    return;
  }

  debugLog('perf', 'ui-roundtrip', {
    id: pending.id,
    type: pending.type,
    requestId: pending.requestId,
    ok: msg.ok,
    targetId: msg.targetId,
    totalMs: now - pending.startedAt,
    error: msg.error,
  });
}

function unwrapPluginMessage(event: MessageEvent): PluginToUIMessage | null {
  // Edge-case: Vite HMR en andere iframe-messages hebben geen
  // pluginMessage-envelope. Stil negeren, niet throwen.
  const envelope = event.data as PluginMessageEnvelope | undefined;
  if (envelope === undefined || envelope === null) return null;
  const raw = envelope.pluginMessage;
  if (raw === undefined || raw === null || typeof raw !== 'object') return null;

  debugMessage('plugin->ui', raw);
  return raw as PluginToUIMessage;
}

function handleWindowMessage(event: MessageEvent): void {
  const msg = unwrapPluginMessage(event);
  if (msg === null) return;
  settleBridgeRoundtrip(msg);

  for (const handler of Array.from(pluginMessageHandlers)) {
    try {
      handler(msg);
    } catch (err: unknown) {
      console.error('[welder-slide-editor] plugin bridge handler failed:', err);
    }
  }
}

function ensureWindowMessageListener(): void {
  if (isWindowMessageListenerAttached) return;
  window.addEventListener('message', handleWindowMessage);
  isWindowMessageListenerAttached = true;
}

function post(msg: UIToPluginMessage): void {
  debugMessage('ui->plugin', msg);
  trackBridgePost(msg);
  parent.postMessage({ pluginMessage: msg }, '*');
}

/**
 * Tracks in-flight writes for a single editor. `register()` increments a
 * counter (called when posting a mutating message); the next
 * `target-updated` decrements it. `pending` is true while the counter > 0.
 *
 * Correlation is approximate — a target-updated from another in-flight
 * editor's write will decrement this counter instead. For typical
 * sequential UX (user edits one field at a time) the approximation is
 * invisible. Acceptable for spinner/disabled-during-save UX without
 * touching the sandbox-side message contract.
 */
export interface BridgePendingTracker {
  pending: ComputedRef<boolean>;
  register(): void;
}

export function useBridgePending(bridge: PluginBridge): BridgePendingTracker {
  const count = ref(0);
  bridge.onMessage((msg) => {
    if (msg.type === 'target-updated' && count.value > 0) {
      count.value -= 1;
    }
  });
  return {
    pending: computed(() => count.value > 0),
    register(): void {
      count.value += 1;
    },
  };
}

export function usePluginBridge(): PluginBridge {
  // getCurrentInstance is null wanneer usePluginBridge buiten een Vue
  // component-setup wordt aangeroepen (bv. vanuit een Pinia-store die
  // pas later mount of vanuit tests). Dan slaan we onUnmounted over.
  const inSetup = getCurrentInstance() !== null;

  function onMessage(handler: PluginMessageHandler): Unsubscribe {
    ensureWindowMessageListener();
    pluginMessageHandlers.add(handler);

    const unsubscribe: Unsubscribe = () => {
      pluginMessageHandlers.delete(handler);
    };

    if (inSetup) {
      onUnmounted(unsubscribe);
    }

    return unsubscribe;
  }

  return { post, onMessage };
}
