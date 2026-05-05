// plugins/welder-editor/ui/composables/usePluginBridge.ts
//
// Typed postMessage bridge between the plugin iframe (ui/) and the main thread
// (code/). The ONLY file in ui/ that calls parent.postMessage or
// window.addEventListener('message', ...).
//
// Adapted from:
//   welder-slide-editor/widget-src/ui/composables/usePluginBridge.ts
//
// Differences from the external build's version:
//   - Typed against the v0.1.0 message-bus contract (shared/messages.ts)
//     rather than the widget's PluginToUIMessage / UIToPluginMessage types.
//   - correlationId-based request/response support: post<T>() returns a
//     Promise that resolves when the matching result message arrives.
//   - Version guard: incoming messages with a mismatched MESSAGE_BUS_VERSION
//     are rejected with a console.warn rather than crashing.
//
// Auto-unsubscribe:
//   When usePluginBridge() is called inside a Vue component setup() context,
//   each onMessage() handler is automatically removed in onUnmounted.
//   When called outside setup() (store, test), the returned unsubscribe
//   function must be called manually.
//
// Usage:
//   const bridge = usePluginBridge();
//   bridge.post({ type: 'close', version: MESSAGE_BUS_VERSION });
//   const unsub = bridge.onMessage((msg) => { ... });

import { getCurrentInstance, onUnmounted } from 'vue';
import type { Message, ResultMessage, CorrelationId } from '@shared/messages.js';
import { MESSAGE_BUS_VERSION } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Handler for any inbound message from the plugin main thread. */
type MessageHandler = (msg: Message) => void;

/** Removes a registered message handler. */
type Unsubscribe = () => void;

/** Figma iframe message envelope structure. */
interface PluginMessageEnvelope {
  pluginMessage?: unknown;
}

// ---------------------------------------------------------------------------
// Pending request registry for correlationId-based promise resolution
// ---------------------------------------------------------------------------

type PendingResolver = (result: ResultMessage) => void;

const pendingRequests = new Map<CorrelationId, PendingResolver>();

// ---------------------------------------------------------------------------
// Global listener (single shared listener for all bridge instances)
// ---------------------------------------------------------------------------

let globalListenerInstalled = false;

function ensureGlobalListener(): void {
  if (globalListenerInstalled) return;
  globalListenerInstalled = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const envelope = event.data as PluginMessageEnvelope | undefined | null;
    if (!envelope || typeof envelope !== 'object') return;

    const raw = envelope.pluginMessage;
    if (!raw || typeof raw !== 'object') return;

    const msg = raw as Record<string, unknown>;

    // Version guard — reject mismatched messages with a warning.
    if (msg['version'] !== MESSAGE_BUS_VERSION) {
      console.warn(
        `[usePluginBridge] Received message with version ${String(msg['version'])}, ` +
          `expected ${MESSAGE_BUS_VERSION}. Message dropped.`,
        msg,
      );
      return;
    }

    const typed = msg as unknown as Message;

    // Resolve pending correlationId promises for result messages.
    if ('correlationId' in typed) {
      const correlationId = (typed as { correlationId: string }).correlationId;
      const resolver = pendingRequests.get(correlationId);
      if (resolver !== undefined) {
        pendingRequests.delete(correlationId);
        resolver(typed as ResultMessage);
      }
    }

    // Broadcast to all registered per-instance handlers.
    for (const handler of globalHandlers) {
      try {
        handler(typed);
      } catch (err) {
        console.error('[usePluginBridge] Handler threw:', err);
      }
    }
  });
}

/** All active per-instance message handlers. */
const globalHandlers = new Set<MessageHandler>();

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PluginBridge {
  /**
   * Send a typed message to the plugin main thread (code/).
   * For request-response messages, use post<T>() instead.
   */
  post(msg: Message): void;

  /**
   * Send a request message and return a Promise that resolves with the
   * matching result message (matched by correlationId).
   *
   * The caller must supply a correlationId (UUID-v4). No timeout is applied
   * here — the composable (useEditorActions) manages timeouts via Promise.race.
   */
  postAndWait<R extends ResultMessage>(
    msg: Extract<Message, { correlationId: CorrelationId }>,
  ): Promise<R>;

  /**
   * Register a handler for inbound messages from the main thread.
   * When called inside a Vue setup() context, the handler is automatically
   * removed in onUnmounted. Otherwise, call the returned unsubscribe function.
   */
  onMessage(handler: MessageHandler): Unsubscribe;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function usePluginBridge(): PluginBridge {
  ensureGlobalListener();

  // Detect Vue component setup context for auto-unsubscribe.
  const inSetup = getCurrentInstance() !== null;

  // Track handlers registered by this bridge instance so we can remove them
  // on unmount without affecting other instances.
  const instanceHandlers = new Set<MessageHandler>();

  function post(msg: Message): void {
    parent.postMessage({ pluginMessage: msg }, '*');
  }

  function postAndWait<R extends ResultMessage>(
    msg: Extract<Message, { correlationId: CorrelationId }>,
  ): Promise<R> {
    return new Promise<R>((resolve) => {
      pendingRequests.set(msg.correlationId, resolve as PendingResolver);
      parent.postMessage({ pluginMessage: msg }, '*');
    });
  }

  function onMessage(handler: MessageHandler): Unsubscribe {
    globalHandlers.add(handler);
    instanceHandlers.add(handler);

    const unsubscribe: Unsubscribe = () => {
      globalHandlers.delete(handler);
      instanceHandlers.delete(handler);
    };

    if (inSetup) {
      onUnmounted(unsubscribe);
    }

    return unsubscribe;
  }

  // If used inside a component, clean up all instance handlers on unmount.
  if (inSetup) {
    onUnmounted(() => {
      for (const handler of instanceHandlers) {
        globalHandlers.delete(handler);
      }
      instanceHandlers.clear();
    });
  }

  return { post, postAndWait, onMessage };
}
