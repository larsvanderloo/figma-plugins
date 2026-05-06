// sections/CardList/tests/setup.ts — Vitest global setup for CardList tests.
//
// Owner: ui-engineer.
// Resolves: MON-2894437197 (Sprint 5, Task 5.9).
//
// Node 25 localStorage shim — same rationale as IconPicker/tests/setup.ts.
// Pinia@3 / @vue/devtools-kit calls localStorage.getItem() at module-evaluation
// time. Node 25 throws a SecurityError on the native localStorage getter unless
// started with --localstorage-file. This shim installs a no-op Map-backed store
// before any dynamic import.
const _lsStore: Record<string, string> = {};
try {
  void globalThis.localStorage;
} catch {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      getItem: (key: string): string | null => _lsStore[key] ?? null,
      setItem: (key: string, value: string): void => {
        _lsStore[key] = String(value);
      },
      removeItem: (key: string): void => {
        delete _lsStore[key];
      },
      clear: (): void => {
        Object.keys(_lsStore).forEach((k) => delete _lsStore[k]);
      },
      get length(): number {
        return Object.keys(_lsStore).length;
      },
      key: (index: number): string | null => Object.keys(_lsStore)[index] ?? null,
    },
  });
}

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';

// ---------------------------------------------------------------------------
// Mock UIcon from its direct component path.
//
// UIcon (Icon.vue) is imported in CardList.vue directly from
// @nuxt/ui/dist/runtime/components/Icon.vue to avoid the #build/ui/*
// virtual-module requirement. In jsdom, @nuxt/icon's runtime (which Icon.vue
// delegates to) requires SVG rendering and requestAnimationFrame that jsdom
// doesn't support. Mocking at the module level gives us a lightweight stub
// that renders <span data-icon="{name}"> — sufficient to verify that CardList
// passes the correct i-lucide-{key} name string and that axe scans clean.
// ---------------------------------------------------------------------------

vi.mock('@nuxt/ui/components/Icon.vue', () => ({
  default: {
    name: 'UIcon',
    props: {
      name: { type: String, required: true },
      mode: { type: String, required: false },
      size: { type: [String, Number], required: false },
    },
    template: '<span :data-icon="name" aria-hidden="true" />',
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
