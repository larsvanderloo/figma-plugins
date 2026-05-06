// sections/ImageEditor/tests/ImageEditor.test.ts
//
// @testing-library/vue + axe-core tests for the rewritten ImageEditor.
//
// Owner: ui-engineer
// Resolves: MON-2894451805 (Sprint 5 Wave 3 task 5.6)
//
// Test contract:
//   1.  Thumbnail renders when previewUrl is set (no-image vs image states)
//   2.  File picker: hidden input present, button click triggers input.click()
//   3.  File selection emits `upload` with Uint8Array bytes
//   4.  2 MB soft warning shown for large files
//   5.  Disabled state: Upload button is disabled; click does not open file picker
//   6.  No-image state: Crop button absent, "No image" status text shown
//   7.  Image state: thumbnail rendered, Crop button present
//   8.  Crop open/cancel: clicking Crop shows CropperComponent; Cancel closes it
//   9.  Apply crop: cropperApi.getBlob resolves → emits `upload` with bytes
//  10.  axe WCAG 2.1 AA — 0 violations: no-image, image, cropper-open, disabled states

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import axe from 'axe-core';

// ---------------------------------------------------------------------------
// Mock vue-picture-cropper before importing ImageEditor.
//
// cropperjs requires a real browser layout engine. jsdom does not implement
// layout so useCropper() would fail. We mock the module to return:
//   - CropperComponent: a minimal <div data-testid="cropper-component"> stub
//   - cropperApi: { getBlob } that resolves to a small PNG-like Blob
// ---------------------------------------------------------------------------

// The mock Blob must implement arrayBuffer() — jsdom's Blob may not have it.
const MOCK_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const mockBlobWithArrayBuffer: Blob = Object.assign(
  new Blob([MOCK_PNG_BYTES], { type: 'image/png' }),
  {
    arrayBuffer: async (): Promise<ArrayBuffer> => MOCK_PNG_BYTES.buffer.slice(0) as ArrayBuffer,
  },
);

const mockGetBlob = vi.fn(async (): Promise<Blob> => mockBlobWithArrayBuffer);

// vi.mock is hoisted before imports. The factory must import Vue via
// dynamic import (no top-level static imports available at hoist time).
// We import Vue directly — no `typeof import()` type annotation needed
// because we let TypeScript infer the type from the awaited result.
vi.mock('vue-picture-cropper', async () => {
  // Dynamic import of Vue is safe inside an async mock factory: Vitest
  // resolves it before the test module runs, so the mock is ready in time.
  const { defineComponent, h } = await import('vue');

  const CropperStub = defineComponent({
    name: 'CropperComponentStub',
    setup() {
      return () => h('div', { 'data-testid': 'cropper-component' });
    },
  });
  return {
    useCropper: () => [CropperStub, { getBlob: mockGetBlob }],
  };
});

// Import ImageEditor AFTER the mock is established.
import ImageEditor from '../src/ImageEditor.vue';

// ---------------------------------------------------------------------------
// Nuxt UI component stubs
//
// UButton and UIcon are Nuxt UI auto-imports unavailable in jsdom.
// We register stubs that:
//   - Render as accessible HTML elements (button, span).
//   - Forward aria-label, disabled, aria-hidden so axe scans remain valid.
//   - Emit click events so trigger-button tests work.
// ---------------------------------------------------------------------------

const UButtonStub = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    icon: { type: String, default: undefined },
    size: { type: String, default: undefined },
    color: { type: String, default: undefined },
    variant: { type: String, default: undefined },
  },
  setup(props, { slots, attrs }) {
    // Do NOT declare 'click' in emits — that would strip onClick from attrs.
    // Pass attrs (including onClick) directly to the button element so that
    // @click="handler" on the parent template is wired through correctly.
    return () =>
      h(
        'button',
        {
          type: 'button',
          disabled: props.disabled || props.loading || undefined,
          'aria-disabled': props.disabled || props.loading ? 'true' : undefined,
          ...attrs,
        },
        slots.default?.(),
      );
  },
});

