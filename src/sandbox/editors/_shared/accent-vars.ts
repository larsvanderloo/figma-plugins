// ============================================================
// editors/_shared/accent-vars.ts
//
// Gedeelde helpers voor library-variable-resolution (Text + Text Dimmer).
// Extractie uit code.ts (T34.2) zodat zowel de accent-range-writer (heading
// dim ranges, T28.2) als de Slot-based table-renderer (T34.2) dezelfde
// single-source-of-truth gebruiken.
//
// Variable-keys komen uit de "Templates Welder / Theme"-library; de
// fallback-RGB voor Text Dimmer (#ffc78f in orange-mode) voedt
// `resolveForConsumer` in het zeldzame geval waarin de library niet
// bereikbaar is op de team-omgeving van de user.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing,
// geen catch-without-binding (feedback_figma_runtime.md).
// ============================================================

/** Variable-keys in de "Templates Welder / Theme"-library. */
export const TEXT_KEY = 'aaeec2f93a38b8a2e3af696972c4313eff529bc7';
export const TEXT_DIMMER_KEY = 'cd3f59ce0c953ee93c4a30b738a96683035b3d72';

/** RGB-waarde van `Text Dimmer` in orange-mode (#ffc78f). Tolerance per channel. */
export const TEXT_DIMMER_RGB = {
  r: 0xff / 255,
  g: 0xc7 / 255,
  b: 0x8f / 255,
};

/** Geresolvde variable-paar na library-import. Elk veld kan null zijn
 * wanneer de library onbereikbaar is (free team, offline). */
export interface AccentVars {
  text: Variable | null;
  dimmer: Variable | null;
}

/**
 * Promise-cache: eerste call start de parallel-import, volgende calls
 * hergebruiken de resolved Promise. ES2017-compat: geen `??=`.
 */
let accentVarsPromise: Promise<AccentVars> | null = null;

export function loadAccentVars(): Promise<AccentVars> {
  if (accentVarsPromise !== null) return accentVarsPromise;
  accentVarsPromise = (async function (): Promise<AccentVars> {
    let textVar: Variable | null = null;
    let dimmerVar: Variable | null = null;
    try {
      textVar = await figma.variables.importVariableByKeyAsync(TEXT_KEY);
    } catch (err: unknown) {
      console.log('[welder-slide-editor] importVariableByKeyAsync(Text) failed:', err);
    }
    try {
      dimmerVar = await figma.variables.importVariableByKeyAsync(TEXT_DIMMER_KEY);
    } catch (err: unknown) {
      console.log('[welder-slide-editor] importVariableByKeyAsync(Text Dimmer) failed:', err);
    }
    return { text: textVar, dimmer: dimmerVar };
  })();
  return accentVarsPromise;
}

/**
 * Pre-resolve een Variable tegen de node's effectieve variable-modes (T28.2).
 * Figma's glyph-renderer cached de fallback-RGB die we aan
 * `setBoundVariableForPaint` meegeven; wanneer die niet matcht met de
 * current-mode-waarde zien we stale kleuren tot een mode-switch de cache
 * invalideert. `resolveForConsumer(node)` levert de current-mode-waarde.
 *
 * `node` mag elk SceneNode zijn dat in Figma's variable-mode-boom valt
 * (TextNode voor dim-ranges, SlotNode voor table-renderer).
 */
export function resolveColor(v: Variable, node: SceneNode, fallback: RGB): RGB {
  try {
    const resolved = v.resolveForConsumer(node);
    if (resolved.resolvedType === 'COLOR') {
      const val = resolved.value as RGB;
      return { r: val.r, g: val.g, b: val.b };
    }
  } catch (err: unknown) {
    console.log('[welder-slide-editor] resolveForConsumer failed:', err);
  }
  return fallback;
}

/**
 * Mode-getrouwe variable-resolutie (T47.1): resolveForConsumer blijkt op
 * Slot/Frame/Instance-consumers de DEFAULT-mode van de collectie terug te
 * geven i.p.v. de slide-mode (MCP-geverifieerd 2026-06-12: blue-mode slide
 * resolvede Text als orange). Deze helper leest de mode van de node zelf
 * (resolvedVariableModes → explicitVariableModes → collection-default) en
 * pakt de waarde direct uit `valuesByMode`, met alias-chains tot 3 hops.
 */
export async function resolveColorInNodeMode(
  v: Variable,
  node: SceneNode,
  fallback: RGB,
): Promise<RGB> {
  try {
    let value = await valueInNodeMode(v, node);
    for (let hop = 0; hop < 3; hop++) {
      if (
        value !== undefined &&
        typeof value === 'object' &&
        value !== null &&
        (value as VariableAlias).type === 'VARIABLE_ALIAS'
      ) {
        const next = await figma.variables.getVariableByIdAsync((value as VariableAlias).id);
        if (next === null) break;
        value = await valueInNodeMode(next, node);
      } else {
        break;
      }
    }
    if (
      value !== undefined &&
      typeof value === 'object' &&
      value !== null &&
      typeof (value as RGBA).r === 'number'
    ) {
      const c = value as RGBA;
      return { r: c.r, g: c.g, b: c.b };
    }
  } catch (err: unknown) {
    console.log('[welder-slide-editor] resolveColorInNodeMode failed:', err);
  }
  return fallback;
}

/** Waarde van `v` in de mode die `node` voor v's collectie voert. */
async function valueInNodeMode(v: Variable, node: SceneNode): Promise<VariableValue | undefined> {
  const collId = v.variableCollectionId;
  let modeId: string | undefined;
  const resolved = node.resolvedVariableModes;
  if (resolved !== undefined && resolved !== null && typeof resolved[collId] === 'string') {
    modeId = resolved[collId];
  }
  if (modeId === undefined) {
    const explicit = node.explicitVariableModes;
    if (explicit !== undefined && explicit !== null && typeof explicit[collId] === 'string') {
      modeId = explicit[collId];
    }
  }
  if (modeId === undefined) {
    const coll = await figma.variables.getVariableCollectionByIdAsync(collId);
    if (coll !== null) modeId = coll.defaultModeId;
  }
  if (modeId === undefined) return undefined;
  return v.valuesByMode[modeId];
}
