// Welder Editor — code-side entry (Sprint 0 stub).
// Runs in Figma's plugin sandbox. No DOM, no window, no localStorage.
// Owns figma.* integration and message-bus dispatch.
//
// This stub will be fully replaced in Sprint 1. It is kept vue-tsc-clean
// against the new shared/messages.ts contract.
//
// Owner: figma-api-engineer
// Contract: shared/messages.ts (owner: figma-api-engineer)

import { MESSAGE_BUS_VERSION, type Message, type EditorType } from '@shared/messages';

// Open the iframe ui at the plugin dimensions from spec §4.
figma.showUI(__html__, { width: 520, height: 760, themeColors: true });

// Send the initial state to the ui. The ui boots into a loading state and
// renders the real interface once this lands.
figma.ui.postMessage({
  type: 'init',
  version: MESSAGE_BUS_VERSION,
  payload: {
    slides: [],
    initialSlideId: null,
    editorType: figma.editorType as EditorType,
  },
} satisfies Message);

// Receive messages from the ui and dispatch to handlers. Every handler must
// return a typed result envelope through figma.ui.postMessage with the
// originating correlationId.
figma.ui.onmessage = (msg: Message) => {
  if (msg.version !== MESSAGE_BUS_VERSION) {
    console.error(
      `message-bus version mismatch: got ${msg.version}, expected ${MESSAGE_BUS_VERSION}`,
    );
    return;
  }
  switch (msg.type) {
    case 'close':
      figma.closePlugin();
      return;
    default:
      // Unknown message type — log and ignore.
      console.warn(`unhandled message type: ${(msg as { type: string }).type}`);
  }
};

// Selection changes propagate to the ui so it can trigger slide-load:request.
figma.on('selectionchange', () => {
  figma.ui.postMessage({
    type: 'selection-changed',
    version: MESSAGE_BUS_VERSION,
    payload: {
      selectedNodeIds: figma.currentPage.selection.map((n) => n.id),
    },
  } satisfies Message);
});
