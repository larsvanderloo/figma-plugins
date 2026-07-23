/** Variable keys from the "Templates Welder / Theme" library. */
export const TEXT_KEY = 'aaeec2f93a38b8a2e3af696972c4313eff529bc7';
export const TEXT_DIMMER_KEY = 'cd3f59ce0c953ee93c4a30b738a96683035b3d72';

/** `Text Dimmer` in orange mode (#ffc78f); consumers compare per channel with tolerance. */
export const TEXT_DIMMER_RGB = {
  r: 0xff / 255,
  g: 0xc7 / 255,
  b: 0x8f / 255,
};

/** Each field is null when the library import failed (free team, offline). */
export interface AccentVars {
  text: Variable | null;
  dimmer: Variable | null;
}

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

/** Figma's glyph renderer caches the fallback RGB passed to setBoundVariableForPaint;
 * if it mismatches the current-mode value, colors stay stale until a mode switch. */
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

/** resolveForConsumer returns the collection's DEFAULT mode on Slot/Frame/Instance
 * consumers instead of the slide's mode, so read the node's own mode and take the
 * value straight from valuesByMode (following alias chains up to 3 hops). */
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
