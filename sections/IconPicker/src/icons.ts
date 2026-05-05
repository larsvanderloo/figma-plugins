// sections/IconPicker/src/icons.ts
//
// On-demand Lucide icon manifest loader.
//
// ADR-0003 §1 mandates that icon data must NOT be bundled in the initial ui
// chunk. This module implements the lazy-load strategy:
//
//   1. The curated subset JSON (lucide-subset.json) is dynamic-imported on
//      the first call to `loadIconManifest()`.
//   2. `addCollection()` from @iconify/vue registers the icons into the
//      Iconify runtime registry — no network request, no bundled SVG data in
//      the initial chunk.
//   3. Subsequent calls are no-ops (the promise is cached).
//   4. `ICON_KEYS` is the static list of icon names in the subset — derived at
//      module-evaluation time from the JSON so that the type system and tests
//      can reference it without importing the JSON eagerly at runtime.
//
// Bundle impact:
//   - lucide-subset.json: ~6 KB raw, ~2 KB gzip (34 icons × ~175 bytes each).
//   - @iconify/vue (Icon + addCollection): already a transitive dep via
//     @nuxt/ui → zero additional bundle cost.
//   - This module itself: < 400 bytes minified.
//
// The total on-demand payload is ~2 KB gzip, deferred until the picker opens.
// Compare with bundling @iconify-json/lucide (full set): ~80–100 KB gzip.
//
// Owner: ui-engineer
// Resolves: ADR-0003 §1 "Lucide icon subset — on-demand manifest"

import { addCollection } from '@iconify/vue';

/**
 * Minimal subset of the IconifyJSON interface from @iconify/types.
 * Redeclared locally to avoid adding @iconify/types as a direct dep
 * (it is already a transitive dep of @iconify/vue, but TypeScript resolves
 * types from direct deps only in strict moduleResolution: bundler).
 */
interface IconifyJSONSubset {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string }>;
}

// ---------------------------------------------------------------------------
// Static key list — used for filtering and type narrowing.
// This is a string literal union of every key in the curated subset.
// Adding a new icon: add it to lucide-subset.json AND append to ICON_KEYS.
// ---------------------------------------------------------------------------

export const ICON_KEYS = [
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
  'check',
  'check-circle',
  'chevron-down',
  'chevron-right',
  'chevron-left',
  'chevron-up',
  'circle',
  'close',
  'external-link',
  'eye',
  'flag',
  'heart',
  'home',
  'image',
  'info',
  'link',
  'mail',
  'map-pin',
  'minus',
  'moon',
  'pencil',
  'plus',
  'search',
  'settings',
  'share',
  'star',
  'sun',
  'trash',
  'user',
  'warning',
  'zap',
] as const satisfies readonly string[];

export type IconKey = (typeof ICON_KEYS)[number];

// ---------------------------------------------------------------------------
// Manifest loader — deferred to first picker interaction.
// ---------------------------------------------------------------------------

let manifestPromise: Promise<void> | null = null;
let manifestLoaded = false;

/**
 * Lazily loads the Lucide icon subset and registers it with @iconify/vue.
 * Safe to call multiple times — subsequent calls return the cached promise.
 *
 * Must be awaited before rendering Icon components so that the icon data
 * is available in the Iconify runtime registry.
 */
export async function loadIconManifest(): Promise<void> {
  if (manifestLoaded) return;
  if (manifestPromise !== null) return manifestPromise;

  manifestPromise = (async () => {
    const data = (await import('./lucide-subset.json')) as
      | { default: IconifyJSONSubset }
      | IconifyJSONSubset;
    // Handle both default-export (Vite ESM) and direct object (Node/CJS interop).
    const json: IconifyJSONSubset = 'default' in data ? data.default : data;
    // addCollection accepts any IconifyJSON-shaped object; the local subset
    // interface satisfies the shape the runtime expects.
    addCollection(json as Parameters<typeof addCollection>[0]);
    manifestLoaded = true;
  })();

  return manifestPromise;
}

/**
 * Returns true once the manifest has been loaded and registered.
 * Useful for conditional rendering before the async load completes.
 */
export function isManifestLoaded(): boolean {
  return manifestLoaded;
}

/**
 * Reset the manifest state. Only for use in tests.
 * @internal
 */
export function _resetManifestForTesting(): void {
  manifestPromise = null;
  manifestLoaded = false;
}
