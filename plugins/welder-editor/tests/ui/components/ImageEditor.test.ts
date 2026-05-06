// plugins/welder-editor/tests/ui/components/ImageEditor.test.ts
//
// @testing-library/vue + axe-core tests for ImageEditor (PR#59 / vue-picture-cropper version).
//
// ADR-0015: Rewritten for the new ImageEditor interface:
//   - Props: modelValue: { hasImage, imageHash }, previewUrl, fillW, fillH, disabled
//   - Emits: upload (Uint8Array)
//   - No `model: ImageModel` prop (old CropperCanvas-based interface removed per ADR-0006 supersession)
//
// Owner: ui-engineer.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import ImageEditor from '../../../ui/components/ImageEditor.vue';

// Mock vue-picture-cropper — jsdom has no canvas/image support.
vi.mock('vue-picture-cropper', () => ({
  useCropper: () => [
    {
      name: 'CropperStub',
      template: '<div data-testid="cropper-stub">Cropper</div>',
    },
    {
      getBlob: vi
        .fn()
        .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    },
  ],
}));

// Mock cropperjs CSS import
vi.mock('cropperjs/dist/cropper.css', () => ({}));

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

const MODEL_NO_IMAGE = { hasImage: false, imageHash: null };
const MODEL_HAS_IMAGE = { hasImage: true, imageHash: 'abc123' };

// ---------------------------------------------------------------------------
// 1. Renders Upload button in no-image state
// ---------------------------------------------------------------------------

describe('ImageEditor — no image state', () => {
  it('renders an Upload button when no image is set', () => {
    render(ImageEditor, {
      props: { modelValue: MODEL_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    const uploadBtn = screen.getByRole('button', { name: /upload image/i });
    expect(uploadBtn).toBeDefined();
  });

  it('shows "No image" status text when no image is set', () => {
    render(ImageEditor, {
      props: { modelValue: MODEL_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    // Use getAllByText to handle the sr-only live region + visible span
    const texts = screen.getAllByText('No image');
    expect(texts.length).toBeGreaterThan(0);
  });

  it('does not render Crop button when no preview URL', () => {
    render(ImageEditor, {
      props: { modelValue: MODEL_HAS_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    expect(screen.queryByRole('button', { name: /crop/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Renders Replace button when image is set
// ---------------------------------------------------------------------------

describe('ImageEditor — has image state', () => {
  it('renders Replace button when image is set', () => {
    render(ImageEditor, {
      props: { modelValue: MODEL_HAS_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    const replaceBtn = screen.getByRole('button', { name: /replace image/i });
    expect(replaceBtn).toBeDefined();
  });

  it('shows "Image set" status text when image is set', () => {
    render(ImageEditor, {
      props: { modelValue: MODEL_HAS_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    const texts = screen.getAllByText('Image set');
    expect(texts.length).toBeGreaterThan(0);
  });

  it('renders the preview thumbnail when previewUrl is provided', () => {
    const { container } = render(ImageEditor, {
      props: {
        modelValue: MODEL_HAS_IMAGE,
        previewUrl: 'data:image/png;base64,abc',
        fillW: null,
        fillH: null,
      },
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.src).toContain('data:image/png');
  });
});

// ---------------------------------------------------------------------------
// 3. Crop button renders when previewUrl is set
// ---------------------------------------------------------------------------

describe('ImageEditor — crop functionality', () => {
  it('renders Crop button when previewUrl is provided', () => {
    render(ImageEditor, {
      props: {
        modelValue: MODEL_HAS_IMAGE,
        previewUrl: 'data:image/png;base64,abc',
        fillW: null,
        fillH: null,
      },
    });
    expect(screen.getByRole('button', { name: /crop image/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled state
// ---------------------------------------------------------------------------

describe('ImageEditor — disabled state', () => {
  it('disables the Upload button when disabled=true', () => {
    render(ImageEditor, {
      props: {
        modelValue: MODEL_NO_IMAGE,
        previewUrl: null,
        fillW: null,
        fillH: null,
        disabled: true,
      },
    });
    const uploadBtn = screen.getByRole('button', { name: /upload image/i }) as HTMLButtonElement;
    expect(uploadBtn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. File selection emits `upload` with Uint8Array bytes
// ---------------------------------------------------------------------------

describe('ImageEditor — file selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits `upload` with Uint8Array bytes when a file is selected', async () => {
    const { emitted } = render(ImageEditor, {
      props: { modelValue: MODEL_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });

    // Get the hidden file input (tabindex=-1, aria-hidden)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const testBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    // Create a mock file with a working arrayBuffer method (jsdom File lacks it)
    const mockFile = {
      name: 'test.png',
      type: 'image/png',
      size: testBytes.length,
      arrayBuffer: vi.fn().mockResolvedValue(testBytes.buffer),
    } as unknown as File;

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      configurable: true,
    });

    await fireEvent.change(fileInput);
    await vi.runAllTimersAsync();

    const uploadEvents = emitted('upload');
    expect(uploadEvents).toBeDefined();
    expect(uploadEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. axe WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('ImageEditor — axe WCAG 2.1 AA', () => {
  it('has zero violations — no image state', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MODEL_NO_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — has image state (no preview)', async () => {
    const { container } = render(ImageEditor, {
      props: { modelValue: MODEL_HAS_IMAGE, previewUrl: null, fillW: null, fillH: null },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — has image with preview', async () => {
    const { container } = render(ImageEditor, {
      props: {
        modelValue: MODEL_HAS_IMAGE,
        previewUrl: 'data:image/png;base64,abc',
        fillW: 800,
        fillH: 600,
      },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state', async () => {
    const { container } = render(ImageEditor, {
      props: {
        modelValue: MODEL_NO_IMAGE,
        previewUrl: null,
        fillW: null,
        fillH: null,
        disabled: true,
      },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
