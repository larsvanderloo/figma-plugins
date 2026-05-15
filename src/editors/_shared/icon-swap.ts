// ============================================================
// editors/_shared/icon-swap.ts
//
// Gedeeld hulpmodule voor icon-swapping via INSTANCE_SWAP
// component-properties (preferredValues + setProperties).
//
// Rationale: Slide Machine's Card en Badge componenten hebben een
// `icon`-property van type INSTANCE_SWAP met `preferredValues`
// gevuld voor de volledige Lucide-set. De juiste Figma API is:
//
//   defs    = main.componentPropertyDefinitions[propKey]
//   for entry in defs.preferredValues:
//     comp  = await figma.importComponentByKeyAsync(entry.key)
//     match = normalizeIconKey(comp.name) === normalizeIconKey(iconName)
//     if match: instance.setProperties({ [propKey]: comp.id })
//
// De eerdere remote-key-cache + swapComponent-aanpak werd gedropt —
// INSTANCE_SWAP is de gedocumenteerde route voor library-driven
// icon-variants en is session-onafhankelijk.
//
// Publieke API:
//   normalizeIconKey(raw)                   — strip prefix/pad-ruis, lowercase.
//   LUCIDE_SLUG_RE                          — patroon voor geldige Lucide-slugs.
//   trySwapViaInstanceProperty(inst, name)  — swap via INSTANCE_SWAP prop.
//
// Performance:
//   prefValueCache  — module-level Map<normalizedName, componentKey>.
//                     Gebouwd in de achtergrond bij eerste swap-aanroep.
//                     Volgende swaps voor gecachede icons kosten slechts
//                     één importComponentByKeyAsync-call in plaats van N.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// FIG-GUARD-01: type-checks vóór property-access.
// ============================================================

import { expandLucideNameVariants } from '../../lucide-aliases';

// ============================================================
// Name normalisation
// ============================================================

/**
 * Normaliseert een icon-naam naar lowercase zonder prefix/pad-ruis.
 * Accepteert 'i-lucide-arrow-down', 'Icon/arrow-down', 'Arrow Down'
 * en geeft 'arrow-down' terug.
 */
export function normalizeIconKey(raw: string): string {
  let k = raw.toLowerCase().trim();
  // Strip 'i-lucide-' prefix
  if (k.indexOf('i-lucide-') === 0) k = k.substring('i-lucide-'.length);
  // Strip pad-prefix ('icon/heart' → 'heart')
  const slash = k.lastIndexOf('/');
  if (slash >= 0) k = k.substring(slash + 1);
  // Strip leading non-alphanumeric characters
  k = k.replace(/^[^a-z0-9]+/, '');
  return k;
}

/**
 * Lucide-component pattern: starts with a lowercase letter, then any
 * mix of letters, digits, and hyphens. Subsequent segments after a
 * hyphen are allowed to be digit-only — required because:
 *   - Canonical Lucide names include digit-only segments (e.g.
 *     `arrow-down-0-1`, `bar-chart-3`) — the previous regex rejected
 *     these and the icon picker missed them.
 *   - Welder libraries sometimes name an icon component with a
 *     numeric uniqueness suffix (e.g. `align-horizontal-space-around-68`).
 *     The previous regex rejected those too, so Stack Icon cards
 *     showed an empty picker.
 *
 * Single-token names (e.g. `imagewrap`) still match — but the card
 * scan now uses the `Type` VARIANT to scope which picker is relevant,
 * so an `ImageWrap` instance never reaches readCardIcon on an Image
 * card.
 */
export const LUCIDE_SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// ============================================================
// Module-level name→key cache
// ============================================================

/** Maps normalized icon name → component key from preferredValues. */
const prefValueCache: Map<string, string> = new Map();

/** Background build promise — started on first trySwapViaInstanceProperty call. */
let prefValueBuildPromise: Promise<void> | null = null;

/**
 * clientStorage-key for persisting the cache across plugin opens. Without
 * this, decks that have ONLY a Badge (no Card on the page) can never prime
 * the cache live — the Badge's INSTANCE_SWAP prop has no preferredValues
 * to seed from. Persisting keeps the cache populated as long as the user
 * has opened ANY deck with cards in their session history.
 */
const PREF_VALUE_STORAGE_KEY = 'welder-icon-pref-cache-v1';

/**
 * One-shot hydrate from clientStorage. Started lazily by `primeIconCache`
 * and `swapComponentByName` / `trySwapViaInstanceProperty` so a swap on a
 * card-less page can still find a cached lucide key.
 */
