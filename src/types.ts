// ============================================================
// Welder Slide Editor — Shared Types (barrel)
//
// Consumed by both main-thread (src/code.ts, slide-machine.ts, editors/**)
// en UI-iframe (src/ui/**). Deze types zijn de single-source-of-truth voor
// het plugin-datamodel en de bridge-messages tussen UI en main-thread.
//
// De definities zelf leven per domein in src/types/*; dit bestand
// re-exporteert alles zodat bestaande './types'-imports blijven werken.
//
// Bridge-messages volgen FIG-MSG-01 (typed discriminated unions).
// Zie spec.md §3 (Data-modellen) en §5 (Bridge-messages).
// ============================================================

export type * from './types/runtime';
export type * from './types/general';
export type * from './types/theme';
export type * from './types/content';
export type * from './types/graphs';
export type * from './types/table';
export type * from './types/messages';
