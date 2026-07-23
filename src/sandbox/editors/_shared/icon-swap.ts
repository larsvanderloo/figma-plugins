// Icon swapping via INSTANCE_SWAP props: Card's `icon` prop lists the full Lucide
// set in preferredValues, seeding a shared name→key cache. An earlier remote-key
// cache + swapComponent-only approach was dropped: INSTANCE_SWAP is session-independent.

import { expandLucideNameVariants } from '../../lucide-aliases';
import { debugLog } from '../../../shared/debug';

/** Normalizes an icon name: 'i-lucide-arrow-down' or 'Icon/arrow-down' → 'arrow-down'. */
export function normalizeIconKey(raw: string): string {
  let k = raw.toLowerCase().trim();
  if (k.indexOf('i-lucide-') === 0) k = k.substring('i-lucide-'.length);
  const slash = k.lastIndexOf('/');
  if (slash >= 0) k = k.substring(slash + 1);
  k = k.replace(/^[^a-z0-9]+/, '');
  return k;
}

/** Digit-only segments must match — canonical Lucide names contain them
 * (`arrow-down-0-1`) and Welder libraries append numeric uniqueness suffixes.
 * Loose single-token matches are safe: the card scan scopes by `Type` VARIANT. */
export const LUCIDE_SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Maps normalized icon name → component key from preferredValues. */
const prefValueCache: Map<string, string> = new Map();

let prefValueBuildPromise: Promise<void> | null = null;

/** Persisted across plugin opens: badge-only decks have no preferredValues to
 * seed the cache from live, so a hydrate from an earlier session is their only source. */
const PREF_VALUE_STORAGE_KEY = 'welder-icon-pref-cache-v1';

let hydratePromise: Promise<void> | null = null;

function startHydrateFromStorage(): Promise<void> {
  if (hydratePromise !== null) return hydratePromise;
  hydratePromise = (async () => {
    const startedAt = Date.now();
    try {
      const raw = await figma.clientStorage.getAsync(PREF_VALUE_STORAGE_KEY);
      if (raw === null || raw === undefined || typeof raw !== 'object') {
        debugLog('perf', 'icon-cache-hydrate', {
          added: 0,
          total: prefValueCache.size,
          totalMs: Date.now() - startedAt,
          source: 'empty',
        });
        return;
      }
      const obj = raw as { [k: string]: unknown };
      const keys = Object.keys(obj);
      let added = 0;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = obj[k];
        if (typeof v !== 'string') continue;
        if (!prefValueCache.has(k)) {
          prefValueCache.set(k, v);
          added++;
        }
      }
      if (added > 0) {
        debugLog(
          'icon-swap',
          'hydrated prefValueCache from clientStorage: ' +
            String(added) +
            ' entries (total ' +
            String(prefValueCache.size) +
          ')',
        );
      }
      debugLog('perf', 'icon-cache-hydrate', {
        added: added,
        storedCount: keys.length,
        total: prefValueCache.size,
        totalMs: Date.now() - startedAt,
        source: 'clientStorage',
      });
    } catch (e) {
      debugLog('perf', 'icon-cache-hydrate', {
        ok: false,
        totalMs: Date.now() - startedAt,
        error: String(e),
      });
      console.log('[icon-swap] hydrate from clientStorage failed: ' + String(e));
    }
  })();
  return hydratePromise;
}

function persistPrefValueCacheToStorage(): void {
  void (async () => {
    const startedAt = Date.now();
    try {
      const serialized: { [k: string]: string } = {};
      prefValueCache.forEach((value, key) => {
        serialized[key] = value;
      });
      await figma.clientStorage.setAsync(PREF_VALUE_STORAGE_KEY, serialized);
      debugLog(
        'icon-swap',
        'persisted prefValueCache to clientStorage: ' +
          String(prefValueCache.size) +
          ' entries',
      );
      debugLog('perf', 'icon-cache-persist', {
        total: prefValueCache.size,
        totalMs: Date.now() - startedAt,
      });
    } catch (e) {
      debugLog('perf', 'icon-cache-persist', {
        ok: false,
        total: prefValueCache.size,
        totalMs: Date.now() - startedAt,
        error: String(e),
      });
      console.log('[icon-swap] persist to clientStorage failed: ' + String(e));
    }
  })();
}

