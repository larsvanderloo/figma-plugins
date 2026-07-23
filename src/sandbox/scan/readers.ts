// Read-only scan readers — mutations belong in editors/**.

import { isEffectivelyVisible } from '../slide-machine';
import { normalizeIconKey, LUCIDE_SLUG_RE } from '../editors/_shared/icon-swap';
import { findImageSlot } from '../editors/_shared/node-finders';
import { debugLog } from '../../shared/debug';

// Reading .characters needs no font load — only writes do.
export function readTextByName(scope: SceneNode, name: string): string | null {
  if (!('findOne' in scope)) return null;
  const node = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (node === null) return null;
  if (node.type !== 'TEXT') return null;
  return node.characters;
}

// Variant masters often carry same-named text nodes (one per branch);
// take the first *visible* match, not the first in tree order.
export function findVisibleTextNodeByName(
  scope: SceneNode,
  name: string,
  slide: InstanceNode,
): TextNode | null {
  if (!('findAll' in scope)) return null;
  const matches = scope.findAll((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  for (const m of matches) {
    if (m.type !== 'TEXT') continue;
    if (!isEffectivelyVisible(m, slide)) continue;
    return m;
  }
  return null;
}

export function readBadgeIcon(badge: InstanceNode): string {
  if (!('findOne' in badge)) return '';

  // Slot-based path: the insert helper names the slot child after its
  // Lucide slug, so normalizing the name is enough.
  const slot = badge.findOne(function (n: SceneNode) {
    return n.type === 'SLOT' && n.name === 'icon-slot';
  });
  if (slot !== null && slot.type === 'SLOT' && 'children' in slot) {
    const slotNode = slot as SlotNode;
    if (slotNode.children.length > 0) {
      return normalizeIconKey(slotNode.children[0].name);
    }
  }

  // Legacy fallback for pre-slot Badge masters.
  if ('findChild' in badge) {
    const wrapper = badge.findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (child.type === 'INSTANCE') {
          return normalizeIconKey(child.name);
        }
      }
    }
  }
  return '';
}

// Strategies mirror applyCardIconSwap in editors/card.ts — keep in sync.
export function readCardIcon(card: SceneNode, slide: InstanceNode): string | null {
  // FRAME counts as an icon too: replaceCardIconWithSvg swaps the library
  // instance for a frame named after its Lucide slug.
  const isIconNode = function (n: SceneNode): boolean {
    return n.type === 'INSTANCE' || n.type === 'FRAME';
  };

  // Strategy 0: Card masters can carry multiple icon-slots (top vs side
  // variant) with the inactive one hidden by an ancestor; findOne walks in
  // tree order and can land on the hidden one, so walk all slots and pick
  // the one whose ancestor chain is visible.
  if ('findAll' in card) {
    const slots = (card as InstanceNode).findAll(function (n: SceneNode) {
      return n.type === 'SLOT' && n.name === 'icon-slot';
    });
    for (let i = 0; i < slots.length; i++) {
      const candidate = slots[i];
      if (candidate.type !== 'SLOT') continue;
      let visible = true;
      let cursor: BaseNode | null = candidate;
      while (cursor !== null && cursor.id !== card.id) {
        if ('visible' in cursor && (cursor as SceneNode).visible === false) {
          visible = false;
          break;
        }
        cursor = cursor.parent;
      }
      if (!visible) continue;
      const slotNode = candidate as SlotNode;
      if (slotNode.children.length > 0) {
        const slug = normalizeIconKey(slotNode.children[0].name);
        if (slug.length > 0) return slug;
      }
    }
  }

  // Strategy A: direct children.
  if ('children' in card) {
    const children = (card as FrameNode | GroupNode | InstanceNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!isIconNode(child)) continue;
      const normalized = normalizeIconKey(child.name);
      if (LUCIDE_SLUG_RE.test(normalized)) {
        return isEffectivelyVisible(child, slide) ? normalized : null;
      }
    }
  }

  // Strategy B: icon_wrapper child.
  if ('findChild' in card) {
    const wrapper = (card as InstanceNode).findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (isIconNode(child)) {
          return isEffectivelyVisible(child, slide) ? normalizeIconKey(child.name) : null;
        }
      }
    }
  }

  // Strategy C: any matching descendant.
  if ('findOne' in card) {
    const found = (card as InstanceNode).findOne((n: SceneNode) => {
      if (!isIconNode(n)) return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && isIconNode(found)) {
      return isEffectivelyVisible(found, slide) ? normalizeIconKey(found.name) : null;
    }
  }

  return null;
}

