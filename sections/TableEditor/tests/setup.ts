// sections/TableEditor/tests/setup.ts — Vitest global setup for TableEditor tests.
//
// Node 25 localStorage shim — same rationale as PropertyPanel/tests/setup.ts.
// pinia@3 imports @vue/devtools-kit which calls localStorage.getItem() at
// module-evaluation time. Node 25 throws a SecurityError on the native
// localStorage getter unless started with --localstorage-file. This shim
// installs a no-op Map-backed store before any dynamic Pinia import.
//
// Owner: ui-engineer.

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

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/vue';

afterEach(() => {
  cleanup();
});