async function buildPrefValueCache(
  entries: ReadonlyArray<{ type: string; key: string }>,
): Promise<void> {
  const startedAt = Date.now();
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
    const r = results[i];
    if (r === null) continue;
    // Register under every Lucide alias variant too: libraries built against an
    // older Lucide may use old alias names (`badge-help`) while the picker emits
    // the canonical name (`badge-question-mark`) — without expansion the lookup misses.
    const variants = expandLucideNameVariants(r.name);
    for (let j = 0; j < variants.length; j++) {
      const variant = variants[j];
      if (!prefValueCache.has(variant)) {
        prefValueCache.set(variant, r.key);
      }
    }
  }
  debugLog('icon-swap', 'prefValueCache built: ' + String(prefValueCache.size) + ' entries');
  debugLog('perf', 'icon-cache-build', {
    preferredCount: entries.length,
    componentCount: components.length,
    total: prefValueCache.size,
    totalMs: Date.now() - startedAt,
  });
  persistPrefValueCacheToStorage();
}

/**
 * For badge icons: a Badge has no INSTANCE_SWAP prop of its own, but its nested
 * Lucide icon instance (in icon_wrapper) can be swapped directly via
 * swapComponent(). Relies on the shared cache primed from Card instances.
 */
export async function swapComponentByName(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  const startedAt = Date.now();
  var target = normalizeIconKey(iconName);
  var waitedForBuild = false;
  var waitedForHydrate = false;

  // Await an in-flight build, or the clientStorage hydrate, so card-less decks
  // can still resolve keys cached in an earlier session.
  if (prefValueBuildPromise !== null) {
    waitedForBuild = true;
    try {
      await prefValueBuildPromise;
    } catch (_e) {}
  }
  if (prefValueCache.size === 0) {
    waitedForHydrate = true;
    await startHydrateFromStorage();
  }

  var cachedKey = prefValueCache.get(target);
  if (cachedKey === undefined) {
    debugLog('icon-swap', 'swapComponentByName: "' + target + '" not in cache');
    debugLog('perf', 'icon-swap-direct', {
      icon: target,
      ok: false,
      cacheHit: false,
      waitedForBuild: waitedForBuild,
      waitedForHydrate: waitedForHydrate,
      totalMs: Date.now() - startedAt,
    });
    return false;
  }

  var comp: ComponentNode;
  try {
    const importStartedAt = Date.now();
    comp = await figma.importComponentByKeyAsync(cachedKey);
    debugLog('perf', 'icon-import', {
      icon: target,
      method: 'direct',
      importMs: Date.now() - importStartedAt,
    });
  } catch (e) {
    console.log('[icon-swap] swapComponentByName: importComponentByKeyAsync failed: ' + String(e));
    debugLog('perf', 'icon-swap-direct', {
      icon: target,
      ok: false,
      cacheHit: true,
      waitedForBuild: waitedForBuild,
      waitedForHydrate: waitedForHydrate,
      totalMs: Date.now() - startedAt,
      error: String(e),
    });
    return false;
  }

  try {
    instance.swapComponent(comp);
    debugLog(
      'icon-swap',
      'swapComponentByName: swapped "' + instance.name + '" → "' + iconName + '"',
    );
    debugLog('perf', 'icon-swap-direct', {
      icon: target,
      ok: true,
      cacheHit: true,
      waitedForBuild: waitedForBuild,
      waitedForHydrate: waitedForHydrate,
      totalMs: Date.now() - startedAt,
    });
    return true;
  } catch (e) {
    console.log('[icon-swap] swapComponentByName: swapComponent failed: ' + String(e));
    debugLog('perf', 'icon-swap-direct', {
      icon: target,
      ok: false,
      cacheHit: true,
      waitedForBuild: waitedForBuild,
      waitedForHydrate: waitedForHydrate,
      totalMs: Date.now() - startedAt,
      error: String(e),
    });
    return false;
  }
}

