// Welder Editor — message-bus contract.
//
// The single source of truth for what crosses between code/ and ui/.
// Owned by figma-api-engineer. Modifying this file requires an ADR or a
// MESSAGE_BUS_VERSION bump (with migration tests).
//
// Every message has:
//   - type: discriminator
//   - version: MESSAGE_BUS_VERSION at time of send (validated on receive)
//   - payload: typed per message
//   - correlationId (for request-response messages): UUID-v4

export const MESSAGE_BUS_VERSION = 1 as const;

export type NodeRef = {
  id: string;
  type: SceneNode['type'];
};

// Matches Figma's runtime editorType values. We support figma / figjam /
// slides; "dev" (Dev Mode) and "buzz" (legacy) are passed through but the
// plugin should branch behavior on them at the boundary.
export type EditorType = 'figma' | 'figjam' | 'slides' | 'dev' | 'buzz';

export type Message =
  | {
      type: 'init';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        selection: NodeRef[];
        editorType: EditorType;
      };
    }
  | {
      type: 'selection-changed';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        selection: NodeRef[];
      };
    }
  | {
      type: 'close';
      version: typeof MESSAGE_BUS_VERSION;
    };

// Result envelope for request-response operations. Add as needed.
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };
