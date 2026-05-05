// packages/figma-api/src/variables.ts
//
// Figma library variable wrapper — typed helpers for importing and applying
// library variables to canvas nodes.
//
// Owner: figma-api-engineer
// Monday task: 1.8
//
// Lifted from:
//   welder-slide-editor/widget-src/editors/_shared/accent-vars.ts (v0.2.1)
//
// ADR-0005: canvas-side mutations bind Figma library variables via
// setBoundVariableForPaint after Variable.resolveForConsumer(node).
// The T28.2 lesson (permanent): NEVER pass a hardcoded fallback RGB to
// setBoundVariableForPaint.  Always pre-resolve via resolveForConsumer to
// get the current-mode value; passing a stale fallback causes Figma's glyph
// render cache to show the wrong color until the user manually switches modes.
//
// Anti-pattern (DO NOT do this):
//   figma.variables.setBoundVariableForPaint(
//     { type: 'SOLID', color: { r: 1, g: 0.957, b: 0.918 } }, // WRONG: hardcoded
//     'color', variable
//   )
//
// Correct pattern (T28.2):
//   const resolved = resolveVariableForConsumer(variable, node);
//   figma.variables.setBoundVariableForPaint(
//     { type: 'SOLID', color: resolved as RGB }, // CORRECT: current-mode value
//     'color', variable
//   )

// ---------------------------------------------------------------------------
// Library variable loading
// ---------------------------------------------------------------------------

/**
 * Loads all available library variable collections from the team library and
 * returns the matching Variable objects after importing them.
 *
 * Optionally filters collections by name substring.  When `filterByName` is
 * provided, only collections whose name includes the filter string are
 * imported.  Pass undefined to import all available collections.
 *
 * This is the full-spectrum load path.  For targeted single-variable loads
 * by key (the welder-editor accent-vars pattern), use
 * figma.variables.importVariableByKeyAsync directly and handle failures per
 * the pattern in the promise-cache below.
 *
 * Errors on individual collections are logged and skipped; the returned array
 * contains only successfully imported variables.
 */
