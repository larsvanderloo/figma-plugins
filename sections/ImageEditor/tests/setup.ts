// sections/ImageEditor/tests/setup.ts — Vitest global setup.
//
// Owner: ui-engineer
//
// 1. localStorage shim — same rationale as TitleDescriptionEditor/tests/setup.ts.
//    pinia@3 imports @vue/devtools-kit which calls localStorage.getItem() at
//    module-evaluation time. Node 25 throws a SecurityError on the native
//    localStorage getter unless started with --localstorage-file.
//
// 2. HTMLCanvasElement shim — jsdom does not implement Canvas 2D context.
//    Tests that mount CropperCanvas will call getContext('2d'); we return a
//    minimal stub so canvas drawing code does not throw. Tests verify model
//    logic (CropRect, Transform computation, handle dispatch) — not the
//    canvas pixels themselves.
//
// 3. requestAnimationFrame / cancelAnimationFrame shim — jsdom's rAF is a
//    no-op that never fires. We replace it with a synchronous stub so
//    scheduleRedraw() calls complete without hanging tests.
//
// 4. ResizeObserver shim — jsdom does not implement ResizeObserver. We
//    provide a no-op stub so CropperCanvas.vue's onMounted doesn't throw.
//
// 5. PointerEvent shim — jsdom's PointerEvent may lack setPointerCapture on
//    HTMLElement. We patch it to a no-op.
//
// 6. Image shim — jsdom's Image element fires no load events for data URLs.
//    We immediately fire onload so loadImage() resolves synchronously in tests.

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
// 3. requestAnimationFrame / cancelAnimationFrame shim
// ---------------------------------------------------------------------------

// Replace rAF with immediate execution so scheduleRedraw() runs synchronously.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  cb(performance.now());
  return 0;
};
globalThis.cancelAnimationFrame = (_id: number): void => {
  // no-op
};

// ---------------------------------------------------------------------------
// 4. ResizeObserver shim
// ---------------------------------------------------------------------------

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {
      // no-op
    }
    unobserve(): void {
      // no-op
    }
    disconnect(): void {
      // no-op
    }
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// ---------------------------------------------------------------------------
// 5. setPointerCapture shim
// ---------------------------------------------------------------------------

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = (_pointerId: number): void => {
    // no-op
  };
  HTMLElement.prototype.releasePointerCapture = (_pointerId: number): void => {
    // no-op
  };
}

// ---------------------------------------------------------------------------
// 6. Image load shim
// ---------------------------------------------------------------------------

// Patch Image.prototype.src so that setting it immediately fires onload.
// We do this by redefining the `src` descriptor on HTMLImageElement.prototype,
// wrapping the original setter with an onload dispatch.
{
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  const originalSetter = originalDescriptor?.set;
  if (originalSetter) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...originalDescriptor,
      set(this: HTMLImageElement, value: string) {
        originalSetter.call(this, value);
        if (typeof this.onload === 'function') {
          (this.onload as EventListener)(new Event('load'));
        }
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Testing Library cleanup
// ---------------------------------------------------------------------------

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/vue';

afterEach(() => {
  cleanup();
});
