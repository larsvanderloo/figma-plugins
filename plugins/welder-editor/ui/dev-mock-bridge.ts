// plugins/welder-editor/ui/dev-mock-bridge.ts
//
// Dev-only mock bridge. Imported exclusively under import.meta.env.DEV in
// main.ts. This file must never be imported in production code — the entire
// module is tree-shaken by Vite when DEV is false.
//
// Purpose:
//   In the Vite dev-server preview there is no Figma main thread. This module
//   simulates the init → slide-load:result handshake so the UI renders fully
//   populated for layout and UX iteration.
//
// Approach:
//   1. Override window.postMessage before App.vue mounts so every call to
//      parent.postMessage({ pluginMessage: msg }, '*') from usePluginBridge is
//      intercepted here (window.parent === window in the dev-server iframe).
//   2. When an outgoing message has type === 'slide-load:request', capture its
//      correlationId and immediately schedule a slide-load:result MessageEvent
//      carrying the captured id and the canned mock payload.
//   3. All other outgoing messages are silently dropped (there is no code-side
//      listener in dev; forwarding them would cause the usePluginBridge version
//      guard to see request messages it doesn't know how to handle).
//   4. Dispatch a mock init MessageEvent at 200 ms to bootstrap App.vue's
//      init handler, which then triggers the slide-load:request that step 2
//      intercepts.
//
// ADR-0010 compliance:
//   MessageEvents dispatched here are consumed by the single usePluginBridge
//   window.addEventListener('message', ...) handler, which calls
//   useEditorActions and the store actions through the normal path. No direct
//   store writes occur here.

import { MESSAGE_BUS_VERSION } from '@shared/messages.js';
import type { Message } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Canned mock payload — matches the Message union shapes from shared/messages.ts
// ---------------------------------------------------------------------------

const MOCK_INIT: Extract<Message, { type: 'init' }> = {
  type: 'init',
  version: MESSAGE_BUS_VERSION,
  payload: {
    slides: [
      {
        id: 'dev-slide-1',
        number: 1,
        name: 'Welcome — Customer Journey',
        isSkipped: false,
      },
      {
        id: 'dev-slide-2',
        number: 2,
        name: 'Product Pillars',
        isSkipped: false,
      },
    ],
    initialSlideId: 'dev-slide-1',
    editorType: 'figma',
  },
};

// The slide-load:result payload shape — correlationId injected at dispatch time.
const MOCK_SLIDE_LOAD_DATA = {
  type: 'slide-load:result' as const,
  version: MESSAGE_BUS_VERSION as typeof MESSAGE_BUS_VERSION,
  payload: {
    ok: true as const,
    data: {
      slideId: 'dev-slide-1',
      general: {
        titleDescription: {
          copyWrapId: 'cw-1',
          heading: 'Welder v0.1.0 RC',
          paragraph: 'Branded plugin UI rewire — Sprint 5.',
          headingDim: [] as Array<[number, number]>,
        },
        badge: {
          badgeNodeId: 'bd-1',
          label: 'Q4 2026',
          icon: 'sparkles',
        },
        image: {
          imageWrapId: 'iw-1',
          imageHash: null,
        },
      },
      content: {
        cardWrapId: 'cw-cards-1',
        cards: [
          {
            cardNodeId: 'c-1',
            heading: 'Faster builds',
            paragraph: 'Single-file vite output cuts plugin load to under a second.',
            icon: 'zap',
            visualHash: null,
          },
          {
            cardNodeId: 'c-2',
            heading: 'Branded chrome',
            paragraph: 'Welder Oranje primary + Inter font + Nuxt UI v4 primitives.',
            icon: 'paint-bucket',
            visualHash: null,
          },
        ],
        timelineItems: [],
        journeyModel: null,
      },
      graphs: null,
    },
  },
};

// ---------------------------------------------------------------------------
// install() — call once before app.mount() in main.ts
// ---------------------------------------------------------------------------

export function installDevMockBridge(): void {
  // ---- Step 1: intercept parent.postMessage --------------------------------
  //
  // In the Vite dev server, window.parent === window. usePluginBridge calls
  //   parent.postMessage({ pluginMessage: msg }, '*')
  // which is identical to window.postMessage(...). We replace window.postMessage
  // with a shim that intercepts slide-load:request messages and responds with
  // the canned payload using the real correlationId from the request.
  //
  // All other outgoing messages are silently dropped — no code-side listener
  // exists in dev, and forwarding them could confuse the usePluginBridge
  // incoming-message handler (it would see unmatched request-type messages).

  const originalPostMessage = window.postMessage.bind(window);

  window.postMessage = function devMockPostMessage(
    message: unknown,
    targetOriginOrOptions?: string | WindowPostMessageOptions,
    transfer?: Transferable[],
  ): void {
    // Only intercept Figma plugin message envelopes.
    if (
      message !== null &&
      typeof message === 'object' &&
      'pluginMessage' in (message as Record<string, unknown>)
    ) {
      const envelope = message as { pluginMessage: unknown };
      const pm = envelope.pluginMessage;

      if (pm !== null && typeof pm === 'object') {
        const pluginMsg = pm as Record<string, unknown>;

        if (pluginMsg['type'] === 'slide-load:request') {
          // Capture the real correlationId and schedule the mock result.
          const correlationId = pluginMsg['correlationId'] as string;

          setTimeout(() => {
            const resultMsg = {
              ...MOCK_SLIDE_LOAD_DATA,
              correlationId,
            };

            window.dispatchEvent(
              new MessageEvent('message', {
                data: { pluginMessage: resultMsg },
              }),
            );
          }, 0);

          // Do not forward to the original postMessage — no code-side listener.
          return;
        }
      }

      // All other plugin messages silently dropped in dev.
      return;
    }

    // Non-plugin messages (e.g. HMR, Vite internal) pass through unchanged.
    if (transfer !== undefined) {
      originalPostMessage(message, targetOriginOrOptions as string, transfer);
    } else if (targetOriginOrOptions !== undefined) {
      originalPostMessage(message, targetOriginOrOptions as string);
    } else {
      originalPostMessage(message);
    }
  } as typeof window.postMessage;

  // ---- Step 2: dispatch the mock init message ------------------------------
  //
  // 200 ms delay mirrors the original pattern and gives Vue enough time to
  // finish mounting App.vue and installing the bridge message listener.

  setTimeout(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { pluginMessage: MOCK_INIT },
      }),
    );
  }, 200);

  console.warn('[dev-mock-bridge] installed — init fires at +200 ms, slide-load intercepted');
}
