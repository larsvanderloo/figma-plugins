// Welder Editor — Slide Machine selectors (1.10)
//
// Port of welder-slide-editor/widget-src/slide-machine.ts, adapted to use
// Wave 1 wrappers and the monorepo shared/messages.ts contract.
//
// Responsibilities:
//   - Slide detection: INSTANCE, name==='Slide', 1920×1080.
//   - findSlidesOnCurrentPage() — current-page scan, sorted by canvas Y then X.
//   - buildSlideSummary(node, number) — SlideSummary from shared/messages.ts.
//   - Dedup signature: hash of slide list so slide-list:result skips emit when
//     nothing changed (200 ms debounce lives in main.ts).
//   - Wrapper finders (CopyWrap / Badge / ImageWrap / CardWrap / TimelineWrap /
//     TableWrap / JourneyWrap) — consumed by wrappers/* extractors.
//   - Component-property helpers: getPropertyKey, setInstanceProperty.
//
// Design constraints:
//   - No mutations, no async calls, no figma.ui interaction.
//   - Traversal bounded to slide/wrapper subtrees (FIG-TRAVERSE-01).
//   - Slide scan uses figma.currentPage.findAll with strict isSlide predicate
//     so both Figma Design (top-level instances) and Figma Slides (SlideNode
//     containers one level deeper) are detected without false-positives.
//   - No ChartWrap detector — ADR-0007 deferred.
//
// Wave 1 wrapper usage:
//   - getNodeByIdSafe, findFirstAncestor from packages/figma-api/src/selection.ts
//
// Owner: figma-api-engineer

import type { SlideSummary } from '@shared/messages';
import { findFirstAncestor, isInstance } from '@figma-plugins/figma-api';

// ---------------------------------------------------------------------------
// Constants (mirroring external widget-src/constants.ts)
// ---------------------------------------------------------------------------

const SLIDE_NODE_NAME = 'Slide';
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

// ---------------------------------------------------------------------------
// Type guard — is this a Welder Slide instance?
// ---------------------------------------------------------------------------

/**
 * Narrows node to a Welder Slide INSTANCE.
 * Match criteria:
 *   - type === 'INSTANCE'
 *   - name === 'Slide' (exact)
 *   - width === 1920, height === 1080 (exact; Slide Machine is always exactly this size)
 *
 * Width/height are compared with strict equality because Slide Machine
 * instances are never scaled — any non-1920×1080 instance with name 'Slide'
 * is a user-created component, not a Welder slide.
 */
export function isSlide(node: SceneNode): node is InstanceNode {
  if (node.type !== 'INSTANCE') return false;
  if (node.name !== SLIDE_NODE_NAME) return false;
  if (node.width !== SLIDE_WIDTH) return false;
  if (node.height !== SLIDE_HEIGHT) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Slide discovery
// ---------------------------------------------------------------------------

/**
 * Scans figma.currentPage for Welder Slide instances.
 *
 * In Figma Design: slides are top-level instances on the page.
 * In Figma Slides: slides are inside SlideNode containers.
 * findAll with the strict isSlide predicate (INSTANCE + exact name + exact
 * dimensions) catches both layouts without false-positives — no wrapper
 * instance inside a slide (CopyWrap, CardWrap, etc.) matches those criteria.
 *
 * Returned array is sorted by canvas position: ascending Y (row order), then
 * ascending X (column order). This gives the natural reading order for
 * presentations (left-to-right rows).
 *
 * @figma-direct: figma.currentPage.findAll — no wrapper covers page-level scan.
 * figma.skipInvisibleInstanceChildren = true set before traversal per ADR-0003 §D.
 */
export function findSlidesOnCurrentPage(): InstanceNode[] {
  // @figma-direct: figma.skipInvisibleInstanceChildren — no wrapper for this toggle.
  figma.skipInvisibleInstanceChildren = true;
  const found = figma.currentPage.findAll(isSlide);
  figma.skipInvisibleInstanceChildren = false;

  const slides = found as InstanceNode[];

  // Sort by canvas Y then X for consistent 1-based numbering.
  slides.sort(function (a, b) {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  return slides;
}

// ---------------------------------------------------------------------------
// SlideSummary builder
// ---------------------------------------------------------------------------

/**
 * Builds a SlideSummary for a single slide instance.
 *
 * Name derivation: scan for the Heading text node inside CopyWrap (bounded
 * to CopyWrap subtree to avoid Card/Badge headings). Falls back to "Slide N".
 *
 * isSkipped: derived from SlideNode parent when running inside Figma Slides
 * editor. Null in Figma Design (no SlideNode parent).
 */
export function buildSlideSummary(slide: InstanceNode, number: number): SlideSummary {
  const name = deriveSlideDisplayName(slide, number);

  let isSkipped: boolean | null = null;
  const parent = slide.parent;
  if (parent !== null && parent !== undefined && parent.type === 'SLIDE') {
    isSkipped = (parent as SlideNode).isSkippedSlide;
  }

  return {
    id: slide.id,
    number: number,
    name: name,
    isSkipped: isSkipped,
  };
}

/**
 * Derives the display name for a slide.
 * Reads the first visible Heading text node inside CopyWrap.
 * Falls back to "Slide N" when CopyWrap or Heading is absent or empty.
 */
function deriveSlideDisplayName(slide: InstanceNode, number: number): string {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return 'Slide ' + String(number);

  const headingNode = copyWrap.findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === 'Heading';
  });
  if (headingNode === null || headingNode.type !== 'TEXT') return 'Slide ' + String(number);

  const chars = (headingNode as TextNode).characters;
  if (chars.length === 0) return 'Slide ' + String(number);
  return chars;
}

// ---------------------------------------------------------------------------
// Dedup signature
// ---------------------------------------------------------------------------

/**
 * Returns a stable string that changes only when the slide list changes.
 * Combines id + number + name + isSkipped so any meaningful mutation
 * (reorder, rename, skip-toggle) produces a different signature.
 *
 * Used in main.ts to debounce slide-list posts: if the signature matches
 * the last-sent value, skip the postMessage.
 */
export function buildSlideListSignature(summaries: SlideSummary[]): string {
  const parts: string[] = [];
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i]!;
    parts.push(s.id + '|' + String(s.number) + '|' + s.name + '|' + String(s.isSkipped));
  }
  return String(summaries.length) + '#' + parts.join(';');
}

