// sections/ImageEditor/tests/ImageEditor.test.ts
//
// @testing-library/vue + axe-core tests for ImageEditor.
//
// Owner: ui-engineer
//
// Test contract:
//   1. File picker renders + triggers file-input click on button press
//   2. File selection emits `update:image` with Uint8Array bytes
//   3. File type validation rejects non-image files and shows error
//   4. File size validation rejects files > 10 MB
//   5. Disabled state: button is disabled; CropperCanvas receives disabled prop
//   6. No-image state: crop section hidden; placeholder shown
//   7. Image-loaded state: crop section shown; loading skeleton hidden
//   8. Loading state: loading skeleton shown; CropperCanvas hidden
//   9. External error prop surfaces in the error region
//  10. update:cropTransform from CropperCanvas is relayed up
//  11. axe WCAG 2.1 AA — 0 violations across all states

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import ImageEditor from '../src/ImageEditor.vue';
import type { ImageModel, Transform } from '../src/types.js';

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

const MODEL_NO_IMAGE: ImageModel = {
  imageWrapId: 'node-image-wrap-1',
  imageHash: null,
};

const MODEL_WITH_IMAGE: ImageModel = {
  imageWrapId: 'node-image-wrap-2',
  imageHash: 'abc123def456',
};

const MODEL_WITH_CROP: ImageModel = {
  imageWrapId: 'node-image-wrap-3',
  imageHash: 'abc123def456',
  cropTransform: [
    [0.5, 0, 0.25],
    [0, 0.5, 0.25],
  ],
};

// Minimal PNG bytes (1×1 px, valid PNG header)
const VALID_PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR chunk length + type
]);

function makeFakeFile(name: string, type: string, sizeBytes: number): File {
  // Build a buffer of the requested size.
  const buffer = new ArrayBuffer(sizeBytes);
  return new File([buffer], name, { type });
}

// ---------------------------------------------------------------------------
// 1. File picker renders + triggers click on button press
// ---------------------------------------------------------------------------

