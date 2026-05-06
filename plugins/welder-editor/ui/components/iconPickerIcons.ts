// plugins/welder-editor/ui/components/iconPickerIcons.ts
//
// On-demand Lucide icon manifest loader for IconPicker.
// Lifted from sections/IconPicker/src/icons.ts with path adjusted for
// the flat ui/components/ layout (./lucide-subset.json is co-located).
//
// ADR-0003 §1: icon data deferred; not in the initial bundle.

import { addCollection } from '@iconify/vue';

interface IconifyJSONSubset {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string }>;
}

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

let manifestPromise: Promise<void> | null = null;
let manifestLoaded = false;

export async function loadIconManifest(): Promise<void> {
  if (manifestLoaded) return;
  if (manifestPromise !== null) return manifestPromise;

  manifestPromise = (async () => {
    const data = (await import('./lucide-subset.json')) as
      | { default: IconifyJSONSubset }
      | IconifyJSONSubset;
    const json: IconifyJSONSubset = 'default' in data ? data.default : data;
    addCollection(json as Parameters<typeof addCollection>[0]);
    manifestLoaded = true;
  })();

  return manifestPromise;
}

export function isManifestLoaded(): boolean {
  return manifestLoaded;
}

/** Reset manifest state. Only for use in tests. */
export function _resetManifestForTesting(): void {
  manifestPromise = null;
  manifestLoaded = false;
}