/** Pre-warm the cache right after slide-load, without swapping. `instance` must
 * expose an INSTANCE_SWAP prop with preferredValues (e.g. a Card). */
export async function primeIconCache(instance: InstanceNode): Promise<void> {
  const startedAt = Date.now();
  // Hydrate in parallel — covers badge-only decks with no Card to prime from;
  // a no-op when storage is empty.
  void startHydrateFromStorage();

  if (prefValueBuildPromise !== null) {
    debugLog('perf', 'icon-cache-prime', {
      instanceId: instance.id,
      instanceName: instance.name,
      reusedBuild: true,
      cacheSize: prefValueCache.size,
      totalMs: Date.now() - startedAt,
    });
    return prefValueBuildPromise;
  }

  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (e) {
    debugLog('perf', 'icon-cache-prime', {
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'main-component-error',
      totalMs: Date.now() - startedAt,
      error: String(e),
    });
    return;
  }
  if (main === null) {
    debugLog('perf', 'icon-cache-prime', {
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'main-component-null',
      totalMs: Date.now() - startedAt,
    });
    return;
  }

  let owner: ComponentNode | ComponentSetNode;
  if (main.parent !== null && main.parent.type === 'COMPONENT_SET') {
    owner = main.parent as ComponentSetNode;
  } else {
    let fresh: ComponentNode | null = null;
    try {
      fresh = await figma.importComponentByKeyAsync(main.key);
    } catch (e) {
      /* ignore */
    }
    if (fresh !== null && fresh.parent !== null && fresh.parent.type === 'COMPONENT_SET') {
      owner = fresh.parent as ComponentSetNode;
    } else {
      owner = main;
    }
  }

  const defs = owner.componentPropertyDefinitions;
  if (defs === null || defs === undefined) {
    debugLog('perf', 'icon-cache-prime', {
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'no-property-definitions',
      totalMs: Date.now() - startedAt,
    });
    return;
  }

  const defKeys = Object.keys(defs);
  for (let i = 0; i < defKeys.length; i++) {
    const def = defs[defKeys[i]];
    if (def.type !== 'INSTANCE_SWAP') continue;
    const preferred = def.preferredValues;
    if (preferred === null || preferred === undefined || preferred.length === 0) continue;

    debugLog(
      'icon-swap',
      'primeIconCache: starting background build (' +
        String(preferred.length) +
        ' entries)',
    );
    prefValueBuildPromise = buildPrefValueCache(preferred);
    debugLog('perf', 'icon-cache-prime', {
      instanceId: instance.id,
      instanceName: instance.name,
      ok: true,
      preferredCount: preferred.length,
      totalMs: Date.now() - startedAt,
    });
    return prefValueBuildPromise;
  }
  debugLog('perf', 'icon-cache-prime', {
    instanceId: instance.id,
    instanceName: instance.name,
    ok: false,
    reason: 'no-instance-swap-preferred-values',
    totalMs: Date.now() - startedAt,
  });
}

