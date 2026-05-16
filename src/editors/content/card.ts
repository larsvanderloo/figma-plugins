// ============================================================
// editors/content/card.ts
//
// Main-thread mutator voor de Content → Cards-sectie (spec §9-T11).
// Zoekt binnen de slide de CardWrap-instance en vervolgens de specifieke
// card (identificeerd op node-id), en muteert:
//   1. Heading  — descendant text-node met name 'Heading' binnen de card.
//   2. Paragraph — descendant text-node met name 'Paragraph' binnen de card.
//   3. Icon     — INSTANCE_SWAP-property op de card-instance zelf
//                 (preferredValues + setProperties via shared/icon-swap).
//   4. Visual   — optioneel: vervang de ImagePaint op de image-slot van
//                 de card (best-effort descendant-frame met naam 'Visual'/
//                 'Image' of een bestaande IMAGE-fill).
//
// Tekstupdates volgen hetzelfde patroon als editors/general/title-
// description.ts (FIG-FONT-01 met mixed-font-fallback).
// Visual-update volgt editors/general/image.ts (figma.createImage +
// node.fills replace) maar zoekt het image-slot descendant binnen de
// card i.p.v. de slide-level ImageWrap.
//
// FIG-GUARD-01: type-checks vóór property-access; silent skip wanneer
// de card of target-nodes ontbreken.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

// T31.2: findCardWrap no longer needed — applyCard/applyCardVisual use slide.findOne(id).
import {
  normalizeIconKey,
  LUCIDE_SLUG_RE,
  trySwapViaInstanceProperty,
  swapComponentByName,
} from '../_shared/icon-swap';
import { replaceIconViaSlot } from '../_shared/icon-slot';
import { setTextCharactersSafe } from '../_shared/fonts';

/** Payload-shape voor `update-card` (text-velden) + `upload-image`
 *  (visualBytes wanneer CardItemEditor een file selecteert).
 *  `visualBytes` is optioneel en wordt door de `upload-image`-route
 *  naar `applyCardVisual` geleid (zie code.ts).
 *  `icon` is de Lucide-naam (voor diff-checks + node-naming);
 *  `iconSvg` is het volledige SVG-document dat de iframe meelevert
 *  zodat de sandbox direct kan renderen via figma.createNodeFromSvg —
 *  geen INSTANCE_SWAP / library-import meer nodig. */
export interface CardPayload {
  cardNodeId: string;
  heading?: string;
  paragraph?: string;
  icon?: string;
  iconSvg?: string;
  visualBytes?: Uint8Array;
  /** Card `Style` VARIANT property — `Default` (filled) of `Outline`. */
  style?: 'Default' | 'Outline';
}

// ============================================================
// Card icon helpers — mirror van badge.ts applyIconSwap
// ============================================================

/**
 * Zoekt het icon-INSTANCE-kind dat nested in de card zit via:
 *   card → icon_wrapper (FRAME) → eerste INSTANCE-kind
 *
 * Fallback: eerste INSTANCE-descendant wier naam een Lucide-slug is.
 * Mirror van badge.ts:findNestedIconInstance (FIG-GUARD-01, FIG-TRAVERSE-01).
 */
function findNestedIconInstance(card: InstanceNode): InstanceNode | null {
  // Primair pad: directe child met name 'icon_wrapper'
  if ('findChild' in card) {
    const wrapper = card.findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (child.type === 'INSTANCE') return child as InstanceNode;
      }
    }
  }

  // Fallback: eerste INSTANCE-descendant wier naam een Lucide-slug is
  if ('findOne' in card) {
    const found = card.findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') return found as InstanceNode;
  }

  return null;
}

// Card-icon-swap loopt via de shared `replaceIconViaSlot` helper in
// `editors/_shared/icon-slot.ts` — zie daar voor de algoritme-beschrijving.

/**
 * Best-effort icon-swap voor een card. Probeert in volgorde:
 *   1. INSTANCE_SWAP-property op card-level (primary).
 *   2. INSTANCE_SWAP-property op de nested icon-child (fallback).
 *   3. swapComponentByName op de nested icon-child (last resort).
 *
 * Retourneert true als een van de strategieën slaagde.
 */
