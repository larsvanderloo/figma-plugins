// ============================================================
// useIconRecents — recently-picked icon names, persisted via the
// sandbox's `figma.clientStorage` (NOT iframe localStorage).
//
// State shape: ordered string[] (most recent first), capped at 8.
// Hydration happens once: sandbox reads clientStorage on `ui-ready`
// and posts an `icon-recents` message; App.vue calls `setItems`.
// On every `record(name)` mutation, App.vue's watcher posts
// `set-icon-recents` so the sandbox can persist verbatim.
//
// Why a store and not a composable: shared across IconPicker
// consumers (BadgeEditor, CardItemEditor). Picking an
// icon in one picker should immediately reflect in the others'
// "Recent" rows — a module-level ref would do this too, but the
// store gives us devtools observability and a documented surface
// for the third-party concern (clientStorage round-trip).
// ============================================================

import { ref } from 'vue';
import { defineStore } from 'pinia';

const MAX_RECENT = 8;

export const useIconRecents = defineStore('iconRecents', () => {
  /** Ordered recent picks, most recent first. */
  const items = ref<string[]>([]);

  /**
   * Sandbox-driven hydration. Called once after `ui-ready` when the
   * `icon-recents` message arrives. Truncates defensively in case the
   * stored array drifted past the cap.
   */
  function setItems(next: string[]): void {
    items.value = next.slice(0, MAX_RECENT);
  }

  /**
   * Record a fresh pick. Moves the name to the front, dedupes prior
   * occurrences, and caps the list. The watcher in App.vue picks up
   * the mutation and posts `set-icon-recents` to the sandbox.
   */
  function record(name: string): void {
    const without = items.value.filter((n) => n !== name);
    items.value = [name, ...without].slice(0, MAX_RECENT);
  }

  return {
    items,
    setItems,
    record,
  };
});
