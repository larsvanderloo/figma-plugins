// ============================================================
// sandbox/slides.ts
//
// Slide-lookup voor de sandbox: per-page cache van Welder-slides
// (canvas-grid of children-walk), 1-based nummering, en de finders
// waarmee handlers en scans van slide-id naar InstanceNode komen.
// De cache wordt geïnvalideerd vanuit code.ts' documentchange/
// currentpagechange-listeners.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findSlidesOnPage, isSlide, slideSummary } from './slide-machine';
import { SlideSummary } from '../shared/types';
import { debugLog } from '../shared/debug';


interface SlidePageCache {
  pageId: string;
  slides: InstanceNode[];
  numberById: { [id: string]: number };
}

interface SlideLookupResult {
  slides: InstanceNode[];
  source: 'canvas-grid' | 'children' | 'fallback';
}

let slidePageCache: SlidePageCache | null = null;

export function invalidateSlidePageCache(reason: string): void {
  if (slidePageCache === null) return;
  debugLog('perf', 'slide-cache-invalidate', {
    reason: reason,
    pageId: slidePageCache.pageId,
    slideCount: slidePageCache.slides.length,
  });
  slidePageCache = null;
}

export function getSlidesOnCurrentPage(): InstanceNode[] {
  if (slidePageCache !== null && slidePageCache.pageId === figma.currentPage.id) {
    return slidePageCache.slides;
  }
  const startedAt = Date.now();
  const lookup = findSlidesOnCurrentPageOptimized();
  const slides = lookup.slides;
  const numberById: { [id: string]: number } = {};
  for (let i = 0; i < slides.length; i++) {
    numberById[slides[i].id] = i + 1;
  }
  slidePageCache = {
    pageId: figma.currentPage.id,
    slides: slides,
    numberById: numberById,
  };
  debugLog('perf', 'slide-cache-build', {
    pageId: figma.currentPage.id,
    slideCount: slides.length,
    source: lookup.source,
    totalMs: Date.now() - startedAt,
  });
  return slides;
}

function findSlidesOnCurrentPageOptimized(): SlideLookupResult {
  const gridSlides = findSlidesFromCanvasGrid();
  if (gridSlides.length > 0) {
    return { slides: gridSlides, source: 'canvas-grid' };
  }

  const childSlides = findSlidesFromPageChildren();
  if (childSlides.length > 0 && (figma.editorType !== 'slides' || childSlides.length > 1)) {
    return { slides: childSlides, source: 'children' };
  }

  return { slides: findSlidesOnPage(), source: 'fallback' };
}

function findSlidesFromCanvasGrid(): InstanceNode[] {
  if (figma.editorType !== 'slides') return [];
  try {
    const grid = figma.getCanvasGrid();
    const slides: InstanceNode[] = [];
    for (let row = 0; row < grid.length; row++) {
      const nodes = grid[row];
      for (let col = 0; col < nodes.length; col++) {
        const slide = findNestedWelderSlide(nodes[col]);
        if (slide !== null) {
          slides.push(slide);
        }
      }
    }
    return slides;
  } catch (_e) {
    return [];
  }
}

function findSlidesFromPageChildren(): InstanceNode[] {
  const children = figma.currentPage.children;
  const slides: InstanceNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const slide = findNestedWelderSlide(children[i]);
    if (slide !== null) {
      slides.push(slide);
    }
  }
  return slides;
}

function findNestedWelderSlide(node: SceneNode): InstanceNode | null {
  if (node.type === 'INSTANCE' && isSlide(node)) {
    return node;
  }
  if ('children' in node) {
    const children = (node as SceneNode & { children: ReadonlyArray<SceneNode> }).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'INSTANCE' && isSlide(child)) {
        return child as InstanceNode;
      }
    }
  }
  if ('findOne' in node) {
    const scope = node as SceneNode & { findOne: SlideNode['findOne'] };
    const found = scope.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && isSlide(n);
    });
    if (found !== null && found.type === 'INSTANCE') {
      return found as InstanceNode;
    }
  }
  return null;
}

