// ============================================================
// scan/readers.ts
//
// Gedeelde low-level readers voor de scan-modules: tekst op naam,
// icon-slugs uit Badge/Card, image-hashes uit slots, en Card/CopyWrap
// variant-properties. Read-only — mutaties horen in editors/**.
//
// FIG-GUARD-01: type-checks vóór property-access.
// FIG-TRAVERSE-01: traversal bounded via findChild / findOne.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { isEffectivelyVisible } from '../slide-machine';
import { normalizeIconKey, LUCIDE_SLUG_RE } from '../editors/_shared/icon-swap';
import { findImageSlot } from '../editors/_shared/node-finders';
import { debugLog } from '../../shared/debug';

/**
 * Leest een descendant text-node op naam en geeft zijn characters terug.
 * Bounded scope (findOne binnen de wrapper) en naam-gebaseerd. Text-lookup
 * is read-only zodat we geen font hoeven te laden alvorens `characters` te
 * lezen.
 */
export function readTextByName(scope: SceneNode, name: string): string | null {
  if (!('findOne' in scope)) return null;
  const node = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (node === null) return null;
  if (node.type !== 'TEXT') return null;
  return node.characters;
}

/**
 * Zoekt het eerste zichtbare descendant-TextNode met de gegeven naam binnen
 * de scope en retourneert het TextNode-object zelf (nodig voor
 * `getStyledTextSegments`). Slide Machine variant-componenten bevatten vaak
 * meerdere text-nodes met dezelfde naam (één per variant-branch); we pakken
 * de eerste *zichtbare* match, niet de eerste in de tree.
 */
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

/**
 * Leest de huidige icon-slug uit een Badge-instance.
 * Structuur: Badge → icon_wrapper (FRAME) → eerste INSTANCE-kind → .name
 * Normaliseert de naam via normalizeIconKey (strip 'i-lucide-' etc.).
 * Retourneert '' wanneer de wrapper of icon-kind ontbreekt.
 */