const UIconStub = defineComponent({
  name: 'UIcon',
  props: {
    name: { type: String, required: true },
    ariaHidden: { type: String, default: undefined },
  },
  setup(props, { attrs }) {
    return () =>
      h('span', {
        'aria-hidden': (attrs['aria-hidden'] as string | undefined) ?? 'true',
        'data-icon': props.name,
      });
  },
});

// Global render options — injects UButton/UIcon stubs into every mounted Vue app.
const globalOpts = {
  global: {
    components: {
      UButton: UButtonStub,
      UIcon: UIconStub,
    },
  },
};

// ---------------------------------------------------------------------------
// axe helpers
// ---------------------------------------------------------------------------

async function runAxeWCAG(el: Element): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  return results.violations;
}

function formatViolations(violations: axe.Result[]): string {
  if (violations.length === 0) return 'none';
  return violations
    .map(
      (v) =>
        `[${v.impact ?? 'unknown'}] ${v.id}: ${v.description}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  • ${n.html}`)
          .join('\n'),
    )
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MV_NO_IMAGE = { hasImage: false, imageHash: null };
const MV_WITH_IMAGE = { hasImage: true, imageHash: 'abc123def456' };
const PREVIEW_URL = 'data:image/png;base64,iVBORw0KGgo=';

function makeFakeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new ArrayBuffer(sizeBytes)], name, { type });
}

const MINI_PNG_BUFFER = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer as ArrayBuffer;

// ---------------------------------------------------------------------------
// 1. Thumbnail vs no-image state
// ---------------------------------------------------------------------------

