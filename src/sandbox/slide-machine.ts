// Selectors are pure and synchronous by contract: no mutations, no async,
// no figma.ui interaction.

import type { SlideSummary } from '../shared/types';
import type { SurfaceSignature } from '../shared/constants';
import { SURFACE_SIGNATURES } from '../shared/constants';

export function isSlide(node: SceneNode): node is InstanceNode {
  return matchSurfaceSignature(node) !== null;
}

/**
 * Strict width/height equality is deliberate: Figma reports subpixel floats
 * for scaled instances, so exact-size matching filters out scaled copies.
 */
export function matchSurfaceSignature(node: SceneNode): SurfaceSignature | null {
  if (node.type !== 'INSTANCE') return null;
  for (let i = 0; i < SURFACE_SIGNATURES.length; i++) {
    const sig = SURFACE_SIGNATURES[i];
    if (node.name === sig.name && node.width === sig.width && node.height === sig.height) {
      return sig;
    }
  }
  return null;
}

export function findEnclosingSurfaceName(node: BaseNode): string | null {
  const surface = findEnclosingSurface(node);
  return surface !== null ? surface.name : null;
}

export function findEnclosingSurface(node: BaseNode): InstanceNode | null {
  let cur: BaseNode | null = node;
  for (let i = 0; i < 20; i++) {
    if (cur === null) return null;
    if (cur.type === 'INSTANCE' && matchSurfaceSignature(cur as InstanceNode) !== null) {
      return cur as InstanceNode;
    }
    cur = 'parent' in cur ? (cur as SceneNode).parent : null;
  }
  return null;
}

/**
 * In the Slides editor, Slide instances are nested inside SlideNode containers
 * (top-level only in Figma Design) — hence the deep search. findAllWithCriteria
 * narrows to INSTANCE first to avoid predicate work on large decks.
 */
export function findSlidesOnPage(page?: PageNode): InstanceNode[] {
  const target = page !== undefined ? page : figma.currentPage;
  try {
    const instances = target.findAllWithCriteria({ types: ['INSTANCE'] });
    const slides: InstanceNode[] = [];
    for (let i = 0; i < instances.length; i++) {
      if (isSlide(instances[i])) {
        slides.push(instances[i] as InstanceNode);
      }
    }
    return slides;
  } catch (_e) {
    const found = target.findAll(isSlide);
    return found as InstanceNode[];
  }
}

/**
 * isSkipped is null without a SlideNode parent (Figma Design): skip is a
 * Slides-editor-only concept, and the UI hides the toggle on null.
 */
export function slideSummary(slide: InstanceNode, number: number): SlideSummary {
  const title = findSlideHeadingText(slide);
  var isSkipped: boolean | null = null;
  var parent: BaseNode | null = slide.parent;
  if (parent !== null && parent.type === 'SLIDE') {
    isSkipped = (parent as SlideNode).isSkippedSlide;
  }
  return {
    id: slide.id,
    number: number,
    name: title !== null && title.length > 0 ? title : 'Slide ' + String(number),
    isSkipped: isSkipped,
  };
}

/**
 * Scoped to CopyWrap on purpose: a slide holds multiple 'Heading' text nodes
 * (in Cards and hidden badge variants), and an unscoped findOne can pick one
 * of those, yielding a wrong or doubled slide title.
 */
function findSlideHeadingText(slide: InstanceNode): string | null {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return null;
  const headingNode = copyWrap.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === 'Heading';
  });
  if (headingNode === null) return null;
  if (headingNode.type !== 'TEXT') return null;
  const chars = headingNode.characters;
  if (chars.length === 0) return null;
  return chars;
}

function findFirstInstance(
  slide: InstanceNode,
  predicate: (n: InstanceNode) => boolean,
): InstanceNode | null {
  const found = slide.findOne((n: SceneNode) => {
    // Dynamic-pages can serve stale instance sublayers during an interleaved
    // rebuild (chart clones); property access then throws "node does not exist".
    try {
      if (n.type !== 'INSTANCE') return false;
      return predicate(n as InstanceNode);
    } catch (_e) {
      return false;
    }
  });
  if (found === null) return null;
  if (found.type !== 'INSTANCE') return null;
  return found;
}

