// ============================================================
// editors/_shared/fonts.ts
//
// Canonical font-loading helpers voor text-mutaties. Één plek,
// één patroon — voorkomt de silent character-truncation bug die
// ontstond toen drie editor-files ieder een eigen "laad alleen
// char-0's font"-variant hadden.
//
// FIG-FONT-01: Figma Plugin API truncate-t `node.characters = value`
// stil bij de eerste font-boundary wanneer niet álle fonts in de
// bestaande styled-range al geladen zijn. Het verschil tussen "één
// font geladen" en "alle fonts geladen" is onzichtbaar tot de user
// ineens de helft van zijn heading mist. Daarom: laad altijd alles.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing,
// geen catch-without-binding (feedback_figma_runtime.md).
// ============================================================

/**
 * FIG-FONT-01 canonical pattern — laadt elk uniek font in een TextNode
 * zodat `node.characters = value` en `node.setRangeFills(...)` veilig
 * uitgevoerd kunnen worden. Mixed-font nodes die niet álle fonts laden
 * vóór een characters-write worden door Figma silent getruncate-t bij
 * de font-boundary (de root-cause).
 */
export async function loadAllFontsForNode(node: TextNode): Promise<void> {
  const fontName = node.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName as FontName);
    return;
  }
  // Mixed fonts: loop over unieke fontNames per segment.
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

/**
 * Schrijft `value` naar `node.characters` na het laden van alle fonts
 * in de bestaande styled-range. Dit is de canonical write-path voor
 * alle editors; gebruik NOOIT `node.characters = value` zonder deze
 * helper of een equivalente all-fonts-load.
 */
export async function setTextCharactersSafe(node: TextNode, value: string): Promise<void> {
  await loadAllFontsForNode(node);
  node.characters = value;
}
