// wrappers/CopyWrap.ts — CopyWrap detector and model extractor (1.11)
//
// Finds the CopyWrap INSTANCE within a slide and extracts the
// TitleDescriptionSection model from shared/messages.ts.
//
// Detection: name === 'CopyWrap' (exact match).
// Extraction: reads Heading (always present) + Paragraph (may be absent or
// hidden). headingDim is NOT extracted here — accent-range editing is deferred
// (ADR-0008). The field is always null in v0.1.0.
//
// FIG-TRAVERSE-01: traversal bounded to CopyWrap subtree (findOne within wrapper).
// FIG-GUARD-01: type-checks before property access.
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

import type { TitleDescriptionSection } from '@shared/messages';
import { findCopyWrap, isEffectivelyVisible } from '../slide-machine';
import { setTextCharactersSafe } from '@figma-plugins/figma-api';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Finds the CopyWrap INSTANCE within a slide.
 * Returns null when the slide has no CopyWrap.
 */
export function findCopyWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findCopyWrap(slide);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Reads the first visible Heading and Paragraph text nodes within CopyWrap.
 *
 * Paragraph: uses findAll + visibility check to select the first *visible*
 * Paragraph node (Slide Machine variant "Heading only" hides the Paragraph
 * subtree). If no visible Paragraph exists, the field is null.
 *
 * headingDim: always null in v0.1.0 — accent-range editing deferred (ADR-0008).
 */
export function extractCopyWrap(
  copyWrap: InstanceNode,
  slide: InstanceNode,
): TitleDescriptionSection {
  // Heading: read first visible Heading text node.
  const headingNode = findFirstVisibleTextByName(copyWrap, 'Heading', slide);
  const heading = headingNode !== null ? headingNode.characters : '';

  // Paragraph: visible check — "Heading only" variant hides the Paragraph subtree.
  const paragraphNode = findFirstVisibleTextByName(copyWrap, 'Paragraph', slide);
  const paragraph = paragraphNode !== null ? paragraphNode.characters : null;

  return {
    copyWrapId: copyWrap.id,
    heading: heading,
    paragraph: paragraph,
    // ADR-0008: accent-range editing deferred; always null in v0.1.0.
    headingDim: null,
  };
}

// ---------------------------------------------------------------------------
// Mutation (apply-title-description handler)
// ---------------------------------------------------------------------------

/**
 * Applies heading and/or paragraph text to the CopyWrap within slide.
 * Per ADR-0004: single text writes produce granular undo steps (no withAtomic).
 * Visibility is toggled to hide empty nodes (CopyWrap auto-layout shrinks).
 *
 * Wave 1 usage: setTextCharactersSafe from packages/figma-api/src/fonts.ts
 * handles FIG-FONT-01 (load all fonts before write).
 */
export async function applyCopyWrap(
  slide: InstanceNode,
  heading?: string,
  paragraph?: string,
): Promise<{ copyWrapId: string } | null> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return null;

  if (typeof heading === 'string') {
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (headingNode !== null) {
      await setTextCharactersSafe(headingNode, heading);
      // Hide empty heading so CopyWrap auto-layout collapses around real content.
      headingNode.visible = heading !== '';
    }
  }

  if (typeof paragraph === 'string') {
    const paragraphNode = findTextByName(copyWrap, 'Paragraph');
    if (paragraphNode !== null) {
      await setTextCharactersSafe(paragraphNode, paragraph);
      paragraphNode.visible = paragraph !== '';
    }
  }

  return { copyWrapId: copyWrap.id };
}

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

/**
 * Finds the first TextNode with the given name within scope.
 * No visibility filter — used for mutations where we write to the canonical node.
 */
function findTextByName(scope: InstanceNode, name: string): TextNode | null {
  const found = scope.findOne(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null || found.type !== 'TEXT') return null;
  return found as TextNode;
}

/**
 * Finds the first *visible* TextNode with the given name within scope.
 * Slide Machine variant components often contain multiple text nodes with the
 * same name (one per variant branch). We take the first effectively-visible
 * match to avoid hiding the textarea when the user's chosen variant does show it.
 */
function findFirstVisibleTextByName(
  scope: InstanceNode,
  name: string,
  slide: InstanceNode,
): TextNode | null {
  const matches = scope.findAll(function (n: SceneNode) {
    return n.type === 'TEXT' && n.name === name;
  });
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    if (m.type !== 'TEXT') continue;
    if (!isEffectivelyVisible(m, slide)) continue;
    return m as TextNode;
  }
  return null;
}
