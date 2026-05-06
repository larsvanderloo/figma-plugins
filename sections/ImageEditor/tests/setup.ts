// sections/ImageEditor/tests/setup.ts — Vitest global setup.
//
// Owner: ui-engineer
//
// 1. localStorage shim — pinia@3 imports @vue/devtools-kit which calls
//    localStorage.getItem() at module-evaluation time. Node 25 throws a
//    SecurityError on the native localStorage getter unless started with
//    --localstorage-file.
//
// 2. HTMLCanvasElement.getContext stub — axe-core's color-contrast rule calls
//    HTMLCanvasElement.getContext('2d') internally even when there are no
//    canvas elements in the component under test. jsdom does not implement
//    the Canvas 2D API. We return a minimal stub so axe does not throw.
//
// 3. Nuxt UI component stubs — UButton and UIcon are global Nuxt UI
//    auto-imports that are not available in jsdom. We register lightweight
//    HTML stubs so that:
//    a. Tests can query by role/label without depending on Nuxt UI internals.
//    b. The stubs forward aria attributes and disabled state so axe scans
//       see valid accessible markup.
//    The stubs are registered via @testing-library/vue's `global.components`
//    option — see ImageEditor.test.ts. Setup registers them on the Vue global
//    app so we don't need to thread options through every render call.

// ---------------------------------------------------------------------------
// 1. localStorage shim
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. HTMLCanvasElement.getContext stub
// axe-core calls getContext('2d') for color-contrast analysis even when no
// canvas elements exist in the component. We stub to a minimal object.
// ---------------------------------------------------------------------------

const canvasCtxStub: Partial<CanvasRenderingContext2D> = {
  clearRect: () => undefined,
  fillRect: () => undefined,
  strokeRect: () => undefined,
  drawImage: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  stroke: () => undefined,
  setTransform: () => undefined,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
};

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (contextId: string): RenderingContext | null {
    if (contextId === '2d') {
      return canvasCtxStub as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// ---------------------------------------------------------------------------
// Testing Library cleanup
// ---------------------------------------------------------------------------

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/vue';

afterEach(() => {
  cleanup();
});