function getSlideNumber(slide: InstanceNode): number {
  getSlidesOnCurrentPage();
  if (slidePageCache !== null) {
    const number = slidePageCache.numberById[slide.id];
    if (typeof number === 'number') return number;
  }
  return 1;
}

/**
 * Compute the SlideSummary for a single slide. Used by every slide-loaded
 * / slide-summary emission. `findSlidesOnPage` here is for the 1-based
 * `number` fallback when the slide has no heading text — most slides have
 * a heading, so the number rarely shows in the UI but it keeps the
 * SlideSummary shape consistent with the export-document filename logic.
 */
export function summaryForSlide(slide: InstanceNode): SlideSummary {
  return slideSummary(slide, getSlideNumber(slide));
}

export async function findSlideById(id: string): Promise<InstanceNode | null> {
  const nodes = getSlidesOnCurrentPage();
  for (const node of nodes) {
    if (node.id === id) return node;
  }
  // Fallback: de cache-walk (canvas-grid / page-children) mist slides
  // die dieper genest zijn — bv. binnen een SECTION op een design-pagina
  // zoals Templates. De scan-kant vindt die slides wél (up-walk vanaf de
  // selectie via findSlideAncestor), dus zonder deze fallback kan de UI
  // een slide tonen waarvan elke mutatie op "Slide not found" strandt.
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (node !== null && node.type === 'INSTANCE' && isSlide(node as InstanceNode)) {
      return node as InstanceNode;
    }
  } catch (_e) {
    /* silent — id kan stale zijn na undo/delete */
  }
  return null;
}

/**
 * Loopt vanaf `node` omhoog langs `.parent` tot we een Slide-instance
 * vinden (isSlide-check). Retourneert null wanneer we de pagina-root
 * bereiken zonder hit — dan zit het target niet binnen een Slide.
 * Gebruikt door `upload-image` om vanuit een ImageWrap-id terug te
 * herleiden welke slide hij draagt.
 */
export function findSlideAncestor(node: BaseNode): InstanceNode | null {
  let current: BaseNode | null = node;
  // Bounded: Slide Machine-slides staan op page-level, dus ≤5 parent-hops.
  for (let i = 0; i < 10; i++) {
    if (current === null) return null;
    // Alleen SceneNodes (dus niet page/document) kunnen isSlide-match zijn.
    if ('type' in current && (current as SceneNode).type === 'INSTANCE') {
      const asScene = current as SceneNode;
      if (isSlide(asScene)) return asScene as InstanceNode;
    }
    const parent: BaseNode | null = 'parent' in current ? (current as SceneNode).parent : null;
    if (parent === null || parent === undefined) return null;
    current = parent;
  }
  return null;
}

/**
 * Bepaalt welke Welder-Slide de user momenteel voor ogen heeft op basis
 * van de huidige selectie. Drie scenarios (in volgorde):
 *   1. Primary selection = Welder-Slide zelf → direct return.
 *   2. Primary selection = descendant van een Welder-Slide (bv. text-klik
 *      in Figma Design) → walk up via findSlideAncestor.
 *   3. Primary selection = container die een Welder-Slide BEVAT (bv.
 *      SlideNode in Figma Slides navigator) → walk down via findOne met
 *      isSlide-predicate, bounded.
 * Retourneert null wanneer geen match — caller doet niets.
 */
export function findFocusedWelderSlide(): InstanceNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;
  const selected = selection[0];

  // Scenario 1: selected IS a Welder-Slide
  if (selected.type === 'INSTANCE' && isSlide(selected)) {
    return selected;
  }

  // Scenario 2: selected is INSIDE a Welder-Slide
  const ancestor = findSlideAncestor(selected);
  if (ancestor !== null) return ancestor;

  // Scenario 3: selected is a CONTAINER of a Welder-Slide (e.g. SlideNode)
  if ('findOne' in selected) {
    const container = selected as SceneNode & { findOne: SlideNode['findOne'] };
    const descendant = container.findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return isSlide(n as InstanceNode);
    });
    if (descendant !== null && descendant.type === 'INSTANCE') {
      return descendant as InstanceNode;
    }
  }

  return null;
}
