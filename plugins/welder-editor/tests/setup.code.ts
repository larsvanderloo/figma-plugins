// tests/setup.code.ts — code-side vitest setup for plugins/welder-editor
//
// Owner: plugin-tester
//
// Purpose: install the global `figma` stub required by all code-side tests
// (tests/code/**). The Figma plugin sandbox exposes `figma` as a global;
// vitest runs in Node where no such global exists. This file installs a
// minimal structural stub so that code-side modules that reference `figma.*`
// at import time (e.g. fill-checking helpers that reference `figma.mixed`)
// do not throw a ReferenceError.
//
// Registered in vitest.config.ts via `setupFiles` alongside tests/setup.ts.
// This file is NOT registered for ui-side tests (jsdom environment) — those
// must never import code-side modules that reference figma.*.
//
// figma.mixed
// -----------
// `figma.mixed` is a unique Symbol used by ImageWrap and other wrappers as a
// sentinel to distinguish "multiple different fills" from "no fills". Any test
// that exercises these wrappers needs the sentinel present before the module is
// imported (ES module evaluation is synchronous and top-level). A shared setup
// file is the correct location — per-file inline stubs risk import-order races.
//
// Note: this stub is intentionally minimal. Only `figma.mixed` is installed
// here; test files that need richer figma.* behaviour (currentPage, ui, on,
// closePlugin, etc.) should construct it locally using makeInstanceNode et al.
// from validation/fixtures/figma-mock/index.ts.

const _globalAny = globalThis as unknown as Record<string, unknown>;

if (typeof _globalAny['figma'] === 'undefined') {
  Object.defineProperty(globalThis, 'figma', {
    value: {
      mixed: Symbol('figma.mixed'),
    },
    writable: true,
    configurable: true,
  });
}
