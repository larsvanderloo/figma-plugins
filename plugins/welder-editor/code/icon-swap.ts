// code/icon-swap.ts — Icon swap helpers for Badge, Card, and Journey wrappers.
//
// Port of welder-slide-editor/widget-src/editors/shared/icon-swap.ts.
//
// Public API:
//   normalizeIconKey(raw)                   — strip prefix/noise, lowercase.
//   LUCIDE_SLUG_RE                          — pattern for valid Lucide slugs.
//   trySwapViaInstanceProperty(inst, name)  — swap via INSTANCE_SWAP property.
//   swapComponentByName(inst, name)         — swap via prefValueCache.
//   primeIconCache(instance)               — background cache warm-up.
//
// The prefValueCache (module-level Map<normalizedName, componentKey>) is built
// on first trySwapViaInstanceProperty call and reused for subsequent swaps.
// This avoids N importComponentByKeyAsync calls when the user edits multiple
// icons in sequence.
//
// Wave 1 wrapper note: swapInstanceComponent from packages/figma-api/src/mutate.ts
// covers the simple component-swap path but does NOT handle the INSTANCE_SWAP
// preferredValues pattern required by the Slide Machine library. That pattern
// (inspect componentPropertyDefinitions, match by normalized name, setProperties)
// is implemented here and is the canonical approach for library-driven icons.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a raw icon name to a lowercase Lucide slug.
 * Accepts: 'i-lucide-arrow-down', 'Icon/arrow-down', 'Arrow Down', 'arrow-down'.
 * Returns: 'arrow-down'.
 */
export function normalizeIconKey(raw: string): string {
  let k = raw.toLowerCase().trim();
  if (k.indexOf('i-lucide-') === 0) k = k.substring('i-lucide-'.length);
  const slash = k.lastIndexOf('/');
  if (slash >= 0) k = k.substring(slash + 1);
  k = k.replace(/^[^a-z0-9]+/, '');
  return k;
}

/** Pattern for a valid Lucide slug: lowercase words separated by hyphens. */
export const LUCIDE_SLUG_RE = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;

// ---------------------------------------------------------------------------
// Module-level name→key cache
// ---------------------------------------------------------------------------

/** Maps normalised icon name → component key from preferredValues. */
const prefValueCache: Map<string, string> = new Map();

/** Background build promise — started on first trySwapViaInstanceProperty call. */
let prefValueBuildPromise: Promise<void> | null = null;

async function buildPrefValueCache(
  entries: ReadonlyArray<{ type: string; key: string }>,
): Promise<void> {
  const components = entries.filter(function (e) {
    return e.type === 'COMPONENT';
  });
  const results = await Promise.all(
    components.map(function (entry) {
      return figma.importComponentByKeyAsync(entry.key).then(
        function (comp) {
          return { name: normalizeIconKey(comp.name), key: entry.key };
        },
        function (_e) {
          return null;
        },
      );
    }),
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i] ?? null;
    if (r !== null && !prefValueCache.has(r.name)) {
      prefValueCache.set(r.name, r.key);
    }
  }
}

// ---------------------------------------------------------------------------
// swapComponentByName — swap via prefValueCache
// ---------------------------------------------------------------------------

/**
 * Swaps the component of instance to the Lucide component matching iconName
 * using the module-level prefValueCache. Returns true on success.
 *
 * Used for badge and card icons where the instance has no INSTANCE_SWAP
 * property but has a nested Lucide INSTANCE child that can be swapped directly.
 */