export function findCopyWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => n.name === 'CopyWrap');
}

export function isEffectivelyVisible(node: SceneNode, slide: InstanceNode): boolean {
  let current: BaseNode | null = node;
  for (let i = 0; i < 10; i++) {
    if (current === null) return true;
    if ('visible' in current) {
      if ((current as SceneNode).visible === false) return false;
    }
    if (current.id === slide.id) return true;
    const parent: BaseNode | null = 'parent' in current ? (current as SceneNode).parent : null;
    if (parent === null) return true;
    current = parent;
  }
  return true;
}

/**
 * Two hide paths must both be checked: visible=false somewhere up the parent
 * chain (legacy CopyWraps), and CopyWrap's `showBadge` component property —
 * the variant render can hide the badge while the Badge node itself keeps
 * visible=true. showBadge is designer-owned; the plugin only reads it.
 */
export function findBadge(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    if (n.name.indexOf('Badge') !== 0) return false;
    if (!isEffectivelyVisible(n, slide)) return false;
    const copyWrap = findEnclosingInstanceByName(n, 'CopyWrap', slide);
    if (copyWrap !== null && readBooleanProperty(copyWrap, 'showBadge') === false) {
      return false;
    }
    return true;
  });
}

/**
 * Exact name on purpose — a prefix match would also catch 'ConfidentalBadgeWrap'.
 * 'ConfidentialBadge' (correct spelling) is a fallback for a future master rename.
 * No visibility gate: the instance exists even while its wrap is hidden, so the
 * variant stays readable and settable regardless of show-state.
 */
export function findConfidentalBadge(slide: InstanceNode): InstanceNode | null {
  const exact = findFirstInstance(slide, (n) => n.name === 'ConfidentalBadge');
  if (exact !== null) return exact;
  return findFirstInstance(slide, (n) => n.name === 'ConfidentialBadge');
}

/**
 * Slide-level ImageWrap only: ImageWraps inside a Card/CardWrap belong to that
 * card, and returning one here would surface the same image twice in the UI.
 */
export function findImageWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    if (n.name !== 'ImageWrap') return false;
    let cur: BaseNode | null = n.parent;
    while (cur !== null && cur !== slide) {
      if (cur.type === 'INSTANCE' && (cur.name === 'Card' || cur.name === 'CardWrap')) {
        return false;
      }
      cur = cur.parent;
    }
    return true;
  });
}

export function findCardWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => n.name === 'CardWrap');
}

export function findAllCardWraps(slide: InstanceNode): InstanceNode[] {
  return findAllInstances(slide, (n) => n.name === 'CardWrap');
}

/**
 * Slide Machine names on-slide instances after their variant properties:
 * 'Tabel='/'Table=', or 'Property 1=' when that is the component's only
 * property — hence the prefix matching in isTableWrapName. Names containing
 * 'Timeline' or 'Chart' are excluded; those belong to the other finders.
 */
export function findTableWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, isTableWrapName);
}

export function findChartWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, isChartWrapName);
}

export function findAllTableWraps(slide: InstanceNode): InstanceNode[] {
  return findAllInstances(slide, isTableWrapName);
}

export function findAllChartWraps(slide: InstanceNode): InstanceNode[] {
  return findAllInstances(slide, isChartWrapName);
}

export function findSlotInWrap(wrap: InstanceNode): SlotNode | null {
  const slot = wrap.findOne((n: SceneNode) => n.type === 'SLOT');
  if (slot === null) return null;
  if (slot.type !== 'SLOT') return null;
  return slot as SlotNode;
}