async function applyCardIconSwap(card: InstanceNode, iconName: string): Promise<boolean> {
  // --- Strategy 1: INSTANCE_SWAP property op card zelf ---
  console.log('[card-icon] strategy 1: trySwapViaInstanceProperty on card "' + card.name + '"');
  if (await trySwapViaInstanceProperty(card, iconName)) {
    console.log('[card-icon] strategy 1 hit for "' + iconName + '"');
    return true;
  }
  console.log('[card-icon] strategy 1 miss for "' + iconName + '"');

  // --- Strategy 2: INSTANCE_SWAP property op nested icon-child ---
  const nestedIcon = findNestedIconInstance(card);
  if (nestedIcon !== null) {
    console.log(
      '[card-icon] strategy 2: trySwapViaInstanceProperty on nested "' + nestedIcon.name + '"',
    );
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) {
      console.log('[card-icon] strategy 2 hit for "' + iconName + '"');
      return true;
    }
    console.log('[card-icon] strategy 2 miss for "' + iconName + '"');

    // --- Strategy 3: swapComponentByName op nested icon ---
    console.log('[card-icon] strategy 3: swapComponentByName on nested "' + nestedIcon.name + '"');
    if (await swapComponentByName(nestedIcon, iconName)) {
      console.log('[card-icon] strategy 3 hit for "' + iconName + '"');
      return true;
    }
    console.log('[card-icon] strategy 3 miss for "' + iconName + '"');
  } else {
    console.log('[card-icon] no nested icon instance found in card "' + card.name + '"');
  }

  console.log(
    '[card-icon] all strategies failed for "' + iconName + '" on card "' + card.name + '"',
  );
  return false;
}

/**
 * Zoekt de eerste descendant-text-node met de opgegeven naam binnen
 * `scope` en retourneert het als TextNode of null. Bounded — blijft
 * binnen de card-subtree.
 */
function findTextByName(scope: SceneNode, name: string): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found;
}

/**
 * Heuristiek voor het vinden van het image-slot binnen een card.
 *   1. Descendant met name 'Visual' of 'Image' (exact match).
 *   2. Descendant met een bestaande IMAGE-fill (Slide Machine gebruikt
 *      placeholder-IMAGE-fills op het slot).
 * Retourneert null wanneer geen slot gevonden wordt.
 */
function findImageSlot(card: SceneNode): SceneNode | null {
  if (!('findOne' in card)) return null;

  // Strategie 1: naam-gebaseerd.
  const byName = card.findOne((n: SceneNode) => {
    if (n.name !== 'Visual' && n.name !== 'Image') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

  // Strategie 2: bestaande IMAGE-fill.
  const byFill = card.findOne((n: SceneNode) => {
    if (!('fills' in n)) return false;
    const fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed) return false;
    if (!Array.isArray(fills)) return false;
    for (const f of fills) {
      if (f.type === 'IMAGE') return true;
    }
    return false;
  });
  return byFill;
}

/**
 * Vervangt de fill van het image-slot binnen een card met de geüploade
 * afbeelding. Best-effort — faalt stil wanneer geen slot gevonden wordt.
 * Retourneert de nieuwe ImagePaint-hash bij succes, of null bij skip.
 *
 * T31.2: zoekt Card via slide.findOne(id) zodat Cards binnen TimelineWrap
 * (genest in tussenliggende Frames) ook bereikbaar zijn — wrapper-agnostisch.
 */
export async function applyCardVisual(
  slide: InstanceNode,
  cardNodeId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  // T31.2: slide-scoped findOne op node-id — vindt Cards in CardWrap én TimelineWrap.
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === cardNodeId;
  });
  const card: SceneNode | null = cardNode !== null ? cardNode : null;
  if (card === null) return null;
  const slot = findImageSlot(card);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  const image = figma.createImage(bytes);
  const hash = image.hash;
  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: hash,
    scaleMode: 'FILL',
  };
  (slot as GeometryMixin).fills = [paint];
  return hash;
}

/**
 * Past een CardPayload toe op de aangewezen card.
 * Resolveert zonder error wanneer de target-card ontbreekt (silent skip, FIG-GUARD-01).
 *
 * T31.2: zoekt Card via slide.findOne(id) zodat Cards binnen TimelineWrap
 * (genest in tussenliggende Frames) ook muteerbaar zijn — wrapper-agnostisch.
 */