export function readImageWrapHash(imageWrap: InstanceNode): string | null {
  var slot = findImageSlot(imageWrap, false);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  var fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (var i = 0; i < fills.length; i++) {
    if (fills[i].type === 'IMAGE') {
      return (fills[i] as ImagePaint).imageHash;
    }
  }
  return null;
}

// Tri-state: hash when the slot has an IMAGE fill, null when the slot is
// empty, undefined when the card has no slot (UI hides the upload button).
export function readCardVisualHash(card: SceneNode): string | null | undefined {
  const slot = findImageSlot(card, false);
  if (slot === null) return undefined;
  if (!('fills' in slot)) return undefined;

  const fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (const f of fills) {
    if (f.type === 'IMAGE') {
      return (f as ImagePaint).imageHash;
    }
  }
  return null;
}

// The Card master exposes 'Type' as a flat key (no '#nodeId:n' suffix),
// so a direct name lookup is safe.
export function readCardTypeVariant(card: InstanceNode): string | null {
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const t = props['Type'];
  if (t === undefined || t === null) return null;
  if (t.type !== 'VARIANT') return null;
  return typeof t.value === 'string' ? t.value : null;
}

// Anything but the two known options returns null, so the iframe hides the
// style toggle on card variants that can't actually switch outline/fill.
export function readCardStyleVariant(card: InstanceNode): 'Default' | 'Outline' | null {
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const s = props['Style'];
  if (s === undefined || s === null) return null;
  if (s.type !== 'VARIANT') return null;
  if (s.value === 'Default') return 'Default';
  if (s.value === 'Outline') return 'Outline';
  return null;
}

// Heading size lives on the nested TypHeading VARIANT; legacy masters may
// lift it onto CopyWrap itself. Reads and writes need the same host + key,
// so the resolver returns both.
interface HeadingSizeHost {
  host: InstanceNode;
  key: string;
  value: string;
  options: ReadonlyArray<string>;
}

export async function resolveTypHeadingSizeHost(
  copyWrap: InstanceNode,
): Promise<HeadingSizeHost | null> {
  const candidates: InstanceNode[] = [];
  if ('findOne' in copyWrap) {
    const typHeading = copyWrap.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'TypHeading';
    });
    if (typHeading !== null && typHeading.type === 'INSTANCE') {
      candidates.push(typHeading as InstanceNode);
    }
  }
  candidates.push(copyWrap);

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const props = cand.componentProperties;
    if (props === null || props === undefined) continue;
    const keys = Object.keys(props);
    let key: string | null = null;
    // Variant keys can carry a '#nodeId:n' suffix in some files — strip it
    // before comparing. Exact "size" match first, then any key containing it.
    for (let k = 0; k < keys.length; k++) {
      const bare = keys[k].split('#')[0].toLowerCase();
      if (bare === 'size' && props[keys[k]].type === 'VARIANT') {
        key = keys[k];
        break;
      }
    }
    if (key === null) {
      for (let k = 0; k < keys.length; k++) {
        const stripped = keys[k].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (stripped.indexOf('size') >= 0 && props[keys[k]].type === 'VARIANT') {
          key = keys[k];
          break;
        }
      }
    }
    if (key === null) {
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" props=[' + keys.join(', ') + '] — no size key',
      );
      continue;
    }
    const main = await cand.getMainComponentAsync();
    const parent = main !== null ? main.parent : null;
    if (parent === null || parent.type !== 'COMPONENT_SET') {
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" main parent is ' +
          (parent !== null ? parent.type : 'null') + ', not COMPONENT_SET',
      );
      continue;
    }
    const defs = (parent as ComponentSetNode).componentPropertyDefinitions;
    const def = defs !== null && defs !== undefined ? defs[key] : undefined;
    if (def === undefined || def.type !== 'VARIANT' || !Array.isArray(def.variantOptions)) {
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" def missing variantOptions for key "' +
          key + '"',
      );
      continue;
    }
    // The library exposes H5 but the editor only ships Display–H4. A slide
    // already on H5 keeps its value; the slider snaps once the user drags.
    const filteredOptions: string[] = [];
    for (let o = 0; o < def.variantOptions.length; o++) {
      if (def.variantOptions[o].toLowerCase() !== 'h5') {
        filteredOptions.push(def.variantOptions[o]);
      }
    }
    // The library declares variantOptions big → small; reverse so dragging
    // the slider right means a bigger heading.
    filteredOptions.reverse();
    return {
      host: cand,
      key: key,
      value: String(props[key].value),
      options: filteredOptions,
    };
  }
  return null;
}
