// Figma silently truncates a `node.characters` write at the first font
// boundary unless every font in the node's existing styled range is loaded
// first — hence one shared load-all path for every text mutation.

// Font must already be loaded by the caller (chart builders run after
// applyChart's font preload); intentionally synchronous — no loadFontAsync.
export function probeTextHeight(family: string, style: string, fontSize: number): number {
  const probe = figma.createText();
  probe.fontName = { family: family, style: style };
  probe.fontSize = fontSize;
  probe.characters = 'Ag';
  const h = probe.height;
  probe.remove();
  return h;
}

export async function loadAllFontsForNode(node: TextNode): Promise<void> {
  const fontName = node.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName as FontName);
    return;
  }
  const segments = node.getStyledTextSegments(['fontName']);
  const seen: Record<string, boolean> = {};
  const loads: Array<Promise<void>> = [];
  for (let i = 0; i < segments.length; i++) {
    const fn = segments[i].fontName;
    const key = fn.family + '::' + fn.style;
    if (seen[key] === true) continue;
    seen[key] = true;
    loads.push(figma.loadFontAsync(fn));
  }
  await Promise.all(loads);
}

// Canonical write path — never assign `node.characters` directly in editors.
export async function setTextCharactersSafe(node: TextNode, value: string): Promise<void> {
  await loadAllFontsForNode(node);
  node.characters = value;
}