export function readBadgeIcon(badge: InstanceNode): string {
  if (!('findOne' in badge)) return '';

  // Slot-based (new): Badge → icon-slot (SLOT) → first child (INSTANCE or
  // FRAME after SVG-replace). The slot helper sets the child's name to
  // the Lucide slug after insertion, so normalising the name is enough.
  const slot = badge.findOne(function (n: SceneNode) {
    return n.type === 'SLOT' && n.name === 'icon-slot';
  });
  if (slot !== null && slot.type === 'SLOT' && 'children' in slot) {
    const slotNode = slot as SlotNode;
    if (slotNode.children.length > 0) {
      return normalizeIconKey(slotNode.children[0].name);
    }
  }

  // Legacy fallback: Badge → icon_wrapper (FRAME) → first INSTANCE-kind.
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

/**
 * Leest de huidige icon-slug uit een Card-node.
 * Drie strategieën (symmetrisch met applyCardIconSwap in card.ts):
 *
 *   A. Directe INSTANCE-children — eerste child wier naam een Lucide-slug is.
 *   B. icon_wrapper-child → eerste INSTANCE-kind daarin.
 *   C. findOne descendant — eerste INSTANCE-descendant met Lucide-slug-naam.
 *
 * Retourneert null wanneer geen passend kind gevonden wordt of wanneer de
 * gevonden icon-instance niet zichtbaar is (visible === false via ancestor-chain).
 *
 * Signatuur uitgebreid met `slide` zodat isEffectivelyVisible aangeroepen
 * kan worden. Zelfde visibility-pattern als findVisibleTextNodeByName.
 */
export function readCardIcon(card: SceneNode, slide: InstanceNode): string | null {
  // Both INSTANCE (legacy library icon) and FRAME (post-SVG-replace) are
  // valid icon-node shapes. The frame inserted by replaceCardIconWithSvg
  // carries the Lucide name as its node name, so the normalize-check is
  // the only thing the reader needs.
  const isIconNode = function (n: SceneNode): boolean {
    return n.type === 'INSTANCE' || n.type === 'FRAME';
  };

  // Strategy 0: read the ACTIVE icon-slot's first child. Card masters
  // can carry multiple icon-slots (top vs side variant) with the inactive
  // one hidden via ancestor visibility. findOne hits tree-order and lands
  // on the hidden one — by which point isEffectivelyVisible nukes the
  // result and the picker shows a blank preview. Walk all icon-slots and
  // pick the one whose ancestor chain is visible.
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

  // Strategy A: directe INSTANCE/FRAME-children met Lucide-slug-naam
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

  // Strategy B: icon_wrapper → eerste icon-kind (INSTANCE of FRAME)
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

  // Strategy C: findOne descendant — eerste icon-node met Lucide-slug-naam
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

/**
 * Leest de huidige ImagePaint-hash van het image-slot binnen de ImageWrap.
 * Slot-detectie via de shared findImageSlot (editors/_shared/node-finders.ts).
 * Returns null wanneer het slot leeg is of geen IMAGE-fill draagt.
 */
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

/**
 * Best-effort detectie van de image-slot binnen een card.
 * Retourneert de huidige ImagePaint-hash wanneer de slot een IMAGE-fill
 * draagt, null wanneer de slot aanwezig is maar leeg, of undefined
 * wanneer de card geen slot heeft (de UI verbergt dan de upload-knop).
 * Slot-detectie via de shared findImageSlot (editors/_shared/node-finders.ts).
 */
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

/**
 * Reads the `Type` VARIANT property off a Card instance. The Welder
 * library's Card master defines this as a flat 'Type' key (no #N:N
 * suffix) so we look it up by name directly. Returns null when the
 * card has no Type property or it isn't a VARIANT.
 */
export function readCardTypeVariant(card: InstanceNode): string | null {
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const t = props['Type'];
  if (t === undefined || t === null) return null;
  if (t.type !== 'VARIANT') return null;
  return typeof t.value === 'string' ? t.value : null;
}

/**
 * Reads the `Style` VARIANT property off a Card instance. Welder Card
 * masters expose `Default` (filled) and `Outline` (bordered). Returns
 * null when the card has no Style property OR its value isn't one of
 * the two known options — protects the iframe toggle from rendering on
 * card variants that don't actually support outline/fill switching
 * (e.g. CardWrap layouts that flatten cards into inline divs).
 */
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

/**
 * Heading-size source on CopyWrap is the nested `TypHeading` instance's
 * VARIANT property (verified via Figma MCP on Welder Templates v0). Some
 * older library generations may not have a TypHeading wrapper — we fall
 * back to scanning CopyWrap itself for a size-named VARIANT in case the
 * property was lifted up. Both reads (current value) and writes
 * (setProperties) need the same host + key, so the resolver returns both.
 */
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
  // Prefer TypHeading; fall back to CopyWrap-level scan for legacy masters.
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
    // Pass 1: exact "size" (case-insensitive). The Figma plugin API
    // returns variant keys with a `#nodeId:n` suffix in some files; we
    // strip the suffix before comparing.
    for (let k = 0; k < keys.length; k++) {
      const bare = keys[k].split('#')[0].toLowerCase();
      if (bare === 'size' && props[keys[k]].type === 'VARIANT') {
        key = keys[k];
        break;
      }
    }
    // Pass 2: any VARIANT key containing "size" (alnum-stripped).
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
    // H5 is intentionally excluded from the picker — the library exposes
    // it but Welder's editor only ships Display through H4 as user-facing
    // sizes. If a slide is currently on H5 the value passes through (no
    // forced rewrite); the slider just snaps to the nearest allowed
    // option as soon as the user drags it.
    const filteredOptions: string[] = [];
    for (let o = 0; o < def.variantOptions.length; o++) {
      if (def.variantOptions[o].toLowerCase() !== 'h5') {
        filteredOptions.push(def.variantOptions[o]);
      }
    }
    // Reverse so the slider goes small → big left → right (H4 on the
    // left, Display on the right) — matches user expectation that
    // dragging right means a bigger heading. Figma's variantOptions
    // are declared big → small in the library.
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
