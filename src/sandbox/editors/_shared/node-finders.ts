// Single implementation of the badge/card/image lookup patterns that used to be
// copied per editor and drifted apart.

import { normalizeIconKey, LUCIDE_SLUG_RE } from './icon-swap';

export function findTextByName(scope: SceneNode, name: string): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found;
}

export function findNestedIconInstance(host: InstanceNode): InstanceNode | null {
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

  if ('findOne' in host) {
    const found = host.findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') return found as InstanceNode;
  }

  return null;
}

// Matching an existing IMAGE fill works because the Slide Machine leaves placeholder
// IMAGE fills on the slot. `fallbackToSelf` exists for slide-level ImageWraps that
// carry the fill themselves; cards must pass false — a card is never the slot itself.
export function findImageSlot(scope: SceneNode, fallbackToSelf: boolean): SceneNode | null {
  if (!('findOne' in scope)) return fallbackToSelf ? scope : null;

  const byName = scope.findOne((n: SceneNode) => {
    if (n.name !== 'Image' && n.name !== 'Visual' && n.name !== 'ImageSlot') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

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

  return fallbackToSelf ? scope : null;
}
