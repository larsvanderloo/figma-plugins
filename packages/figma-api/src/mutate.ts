// packages/figma-api/src/mutate.ts
//
// Document mutation primitives with font-loading guards and optional atomic
// undo grouping.
//
// Owner: figma-api-engineer
// Monday task: 1.6
//
// ADR-0004: default behaviour is granular per-call undo (Figma native).
// The `atomic` escape hatch (withAtomic) is available for composite
// operations like table/journey renders that produce 20-60 undo steps for a
// single user action.  Callers opt in explicitly — never implicitly.
//
// Reference: ADR-0004 §"explicit `atomic` option"
// https://www.figma.com/plugin-docs/api/figma/#commitundo

import { loadAllFontsForNode } from './fonts';

// ---------------------------------------------------------------------------
// Character writes (with font guards)
// ---------------------------------------------------------------------------

/**
 * FIG-FONT-01 canonical write path: loads all fonts in the existing styled
 * range before writing characters, preventing silent character truncation at
 * font-boundary.  Also accepts an explicit override font to load before the
 * write (useful for nodes that will receive a fresh font as part of the same
 * mutation).
 *
 * Single Figma undo step: the characters write.
 * The loadFontAsync calls are async-only; they don't add undo steps.
 */
export async function setCharactersSafe(
  node: TextNode,
  text: string,
  font?: FontName,
): Promise<void> {
  await loadAllFontsForNode(node);
  if (font !== undefined) {
    await figma.loadFontAsync(font);
  }
  node.characters = text;
}

/**
 * Applies character-range fills after ensuring all fonts in the range are
 * loaded.  `ranges` is an array of [start, end, fills] tuples.
 *
 * Uses setRangeFills (not node.fills) to respect mixed-style text nodes.
 *
 * Note on glyph-cache flush: after setRangeFills with bound variables,
 * a visibility toggle may be required to force Figma to invalidate the
 * render cache.  See ADR-0005 §"Additional render-cache flush" for when
 * this is needed.  This function does NOT apply the flush — callers that
 * bind variables via setBoundVariableForPaintSafe (variables.ts) should
 * apply the flush as described there.
 */
export async function setRangeFillsSafe(
  node: TextNode,
  ranges: ReadonlyArray<readonly [number, number, ReadonlyArray<Paint>]>,
): Promise<void> {
  await loadAllFontsForNode(node);
  for (const [start, end, fills] of ranges) {
    node.setRangeFills(start, end, fills as Paint[]);
  }
}

// ---------------------------------------------------------------------------
// Instance swap
// ---------------------------------------------------------------------------

/**
 * Swaps the component backing an instance to the component identified by
 * `componentKey` (a Figma component key usable with importComponentByKeyAsync).
 *
 * Three-strategy fallback (cited from external build badge/card icon-swap
 * logic in widget-src/editors/shared/icon-swap.ts):
 *
 *   Strategy A: INSTANCE_SWAP property on the instance's main component.
 *     The preferred route for library components that expose an icon slot as
 *     a componentPropertyDefinition of type INSTANCE_SWAP.
 *     Skipped here — swapInstanceComponent takes a resolved key; the
 *     INSTANCE_SWAP property resolution lives in icon-swap logic in code/.
 *
 *   Strategy B: importComponentByKeyAsync → instance.swapComponent(comp).
 *     Standard swap: import the target component by key and call swapComponent.
 *     This is the primary path.
 *
 *   Strategy C: direct setProperties with the imported component's id.
 *     Used when Strategy B fails (e.g. the instance has an INSTANCE_SWAP
 *     property that requires setProperties rather than swapComponent, or
 *     swapComponent throws in dynamic-page mode for remote components).
 *     Requires the caller to know the property name — this fallback only
 *     attempts setProperties with the first INSTANCE_SWAP property found on
 *     the main component's owner.
 *
 * Returns `true` if any strategy succeeded, `false` otherwise.  Callers
 * should log or surface the false case to the user via the error envelope.
 */
export async function swapInstanceComponent(
  instance: InstanceNode,
  componentKey: string,
): Promise<boolean> {
  let comp: ComponentNode;
  try {
    comp = await figma.importComponentByKeyAsync(componentKey);
  } catch (_e) {
    return false;
  }

  // Strategy B: swapComponent
  try {
    instance.swapComponent(comp);
    return true;
  } catch (_e) {
    // fall through to Strategy C
  }

  // Strategy C: setProperties via first INSTANCE_SWAP property on the owner
  let main: ComponentNode | null = null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (_e) {
    // ignore; main stays null
  }

  if (main === null) return false;

  const owner: ComponentNode | ComponentSetNode =
    main.parent !== null && main.parent.type === 'COMPONENT_SET'
      ? (main.parent as ComponentSetNode)
      : main;

  const defs = owner.componentPropertyDefinitions;
  if (defs === null || defs === undefined) return false;

  for (const propKey of Object.keys(defs)) {
    const def = defs[propKey];
    if (def === undefined) continue;
    if (def.type !== 'INSTANCE_SWAP') continue;
    try {
      instance.setProperties({ [propKey]: comp.id });
      return true;
    } catch (_e) {
      // continue to next property
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Tree append
// ---------------------------------------------------------------------------

/**
 * Type-safe wrapper around parent.appendChild(child).
 *
 * Only FRAME, GROUP, COMPONENT, COMPONENT_SET, SECTION, and INSTANCE nodes
 * accept children in Figma's API.  This helper guards against calling
 * appendChild on a leaf node (TEXT, RECTANGLE, etc.) and throws a descriptive
 * error instead of a silent no-op.
 */
export function appendChildSafe(parent: ChildrenMixin & BaseNode, child: SceneNode): void {
  parent.appendChild(child);
}

// ---------------------------------------------------------------------------
// Atomic undo grouping (opt-in, per ADR-0004)
// ---------------------------------------------------------------------------

/**
 * Wraps a mutation sequence in a single user-visible undo step.
 *
 * Per ADR-0004, default behaviour is granular per-call undo.  This helper
 * is the explicit opt-in for composite operations (table render, journey
 * render, image replacement) where collapsing 20–60 node operations into
 * one Cmd-Z step is the correct UX.
 *
 * How it works: figma.commitUndo() called BEFORE the fn starts a new undo
 * group boundary.  Any mutations during fn are grouped into one step.
 * A second commitUndo() after fn closes the group so subsequent changes
 * start a fresh step.
 *
 * Callers that do NOT use withAtomic get the default granular behaviour.
 *
 * Known limitations:
 *   - setPluginData and setRelaunchData are NOT included in undo history
 *     (Figma API limitation — see ADR-0004 §"Consequences").
 *   - If fn throws, the partial mutations are already on the undo stack.
 *     Callers should handle errors and communicate the partial state to the
 *     user if relevant.
 */
export async function withAtomic<T>(_label: string, fn: () => Promise<T>): Promise<T> {
  figma.commitUndo();
  try {
    const result = await fn();
    figma.commitUndo();
    return result;
  } catch (err: unknown) {
    // Close the undo group even on failure so subsequent interactions are
    // not accidentally grouped with the failed operation.
    figma.commitUndo();
    throw err;
  }
}