function isTableWrapName(n: InstanceNode): boolean {
  if (n.name === 'TableWrap') return true;
  if (n.name.indexOf('Tabel=') === 0 && n.name.indexOf('Timeline') < 0) return true;
  if (n.name.indexOf('Table=') === 0 && n.name.indexOf('Timeline') < 0) return true;
  if (
    n.name.indexOf('Property 1=') === 0 &&
    n.name.indexOf('Timeline') < 0 &&
    n.name.indexOf('Chart') < 0
  ) {
    return true;
  }
  return false;
}

function isChartWrapName(n: InstanceNode): boolean {
  if (n.name === 'ChartWrap') return true;
  if (n.name.indexOf('Chart=') === 0 && n.name.indexOf('Timeline') < 0) return true;
  if (
    n.name.indexOf('Property 1=') === 0 &&
    n.name.indexOf('Chart') >= 0 &&
    n.name.indexOf('Timeline') < 0
  ) {
    return true;
  }
  return false;
}

function findAllInstances(
  slide: InstanceNode,
  predicate: (n: InstanceNode) => boolean,
): InstanceNode[] {
  const out: InstanceNode[] = [];
  try {
    const found = slide.findAll((n: SceneNode) => {
      // Same stale-node guard as in findFirstInstance.
      try {
        if (n.type !== 'INSTANCE') return false;
        return predicate(n as InstanceNode);
      } catch (_e) {
        return false;
      }
    });
    for (let i = 0; i < found.length; i++) {
      if (found[i].type === 'INSTANCE') out.push(found[i] as InstanceNode);
    }
  } catch (e) {
    console.log('[welder-slide-editor] findAllInstances failed: ' + String(e));
  }
  return out;
}

/**
 * Any instance with 'Timeline' in its name matches — specific enough within
 * the Slide Machine library that false positives are unlikely.
 */
export function findTimelineWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    return n.name === 'TimelineWrap' || n.name.indexOf('Timeline') >= 0;
  });
}

/**
 * Component-property keys carry a hash suffix ('Style#1234:0' rather than
 * 'Style'), and setProperties expects those same hashed keys — so logical
 * names must be resolved to the full key. Null when the property is absent
 * (detached instance, legacy master, unknown name).
 */
export function getPropertyKey(instance: InstanceNode, logicalName: string): string | null {
  const props = instance.componentProperties;
  if (props === null || props === undefined) return null;
  // Some properties carry no hash suffix — check the plain name first.
  if (Object.prototype.hasOwnProperty.call(props, logicalName)) {
    return logicalName;
  }
  const prefix = logicalName + '#';
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.indexOf(prefix) === 0) return key;
  }
  return null;
}
export function setInstanceProperty(
  instance: InstanceNode,
  logicalName: string,
  value: string | boolean,
): boolean {
  const key = getPropertyKey(instance, logicalName);
  if (key === null) return false;
  const patch: { [k: string]: string | boolean } = {};
  patch[key] = value;
  instance.setProperties(patch);
  return true;
}

export function readBooleanProperty(
  instance: InstanceNode,
  logicalName: string,
): boolean | null {
  const key = getPropertyKey(instance, logicalName);
  if (key === null) return null;
  const props = instance.componentProperties;
  if (props === null || props === undefined) return null;
  const entry = props[key];
  if (entry === undefined || entry === null) return null;
  if (typeof entry.value !== 'boolean') return null;
  return entry.value;
}

export function findEnclosingInstanceByName(
  node: BaseNode,
  name: string,
  slide: InstanceNode,
): InstanceNode | null {
  let cur: BaseNode | null = 'parent' in node ? (node as SceneNode).parent : null;
  for (let i = 0; i < 10; i++) {
    if (cur === null) return null;
    if (cur.id === slide.id) return null;
    if (cur.type === 'INSTANCE' && (cur as InstanceNode).name === name) {
      return cur as InstanceNode;
    }
    cur = 'parent' in cur ? (cur as SceneNode).parent : null;
  }
  return null;
}