let hydratePromise: Promise<void> | null = null;

function startHydrateFromStorage(): Promise<void> {
  if (hydratePromise !== null) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await figma.clientStorage.getAsync(PREF_VALUE_STORAGE_KEY);
      if (raw === null || raw === undefined || typeof raw !== 'object') return;
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
        console.log(
          '[icon-swap] hydrated prefValueCache from clientStorage: ' +
            String(added) +
            ' entries (total ' +
            String(prefValueCache.size) +
            ')',
        );
      }
    } catch (e) {
      console.log('[icon-swap] hydrate from clientStorage failed: ' + String(e));
    }
  })();
  return hydratePromise;
}

/**
 * Persist the current cache to clientStorage. Fire-and-forget; failures
 * are logged but don't block. Called at the end of `buildPrefValueCache`
 * so the next open of a card-less deck has something to load.
 */
function persistPrefValueCacheToStorage(): void {
  void (async () => {
    try {
      const serialized: { [k: string]: string } = {};
      prefValueCache.forEach((value, key) => {
        serialized[key] = value;
      });
      await figma.clientStorage.setAsync(PREF_VALUE_STORAGE_KEY, serialized);
      console.log(
        '[icon-swap] persisted prefValueCache to clientStorage: ' +
          String(prefValueCache.size) +
          ' entries',
      );
    } catch (e) {
      console.log('[icon-swap] persist to clientStorage failed: ' + String(e));
    }
  })();
}

/**
 * Bouwt `prefValueCache` door alle COMPONENT-entries in `entries` te
 * importeren en hun genormaliseerde naam als cache-sleutel op te slaan.
 * Runt in de achtergrond; errors per entry worden geskipt (continue).
 */
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
    const r = results[i];
    if (r === null) continue;
    // Register the component under its own normalized name AND under
    // every Lucide alias variant. Welder libraries built against an
    // older Lucide version may name their components after old aliases
    // (e.g. `badge-help`); the picker emits the current canonical name
    // (`badge-question-mark`). Without alias expansion the lookup
    // would silently miss. See lucide-aliases.ts for the source data.
    const variants = expandLucideNameVariants(r.name);
    for (let j = 0; j < variants.length; j++) {
      const variant = variants[j];
      if (!prefValueCache.has(variant)) {
        prefValueCache.set(variant, r.key);
      }
    }
  }
  console.log('[icon-swap] prefValueCache built: ' + String(prefValueCache.size) + ' entries');
  // Persist to clientStorage so future plugin opens — even on decks
  // without a Card to prime from — can hydrate the cache.
  persistPrefValueCacheToStorage();
}

// ============================================================
// swapComponentByName — direct swapComponent via prefValueCache
// ============================================================

/**
 * Vervangt het component van `instance` met het Lucide-component dat
 * overeenkomt met `iconName`, via de module-level `prefValueCache`.
 * Retourneert true bij succes.
 *
 * Bedoeld voor badge-icons: de badge heeft geen INSTANCE_SWAP-property
 * op zichzelf, maar WEL een genest Lucide-icon-INSTANCE (in icon_wrapper)
 * dat direct geswapt kan worden via swapComponent(). De cache wordt
 * gevuld door primeIconCache() die al vanuit Card-instances loopt.
 */
export async function swapComponentByName(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  var target = normalizeIconKey(iconName);

  // Wacht op lopende cache-build (van eerder gestart Card-prime) of
  // op clientStorage-hydrate zodat ook decks zonder Card op de page
  // de Lucide-keys uit een eerdere sessie kunnen vinden.
  if (prefValueBuildPromise !== null) {
    try {
      await prefValueBuildPromise;
    } catch (_e) {}
  }
  if (prefValueCache.size === 0) {
    await startHydrateFromStorage();
  }

  var cachedKey = prefValueCache.get(target);
  if (cachedKey === undefined) {
    console.log('[icon-swap] swapComponentByName: "' + target + '" not in cache');
    return false;
  }

  var comp: ComponentNode;
  try {
    comp = await figma.importComponentByKeyAsync(cachedKey);
  } catch (e) {
    console.log('[icon-swap] swapComponentByName: importComponentByKeyAsync failed: ' + String(e));
    return false;
  }

  try {
    instance.swapComponent(comp);
    console.log(
      '[icon-swap] swapComponentByName: swapped "' + instance.name + '" → "' + iconName + '"',
    );
    return true;
  } catch (e) {
    console.log('[icon-swap] swapComponentByName: swapComponent failed: ' + String(e));
    return false;
  }
}