export async function trySwapViaInstanceProperty(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  const startedAt = Date.now();
  const target = normalizeIconKey(iconName);
  let waitedForBuild = false;
  let waitedForHydrate = false;
  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (e) {
    console.log(
      '[icon-swap] getMainComponentAsync failed for "' + instance.name + '": ' + String(e),
    );
    debugLog('perf', 'icon-swap-instance-property', {
      icon: target,
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'main-component-error',
      totalMs: Date.now() - startedAt,
      error: String(e),
    });
    return false;
  }
  if (main === null) {
    debugLog('icon-swap', 'getMainComponentAsync → null for "' + instance.name + '"');
    debugLog('perf', 'icon-swap-instance-property', {
      icon: target,
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'main-component-null',
      totalMs: Date.now() - startedAt,
    });
    return false;
  }
  debugLog(
    'icon-swap',
    'getMainComponentAsync → name: ' +
      main.name +
      ', key: ' +
      main.key +
      ', remote: ' +
      String(main.remote),
  );

  // In dynamic-page mode main.parent can be null; a fresh
  // importComponentByKeyAsync can return the component with its parent populated.
  let owner: ComponentNode | ComponentSetNode;
  if (main.parent !== null && main.parent.type === 'COMPONENT_SET') {
    owner = main.parent as ComponentSetNode;
  } else {
    let freshMain: ComponentNode | null = null;
    try {
      freshMain = await figma.importComponentByKeyAsync(main.key);
    } catch (e) {
      console.log('[icon-swap] fresh importComponentByKeyAsync failed: ' + String(e));
    }
    if (
      freshMain !== null &&
      freshMain.parent !== null &&
      freshMain.parent.type === 'COMPONENT_SET'
    ) {
      owner = freshMain.parent as ComponentSetNode;
      debugLog('icon-swap', 'owner resolved via fresh import: ' + owner.name);
    } else {
      owner = main;
    }
  }

  const ownerDefs = owner.componentPropertyDefinitions;
  const ownerDefKeys = ownerDefs !== null && ownerDefs !== undefined ? Object.keys(ownerDefs) : [];
  debugLog(
    'icon-swap',
    'owner type: ' +
      owner.type +
      ', name: ' +
      owner.name +
      ', propDef keys: [' +
      ownerDefKeys.join(', ') +
      ']',
  );

  const defs = ownerDefs;
  if (defs === null || defs === undefined) {
    debugLog('perf', 'icon-swap-instance-property', {
      icon: target,
      instanceId: instance.id,
      instanceName: instance.name,
      ok: false,
      reason: 'no-property-definitions',
      totalMs: Date.now() - startedAt,
    });
    return false;
  }

  const keys = Object.keys(defs);
  let foundInstanceSwap = false;
  for (let i = 0; i < keys.length; i++) {
    const propKey = keys[i];
    const def = defs[propKey];
    if (def.type !== 'INSTANCE_SWAP') continue;
    foundInstanceSwap = true;

    const preferred = def.preferredValues;
    const hasPreferred =
      preferred !== null && preferred !== undefined && preferred.length > 0;
    debugLog(
      'icon-swap',
      'checking INSTANCE_SWAP prop "' +
        propKey +
        '" on "' +
        owner.name +
        '": ' +
        (hasPreferred ? String(preferred!.length) + ' preferredValues' : 'no preferredValues — will reuse shared cache'),
    );

    // Only a prop with its own preferredValues can seed the cache; empty props
    // (e.g. Badge.Instance) rely on the shared cache from an earlier Card swap.
    if (hasPreferred && prefValueBuildPromise === null) {
      debugLog(
        'icon-swap',
        'starting background prefValueCache build (' +
          String(preferred!.length) +
          ' entries)',
      );
      prefValueBuildPromise = buildPrefValueCache(preferred!);
      // Deliberately not awaited — the lookup below runs during the build.
    }

    // On a miss, await any in-flight build before giving up; if the cache is
    // still empty (card-less deck, no live build) await the storage hydrate.
    let cachedKey = prefValueCache.get(target);
    if (cachedKey === undefined && prefValueBuildPromise !== null) {
      debugLog('icon-swap', 'cache miss for "' + target + '" — awaiting in-flight build');
      waitedForBuild = true;
      try {
        await prefValueBuildPromise;
      } catch (_e) {
        /* build error already logged */
      }
      cachedKey = prefValueCache.get(target);
    }
    if (cachedKey === undefined && prefValueCache.size === 0) {
      debugLog('icon-swap', 'cache empty — awaiting clientStorage hydrate');
      waitedForHydrate = true;
      await startHydrateFromStorage();
      cachedKey = prefValueCache.get(target);
    }

    if (cachedKey === undefined) {
      // With own preferredValues this is a definitive miss — all props share one
      // cache. Without them, a later prop that carries a list may still seed it.
      if (hasPreferred) {
        debugLog(
          'icon-swap',
          '"' +
            iconName +
            '" (normalized: "' +
            target +
            '") not in preferredValues of prop "' +
            propKey +
            '" on "' +
            owner.name +
            '"',
        );
        debugLog('perf', 'icon-swap-instance-property', {
          icon: target,
          instanceId: instance.id,
          instanceName: instance.name,
          ok: false,
          reason: 'cache-miss',
          cacheHit: false,
          waitedForBuild: waitedForBuild,
          waitedForHydrate: waitedForHydrate,
          totalMs: Date.now() - startedAt,
        });
        return false;
      }
      debugLog(
        'icon-swap',
        'prop "' +
          propKey +
          '" has no preferredValues and shared cache lacks "' +
          target +
          '"; trying next INSTANCE_SWAP prop if any',
      );
      continue;
    }

    debugLog('icon-swap', 'cache hit for "' + target + '" → key: ' + cachedKey);

    let imported: ComponentNode;
    let importMs = 0;
    try {
      const importStartedAt = Date.now();
      imported = await figma.importComponentByKeyAsync(cachedKey);
      importMs = Date.now() - importStartedAt;
      debugLog('perf', 'icon-import', {
        icon: target,
        method: 'instance-property',
        importMs: importMs,
      });
    } catch (e) {
      console.log(
        '[icon-swap] importComponentByKeyAsync failed for cached key "' +
          cachedKey +
          '": ' +
          String(e),
      );
      debugLog('perf', 'icon-swap-instance-property', {
        icon: target,
        instanceId: instance.id,
        instanceName: instance.name,
        ok: false,
        reason: 'import-error',
        cacheHit: true,
        waitedForBuild: waitedForBuild,
        waitedForHydrate: waitedForHydrate,
        totalMs: Date.now() - startedAt,
        error: String(e),
      });
      return false;
    }

    const patch: { [k: string]: string } = {};
    patch[propKey] = imported.id;
    try {
      instance.setProperties(patch);
      debugLog(
        'icon-swap',
        'icon swapped → ' + iconName + ' (via INSTANCE_SWAP prop "' + propKey + '")',
      );
      debugLog('perf', 'icon-swap-instance-property', {
        icon: target,
        instanceId: instance.id,
        instanceName: instance.name,
        ok: true,
        cacheHit: true,
        waitedForBuild: waitedForBuild,
        waitedForHydrate: waitedForHydrate,
        importMs: importMs,
        totalMs: Date.now() - startedAt,
      });
      return true;
    } catch (e) {
      console.log(
        '[icon-swap] setProperties failed for "' +
          iconName +
          '" on prop "' +
          propKey +
          '": ' +
          String(e),
      );
      debugLog('perf', 'icon-swap-instance-property', {
        icon: target,
        instanceId: instance.id,
        instanceName: instance.name,
        ok: false,
        reason: 'set-properties-error',
        cacheHit: true,
        waitedForBuild: waitedForBuild,
        waitedForHydrate: waitedForHydrate,
        importMs: importMs,
        totalMs: Date.now() - startedAt,
        error: String(e),
      });
      return false;
    }
  }

  if (!foundInstanceSwap) {
    debugLog('icon-swap', "no INSTANCE_SWAP prop found on instance '" + instance.name + "'");
  }

  debugLog('perf', 'icon-swap-instance-property', {
    icon: target,
    instanceId: instance.id,
    instanceName: instance.name,
    ok: false,
    reason: foundInstanceSwap ? 'cache-miss' : 'no-instance-swap-property',
    cacheHit: false,
    waitedForBuild: waitedForBuild,
    waitedForHydrate: waitedForHydrate,
    totalMs: Date.now() - startedAt,
  });
  return false;
}
