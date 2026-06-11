// ============================================================
// scan/theme.ts
//
// Theme-scan: slide-level Theme-collection mode binding. Vindt de
// Theme-variable-collections waar een slide aan gebonden is en bouwt
// de picker-payload (modes + swatch-kleuren) voor de iframe.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { GeneralSections, ThemeMode } from '../types';

/**
 * Discover every variable collection named "Theme" that the slide is
 * actually bound to (explicit OR resolved). Welder Templates files
 * carry TWO `Theme` collections in parallel — a local one and the
 * library one from "Templates Welder" — and both must be set in lock-
 * step so the body theme AND the accent (which references library
 * variables) follow the picker.
 *
 * Returns the collections in stable order: local first, library second
 * (or whatever order their IDs sort in). The picker uses the first
 * collection's modes for its UI; the writer below maps the chosen mode
 * onto every collection by NAME.
 */
export async function findThemeCollectionsForSlide(slide: InstanceNode): Promise<VariableCollection[]> {
  const ids = new Set<string>();
  if (slide.explicitVariableModes) {
    for (const k of Object.keys(slide.explicitVariableModes)) ids.add(k);
  }
  if (slide.resolvedVariableModes) {
    for (const k of Object.keys(slide.resolvedVariableModes)) ids.add(k);
  }
  // Fetch every candidate collection in parallel — sequential awaits
  // serialized 2-5 round-trips per slide selection.
  const fetched = await Promise.all(
    Array.from(ids).map(function (id) {
      return figma.variables.getVariableCollectionByIdAsync(id).catch(function () {
        return null;
      });
    }),
  );
  const result: VariableCollection[] = [];
  for (let i = 0; i < fetched.length; i++) {
    const c = fetched[i];
    if (c !== null && c.name === 'Theme') result.push(c);
  }
  // Local before remote so the picker's swatches come from the local
  // collection (faster to resolve, no library round-trip).
  result.sort((a, b) => (a.remote === b.remote ? 0 : a.remote ? 1 : -1));
  return result;
}

export async function scanTheme(slide: InstanceNode): Promise<GeneralSections['theme']> {
  const collections = await findThemeCollectionsForSlide(slide);
  if (collections.length === 0) return null;
  // Picker reads its modes + swatches from the first (local-preferred)
  // collection. The set-slide-theme handler then mirrors the choice onto
  // every Theme collection by name.
  const collection = collections[0];

  const explicit =
    slide.explicitVariableModes !== undefined && slide.explicitVariableModes !== null
      ? slide.explicitVariableModes[collection.id]
      : undefined;
  const resolved =
    slide.resolvedVariableModes !== undefined && slide.resolvedVariableModes !== null
      ? slide.resolvedVariableModes[collection.id]
      : undefined;

  // resolvedMode is required for the picker to highlight the active
  // mode. Fall back to the collection's default when the slide doesn't
  // resolve any mode (shouldn't happen in practice but defensive).
  const resolvedModeId =
    typeof resolved === 'string' && resolved.length > 0 ? resolved : collection.defaultModeId;

  // Pick the first two COLOR variables in the collection as the picker's
  // swatch colors. Library-agnostic: works for any Theme collection
  // whose first two color slots are the dominant + accent colors.
  // Fetch all variables in parallel — sequential awaits added ~10ms ×
  // collection-size before the picker could render.
  const allVars = await Promise.all(
    collection.variableIds.map(function (id) {
      return figma.variables.getVariableByIdAsync(id);
    }),
  );
  const colorVars: Variable[] = [];
  for (let i = 0; i < allVars.length && colorVars.length < 2; i++) {
    const v = allVars[i];
    if (v !== null && v.resolvedType === 'COLOR') colorVars.push(v);
  }

  // Resolve every mode's primary + secondary in parallel — modes × 2
  // awaits previously serialized into ~2M round-trips before render.
  const modes: ThemeMode[] = await Promise.all(
    collection.modes.map(async function (m) {
      const [primary, secondary] = await Promise.all([
        colorVars.length >= 1
          ? resolveColorAsHex(colorVars[0].valuesByMode[m.modeId], m.modeId)
          : Promise.resolve(null),
        colorVars.length >= 2
          ? resolveColorAsHex(colorVars[1].valuesByMode[m.modeId], m.modeId)
          : Promise.resolve(null),
      ]);
      return {
        id: m.modeId,
        name: m.name,
        swatchPrimary: primary,
        swatchSecondary: secondary,
      };
    }),
  );

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    explicitModeId: typeof explicit === 'string' && explicit.length > 0 ? explicit : null,
    resolvedModeId: resolvedModeId,
    modes: modes,
  };
}

/**
 * Resolve a Figma variable value (which may be `RGB`/`RGBA` directly or
 * a `VARIABLE_ALIAS` pointing at another variable) to a `#rrggbb` hex
 * string. Walks one alias hop; on alias-to-another-collection, falls
 * back to the aliased variable's first available mode value.
 *
 * Returns null when the value is undefined, isn't a color, or the alias
 * chain can't be resolved.
 */
async function resolveColorAsHex(value: VariableValue | undefined, modeId: string): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && 'r' in value && typeof (value as RGB).r === 'number') {
    return rgbToHex(value as RGB);
  }
  if (typeof value === 'object' && 'type' in value && (value as VariableAlias).type === 'VARIABLE_ALIAS') {
    const aliased = await figma.variables.getVariableByIdAsync((value as VariableAlias).id);
    if (aliased === null || aliased.resolvedType !== 'COLOR') return null;
    const sameMode = aliased.valuesByMode[modeId];
    if (sameMode !== undefined) return resolveColorAsHex(sameMode, modeId);
    // Cross-collection alias: take the aliased variable's first mode.
    const otherColl = await figma.variables.getVariableCollectionByIdAsync(aliased.variableCollectionId);
    if (otherColl !== null) {
      for (let i = 0; i < otherColl.modes.length; i++) {
        const v = aliased.valuesByMode[otherColl.modes[i].modeId];
        if (v !== undefined) return resolveColorAsHex(v, otherColl.modes[i].modeId);
      }
    }
  }
  return null;
}

function rgbToHex(c: RGB): string {
  const to = (x: number): string => {
    const v = Math.round(x * 255);
    const s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + to(c.r) + to(c.g) + to(c.b);
}
