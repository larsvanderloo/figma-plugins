import { GeneralSections, ThemeMode } from '../../shared/types';

// Welder Templates files carry TWO "Theme" collections in parallel (local + library) that must
// switch in lock-step — the accent references library variables — so writers map modes by name.
export async function findThemeCollectionsForSlide(slide: InstanceNode): Promise<VariableCollection[]> {
  const ids = new Set<string>();
  if (slide.explicitVariableModes) {
    for (const k of Object.keys(slide.explicitVariableModes)) ids.add(k);
  }
  if (slide.resolvedVariableModes) {
    for (const k of Object.keys(slide.resolvedVariableModes)) ids.add(k);
  }
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
  // Local before remote so swatches resolve from the local collection, no library round-trip.
  result.sort((a, b) => (a.remote === b.remote ? 0 : a.remote ? 1 : -1));
  return result;
}

export async function scanTheme(slide: InstanceNode): Promise<GeneralSections['theme']> {
  const collections = await findThemeCollectionsForSlide(slide);
  if (collections.length === 0) return null;
  const collection = collections[0];

  const explicit =
    slide.explicitVariableModes !== undefined && slide.explicitVariableModes !== null
      ? slide.explicitVariableModes[collection.id]
      : undefined;
  const resolved =
    slide.resolvedVariableModes !== undefined && slide.resolvedVariableModes !== null
      ? slide.resolvedVariableModes[collection.id]
      : undefined;

  const resolvedModeId =
    typeof resolved === 'string' && resolved.length > 0 ? resolved : collection.defaultModeId;

  // Swatch colors are the first two COLOR variables in the collection — by convention the
  // dominant + accent slots of any Theme collection, so this stays library-agnostic.
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
    // Cross-collection alias: fall back to the aliased variable's first mode that has a value.
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