// ---------------------------------------------------------------------------
// Visibility helper
// ---------------------------------------------------------------------------

/**
 * Returns true when node and all ancestors up to (and including) slide are
 * visible. Bounded to 10 ancestor hops — slides have ≤ 5 levels of nesting
 * in practice; 10 is a safe over-allocation.
 *
 * Used by findBadge (visible-badge-only) and wrapper extraction helpers.
 */
export function isEffectivelyVisible(node: SceneNode, slide: InstanceNode): boolean {
  let current: BaseNode | null = node;
  for (let i = 0; i < 10; i++) {
    if (current === null) return true;
    if ('visible' in current && (current as SceneNode).visible === false) return false;
    if (current.id === slide.id) return true;
    const parentNode: BaseNode | null | undefined =
      'parent' in current ? (current as SceneNode).parent : null;
    if (parentNode === null || parentNode === undefined) return true;
    current = parentNode;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shared traversal primitive
// ---------------------------------------------------------------------------

/**
 * Finds the first INSTANCE child (direct or descendant) of slide that
 * satisfies predicate. Bounded to slide subtree (FIG-TRAVERSE-01).
 */
function findFirstInstance(
  slide: InstanceNode,
  predicate: (n: InstanceNode) => boolean,
): InstanceNode | null {
  const found = slide.findOne(function (n: SceneNode) {
    if (n.type !== 'INSTANCE') return false;
    return predicate(n as InstanceNode);
  });
  if (found === null) return null;
  if (found.type !== 'INSTANCE') return null;
  return found as InstanceNode;
}

// ---------------------------------------------------------------------------
// Wrapper finders
// ---------------------------------------------------------------------------

/** CopyWrap: INSTANCE with exact name 'CopyWrap'. */
export function findCopyWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'CopyWrap';
  });
}

/**
 * Badge: INSTANCE whose name starts with 'Badge', and which is effectively
 * visible (CopyWrap's "Show Badge" toggle hides the badge instance or one
 * of its ancestors). Invisible badges are excluded so the ui can hide the
 * badge editor section appropriately.
 */
export function findBadge(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    if (n.name.indexOf('Badge') !== 0) return false;
    if (!isEffectivelyVisible(n, slide)) return false;
    return true;
  });
}

/** ImageWrap: INSTANCE with exact name 'ImageWrap'. */
export function findImageWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'ImageWrap';
  });
}

/** CardWrap: INSTANCE with exact name 'CardWrap'. */
export function findCardWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'CardWrap';
  });
}

