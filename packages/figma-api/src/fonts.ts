// packages/figma-api/src/fonts.ts
//
// Canonical font-loading helpers.
//
// Owner: figma-api-engineer
// Monday task: 1.9 (part 1)
//
// Lifted from:
//   welder-slide-editor/widget-src/editors/_shared/fonts.ts (v0.2.1)
//
// FIG-FONT-01: Figma Plugin API silently truncates `node.characters = value`
// at the first font-boundary when not ALL fonts in the existing styled range
// are loaded.  "One font loaded" vs "all fonts loaded" is invisible until the
// user sees half their heading missing.  Always load everything.
//
// See also: spec §13 T29 root-cause analysis (welder-slide-editor).
//
// The external build had three separate editor files each with their own
// "load only char-0's font" variant.  This module is the single source of
// truth for all editors.

// ---------------------------------------------------------------------------
// loadAllFontsForNode
// ---------------------------------------------------------------------------

/**
 * FIG-FONT-01 canonical pattern: loads every unique font referenced by any
 * styled segment of `node` so that subsequent `node.characters = value` and
 * `node.setRangeFills(...)` calls are safe.
 *
 * For non-mixed text nodes a single loadFontAsync call is issued.
 * For mixed-style text nodes (figma.mixed fontName), all unique fonts across
 * all styled segments are loaded in parallel.
 *
 * Also accepts a SceneNode for recursive traversal: when passed a non-TextNode
 * SceneNode, the function walks all TextNode descendants and loads fonts for
 * each.  This covers the case where a caller wants to pre-load fonts for an
 * entire wrapper component before performing a batch of text mutations.
 */
export async function loadAllFontsForNode(node: TextNode | SceneNode): Promise<void> {
  if (node.type === 'TEXT') {
    await loadFontsForTextNode(node);
    return;
  }

  // Recursive traversal for non-text scene nodes.
  if (!('findAll' in node)) return;
  const textNodes = (node as ChildrenMixin).findAll((n) => n.type === 'TEXT') as TextNode[];
  if (textNodes.length === 0) return;

  await Promise.all(textNodes.map((t) => loadFontsForTextNode(t)));
}

/** Internal: loads all fonts for a single TextNode. */
async function loadFontsForTextNode(node: TextNode): Promise<void> {
  const fontName = node.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName as FontName);
    return;
  }

  // Mixed fonts: collect unique FontName values across all styled segments.
  const segments = node.getStyledTextSegments(['fontName']);
  const seen: Record<string, boolean> = {};
  const loads: Array<Promise<void>> = [];

  for (const seg of segments) {
    const fn = seg.fontName as FontName;
    const key = `${fn.family}::${fn.style}`;
    if (seen[key] === true) continue;
    seen[key] = true;
    loads.push(figma.loadFontAsync(fn));
  }

  await Promise.all(loads);
}

// ---------------------------------------------------------------------------
// setTextCharactersSafe
// ---------------------------------------------------------------------------

/**
 * FIG-FONT-01 canonical write path: loads all fonts in the existing styled
 * range then writes `text` to `node.characters`.
 *
 * This is the ONLY sanctioned path for setting text characters in all editors.
 * Do NOT write `node.characters = value` directly — always go through this
 * function or setCharactersSafe in mutate.ts (which delegates here).
 */
export async function setTextCharactersSafe(node: TextNode, text: string): Promise<void> {
  await loadFontsForTextNode(node);
  node.characters = text;
}
