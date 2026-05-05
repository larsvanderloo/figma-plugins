// wrappers/CardWrap.ts — CardWrap detector, extractor, and applier (1.11)
//
// Finds the CardWrap INSTANCE and extracts the list of CardItem models.
// Also handles the apply-card and apply-card-visual mutations.
//
// Detection: name === 'CardWrap' (exact match).
//
// Card discovery: findAll within the CardWrap subtree for INSTANCE nodes
// named 'Card'. Bounded to the wrapper subtree (FIG-TRAVERSE-01).
//
// Icon-swap strategy: three cascading attempts (per badge.ts pattern):
//   1. INSTANCE_SWAP property on card itself.
//   2. INSTANCE_SWAP property on nested icon_wrapper child.
//   3. swapComponentByName on nested icon instance (last resort).
//
// Wave 1 wrapper usage:
//   - setTextCharactersSafe (fonts.ts) for heading/paragraph writes.
//   - No wrapper covers figma.createImage — used directly with comment.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

import type { CardItem, ImageHash } from '@shared/messages';
import { findCardWrap, isEffectivelyVisible } from '../slide-machine';
import { setTextCharactersSafe } from '@figma-plugins/figma-api';
import {
  normalizeIconKey,
  LUCIDE_SLUG_RE,
  trySwapViaInstanceProperty,
  swapComponentByName,
} from '../icon-swap';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Finds the CardWrap INSTANCE within a slide. */
export function findCardWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findCardWrap(slide);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts all CardItem models from the CardWrap on a slide.
 * Returns an empty array when no CardWrap or no Card instances found.
 */
export function extractCardWrap(slide: InstanceNode): CardItem[] {
  const cardWrap = findCardWrap(slide);
  if (cardWrap === null) return [];
  return extractCardsFromScope(cardWrap, slide);
}

/**
 * Extracts Card instances from any wrapper scope (CardWrap or TimelineWrap).
 * Called by both CardWrap and TimelineWrap extractors (polymorphic scan).
 *
 * Corrupt items without a Heading text node are silently skipped.
 */