/**
 * TableWrap: instances that represent a table (NOT timeline).
 * Matches:
 *   - Exact name 'TableWrap' (legacy).
 *   - Variant names starting with 'Tabel=' or 'Table=' without 'Timeline'.
 *   - Variant names starting with 'Property 1=' without 'Timeline' or 'Chart'.
 *
 * No ChartWrap match — ADR-0007.
 */
export function findTableWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
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
  });
}

/**
 * Finds the SlotNode (FRAME matching slot naming convention) within the
 * TableWrap INSTANCE. Returns null when no TableWrap or no Slot found.
 *
 * NOTE: Figma's API does not have a first-class SlotNode type. Slots are
 * FRAME nodes with names matching 'SlotNode', ending in '_slot', ' Slot',
 * or 'Slot'. The Wave 1 isSlot() predicate covers this.
 *
 * @figma-direct: slot.type === 'SLOT' — Figma does expose SlotNode as a
 * distinct type in @figma/plugin-typings even though it's a FRAME at runtime.
 * We check by name per the isSlot convention from packages/figma-api.
 */
export function findTableSlot(slide: InstanceNode): FrameNode | null {
  const tableWrap = findTableWrap(slide);
  if (tableWrap === null) return null;

  const slot = tableWrap.findOne(function (n: SceneNode) {
    if (n.type !== 'FRAME') return false;
    const nm = n.name;
    return nm === 'SlotNode' || nm.endsWith('_slot') || nm.endsWith(' Slot') || nm.endsWith('Slot');
  });
  if (slot === null || slot.type !== 'FRAME') return null;
  return slot as FrameNode;
}

/**
 * TimelineWrap: instances representing a timeline.
 * Matches 'TimelineWrap' (exact) or any name containing 'Timeline'.
 */
export function findTimelineWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'TimelineWrap' || n.name.indexOf('Timeline') >= 0;
  });
}

/** JourneyWrap: INSTANCE with exact name 'JourneyWrap'. */
export function findJourneyWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'JourneyWrap';
  });
}

/**
 * Finds the SlotNode within the JourneyWrap INSTANCE.
 * Same slot-detection strategy as findTableSlot.
 */
export function findJourneySlot(slide: InstanceNode): FrameNode | null {
  const journeyWrap = findJourneyWrap(slide);
  if (journeyWrap === null) return null;

  const slot = journeyWrap.findOne(function (n: SceneNode) {
    if (n.type !== 'FRAME') return false;
    const nm = n.name;
    return nm === 'SlotNode' || nm.endsWith('_slot') || nm.endsWith(' Slot') || nm.endsWith('Slot');
  });
  if (slot === null || slot.type !== 'FRAME') return null;
  return slot as FrameNode;
}

// ---------------------------------------------------------------------------
// Slide ancestor walk (used in main.ts for upload-image routing)
// ---------------------------------------------------------------------------

/**
 * Walks up the parent chain from node until a Welder Slide INSTANCE is found.
 * Bounded to 10 hops. Returns null if no enclosing slide is found.
 *
 * Uses Wave 1 findFirstAncestor + isSlide type guard.
 */
export function findSlideAncestor(node: BaseNode): InstanceNode | null {
  // findFirstAncestor walks parent chain; we need a combined predicate.
  const ancestor = findFirstAncestor(node, function (n): n is InstanceNode {
    return isInstance(n) && isSlide(n as SceneNode);
  });
  return ancestor;
}

// ---------------------------------------------------------------------------
// Component property helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the full hashed component-property key (e.g. 'Style#1234:0') for
 * a logical name (e.g. 'Style'). INSTANCE_SWAP properties in Slide Machine
 * always have a hash suffix.
 *
 * Returns null when the instance has no matching property (detached or legacy).
 */
export function getPropertyKey(instance: InstanceNode, logicalName: string): string | null {
  const props = instance.componentProperties;
  if (props === null || props === undefined) return null;

  // Direct hit (no hash suffix).
  if (Object.prototype.hasOwnProperty.call(props, logicalName)) return logicalName;

  // Prefix search for '#'-suffixed variant.
  const prefix = logicalName + '#';
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] ?? '';
    if (key.indexOf(prefix) === 0) return key;
  }
  return null;
}

/**
 * Sets an instance property by logical name, hiding the hash-suffix detail.
 * Returns true on success, false when the property key does not exist.
 */
export function setInstanceProperty(
  instance: InstanceNode,
  logicalName: string,
  value: string | boolean,
): boolean {
  const key = getPropertyKey(instance, logicalName);
  if (key === null) return false;
  const patch: Record<string, string | boolean> = {};
  patch[key] = value;
  instance.setProperties(patch);
  return true;
}