// ============================================================
// Pre-warming — start cache-build zonder een swap te doen
// ============================================================

/**
 * Start de `prefValueCache`-build in de achtergrond zonder een swap te doen.
 * Bedoeld voor pre-warming direct na slide-load. Retourneert de build-promise
 * (of een direct-resolved promise als de build al loopt/klaar is).
 *
 * @param instance — een InstanceNode met een INSTANCE_SWAP-property (bv. een Card).
 */
export async function primeIconCache(instance: InstanceNode): Promise<void> {
  // Always kick off the clientStorage hydrate in parallel — covers the
  // "deck has only badges, no card to prime from" path. Hydrate is a
  // no-op when storage is empty (first-ever open).
  void startHydrateFromStorage();

  // Already building or done — nothing to do.
  if (prefValueBuildPromise !== null) {
    return prefValueBuildPromise;
  }

  // Resolve the owner's componentPropertyDefinitions.
  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (e) {
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
  if (defs === null || defs === undefined) return;

  const defKeys = Object.keys(defs);
  for (let i = 0; i < defKeys.length; i++) {
    const def = defs[defKeys[i]];
    if (def.type !== 'INSTANCE_SWAP') continue;
    const preferred = def.preferredValues;
    if (preferred === null || preferred === undefined || preferred.length === 0) continue;

    // Start the background build and return the promise.
    console.log(
      '[icon-swap] primeIconCache: starting background build (' +
        String(preferred.length) +
        ' entries)',
    );
    prefValueBuildPromise = buildPrefValueCache(preferred);
    return prefValueBuildPromise;
  }
}

// ============================================================
// INSTANCE_SWAP-property swap
// ============================================================

/**
 * Probeert een INSTANCE_SWAP-property op `instance` te swappen naar
 * het component dat matcht met `iconName` via `preferredValues`.
 * Retourneert true bij succes, false bij miss/fout.
 *
 * Strategie:
 *   1. getMainComponentAsync → main
 *   2. owner = main.parent (COMPONENT_SET) OR main zelf
 *   3. defs = owner.componentPropertyDefinitions
 *   4. Zoek eerste key met def.type === 'INSTANCE_SWAP'
 *   5. Start cache-build in achtergrond op eerste aanroep
 *   6. Cache-lookup: hit → directe import; miss → wacht op build, dan opnieuw
 *   7. Bij match: instance.setProperties({ [propKey]: comp.id })
 *
 * @param instance  — de INSTANCE-node met de INSTANCE_SWAP-property.
 * @param iconName  — de gewenste icon-naam (wordt genormaliseerd).
 */
export async function trySwapViaInstanceProperty(
  instance: InstanceNode,
  iconName: string,
): Promise<boolean> {
  // Stap 1: haal mainComponent op.
  let main: ComponentNode | null;
  try {
    main = await instance.getMainComponentAsync();
  } catch (e) {
    console.log(
      '[icon-swap] getMainComponentAsync failed for "' + instance.name + '": ' + String(e),
    );
    return false;
  }
  if (main === null) {
    console.log('[icon-swap] getMainComponentAsync → null for "' + instance.name + '"');
    return false;
  }
  console.log(
    '[icon-swap] getMainComponentAsync → name: ' +
      main.name +
      ', key: ' +
      main.key +
      ', remote: ' +
      String(main.remote),
  );

  // Stap 2: bepaal de owner (COMPONENT_SET als parent een variant-set is).
  // In dynamic-page mode kan main.parent null zijn; we proberen dan het
  // component opnieuw te importeren via importComponentByKeyAsync om een
  // locale instantie te krijgen met eventueel een ingevulde parent.
  let owner: ComponentNode | ComponentSetNode;
  if (main.parent !== null && main.parent.type === 'COMPONENT_SET') {
    owner = main.parent as ComponentSetNode;
  } else {
    // main.parent is null of geen COMPONENT_SET — probeer fresh import.
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
      console.log('[icon-swap] owner resolved via fresh import: ' + owner.name);
    } else {
      // Laatste fallback: gebruik main zelf als owner.
      owner = main;
    }
  }

  const ownerDefs = owner.componentPropertyDefinitions;
  const ownerDefKeys = ownerDefs !== null && ownerDefs !== undefined ? Object.keys(ownerDefs) : [];
  console.log(
    '[icon-swap] owner type: ' +
      owner.type +
      ', name: ' +
      owner.name +
      ', propDef keys: [' +
      ownerDefKeys.join(', ') +
      ']',
  );

  // Stap 3: property-definitions uitlezen.
  const defs = ownerDefs;
  if (defs === null || defs === undefined) return false;

  // Stap 4: zoek de eerste INSTANCE_SWAP-property.
  const target = normalizeIconKey(iconName);
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
    console.log(
      '[icon-swap] checking INSTANCE_SWAP prop "' +
        propKey +
        '" on "' +
        owner.name +
        '": ' +
        (hasPreferred ? String(preferred!.length) + ' preferredValues' : 'no preferredValues — will reuse shared cache'),
    );

    // Stap 5: start cache-build in achtergrond op eerste aanroep — ALLEEN
    // wanneer deze prop eigen preferredValues heeft. Props met 0 entries
    // (bv. Slide Machine's Badge.Instance — gebruiker swapt via Figma UI
    // picker) kunnen de cache niet zelf zaaien; ze leunen op een eerdere
    // Card-swap die de gedeelde prefValueCache al populated heeft.
    if (hasPreferred && prefValueBuildPromise === null) {
      console.log(
        '[icon-swap] starting background prefValueCache build (' +
          String(preferred!.length) +
          ' entries)',
      );
      prefValueBuildPromise = buildPrefValueCache(preferred!);
      // Don't await — runs in background while we do the lookup below.
    }

    // Stap 6: cache-lookup. Als er een build loopt (van eerdere swap of
    // van deze call), await hem voordat we opgeven. Voor decks zonder
    // Card op de page is er geen live build maar mogelijk wel een
    // clientStorage-hydrate met keys uit eerdere sessies — die awaiten
    // we hier als de cache leeg is.
    let cachedKey = prefValueCache.get(target);
    if (cachedKey === undefined && prefValueBuildPromise !== null) {
      console.log('[icon-swap] cache miss for "' + target + '" — awaiting in-flight build');
      try {
        await prefValueBuildPromise;
      } catch (_e) {
        /* silent — build error already logged */
      }
      cachedKey = prefValueCache.get(target);
    }
    if (cachedKey === undefined && prefValueCache.size === 0) {
      console.log('[icon-swap] cache empty — awaiting clientStorage hydrate');
      await startHydrateFromStorage();
      cachedKey = prefValueCache.get(target);
    }

    if (cachedKey === undefined) {
      // Cache miss na await. Als deze prop eigen preferredValues had,
      // is dit een echte miss — andere INSTANCE_SWAP-props zouden dezelfde
      // cache gebruiken, dus geen reden om door te lopen. Als deze prop
      // geen eigen preferredValues had, zou een latere prop met wél een
      // gevulde lijst alsnog kunnen werken — `continue` naar volgende.
      if (hasPreferred) {
        console.log(
          '[icon-swap] "' +
            iconName +
            '" (normalized: "' +
            target +
            '") not in preferredValues of prop "' +
            propKey +
            '" on "' +
            owner.name +
            '"',
        );
        return false;
      }
      console.log(
        '[icon-swap] prop "' +
          propKey +
          '" has no preferredValues and shared cache lacks "' +
          target +
          '"; trying next INSTANCE_SWAP prop if any',
      );
      continue;
    }

    console.log('[icon-swap] cache hit for "' + target + '" → key: ' + cachedKey);

    // Stap 7: import via gecachede key en swap.
    let imported: ComponentNode;
    try {
      imported = await figma.importComponentByKeyAsync(cachedKey);
    } catch (e) {
      console.log(
        '[icon-swap] importComponentByKeyAsync failed for cached key "' +
          cachedKey +
          '": ' +
          String(e),
      );
      return false;
    }

    // Match — setProperties.
    const patch: { [k: string]: string } = {};
    patch[propKey] = imported.id;
    try {
      instance.setProperties(patch);
      console.log(
        '[icon-swap] icon swapped → ' + iconName + ' (via INSTANCE_SWAP prop "' + propKey + '")',
      );
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
      return false;
    }
  }

  if (!foundInstanceSwap) {
    console.log("[icon-swap] no INSTANCE_SWAP prop found on instance '" + instance.name + "'");
  }

  // Geen INSTANCE_SWAP-property gevonden.
  return false;
}