export function extractCardsFromScope(scope: InstanceNode, slide: InstanceNode): CardItem[] {
  const items: CardItem[] = [];
  if (!('findAll' in scope)) return items;

  const cardInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card';
  });

  for (let i = 0; i < cardInstances.length; i++) {
    const card = cardInstances[i]!;
    const heading = readTextByName(card, 'Heading');
    if (heading === null) continue; // corrupt card: skip

    items.push({
      cardNodeId: card.id,
      heading: heading,
      paragraph: readTextByName(card, 'Paragraph') ?? '',
      icon: readCardIcon(card, slide),
      visualHash: readCardVisualHash(card),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Card icon read
// ---------------------------------------------------------------------------

/**
 * Reads the current icon slug from a card node.
 * Three strategies (mirror of apply icon-swap strategies):
 *   A. Direct INSTANCE children whose name is a Lucide slug.
 *   B. icon_wrapper → first INSTANCE child.
 *   C. findOne descendant — first INSTANCE with a Lucide slug name.
 *
 * Returns null when no icon instance is found or when the found instance
 * is not effectively visible (icon hidden via variant).
 */
export function readCardIcon(card: SceneNode, slide: InstanceNode): string | null {
  // Strategy A: direct INSTANCE children.
  if ('children' in card) {
    const children = (card as FrameNode | GroupNode | InstanceNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.type !== 'INSTANCE') continue;
      const normalized = normalizeIconKey(child.name);
      if (LUCIDE_SLUG_RE.test(normalized)) {
        return isEffectivelyVisible(child, slide) ? normalized : null;
      }
    }
  }

  // Strategy B: icon_wrapper → first INSTANCE child.
  if ('findChild' in card) {
    const wrapper = (card as InstanceNode).findChild(function (n: SceneNode) {
      return n.name === 'icon_wrapper';
    });
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i]!;
        if (child.type === 'INSTANCE') {
          return isEffectivelyVisible(child, slide) ? normalizeIconKey(child.name) : null;
        }
      }
    }
  }

  // Strategy C: findOne descendant with Lucide slug name.
  if ('findOne' in card) {
    const found = (card as InstanceNode).findOne(function (n: SceneNode) {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') {
      return isEffectivelyVisible(found, slide) ? normalizeIconKey(found.name) : null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Card visual hash read
// ---------------------------------------------------------------------------

function readCardVisualHash(card: SceneNode): ImageHash | null | undefined {
  if (!('findOne' in card)) return undefined;

  const byName = (card as InstanceNode).findOne(function (n: SceneNode) {
    if (n.name !== 'Visual' && n.name !== 'Image') return false;
    return 'fills' in n;
  });

  const slot: SceneNode | null =
    byName !== null
      ? byName
      : (card as InstanceNode).findOne(function (n: SceneNode) {
          if (!('fills' in n)) return false;
          const fills = (n as GeometryMixin).fills;
          if (fills === figma.mixed || !Array.isArray(fills)) return false;
          for (let i = 0; i < fills.length; i++) {
            if (fills[i]!.type === 'IMAGE') return true;
          }
          return false;
        });

  if (slot === null) return undefined;
  if (!('fills' in slot)) return undefined;

  const fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return null;
  for (let i = 0; i < fills.length; i++) {
    if (fills[i]!.type === 'IMAGE') {
      const hash = (fills[i]! as ImagePaint).imageHash;
      return hash !== null ? hash : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mutation — apply-card handler
// ---------------------------------------------------------------------------

/**
 * Applies heading, paragraph, and/or icon to a specific Card node within slide.
 * Card is located by node-id via slide.findOne (finds Cards inside TimelineWrap too).
 *
 * Returns { cardNodeId } on success, null when the card is not found.
 */
export async function applyCard(
  slide: InstanceNode,
  cardNodeId: string,
  heading?: string,
  paragraph?: string,
  icon?: string,
): Promise<{ cardNodeId: string } | null> {
  // Slide-scoped findOne — finds cards in CardWrap and TimelineWrap.
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === cardNodeId;
  });
  if (cardNode === null || cardNode.type !== 'INSTANCE') return null;
  const card = cardNode as InstanceNode;

  if (typeof heading === 'string') {
    const headingNode = findTextByNameInScope(card, 'Heading');
    if (headingNode !== null) await setTextCharactersSafe(headingNode, heading);
  }

  if (typeof paragraph === 'string') {
    const paragraphNode = findTextByNameInScope(card, 'Paragraph');
    if (paragraphNode !== null) await setTextCharactersSafe(paragraphNode, paragraph);
  }

  if (typeof icon === 'string' && icon.length > 0) {
    await applyCardIconSwap(card, icon);
  }

  return { cardNodeId };
}

/**
 * Applies uploaded image bytes to the visual slot within a specific Card.
 * Card is located by node-id via slide.findOne.
 *
 * @figma-direct: figma.createImage — no wrapper covers image-paint creation.
 *
 * Returns { cardNodeId, imageHash } on success, null on any failure.
 */
export async function applyCardVisual(
  slide: InstanceNode,
  cardNodeId: string,
  bytes: Uint8Array,
): Promise<{ cardNodeId: string; imageHash: ImageHash } | null> {
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === cardNodeId;
  });
  if (cardNode === null || cardNode.type !== 'INSTANCE') return null;
  const card = cardNode as InstanceNode;

  const slot = findCardImageSlot(card);
  if (slot === null || !('fills' in slot)) return null;

  // @figma-direct: figma.createImage — image-paint creation has no wrapper equivalent.
  const image = figma.createImage(bytes);
  const imageHash = image.hash;
  const paint: ImagePaint = { type: 'IMAGE', imageHash, scaleMode: 'FILL' };
  (slot as GeometryMixin).fills = [paint];

  return { cardNodeId, imageHash };
}

// ---------------------------------------------------------------------------
// Card icon swap
// ---------------------------------------------------------------------------

async function applyCardIconSwap(card: InstanceNode, iconName: string): Promise<boolean> {
  // Strategy 1: INSTANCE_SWAP on card itself.
  if (await trySwapViaInstanceProperty(card, iconName)) return true;

  // Strategy 2 + 3: nested icon instance.
  const nestedIcon = findNestedIconInstance(card);
  if (nestedIcon !== null) {
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) return true;
    if (await swapComponentByName(nestedIcon, iconName)) return true;
  }

  return false;
}

function findNestedIconInstance(card: InstanceNode): InstanceNode | null {
  if ('findChild' in card) {
    const wrapper = card.findChild(function (n: SceneNode) {
      return n.name === 'icon_wrapper';
    });
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i]!;
        if (child.type === 'INSTANCE') return child as InstanceNode;
      }
    }
  }
  if ('findOne' in card) {
    const found = card.findOne(function (n: SceneNode) {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') return found as InstanceNode;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Card image slot
// ---------------------------------------------------------------------------

function findCardImageSlot(card: InstanceNode): SceneNode | null {
  if (!('findOne' in card)) return null;

  const byName = card.findOne(function (n: SceneNode) {
    if (n.name !== 'Visual' && n.name !== 'Image') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

  return card.findOne(function (n: SceneNode) {
    if (!('fills' in n)) return false;
    const fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed || !Array.isArray(fills)) return false;
    for (let i = 0; i < fills.length; i++) {
      if (fills[i]!.type === 'IMAGE') return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function readTextByName(scope: SceneNode, name: string): string | null {
  if (!('findOne' in scope)) return null;
  const found = (scope as InstanceNode).findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null || found.type !== 'TEXT') return null;
  return (found as TextNode).characters;
}

function findTextByNameInScope(scope: InstanceNode, name: string): TextNode | null {
  const found = scope.findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null || found.type !== 'TEXT') return null;
  return found as TextNode;
}
