// InstructorCard: the Instructor variant of the Card slot inside CardWrap. Photo and
// name are designer-managed and follow the `Instructor` VARIANT property; the plugin
// only switches that variant and edits the TEXT nodes inside the `list` frame.

import { getPropertyKey, setInstanceProperty } from '../../slide-machine';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

export const INSTRUCTOR_CARD_NODE_NAME = 'InstructorCard';
const INSTRUCTOR_PROPERTY_NAME = 'Instructor';
const LIST_FRAME_NAME = 'list';

// Scoped to the `list` frame so the variant-driven name text stays untouched.
// Also works on component masters — they supply the defaults on an instructor switch.
export function findInstructorListTexts(card: InstanceNode | ComponentNode): TextNode[] {
  if (!('findOne' in card)) return [];
  const list = card.findOne(function (n: SceneNode) {
    return n.name === LIST_FRAME_NAME && 'findAll' in n;
  });
  if (list === null || !('findAll' in list)) return [];
  const found = (list as FrameNode).findAll(function (n: SceneNode) {
    return n.type === 'TEXT';
  });
  const out: TextNode[] = [];
  for (let i = 0; i < found.length; i++) {
    if (found[i].type === 'TEXT') out.push(found[i] as TextNode);
  }
  return out;
}

export function readInstructorVariant(card: InstanceNode): string | null {
  const key = getPropertyKey(card, INSTRUCTOR_PROPERTY_NAME);
  if (key === null) return null;
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const entry = props[key];
  if (entry === undefined || entry === null) return null;
  if (entry.type !== 'VARIANT') return null;
  if (typeof entry.value !== 'string') return null;
  return entry.value;
}

// One InstructorCard set per design system; caching it makes later switches and
// re-scans fully synchronous (no getMainComponentAsync after the first resolve).
let cachedInstructorSet: ComponentSetNode | null = null;

async function resolveInstructorSet(card: InstanceNode): Promise<ComponentSetNode | null> {
  if (cachedInstructorSet !== null) return cachedInstructorSet;
  try {
    const main = await card.getMainComponentAsync();
    const parent = main !== null ? main.parent : null;
    if (parent !== null && parent.type === 'COMPONENT_SET') {
      cachedInstructorSet = parent as ComponentSetNode;
    }
  } catch (e) {
    debugLog('instructor', 'resolveInstructorSet failed: ' + String(e));
  }
  return cachedInstructorSet;
}

/** Empty array when the set is unreachable (library not loaded) — the UI then shows the picker disabled. */
export async function readInstructorOptions(card: InstanceNode): Promise<string[]> {
  const set = await resolveInstructorSet(card);
  if (set === null) return [];
  const defs = set.componentPropertyDefinitions;
  if (defs === null || defs === undefined) return [];
  const keys = Object.keys(defs);
  for (let i = 0; i < keys.length; i++) {
    const bare = keys[i].split('#')[0];
    if (bare === INSTRUCTOR_PROPERTY_NAME && defs[keys[i]].type === 'VARIANT') {
      const options = defs[keys[i]].variantOptions;
      return Array.isArray(options) ? options : [];
    }
  }
  return [];
}

// Variant children are named 'Instructor=<value>' among comma-separated property
// pairs; matched segment-exact.
function defaultItemsForVariant(set: ComponentSetNode, instructor: string): string[] | null {
  const wanted = INSTRUCTOR_PROPERTY_NAME + '=' + instructor;
  for (let i = 0; i < set.children.length; i++) {
    const child = set.children[i];
    if (child.type !== 'COMPONENT') continue;
    const segments = child.name.split(',');
    let match = false;
    for (let s = 0; s < segments.length; s++) {
      if (segments[s].replace(/^\s+|\s+$/g, '') === wanted) {
        match = true;
        break;
      }
    }
    if (!match) continue;
    const texts = findInstructorListTexts(child as ComponentNode);
    const out: string[] = [];
    for (let t = 0; t < texts.length; t++) {
      out.push(texts[t].characters);
    }
    return out;
  }
  return null;
}

export interface InstructorCardPayload {
  cardNodeId: string;
  instructor?: string;
  /** Full list in document order; unchanged texts are skipped. */
  items?: string[];
  /** Hidden cards collapse out of the CardWrap auto-layout. */
  visible?: boolean;
}

/**
 * Returns the list texts after an instructor switch (reset to the new variant's
 * defaults) so the caller can post them to the iframe; null when no switch happened.
 */
export async function applyInstructorCard(
  slide: InstanceNode,
  payload: InstructorCardPayload,
): Promise<string[] | null> {
  const cardNode = slide.findOne(function (n: SceneNode) {
    return (
      n.type === 'INSTANCE' &&
      n.name === INSTRUCTOR_CARD_NODE_NAME &&
      n.id === payload.cardNodeId
    );
  });
  if (cardNode === null || cardNode.type !== 'INSTANCE') return null;
  const card = cardNode as InstanceNode;
  let switched = false;

  if (typeof payload.visible === 'boolean' && card.visible !== payload.visible) {
    card.visible = payload.visible;
  }

  if (typeof payload.instructor === 'string' && payload.instructor.length > 0) {
    const current = readInstructorVariant(card);
    if (current !== payload.instructor) {
      switched = true;
      try {
        const ok = setInstanceProperty(card, INSTRUCTOR_PROPERTY_NAME, payload.instructor);
        if (!ok) {
          debugLog('instructor', 'Instructor property missing on ' + card.id);
        }
      } catch (e) {
        console.log('[instructor] setProperties Instructor failed: ' + String(e));
      }
      // Figma keeps text overrides across a variant switch, so reset the list to the
      // NEW variant's defaults manually. Not via resetOverrides: the card is itself an
      // instance-swap override in the CardWrap slot, and a full reset would undo the swap.
      try {
        const set = await resolveInstructorSet(card);
        if (set !== null) {
          const defaults = defaultItemsForVariant(set, payload.instructor);
          if (defaults !== null) {
            const instanceTexts = findInstructorListTexts(card);
            const resets: Array<Promise<void>> = [];
            const limit = Math.min(defaults.length, instanceTexts.length);
            for (let i = 0; i < limit; i++) {
              if (instanceTexts[i].characters === defaults[i]) continue;
              resets.push(setTextCharactersSafe(instanceTexts[i], defaults[i]));
            }
            if (resets.length > 0) {
              await Promise.all(resets);
            }
          }
        }
      } catch (e) {
        debugLog('instructor', 'list reset failed: ' + String(e));
      }
    }
  }

  if (Array.isArray(payload.items)) {
    const textNodes = findInstructorListTexts(card);
    const writes: Array<Promise<void>> = [];
    const limit = Math.min(textNodes.length, payload.items.length);
    for (let i = 0; i < limit; i++) {
      const next = payload.items[i];
      if (typeof next !== 'string') continue;
      if (textNodes[i].characters === next) continue;
      writes.push(setTextCharactersSafe(textNodes[i], next));
    }
    if (writes.length > 0) {
      await Promise.all(writes);
    }
  }

  if (!switched) return null;
  const finalTexts = findInstructorListTexts(card);
  const finalItems: string[] = [];
  for (let f = 0; f < finalTexts.length; f++) {
    finalItems.push(finalTexts[f].characters);
  }
  return finalItems;
}
