// tests/setup.ts — global Vitest setup for plugins/welder-editor
//
// Owner: ui-engineer
//
// Purpose: ambient cleanup and Pinia bootstrap so every test file in this
// package starts from a clean slate without repeating boilerplate.
//
// Registered via `setupFiles` in plugins/welder-editor/vitest.config.ts.
//
// --- Node 25 localStorage shim ---
// Node 25 ships a Web Storage API (localStorage / sessionStorage) whose getter
// throws a SecurityError unless the process is started with --localstorage-file.
// Vitest's populateGlobal() skips overriding keys that already exist on
// globalThis and are not in its explicit LIVING_KEYS / OTHER_KEYS allowlist
// (localStorage is in neither). Pinia 3 imports @vue/devtools-kit, which calls
// localStorage.getItem() at module-evaluation time. Without a shim, every test
// file running in the jsdom environment still sees Node 25's throwing getter
// during module loading. This body-level try/catch installs a no-op Map-backed
// shim when the native getter throws — jsdom's real localStorage is visible
// inside test bodies once the jsdom environment is active.
// Root cause: vitest@1.6 + jsdom@24 + Node 25 incompatibility.
// ---
const _lsStore: Record<string, string> = {};
try {
  void globalThis.localStorage; // throws on Node 25 without --localstorage-file
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
// --- End Node 25 localStorage shim ---

import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/vue';

// ---------------------------------------------------------------------------
// ResizeObserver shim
//
// jsdom does not implement ResizeObserver. CropperCanvas.vue (inside ImageEditor)
// uses it to track the canvas dimensions. Without this shim, any test that mounts
// ImageEditor (directly or via App.vue with an image-containing GeneralSections
// fixture) throws "ResizeObserver is not defined" and the suite aborts.
//
// The shim is a minimal no-op: observe/unobserve/disconnect do nothing.
// CropperCanvas handles the case where the observer callback never fires by
// reading the canvas clientWidth/clientHeight on its own mount hook — so
// the crop UI is simply static in tests, which is correct for unit/smoke tests.
// ---------------------------------------------------------------------------
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

//   afterEach(cleanup)
//     @testing-library/vue does NOT auto-cleanup unless vitest is configured
//     with `globals: true` (this repo uses `globals: false`). Without cleanup,
//     rendered components accumulate in the jsdom document across tests in the
//     same file. This afterEach tears them down after every test, matching the
//     behaviour Sprint 0's App.smoke.test.ts achieved via an explicit afterEach
//     in-file. With this setup file registered, every test in the package gets
//     that guarantee for free.
afterEach(() => {
  cleanup();
});

//   beforeEach(() => setActivePinia(createPinia()))
//     A fresh Pinia instance is created before every test. Any store accessed
//     during a test therefore starts from its initial state. Tests that don't
//     import or use any store are unaffected (creating an active Pinia instance
//     has no side-effect on non-store code). This pattern matches the official
//     Pinia testing guide and is required from Sprint 2 onward as sections
//     carry Pinia-backed state.
//
//     Pinia is imported dynamically so the localStorage shim above is in place
//     before @vue/devtools-kit's module-level code fires. Static imports are
//     hoisted to before any module body runs; dynamic imports fire at call time.
//     ADR context: ADR-0010 (hybrid Pinia + composables).
beforeEach(async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
});