export async function applyCard(slide: InstanceNode, payload: CardPayload): Promise<void> {
  // T31.2: slide-scoped findOne op node-id — vindt Cards in CardWrap én TimelineWrap.
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === payload.cardNodeId;
  });
  const card: SceneNode | null = cardNode !== null ? cardNode : null;
  if (card === null) return;

  // Per-field no-op-skip: the iframe emits the FULL CardItem on every
  // typing-debounce fire (heading + paragraph + icon + style), even if
  // only one field changed. Without these checks every keystroke re-runs
  // the heavy icon swap (getMainComponentAsync + cache lookup +
  // importComponentByKeyAsync + setProperties) AND a Style setProperties
  // — adding 30-100ms of wasted sandbox work per keystroke that the user
  // perceives as typing lag. Reading current state is cheap; skipping
  // the writes when state already matches is the win.

  if (typeof payload.heading === 'string') {
    const headingNode = findTextByName(card, 'Heading');
    if (headingNode !== null && headingNode.characters !== payload.heading) {
      await setTextCharactersSafe(headingNode, payload.heading);
    }
  }

  if (typeof payload.paragraph === 'string') {
    const paragraphNode = findTextByName(card, 'Paragraph');
    if (paragraphNode !== null && paragraphNode.characters !== payload.paragraph) {
      await setTextCharactersSafe(paragraphNode, payload.paragraph);
    }
  }

  // Style first — when both `style` and `icon` arrive together (e.g. the
  // user toggled Outline and the iframe re-sent the icon so we can refresh
  // the slot's stroke paint), the variant must already be active when the
  // icon swap runs so the captured paint comes from the NEW variant's
  // bound stroke variable, not the old one.
  let styleJustChanged = false;
  if (payload.style !== undefined && card.type === 'INSTANCE') {
    const cardInst = card as InstanceNode;
    const props = cardInst.componentProperties;
    const currentStyle = props && props['Style'] ? props['Style'].value : undefined;
    if (currentStyle !== payload.style) {
      try {
        cardInst.setProperties({ Style: payload.style });
        styleJustChanged = true;
        console.log('[card] style → ' + payload.style);
      } catch (e) {
        console.log('[card] setProperties Style failed: ' + String(e));
      }
    }
  }

  if (typeof payload.icon === 'string' && payload.icon.length > 0) {
    console.log(
      '[card] icon update for "' + payload.icon + '", iconSvg ' +
        (typeof payload.iconSvg === 'string' ? 'present (' + String(payload.iconSvg.length) + ' chars)' : 'MISSING'),
    );
    if (card.type === 'INSTANCE') {
      const cardInst = card as InstanceNode;
      // Cheap pre-check: peek at the nested icon's component name and
      // compare normalized to the desired icon. Skips the entire
      // icon-replacement round-trip on the common no-op path — unless
      // the Style variant just changed, in which case the slot content
      // needs to be re-rendered to pick up the new variant's stroke
      // paint binding.
      const currentIconInstance = findNestedIconInstance(cardInst);
      const currentIconKey =
        currentIconInstance !== null ? normalizeIconKey(currentIconInstance.name) : '';
      const desiredIconKey = normalizeIconKey(payload.icon);
      console.log('[card] currentIconKey="' + currentIconKey + '" desiredIconKey="' + desiredIconKey + '"');
      if (currentIconKey !== desiredIconKey || styleJustChanged) {
        // Preferred path: iframe shipped the SVG body — we render it
        // directly via createNodeFromSvg. No library import, no INSTANCE_SWAP.
        let handled = false;
        if (typeof payload.iconSvg === 'string' && payload.iconSvg.length > 0) {
          handled = replaceIconViaSlot(
            cardInst,
            payload.icon,
            payload.iconSvg,
            styleJustChanged,
          );
        }
        // Fallback to the legacy INSTANCE_SWAP path (kept for safety while
        // the new path is being smoke-tested; can be removed once the SVG
        // route is verified across all Card variants).
        if (!handled) {
          console.log('[card] SVG path failed/skipped, falling back to legacy swap');
          await applyCardIconSwap(cardInst, payload.icon);
        }
      }
    }
  }

  if (payload.visualBytes !== undefined) {
    await applyCardVisual(slide, payload.cardNodeId, payload.visualBytes);
  }
}
