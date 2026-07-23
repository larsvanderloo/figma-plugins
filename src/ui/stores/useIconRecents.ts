// Persisted via the sandbox's figma.clientStorage, not iframe localStorage:
// the sandbox hydrates this store once via the `icon-recents` message after
// `ui-ready`, and App.vue's watcher posts `set-icon-recents` back on mutation.

import { ref } from 'vue';
import { defineStore } from 'pinia';

const MAX_RECENT = 8;

export const useIconRecents = defineStore('iconRecents', () => {
  const items = ref<string[]>([]);

  // Slice guards against a stored array that drifted past the cap.
  function setItems(next: string[]): void {
    items.value = next.slice(0, MAX_RECENT);
  }

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
