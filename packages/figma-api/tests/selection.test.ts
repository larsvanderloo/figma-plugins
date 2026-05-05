// packages/figma-api/tests/selection.test.ts
//
// Tests for selection.ts helpers.
//
// Figma globals are stubbed via globalThis.figma ad-hoc per Sprint 0
// conventions (validation/fixtures/figma-mock/README.md).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentSelection,
  getNodeByIdSafe,
  findFirstAncestor,
  onSelectionChange,
  isInstance,
  isFrame,
  isText,
  isSlot,
  isComponent,
} from '../src/selection';

// ---------------------------------------------------------------------------
// Minimal figma stub
// ---------------------------------------------------------------------------

function makeFigmaStub(opts: { selection?: SceneNode[]; nodeMap?: Map<string, BaseNode | null> }) {
  return {
    currentPage: {
      selection: opts.selection ?? [],
    },
    getNodeByIdAsync: async (id: string) => {
      const map = opts.nodeMap;
      if (map === undefined) return null;
      return map.get(id) ?? null;
    },
    on: vi.fn(),
    off: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Type predicates
// ---------------------------------------------------------------------------

describe('type predicates', () => {
  it('isInstance returns true for INSTANCE node', () => {
    const node = { type: 'INSTANCE' } as unknown as BaseNode;
    expect(isInstance(node)).toBe(true);
  });

  it('isInstance returns false for FRAME node', () => {
    const node = { type: 'FRAME' } as unknown as BaseNode;
    expect(isInstance(node)).toBe(false);
  });

  it('isFrame returns true for FRAME node', () => {
    const node = { type: 'FRAME' } as unknown as BaseNode;
    expect(isFrame(node)).toBe(true);
  });

  it('isText returns true for TEXT node', () => {
    const node = { type: 'TEXT' } as unknown as BaseNode;
    expect(isText(node)).toBe(true);
  });

  it('isComponent returns true for COMPONENT node', () => {
    const node = { type: 'COMPONENT' } as unknown as BaseNode;
    expect(isComponent(node)).toBe(true);
  });

  it('isSlot returns true for FRAME named SlotNode', () => {
    const node = { type: 'FRAME', name: 'SlotNode' } as unknown as BaseNode;
    expect(isSlot(node)).toBe(true);
  });

  it('isSlot returns true for FRAME named "Table Slot"', () => {
    const node = { type: 'FRAME', name: 'Table Slot' } as unknown as BaseNode;
    expect(isSlot(node)).toBe(true);
  });

  it('isSlot returns false for INSTANCE named SlotNode', () => {
    const node = { type: 'INSTANCE', name: 'SlotNode' } as unknown as BaseNode;
    expect(isSlot(node)).toBe(false);
  });

  it('isSlot returns false for FRAME with unrelated name', () => {
    const node = { type: 'FRAME', name: 'content-area' } as unknown as BaseNode;
    expect(isSlot(node)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCurrentSelection
// ---------------------------------------------------------------------------

describe('getCurrentSelection', () => {
  it('returns figma.currentPage.selection', () => {
    const sel = [{ type: 'INSTANCE' } as unknown as SceneNode];
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({ selection: sel });
    expect(getCurrentSelection()).toBe(sel);
  });
});

// ---------------------------------------------------------------------------
// getNodeByIdSafe
// ---------------------------------------------------------------------------

describe('getNodeByIdSafe', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      nodeMap: new Map([
        ['scene-1', { type: 'FRAME', parent: {}, visible: true } as unknown as BaseNode],
        ['doc-node', { type: 'DOCUMENT' } as unknown as BaseNode],
      ]),
    });
  });

  it('happy path: returns SceneNode for a known id', async () => {
    const node = await getNodeByIdSafe('scene-1');
    expect(node).not.toBeNull();
    expect((node as BaseNode | null)?.type).toBe('FRAME');
  });

  it('returns null when node is missing from the document', async () => {
    const node = await getNodeByIdSafe('nonexistent-id');
    expect(node).toBeNull();
  });

  it('returns null when getNodeByIdAsync throws', async () => {
    (globalThis as Record<string, unknown>)['figma'] = {
      getNodeByIdAsync: async (_id: string) => {
        throw new Error('dynamic-page access error');
      },
    };
    const node = await getNodeByIdSafe('any-id');
    expect(node).toBeNull();
  });

  it('returns null for a non-scene node (no parent/visible)', async () => {
    // DOCUMENT has type 'DOCUMENT' and lacks the visible property check
    const node = await getNodeByIdSafe('doc-node');
    expect(node).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findFirstAncestor
// ---------------------------------------------------------------------------

describe('findFirstAncestor', () => {
  it('finds an INSTANCE ancestor', () => {
    const slide = { type: 'INSTANCE', parent: null } as unknown as BaseNode;
    const frame = { type: 'FRAME', parent: slide } as unknown as BaseNode;
    const text = { type: 'TEXT', parent: frame } as unknown as BaseNode;

    const result = findFirstAncestor(text, isInstance);
    expect(result).toBe(slide);
  });

  it('returns null when no ancestor matches', () => {
    const frame = { type: 'FRAME', parent: null } as unknown as BaseNode;
    const text = { type: 'TEXT', parent: frame } as unknown as BaseNode;

    const result = findFirstAncestor(text, isInstance);
    expect(result).toBeNull();
  });

  it('does not return the node itself — only ancestors', () => {
    const frame = { type: 'FRAME', parent: null } as unknown as BaseNode;
    const result = findFirstAncestor(frame, isFrame);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// onSelectionChange
// ---------------------------------------------------------------------------

describe('onSelectionChange', () => {
  it('registers handler and returns unsubscribe function', () => {
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    (globalThis as Record<string, unknown>)['figma'] = { on: onSpy, off: offSpy };

    const handler = vi.fn();
    const unsub = onSelectionChange(handler);

    expect(onSpy).toHaveBeenCalledWith('selectionchange', handler);

    unsub();
    expect(offSpy).toHaveBeenCalledWith('selectionchange', handler);
  });
});