export async function swapComponentByName(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  const target = normalizeIconKey(iconName);

  if (prefValueBuildPromise !== null) {
    try {
      await prefValueBuildPromise;
    } catch (_e) {
      // ignore
    }
  }

  const cachedKey = prefValueCache.get(target);
  if (cachedKey === undefined) return false;

  let comp: ComponentNode;
  try {
    comp = await figma.importComponentByKeyAsync(cachedKey);
  } catch (_e) {
    return false;
  }

  try {
    instance.swapComponent(comp);
    return true;
  } catch (_e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// primeIconCache — background warm-up (called after slide-load)
// ---------------------------------------------------------------------------

/**
 * Starts the prefValueCache build in the background without performing a swap.
 * Call with a Card or Badge instance that has an INSTANCE_SWAP property.
 * Returns the build promise (or immediately resolved if already running/done).
 */
export async function primeIconCache(instance: InstanceNode): Promise<void> {
  if (prefValueBuildPromise !== null) return prefValueBuildPromise;

  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (_e) {
    return;
  }
  if (main === null) return;

  let owner: ComponentNode | ComponentSetNode;
  if (main.parent !== null && main.parent.type === 'COMPONENT_SET') {
    owner = main.parent as ComponentSetNode;
  } else {
    let fresh: ComponentNode | null = null;
    try {
      fresh = await figma.importComponentByKeyAsync(main.key);
    } catch (_e) {
      // ignore
    }
    if (fresh !== null && fresh.parent !== null && fresh.parent.type === 'COMPONENT_SET') {
      owner = fresh.parent as ComponentSetNode;
    } else {
      owner = main;
    }
  }

  const defs = owner.componentPropertyDefinitions;
  if (defs === null || defs === undefined) return;

  const defKeys = Object.keys(defs);
  for (let i = 0; i < defKeys.length; i++) {
    const defKey = defKeys[i];
    if (defKey === undefined) continue;
    const def = defs[defKey];
    if (def === undefined || def.type !== 'INSTANCE_SWAP') continue;
    const preferred = def.preferredValues;
    if (preferred === null || preferred === undefined || preferred.length === 0) continue;
    prefValueBuildPromise = buildPrefValueCache(preferred);
    return prefValueBuildPromise;
  }
}

// ---------------------------------------------------------------------------
// trySwapViaInstanceProperty — primary INSTANCE_SWAP swap path
// ---------------------------------------------------------------------------

/**
 * Attempts to swap an INSTANCE_SWAP property on instance to the component
 * matching iconName via preferredValues.
 *
 * Strategy:
 *   1. getMainComponentAsync → main component.
 *   2. owner = main.parent (COMPONENT_SET) or re-import to get fresh parent.
 *   3. Iterate componentPropertyDefinitions for INSTANCE_SWAP keys.
 *   4. Start cache build on first call (background; does not block this swap).
 *   5. Cache lookup: hit → import by key; miss → wait for build, retry.
 *   6. On match: instance.setProperties({ [propKey]: comp.id }).
 *
 * Returns true if any strategy succeeded.
 */
export async function trySwapViaInstanceProperty(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (_e) {
    return false;
  }
  if (main === null) return false;

  // Resolve owner.
  let owner: ComponentNode | ComponentSetNode;
  if (main.parent !== null && main.parent.type === 'COMPONENT_SET') {
    owner = main.parent as ComponentSetNode;
  } else {
    let freshMain: ComponentNode | null = null;
    try {
      freshMain = await figma.importComponentByKeyAsync(main.key);
    } catch (_e) {
      // ignore
    }
    if (
      freshMain !== null &&
      freshMain.parent !== null &&
      freshMain.parent.type === 'COMPONENT_SET'
    ) {
      owner = freshMain.parent as ComponentSetNode;
    } else {
      owner = main;
    }
  }

  const ownerDefs = owner.componentPropertyDefinitions;
  if (ownerDefs === null || ownerDefs === undefined) return false;

  const target = normalizeIconKey(iconName);

  const defKeys = Object.keys(ownerDefs);
  for (let di = 0; di < defKeys.length; di++) {
    const propKey = defKeys[di];
    if (propKey === undefined) continue;
    const def = ownerDefs[propKey];
    if (def === undefined || def.type !== 'INSTANCE_SWAP') continue;

    const preferred = def.preferredValues;
    if (preferred === null || preferred === undefined || preferred.length === 0) continue;

    // Start background cache build if not started.
    if (prefValueBuildPromise === null) {
      prefValueBuildPromise = buildPrefValueCache(preferred);
    }

    // Try cache first.
    let cachedKey = prefValueCache.get(target);

    // Cache miss — wait for build and retry.
    if (cachedKey === undefined && prefValueBuildPromise !== null) {
      try {
        await prefValueBuildPromise;
      } catch (_e) {
        // ignore
      }
      cachedKey = prefValueCache.get(target);
    }

    if (cachedKey !== undefined) {
      let comp: ComponentNode;
      try {
        comp = await figma.importComponentByKeyAsync(cachedKey);
      } catch (_e) {
        continue;
      }
      try {
        instance.setProperties({ [propKey]: comp.id });
        return true;
      } catch (_e) {
        // try next property
      }
    } else {
      // Cache still doesn't have the icon — scan preferredValues sequentially.
      for (let pi = 0; pi < preferred.length; pi++) {
        const entry = preferred[pi]!;
        if (entry.type !== 'COMPONENT') continue;
        let comp: ComponentNode;
        try {
          comp = await figma.importComponentByKeyAsync(entry.key);
        } catch (_e) {
          continue;
        }
        if (normalizeIconKey(comp.name) !== target) continue;
        try {
          instance.setProperties({ [propKey]: comp.id });
          return true;
        } catch (_e) {
          // try next
        }
      }
    }
  }

  return false;
}
