// wrappers/TimelineWrap.ts — TimelineWrap detector, extractor, and applier (1.11)
//
// Finds the TimelineWrap INSTANCE and extracts the mixed list of CardItem and
// TimelineItem models. Also handles apply-timeline mutation (heading + paragraph
// write to a specific CopyWrap child).
//
// Detection: name === 'TimelineWrap' OR name contains 'Timeline'.
//
// Polymorphic extraction:
//   - TimelineWrap may contain Card instances (with icon + visual — pushed to
//     ContentItems.cards) AND/OR CopyWrap instances (heading + paragraph only —
//     pushed to ContentItems.timelineItems). Both are found via findAll within
//     the TimelineWrap subtree.
//
// apply-timeline: locates a specific CopyWrap inside the slide by node-id,
// then writes heading and/or paragraph. Uses slide.findOne so nested CopyWraps
// (within TimelineWrap, inside intermediate FRAMEs) are reachable.
//
// Wave 1 wrapper usage:
//   - setTextCharactersSafe (fonts.ts) for text writes.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

import type { TimelineItem } from '@shared/messages';
import { findTimelineWrap } from '../slide-machine';
import { setTextCharactersSafe } from '@figma-plugins/figma-api';
import { extractCardsFromScope } from './CardWrap';
import type { CardItem } from '@shared/messages';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Finds the TimelineWrap INSTANCE within a slide. */
export function findTimelineWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findTimelineWrap(slide);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export interface TimelineWrapExtracted {
  cards: CardItem[];
  timelineItems: TimelineItem[];
}

/**
 * Extracts both Card instances and CopyWrap instances from a TimelineWrap.
 *
 * Cards: extracted via extractCardsFromScope (same function used by CardWrap).
 * CopyWrap items: heading + paragraph only, no icon or visual.
 * Corrupt items (missing Heading) are silently skipped.
 */
export function extractTimelineWrap(slide: InstanceNode): TimelineWrapExtracted {
  const timelineWrap = findTimelineWrap(slide);
  if (timelineWrap === null) return { cards: [], timelineItems: [] };

  const cards = extractCardsFromScope(timelineWrap, slide);
  const timelineItems = extractCopyWrapItems(timelineWrap);

  return { cards, timelineItems };
}

/**
 * Extracts CopyWrap instances from a TimelineWrap.
 * Scans all CopyWrap descendants (bounded to timelineWrap subtree).
 * Skips decorative 'Stepper Item' instances; takes only CopyWrap instances.
 */
export function extractCopyWrapItems(scope: InstanceNode): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (!('findAll' in scope)) return items;

  const copyWrapInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'CopyWrap';
  });

  for (let i = 0; i < copyWrapInstances.length; i++) {
    const cw = copyWrapInstances[i]!;
    const heading = readTextByName(cw, 'Heading');
    if (heading === null) continue; // corrupt: skip

    items.push({
      copyWrapNodeId: cw.id,
      heading: heading,
      paragraph: readTextByName(cw, 'Paragraph') ?? '',
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Mutation — apply-timeline handler
// ---------------------------------------------------------------------------

/**
 * Applies heading and/or paragraph text to a specific CopyWrap within the
 * slide (identified by copyWrapNodeId). Uses slide.findOne so nested CopyWraps
 * inside TimelineWrap (within intermediate FRAMEs) are reachable.
 *
 * Wave 1: setTextCharactersSafe handles FIG-FONT-01 (load all fonts before write).
 *
 * Returns { copyWrapNodeId } on success, null when the CopyWrap is not found.
 */
export async function applyTimeline(
  slide: InstanceNode,
  copyWrapNodeId: string,
  heading?: string,
  paragraph?: string,
): Promise<{ copyWrapNodeId: string } | null> {
  // Slide-scoped findOne — finds CopyWraps nested inside TimelineWrap and FRAMEs.
  const cwNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'CopyWrap' && n.id === copyWrapNodeId;
  });
  if (cwNode === null || cwNode.type !== 'INSTANCE') return null;
  const cw = cwNode as InstanceNode;

  if (typeof heading === 'string') {
    const headingNode = findTextNodeByName(cw, 'Heading');
    if (headingNode !== null) await setTextCharactersSafe(headingNode, heading);
  }

  if (typeof paragraph === 'string') {
    const paragraphNode = findTextNodeByName(cw, 'Paragraph');
    if (paragraphNode !== null) await setTextCharactersSafe(paragraphNode, paragraph);
  }

  return { copyWrapNodeId };
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

function findTextNodeByName(scope: InstanceNode, name: string): TextNode | null {
  const found = scope.findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null || found.type !== 'TEXT') return null;
  return found as TextNode;
}
