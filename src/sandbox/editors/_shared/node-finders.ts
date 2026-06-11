// ============================================================
// editors/_shared/node-finders.ts
//
// Gedeelde node-zoek-helpers voor de editors. Eén implementatie voor
// patronen die voorheen per editor gekopieerd waren (badge/card/
// title-description/image) en daardoor uit elkaar dreven.
//
// FIG-GUARD-01: type-checks vóór property-access.
// FIG-TRAVERSE-01: traversal bounded via findChild / findOne.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { normalizeIconKey, LUCIDE_SLUG_RE } from './icon-swap';

/**
 * Zoekt het eerste descendant-text-node met de opgegeven naam binnen
 * `scope` en retourneert het als TextNode of null. Bounded — blijft
 * binnen de scope-subtree.
 */
export function findTextByName(scope: SceneNode, name: string): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found;
}

/**
 * Zoekt de geneste icon-INSTANCE binnen een host-instance (Badge/Card).
 * Primair pad: directe child met name 'icon_wrapper', daarbinnen de
 * eerste INSTANCE. Fallback: eerste INSTANCE-descendant wier naam een
 * Lucide-slug is.
 */
export function findNestedIconInstance(host: InstanceNode): InstanceNode | null {
  // Primair pad: directe child met name 'icon_wrapper'
  if ('findChild' in host) {
    const wrapper = host.findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (child.type === 'INSTANCE') return child as InstanceNode;
      }
    }
  }

  // Fallback: eerste INSTANCE-descendant wier naam een Lucide-slug is
  if ('findOne' in host) {
    const found = host.findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') return found as InstanceNode;
  }

  return null;
}

/**
 * Zoekt het image-slot (fill-dragende node) binnen `scope`.
 * Strategie 1: descendant met name 'Image', 'Visual' of 'ImageSlot'
 *              met fills-property.
 * Strategie 2: descendant met een bestaande IMAGE-fill (Slide Machine
 *              gebruikt placeholder-IMAGE-fills op het slot).
 * Strategie 3 (alleen met `fallbackToSelf`): de scope zelf — juist voor
 *              slide-level ImageWraps die zelf de fill dragen, fout voor
 *              cards (een card als geheel is nooit het image-slot).
 */
export function findImageSlot(scope: SceneNode, fallbackToSelf: boolean): SceneNode | null {
  if (!('findOne' in scope)) return fallbackToSelf ? scope : null;

  // Strategie 1: naam-gebaseerd
  const byName = scope.findOne((n: SceneNode) => {
    if (n.name !== 'Image' && n.name !== 'Visual' && n.name !== 'ImageSlot') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

  // Strategie 2: bestaande IMAGE-fill
  const byFill = scope.findOne((n: SceneNode) => {
    if (!('fills' in n)) return false;
    const fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed) return false;
    if (!Array.isArray(fills)) return false;
    for (let i = 0; i < fills.length; i++) {
      if (fills[i].type === 'IMAGE') return true;
    }
    return false;
  });
  if (byFill !== null) return byFill;

  // Strategie 3: de scope zelf als laatste redmiddel
  return fallbackToSelf ? scope : null;
}