describe('ImageEditor — thumbnail / no-image state', () => {
  it('shows "No image" status when hasImage is false', () => {
    render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    // getAllByText because the text appears in both the sr-only aria-live region
    // and the visible status span — both are expected.
    expect(screen.getAllByText(/no image/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Image set" status when hasImage is true', () => {
    render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: 800, fillH: 600 },
      ...globalOpts,
    });
    expect(screen.getAllByText(/image set/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders an <img> thumbnail when previewUrl is set', () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe(PREVIEW_URL);
  });

  it('does not render an <img> when previewUrl is null', () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. File picker
// ---------------------------------------------------------------------------

describe('ImageEditor — file picker', () => {
  it('renders a hidden file input accepting image/*', () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.accept).toBe('image/*');
    expect(input?.style.display).toBe('none');
  });

  it('Upload button click triggers click on the hidden file input', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const uploadBtn = screen.getByRole('button', { name: /upload image/i });
    await fireEvent.click(uploadBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('Replace button label shown when hasImage is true', () => {
    render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });
    expect(screen.getByRole('button', { name: /replace image/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. File selection emits `upload`
// ---------------------------------------------------------------------------

describe('ImageEditor — upload emit', () => {
  it('emits `upload` with Uint8Array when a valid file is selected', async () => {
    const { emitted, container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('test.png', 'image/png', 4);
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(MINI_PNG_BUFFER),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));

    const events = emitted('upload') as [Uint8Array][] | undefined;
    expect(events, 'upload not emitted').toBeDefined();
    expect(events![0]?.[0]).toBeInstanceOf(Uint8Array);
  });

  it('does not emit when no file is selected', async () => {
    const { emitted, container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [],
      writable: false,
      configurable: true,
    });
    await fireEvent.change(input);
    expect(emitted('upload')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. 2 MB soft size warning
// ---------------------------------------------------------------------------

describe('ImageEditor — soft size warning', () => {
  it('shows a size warning for files > 2 MB without blocking the upload', async () => {
    const { emitted, container } = render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('big.png', 'image/png', 3 * 1024 * 1024);
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(3 * 1024 * 1024)),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText(/large file/i)).toBeDefined();
    expect(emitted('upload')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Disabled state
// ---------------------------------------------------------------------------

describe('ImageEditor — disabled state', () => {
  it('Upload button is disabled when disabled=true', () => {
    render(ImageEditor, {
      props: {
        modelValue: MV_NO_IMAGE,
        previewUrl: null,
        fillW: null,
        fillH: null,
        disabled: true,
      },
      ...globalOpts,
    });
    const btn = screen.getByRole('button', { name: /upload image/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('does not trigger file input click when Upload is clicked while disabled', async () => {
    const { container } = render(ImageEditor, {
      props: {
        modelValue: MV_NO_IMAGE,
        previewUrl: null,
        fillW: null,
        fillH: null,
        disabled: true,
      },
      ...globalOpts,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const btn = screen.getByRole('button', { name: /upload image/i });
    await fireEvent.click(btn);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. No-image state — Crop button absent
// ---------------------------------------------------------------------------

describe('ImageEditor — no-image state', () => {
  it('does not show a Crop button when previewUrl is null', () => {
    render(ImageEditor, {
      props: { modelValue: MV_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
      ...globalOpts,
    });
    expect(screen.queryByRole('button', { name: /crop image/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Image state — thumbnail + Crop button present
// ---------------------------------------------------------------------------

describe('ImageEditor — image state (with previewUrl)', () => {
  it('shows the Crop button when previewUrl is set and cropper is closed', () => {
    render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: 800, fillH: 600 },
      ...globalOpts,
    });
    expect(screen.getByRole('button', { name: /crop image/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Crop open / cancel
// ---------------------------------------------------------------------------

describe('ImageEditor — crop open / cancel', () => {
  it('clicking Crop shows the CropperComponent stub', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });

    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    expect(container.querySelector('[data-testid="cropper-component"]')).toBeTruthy();
  });

  it('clicking Cancel closes the CropperComponent', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });

    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    expect(container.querySelector('[data-testid="cropper-component"]')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(container.querySelector('[data-testid="cropper-component"]')).toBeNull();
  });

  it('Apply and Cancel buttons appear when cropper is open', async () => {
    render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });

    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    expect(screen.getByRole('button', { name: /apply/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Apply crop — emits `upload` with bytes from cropperApi.getBlob
// ---------------------------------------------------------------------------

describe('ImageEditor — apply crop flow', () => {
  beforeEach(() => {
    mockGetBlob.mockClear();
  });

  it('clicking Apply emits `upload` with Uint8Array from cropperApi.getBlob', async () => {
    const { emitted } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });

    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    await fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockGetBlob).toHaveBeenCalledOnce();
    const events = emitted('upload') as [Uint8Array][] | undefined;
    expect(events, 'upload not emitted after apply crop').toBeDefined();
    expect(events![0]?.[0]).toBeInstanceOf(Uint8Array);
  });

  it('after Apply, the cropper panel is closed', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });

    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    await fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await new Promise((r) => setTimeout(r, 0));

    expect(container.querySelector('[data-testid="cropper-component"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. axe WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('ImageEditor — axe WCAG 2.1 AA', () => {
  async function mountAndScan(props: {
    modelValue: { hasImage: boolean; imageHash: string | null };
    previewUrl: string | null;
    fillW: number | null;
    fillH: number | null;
    disabled?: boolean;
  }): Promise<axe.Result[]> {
    const { container } = render(ImageEditor, { props, ...globalOpts });
    return runAxeWCAG(container);
  }

  it('has zero violations — no-image state', async () => {
    const violations = await mountAndScan({
      modelValue: MV_NO_IMAGE,
      previewUrl: null,
      fillW: null,
      fillH: null,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — image state (with previewUrl)', async () => {
    const violations = await mountAndScan({
      modelValue: MV_WITH_IMAGE,
      previewUrl: PREVIEW_URL,
      fillW: 800,
      fillH: 600,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state (no image)', async () => {
    const violations = await mountAndScan({
      modelValue: MV_NO_IMAGE,
      previewUrl: null,
      fillW: null,
      fillH: null,
      disabled: true,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state (with image)', async () => {
    const violations = await mountAndScan({
      modelValue: MV_WITH_IMAGE,
      previewUrl: PREVIEW_URL,
      fillW: 800,
      fillH: 600,
      disabled: true,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — cropper-open state', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MV_WITH_IMAGE, previewUrl: PREVIEW_URL, fillW: null, fillH: null },
      ...globalOpts,
    });
    await fireEvent.click(screen.getByRole('button', { name: /crop image/i }));
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
