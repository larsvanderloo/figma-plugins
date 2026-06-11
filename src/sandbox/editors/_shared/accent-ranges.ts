// ============================================================
// editors/_shared/accent-ranges.ts
//
// Canonical Text Dimmer range reader/writer for Heading accent marks.
// Used by both slide scans and text mutations so a heading text update
// can clear invalid ranges in the same sandbox write.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from './accent-vars';
import { loadAllFontsForNode } from './fonts';

const DIMMER_HEX_TOLERANCE = 0.01;

/**
 * True wanneer een fill een SOLID-paint is bound aan de gegeven variable-id,
 * of raw SOLID met een kleur die ongeveer #ffc78f matcht.
 */
function isDimmedFill(fill: Paint, dimmerId: string | null): boolean {
  if (fill.type !== 'SOLID') return false;
  const solid = fill as SolidPaint;
  if (dimmerId !== null && solid.boundVariables !== undefined && solid.boundVariables !== null) {
    const bound = solid.boundVariables.color;
    if (bound !== undefined && bound !== null && bound.id === dimmerId) {
      return true;
    }
  }
  const c = solid.color;
  if (
    Math.abs(c.r - TEXT_DIMMER_RGB.r) <= DIMMER_HEX_TOLERANCE &&
    Math.abs(c.g - TEXT_DIMMER_RGB.g) <= DIMMER_HEX_TOLERANCE &&
    Math.abs(c.b - TEXT_DIMMER_RGB.b) <= DIMMER_HEX_TOLERANCE
  ) {
    return true;
  }
  return false;
}

/**
 * Leest dim-ranges van een TextNode via `getStyledTextSegments`.
 *
 * - `null` betekent: library variables niet bereikbaar.
 * - `[]` betekent: library OK, geen dim-range aanwezig.
 * - gevuld betekent: canonical, samengevoegde char-ranges.
 */
export async function readDimRanges(node: TextNode): Promise<Array<[number, number]> | null> {
  const vars = await loadAccentVars();
  if (vars.text === null && vars.dimmer === null) {
    return null;
  }
  const dimmerId = vars.dimmer !== null ? vars.dimmer.id : null;
  const segments = node.getStyledTextSegments(['fills']);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const fills = seg.fills;
    if (!Array.isArray(fills) || fills.length === 0) continue;
    let dimmed = false;
    for (let j = 0; j < fills.length; j++) {
      if (isDimmedFill(fills[j], dimmerId)) {
        dimmed = true;
        break;
      }
    }
    if (!dimmed) continue;
    const last = ranges.length > 0 ? ranges[ranges.length - 1] : null;
    if (last !== null && last[1] === seg.start) {
      last[1] = seg.end;
    } else {
      ranges.push([seg.start, seg.end]);
    }
  }
  return ranges;
}

/**
 * Past accent-ranges toe op een text-node: dim-fill op `dimRanges`,
 * text-fill op het complement. Characters blijven ongemoeid.
 */
export async function applyAccentRanges(
  node: TextNode,
  dimRanges: Array<[number, number]>,
): Promise<void> {
  const vars = await loadAccentVars();
  if (vars.text === null || vars.dimmer === null) {
    console.log('[welder-slide-editor] applyAccentRanges skipped — library vars not available.');
    return;
  }
  await loadAllFontsForNode(node);

  const textColor = resolveColor(vars.text, node, { r: 1, g: 0.957, b: 0.918 });
  const dimColor = resolveColor(vars.dimmer, node, {
    r: TEXT_DIMMER_RGB.r,
    g: TEXT_DIMMER_RGB.g,
    b: TEXT_DIMMER_RGB.b,
  });

  const textFill = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: textColor },
    'color',
    vars.text,
  );
  const dimFill = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: dimColor },
    'color',
    vars.dimmer,
  );

  const len = node.characters.length;
  if (len === 0) return;

  try {
    node.setRangeFills(0, len, [textFill]);
    for (let i = 0; i < dimRanges.length; i++) {
      const r = dimRanges[i];
      const start = Math.max(0, r[0]);
      const end = Math.min(len, r[1]);
      if (end <= start) continue;
      node.setRangeFills(start, end, [dimFill]);
    }
  } catch (err: unknown) {
    console.log('[welder-slide-editor] setRangeFills failed:', err);
  }

  try {
    const prev = node.visible;
    node.visible = !prev;
    node.visible = prev;
  } catch (err: unknown) {
    console.log('[welder-slide-editor] visible-toggle flush failed:', err);
  }
}