describe('ImageEditor — file picker', () => {
  it('renders a "Replace image" button', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    expect(screen.getByRole('button', { name: /replace image/i })).toBeDefined();
  });

  it('renders a hidden file input accepting image types', () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/png');
    expect(input.accept).toContain('image/jpeg');
    expect(input.accept).toContain('image/webp');
  });

  it('clicking the button triggers a click on the hidden file input', async () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const button = screen.getByRole('button', { name: /replace image/i });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const clickSpy = vi.spyOn(input, 'click');
    await fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. File selection emits `update:image` with bytes
// ---------------------------------------------------------------------------

describe('ImageEditor — update:image emit', () => {
  it('emits update:image with Uint8Array when a valid PNG is selected', async () => {
    const { emitted, container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // Simulate file selection by setting files on the input.
    const file = makeFakeFile('test.png', 'image/png', VALID_PNG_BYTES.byteLength);

    // jsdom's File may not have arrayBuffer on its prototype — use defineProperty.
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(VALID_PNG_BYTES.buffer as ArrayBuffer),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    // Give the async arrayBuffer read a tick to resolve.
    await new Promise((r) => setTimeout(r, 0));

    const events = emitted('update:image') as [Uint8Array][] | undefined;
    expect(events, 'update:image not emitted').toBeDefined();
    expect(events![0]?.[0]).toBeInstanceOf(Uint8Array);
  });

  it('emits update:image for JPEG files', async () => {
    const { emitted, container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('photo.jpg', 'image/jpeg', 1024);
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(1024)),
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

    const events = emitted('update:image') as [Uint8Array][] | undefined;
    expect(events).toBeDefined();
  });

  it('does not emit when no file is selected (null files)', async () => {
    const { emitted, container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    expect(emitted('update:image')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. File type validation
// ---------------------------------------------------------------------------

describe('ImageEditor — file type validation', () => {
  it('shows an error message for unsupported file type', async () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('document.pdf', 'application/pdf', 1024);

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));

    const alert = screen.queryByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toMatch(/unsupported file type/i);
  });

  it('does NOT emit update:image for unsupported file type', async () => {
    const { emitted, container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('document.pdf', 'application/pdf', 1024);

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    expect(emitted('update:image')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. File size validation
// ---------------------------------------------------------------------------

describe('ImageEditor — file size validation', () => {
  it('shows an error message for files over 10 MB', async () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // 11 MB
    const file = makeFakeFile('huge.png', 'image/png', 11 * 1024 * 1024);

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));

    const alert = screen.queryByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toMatch(/too large/i);
  });

  it('does NOT emit update:image for files over 10 MB', async () => {
    const { emitted, container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = makeFakeFile('huge.png', 'image/png', 11 * 1024 * 1024);

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
      configurable: true,
    });

    await fireEvent.change(input);
    expect(emitted('update:image')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Disabled state
// ---------------------------------------------------------------------------

describe('ImageEditor — disabled state', () => {
  it('disables the Replace image button when disabled=true', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE, disabled: true } });
    const button = screen.getByRole('button', { name: /replace image/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('does not trigger file input click when button is clicked while disabled', async () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_NO_IMAGE, disabled: true },
    });
    const button = screen.getByRole('button', { name: /replace image/i });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const clickSpy = vi.spyOn(input, 'click');
    await fireEvent.click(button);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('file input is disabled when disabled=true', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_NO_IMAGE, disabled: true },
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. No-image state — crop section hidden
// ---------------------------------------------------------------------------

describe('ImageEditor — no-image state', () => {
  it('shows "No image" hint text when imageHash is null', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    expect(screen.getByText(/no image/i)).toBeDefined();
  });

  it('does not show crop label when imageHash is null', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    expect(screen.queryByText('Crop')).toBeNull();
  });

  it('does not render CropperCanvas when imageHash is null', () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    // CropperCanvas renders 8 handles; if absent there are none.
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Image-loaded state
// ---------------------------------------------------------------------------

describe('ImageEditor — image-loaded state', () => {
  it('shows the Crop label when imageHash is non-null', () => {
    render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, imageDataUrl: 'data:image/png;base64,abc' },
    });
    expect(screen.getByText('Crop')).toBeDefined();
  });

  it('renders CropperCanvas (8 handles) when imageHash is non-null', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, imageDataUrl: 'data:image/png;base64,abc' },
    });
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(8);
  });

  it('does not show loading skeleton when loading=false', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, loading: false },
    });
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Loading state
// ---------------------------------------------------------------------------

describe('ImageEditor — loading state', () => {
  it('shows loading skeleton (aria-busy) when loading=true and image is present', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, loading: true },
    });
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('hides CropperCanvas when loading=true', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, loading: true },
    });
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. External error prop
// ---------------------------------------------------------------------------

describe('ImageEditor — external error prop', () => {
  it('displays the error prop in an alert region', () => {
    render(ImageEditor, {
      props: {
        model: MODEL_WITH_IMAGE,
        error: 'Failed to apply image: node not found.',
      },
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed to apply image');
  });
});

// ---------------------------------------------------------------------------
// 10. update:cropTransform relay
// ---------------------------------------------------------------------------

describe('ImageEditor — update:cropTransform relay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('relays update:cropTransform emitted by CropperCanvas', async () => {
    const { emitted, container } = render(ImageEditor, {
      props: {
        model: MODEL_WITH_IMAGE,
        imageDataUrl: 'data:image/png;base64,abc',
      },
    });

    const handle = container.querySelector('[data-handle="right"]') as HTMLElement;
    expect(handle).toBeTruthy();

    await fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    vi.advanceTimersByTime(300);

    const events = emitted('update:cropTransform') as [Transform][] | undefined;
    expect(events).toBeDefined();
    expect(events!.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 11. axe WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('ImageEditor — axe WCAG 2.1 AA', () => {
  async function mountAndScan(props: {
    model: ImageModel;
    imageDataUrl?: string;
    disabled?: boolean;
    loading?: boolean;
    error?: string;
  }): Promise<axe.Result[]> {
    const { container } = render(ImageEditor, { props });
    return runAxeWCAG(container);
  }

  it('has zero violations — no-image state', async () => {
    const violations = await mountAndScan({ model: MODEL_NO_IMAGE });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — image loaded state', async () => {
    const violations = await mountAndScan({
      model: MODEL_WITH_IMAGE,
      imageDataUrl: 'data:image/png;base64,abc',
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state (no image)', async () => {
    const violations = await mountAndScan({ model: MODEL_NO_IMAGE, disabled: true });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state (with image)', async () => {
    const violations = await mountAndScan({
      model: MODEL_WITH_IMAGE,
      imageDataUrl: 'data:image/png;base64,abc',
      disabled: true,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — loading state', async () => {
    const violations = await mountAndScan({ model: MODEL_WITH_IMAGE, loading: true });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — error state', async () => {
    const violations = await mountAndScan({
      model: MODEL_WITH_IMAGE,
      error: 'Something went wrong.',
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — with crop transform', async () => {
    const violations = await mountAndScan({
      model: MODEL_WITH_CROP,
      imageDataUrl: 'data:image/png;base64,abc',
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
