// ============================================================
// editors/content/instructor.ts
//
// Scan-helpers + main-thread mutator voor InstructorCards — de
// Instructor-variant van de Card-slot binnen CardWrap. De component-set
// exposeert een `Instructor` VARIANT (één variant per persoon, bv.
// Gijs/Myra); foto + naam zijn designer-beheerd en volgen de variant.
// De plugin:
//   1. Switcht de `Instructor` VARIANT-property (picker in de UI).
//   2. Muteert de list-item-teksten (descendant TEXT-nodes binnen het
//      `list`-frame, in document-volgorde).
//
// FIG-FONT-01: text-mutaties gaan via setTextCharactersSafe.
// FIG-GUARD-01: type-checks vóór property-access; silent skip wanneer
// de card of target-nodes ontbreken.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { getPropertyKey, setInstanceProperty } from '../../slide-machine';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

export const INSTRUCTOR_CARD_NODE_NAME = 'InstructorCard';
const INSTRUCTOR_PROPERTY_NAME = 'Instructor';
const LIST_FRAME_NAME = 'list';

/**
 * De bewerkbare TEXT-nodes van een InstructorCard, in document-volgorde.
 * Bounded tot het `list`-frame zodat de variant-gedreven naam-text
 * buiten schot blijft. Werkt op zowel instances als component-masters
 * (de master levert de default-teksten bij een instructor-switch).
 */
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

/** Huidige `Instructor` VARIANT-waarde, of null wanneer de property ontbreekt. */
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

// De InstructorCard-component-set, gecachet na de eerste resolve.
// Eén set per design system; de cache maakt switches en re-scans na de
// eerste keer volledig synchroon (geen getMainComponentAsync meer).
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

/**
 * Beschikbare `Instructor`-variant-opties uit de component-set van de
 * card. Lege array wanneer de set onbereikbaar is (library niet geladen)
 * — de UI toont de picker dan disabled in plaats van een lege dropdown
 * te crashen.
 */
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

/**
 * Default-list-teksten van de variant-master voor `instructor`, sync
 * gelezen uit de (gecachete) component-set. Variant-children heten
 * 'Instructor=<waarde>' (segment-exact gematcht op komma-gescheiden
 * property-paren).
 */
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
  /** Volledige list in document-volgorde; ongewijzigde teksten worden geskipt. */
  items?: string[];
  /** Card-zichtbaarheid — hidden collapst uit de CardWrap-auto-layout. */
  visible?: boolean;
}

/**
 * Past een InstructorCardPayload toe op de aangewezen InstructorCard.
 * Resolveert zonder error wanneer de card ontbreekt (silent skip,
 * FIG-GUARD-01).
 *
 * Retourneert de list-teksten ná een instructor-switch (gereset naar de
 * defaults van de nieuwe variant), of null wanneer er geen switch
 * plaatsvond — de caller post die gericht naar de iframe.
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
      // Reset de list-teksten naar de defaults van de NIEUWE variant —
      // Figma bewaart text-overrides over een variant-switch heen.
      // NIET via resetOverrides: de InstructorCard zit zelf als
      // instance-swap-override in de CardWrap-slot, dus een volledige
      // reset zou de swap terugdraaien naar een gewone Card. De defaults
      // komen sync uit de gecachete component-set; de fonts zijn na de
      // eerste write al geladen — de switch blijft daarmee vlot.
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
