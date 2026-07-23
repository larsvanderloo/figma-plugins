// The slide-page cache never invalidates itself: main.ts's documentchange/
// currentpagechange listeners call invalidateSlidePageCache.

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

// The 1-based number only surfaces in the UI when a slide has no heading,
// but it must stay consistent with the export-document filename logic.
export function summaryForSlide(slide: InstanceNode): SlideSummary {
  return slideSummary(slide, getSlideNumber(slide));
}

export async function findSlideById(id: string): Promise<InstanceNode | null> {
  const nodes = getSlidesOnCurrentPage();
  for (const node of nodes) {
    if (node.id === id) return node;
  }
  // The cache walk misses deeply nested slides (e.g. inside a SECTION on a
  // design page), while the scan side finds them via up-walk; without this
  // fallback the UI can show a slide whose every mutation fails "Slide not found".
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (node !== null && node.type === 'INSTANCE' && isSlide(node as InstanceNode)) {
      return node as InstanceNode;
    }
  } catch (_e) {
    /* id can be stale after undo/delete */
  }
  return null;
}

export function findSlideAncestor(node: BaseNode): InstanceNode | null {
  let current: BaseNode | null = node;
  // Slides sit at page level, so at most ~5 parent hops; 10 is a safe bound.
  for (let i = 0; i < 10; i++) {
    if (current === null) return null;
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

export function findFocusedWelderSlide(): InstanceNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;
  const selected = selection[0];

  if (selected.type === 'INSTANCE' && isSlide(selected)) {
    return selected;
  }

  const ancestor = findSlideAncestor(selected);
  if (ancestor !== null) return ancestor;

  // The Slides navigator selects the SlideNode container, not the Welder
  // instance inside it — walk down for that case.
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
