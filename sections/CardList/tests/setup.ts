// sections/CardList/tests/setup.ts — Vitest global setup for CardList tests.
//
// Owner: ui-engineer.
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
// Mock @iconify/vue so tests don't depend on actual icon rendering.
// The Icon component renders a <span data-icon="..."> stub.
// ---------------------------------------------------------------------------

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: { type: String, required: true },
      width: { type: [String, Number], default: undefined },
      height: { type: [String, Number], default: undefined },
    },
    template: '<span :data-icon="icon" aria-hidden="true" />',
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
