// Welder Editor — code-side entry.
// Runs in Figma's plugin sandbox. No DOM, no window, no localStorage.
// Owns figma.* integration and message-bus dispatch.
//
// Owner: figma-api-engineer
// Contract: shared/messages.ts (owner: figma-api-engineer)

import { MESSAGE_BUS_VERSION, type Message } from '@shared/messages';

// Open the iframe ui at the standard plugin size. Resize via figma.ui.resize
// from message handlers when the ui needs more space.
figma.showUI(__html__, { width: 360, height: 480 });

// Send the initial state to the ui. The ui boots into a loading state and
// renders the real interface once this lands.
figma.ui.postMessage({
  type: 'init',
  version: MESSAGE_BUS_VERSION,
  payload: {
    selection: figma.currentPage.selection.map((n) => ({ id: n.id, type: n.type })),
    editorType: figma.editorType,
  },
} satisfies Message);

// Receive messages from the ui and dispatch to handlers. Every handler must
// return a typed result envelope through figma.ui.postMessage with the
// originating correlationId.
figma.ui.onmessage = (msg: Message) => {
  if (msg.version !== MESSAGE_BUS_VERSION) {
    console.error(`message-bus version mismatch: got ${msg.version}, expected ${MESSAGE_BUS_VERSION}`);
    return;
  }
  switch (msg.type) {
    case 'close':
      figma.closePlugin();
      return;
    default:
      // Unknown message type — log and ignore. Adding a handler is a
      // figma-api-engineer contract change.
      console.warn(`unhandled message type: ${(msg as { type: string }).type}`);
  }
};

// Selection changes propagate to the ui so it can update derived state.
figma.on('selectionchange', () => {
  figma.ui.postMessage({
    type: 'selection-changed',
    version: MESSAGE_BUS_VERSION,
    payload: {
      selection: figma.currentPage.selection.map((n) => ({ id: n.id, type: n.type })),
    },
  } satisfies Message);
});