export async function loadLibraryVariables(filterByName?: string): Promise<Variable[]> {
  let collections: LibraryVariableCollection[];
  try {
    collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  } catch (_e) {
    console.warn('[variables] getAvailableLibraryVariableCollectionsAsync failed');
    return [];
  }

  const filtered =
    filterByName !== undefined
      ? collections.filter((c) => c.name.includes(filterByName))
      : collections;

  const results: Variable[] = [];

  for (const collection of filtered) {
    let libraryVars: LibraryVariable[];
    try {
      libraryVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
    } catch (_e) {
      console.warn(
        `[variables] getVariablesInLibraryCollectionAsync failed for "${collection.name}"`,
      );
      continue;
    }

    for (const lv of libraryVars) {
      let imported: Variable;
      try {
        imported = await figma.variables.importVariableByKeyAsync(lv.key);
      } catch (_e) {
        console.warn(
          `[variables] importVariableByKeyAsync failed for "${lv.name}" (key: ${lv.key})`,
        );
        continue;
      }
      results.push(imported);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Variable resolution — T28.2 canonical pattern
// ---------------------------------------------------------------------------

/**
 * Pre-resolves a Variable against a consumer node's effective variable modes.
 *
 * T28.2 lesson (permanent): Figma's glyph renderer caches the fallback RGB
 * provided to setBoundVariableForPaint.  When that cached RGB differs from
 * the variable's actual resolved value for the consumer node's current mode,
 * the wrong color is rendered until a mode-switch invalidates the cache.
 *
 * `resolveForConsumer(node)` queries the same resolution path Figma's renderer
 * uses, so the returned value is always correct for the consumer's current
 * mode context.
 *
 * Returns the VariableValue (typically an RGB object for COLOR variables).
 * Throws if resolveForConsumer fails — callers should catch and fall back to
 * a safe default or surface LIBRARY_VAR_MISSING to the ui.
 */
export function resolveVariableForConsumer(
  variable: Variable,
  consumerNode: SceneNode,
): VariableValue {
  const resolved = variable.resolveForConsumer(consumerNode);
  return resolved.value;
}

// ---------------------------------------------------------------------------
// setBoundVariableForPaint — canonical write path
// ---------------------------------------------------------------------------

/**
 * Binds `variable` to the `color` field of the paint at `paintIndex` on
 * `node.fills`, using the pre-resolved fallback per T28.2.
 *
 * The `fallbackResolved` argument MUST be the result of
 * `resolveVariableForConsumer(variable, node)` — NOT a hardcoded RGB.
 * The parameter name encodes this contract.
 *
 * Anti-pattern (documented for future readers):
 *   setBoundVariableForPaintSafe(node, 0, variable, { r: 1, g: 0.957, b: 0.918 })
 *   // WRONG: hardcoded fallback causes stale Figma glyph cache
 *
 * Correct usage:
 *   const fallback = resolveVariableForConsumer(variable, node) as RGB;
 *   setBoundVariableForPaintSafe(node, 0, variable, fallback);
 *
 * The paint at `paintIndex` is replaced in-place.  If the node has no fills
 * or `paintIndex` is out of range, the function is a no-op (no throw).
 *
 * Note: `node.fills` must be assigned a new array — Figma paint arrays are
 * immutable.  This function clones the fills array, patches the target paint,
 * and reassigns.
 */
export function setBoundVariableForPaintSafe(
  node: MinimalFillsMixin & BaseNode,
  paintIndex: number,
  variable: Variable,
  fallbackResolved: RGB,
): void {
  const fills = node.fills;
  if (!Array.isArray(fills) || paintIndex < 0 || paintIndex >= fills.length) {
    return;
  }

  const existingPaint = fills[paintIndex];
  if (existingPaint === undefined || existingPaint.type !== 'SOLID') {
    return;
  }

  // Build the new paint with the pre-resolved fallback (T28.2 pattern).
  const basePaint: SolidPaint = {
    type: 'SOLID',
    color: fallbackResolved,
    opacity: existingPaint.opacity,
    visible: existingPaint.visible,
    blendMode: existingPaint.blendMode,
  };

  const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);

  const newFills = fills.slice() as Paint[];
  newFills[paintIndex] = boundPaint;
  node.fills = newFills;
}

// ---------------------------------------------------------------------------
// Promise-cache for named variable pairs (welder-editor pattern)
// ---------------------------------------------------------------------------

/**
 * Promise-cache entry for importVariableByKeyAsync results.
 *
 * Mirrors the pattern from accent-vars.ts: first call starts the async
 * import; subsequent calls reuse the resolved Promise.  Reset to null only
 * on plugin reinitialisation (not exposed; consumers call loadNamedVariables
 * once on init).
 */
export interface NamedVariables {
  [key: string]: Variable | null;
}

/**
 * Load a set of library variables by key into a named record.
 *
 * `keyMap` maps a semantic name to a Figma variable key.  The returned object
 * maps each semantic name to the imported Variable (or null if import failed).
 *
 * Errors per key are logged and do not abort the others.  A null value
 * signals LIBRARY_VAR_MISSING for that variable; callers should check before
 * using and surface the error via the message bus.
 *
 * Example:
 * ```ts
 * const vars = await loadNamedVariables({
 *   text:   'aaeec2f93a38b8a2e3af696972c4313eff529bc7',
 *   dimmer: 'cd3f59ce0c953ee93c4a30b738a96683035b3d72',
 * });
 * // vars.text   → Variable | null
 * // vars.dimmer → Variable | null
 * ```
 */
export async function loadNamedVariables(
  keyMap: Readonly<Record<string, string>>,
): Promise<NamedVariables> {
  const result: NamedVariables = {};
  const keys = Object.keys(keyMap);

  await Promise.all(
    keys.map(async (name) => {
      const key = keyMap[name];
      if (key === undefined) {
        result[name] = null;
        return;
      }
      try {
        result[name] = await figma.variables.importVariableByKeyAsync(key);
      } catch (_e) {
        console.warn(`[variables] importVariableByKeyAsync failed for "${name}" (key: ${key})`);
        result[name] = null;
      }
    }),
  );

  return result;
}
