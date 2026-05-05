// packages/figma-api/src/selection.ts
//
// Selection helpers for the dynamic-page document-access mode.
//
// Owner: figma-api-engineer
// Monday task: 1.5
//
// All helpers are plain functions with no side-effects so they are fully
// tree-shakeable when imported by a downstream consumer.

// ---------------------------------------------------------------------------
// Type predicates
// ---------------------------------------------------------------------------

/**
 * Narrows a BaseNode to InstanceNode.
 *
 * Use when walking a selection to find the Slide INSTANCE container or any
 * nested instance (Badge, Card icon, etc.).
 */
export function isInstance(node: BaseNode): node is InstanceNode {
  return node.type === 'INSTANCE';
}

/**
 * Narrows a BaseNode to FrameNode.
 *
 * Slot-based table cells and rows are FRAME nodes; the Slot itself also resolves
 * to a FRAME in the Figma API.
 */
export function isFrame(node: BaseNode): node is FrameNode {
  return node.type === 'FRAME';
}

/**
 * Narrows a BaseNode to TextNode.
 *
 * Used when visiting text slots inside wrappers (heading, paragraph, cell text).
 */
export function isText(node: BaseNode): node is TextNode {
  return node.type === 'TEXT';
}

/**
 * Narrows a BaseNode to ComponentNode.
 *
 * Needed when inspecting whether a resolved main-component is a standalone
 * ComponentNode (rather than part of a ComponentSetNode).
 */
export function isComponent(node: BaseNode): node is ComponentNode {
  return node.type === 'COMPONENT';
}

/**
 * "Slot" predicate: a FRAME whose name matches the Welder slot naming
 * convention ("SlotNode" / names ending in "_slot" or "Slot").
 *
 * The slot pattern is used by TableWrap and JourneyWrap.  Exact name matching
 * is done here so that code/slide-machine.ts does not need to re-implement it.
 *
 * Note: Figma does not have a first-class SlotNode type.  The plugin detects
 * slots by FRAME type + name convention.
 */
export function isSlot(node: BaseNode): node is FrameNode {
  if (node.type !== 'FRAME') return false;
  const n = node.name;
  return n === 'SlotNode' || n.endsWith('_slot') || n.endsWith(' Slot') || n.endsWith('Slot');
}

// ---------------------------------------------------------------------------
// Selection read
// ---------------------------------------------------------------------------

/**
 * Returns the current canvas selection as a readonly array.
 *
 * Prefer this over accessing figma.currentPage.selection directly so that
 * tests can stub this single call site and so that the type is explicit.
 */
export function getCurrentSelection(): readonly SceneNode[] {
  return figma.currentPage.selection;
}

// ---------------------------------------------------------------------------
// Async node lookup
// ---------------------------------------------------------------------------

/**
 * Async wrapper around figma.getNodeByIdAsync that returns null instead of
 * throwing when the node does not exist.
 *
 * The raw API throws a rejected Promise on an unknown id in dynamic-page mode
 * (confirmed against @figma/plugin-typings 1.100.0 — the return type is
 * `Promise<BaseNode | null>` but in practice a rejected promise is observed
 * for completely unknown ids).  This wrapper normalises the surface to a
 * clean null.
 *
 * Wrap with withTimeout() from progress.ts for long-lived documents where
 * getNodeByIdAsync may block.
 */
export async function getNodeByIdSafe(id: string): Promise<SceneNode | null> {
  let node: BaseNode | null;
  try {
    node = await figma.getNodeByIdAsync(id);
  } catch (_e) {
    return null;
  }
  if (node === null) return null;
  // BaseNode includes non-scene nodes (DocumentNode, PageNode).
  // SceneNode is the set of nodes that can appear on a page.
  if (!('parent' in node && 'visible' in node)) return null;
  return node as SceneNode;
}

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

/**
 * Walks up the parent chain from `node` and returns the first ancestor that
 * satisfies `predicate`, or null if none is found.
 *
 * Typical usage: find the Slide INSTANCE from a deeply-nested child selected
 * by the user.
 *
 * ```ts
 * const slide = findFirstAncestor(selectedNode, isInstance);
 * ```
 */
export function findFirstAncestor<T extends BaseNode>(
  node: BaseNode,
  predicate: (n: BaseNode) => n is T,
): T | null {
  let current: BaseNode | null = node.parent ?? null;
  while (current !== null) {
    if (predicate(current)) return current;
    current = current.parent ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Selection event subscription
// ---------------------------------------------------------------------------

/**
 * Subscribes to the Figma selectionchange event and returns an unsubscribe
 * function.
 *
 * Figma's figma.on() API returns void; there is no figma.off() in the
 * standard API surface. This wrapper keeps a stable reference so callers
 * can cancel the subscription on plugin teardown.
 *
 * Usage:
 * ```ts
 * const unsub = onSelectionChange(() => { ... });
 * // later:
 * unsub();
 * ```
 */
export function onSelectionChange(handler: () => void): () => void {
  figma.on('selectionchange', handler);
  return function () {
    figma.off('selectionchange', handler);
  };
}
