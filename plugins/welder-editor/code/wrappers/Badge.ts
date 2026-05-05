// wrappers/Badge.ts — Badge detector, extractor, and applier (1.11)
//
// Finds the Badge INSTANCE within a slide and extracts the BadgeSection model.
//
// Detection: name starts with 'Badge' AND effectively visible
// (CopyWrap "Show Badge" toggle hides the instance or an ancestor).
//
// Icon-swap strategy (three cascading attempts):
//   1. INSTANCE_SWAP TEXT property on badge-level (component property).
//   2. INSTANCE_SWAP property on nested icon_wrapper child.
//   3. swapComponentByName on the nested icon instance (last resort).
//
// Wave 1 wrapper usage:
//   - setTextCharactersSafe (fonts.ts) for label mutation.
//   - swapInstanceComponent (mutate.ts) is NOT used directly here;
//     icon-swap uses the preferredValues pattern (trySwapViaInstanceProperty).
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
// No ChartWrap — ADR-0007.
//
// Owner: figma-api-engineer

import type { BadgeSection } from '@shared/messages';
import { findBadge, isEffectivelyVisible } from '../slide-machine';
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

/** Finds the visible Badge INSTANCE within a slide. */
export function findBadgeWrapper(slide: InstanceNode): InstanceNode | null {
  return findBadge(slide);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the BadgeSection model from a badge instance.
 * Reads: label text (name 'Label'), icon slug (from icon_wrapper child).
 */
export function extractBadge(badge: InstanceNode): BadgeSection {
  return {
    badgeNodeId: badge.id,
    label: readTextByName(badge, 'Label') ?? badge.name,
    icon: readBadgeIcon(badge),
  };
}

/**
 * Reads the icon slug from the Badge's icon_wrapper child.
 * Structure: badge → icon_wrapper (FRAME) → first INSTANCE child → .name
 * Falls back to '' when no icon child is found.
 */
function readBadgeIcon(badge: InstanceNode): string {
  if (!('findChild' in badge)) return '';
  const wrapper = badge.findChild(function (n: SceneNode) {
    return n.name === 'icon_wrapper';
  });
  if (wrapper === null || !('children' in wrapper)) return '';
  const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
  for (let i = 0; i < wrapperNode.children.length; i++) {
    const child = wrapperNode.children[i]!;
    if (child.type === 'INSTANCE') {
      return normalizeIconKey(child.name);
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Mutation (apply-badge handler)
// ---------------------------------------------------------------------------

/**
 * Applies a badge label and/or icon to the badge INSTANCE within slide.
 *
 * Label: tries TEXT component property first (most reliable for library
 * components), falls back to direct text node mutation.
 *
 * Icon: three-strategy cascade — INSTANCE_SWAP on badge, INSTANCE_SWAP on
 * nested icon child, swapComponentByName on nested icon child.
 *
 * Returns the badgeNodeId on success, null if no badge on slide.
 */
export async function applyBadge(
  slide: InstanceNode,
  label?: string,
  icon?: string,
): Promise<{ badgeNodeId: string } | null> {
  const badge = findBadge(slide);
  if (badge === null) return null;

  if (typeof label === 'string') {
    await applyBadgeLabel(badge, label);
  }

  if (typeof icon === 'string' && icon.length > 0) {
    await applyBadgeIcon(badge, icon);
  }

  return { badgeNodeId: badge.id };
}

async function applyBadgeLabel(badge: InstanceNode, label: string): Promise<void> {
  // Primary: TEXT component property (most reliable for library components).
  const badgeProps = badge.componentProperties;
  if (badgeProps !== null && badgeProps !== undefined) {
    const propKeys = Object.keys(badgeProps);
    for (let pi = 0; pi < propKeys.length; pi++) {
      const propKey = propKeys[pi]!;
      const prop = badgeProps[propKey]!;
      if (prop.type === 'TEXT') {
        const patch: Record<string, string> = {};
        patch[propKey] = label;
        try {
          badge.setProperties(patch);
          return;
        } catch (_e) {
          // continue to fallback
        }
      }
    }
  }

  // Fallback: direct text node mutation.
  const labelNode = readTextNodeByName(badge, 'Label') ?? readFirstTextNode(badge);
  if (labelNode !== null) {
    await setTextCharactersSafe(labelNode, label);
  }
}

async function applyBadgeIcon(badge: InstanceNode, iconName: string): Promise<boolean> {
  // Strategy 1: INSTANCE_SWAP property on badge itself.
  if (await trySwapViaInstanceProperty(badge, iconName)) return true;

  // Strategy 2: INSTANCE_SWAP property on nested icon child.
  const nestedIcon = findNestedIconInstance(badge);
  if (nestedIcon !== null) {
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) return true;

    // Strategy 3: swapComponentByName on nested icon (last resort).
    if (await swapComponentByName(nestedIcon, iconName)) return true;
  }

  // Strategy 4: icon-font text node (very legacy).
  const iconTextNode = readTextNodeByName(badge, 'Icon');
  if (iconTextNode !== null) {
    await setTextCharactersSafe(iconTextNode, iconName);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Nested icon helper
// ---------------------------------------------------------------------------

function findNestedIconInstance(badge: InstanceNode): InstanceNode | null {
  // Primary: icon_wrapper → first INSTANCE child.
  if ('findChild' in badge) {
    const wrapper = badge.findChild(function (n: SceneNode) {
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

  // Fallback: first INSTANCE descendant with a Lucide slug name.
  if ('findOne' in badge) {
    const found = badge.findOne(function (n: SceneNode) {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') return found as InstanceNode;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function readTextByName(scope: InstanceNode, name: string): string | null {
  const node = readTextNodeByName(scope, name);
  return node !== null ? node.characters : null;
}

function readTextNodeByName(scope: InstanceNode, name: string): TextNode | null {
  const found = scope.findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null || found.type !== 'TEXT') return null;
  return found as TextNode;
}

function readFirstTextNode(scope: InstanceNode): TextNode | null {
  const found = scope.findOne(function (n: SceneNode) {
    return n.type === 'TEXT';
  });
  if (found === null || found.type !== 'TEXT') return null;
  return found as TextNode;
}

// Re-export for use in Badge visibility checks from slide scanner.
export { isEffectivelyVisible };
