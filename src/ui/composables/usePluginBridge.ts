// Deliberately a narrow post/onMessage API (unlike welder-table's per-handler
// bridge): stores dispatch on msg.type themselves, so the larger message union
// needs no per-type callback slots. One window listener unwraps once and fans out.

import { computed, getCurrentInstance, onUnmounted, ref, type ComputedRef } from 'vue';
import { debugLog, debugMessage, isPluginDebugEnabled } from '../../shared/debug';
import type { PluginToUIMessage, UIToPluginMessage } from '../../shared/types';

type PluginMessageHandler = (msg: PluginToUIMessage) => void;

type Unsubscribe = () => void;

interface PluginMessageEnvelope {
  pluginMessage?: unknown;
}

export interface PluginBridge {
  post: (msg: UIToPluginMessage) => void;
  /** Returns an unsubscribe fn; inside a Vue setup it also runs automatically on unmount. */
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
  // Vite HMR and other iframe messages carry no pluginMessage envelope; ignore silently.
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
 * Correlation is approximate: a target-updated from another editor's in-flight write
 * may decrement this counter instead. Invisible for sequential edits, and good enough
 * for spinner UX without touching the sandbox-side message contract.
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
  // getCurrentInstance() is null outside component setup (Pinia store, tests);
  // calling onUnmounted there would warn, so skip auto-cleanup.
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
