// plugins/welder-editor/tests/ui/components/ImageEditor.test.ts
//
// Sprint 5 — ImageEditor component tests (flat ui/components/ layout).
//
// Owner: ui-engineer. Sprint 5 Task 5.6.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import ImageEditor from '@/components/ImageEditor.vue';
import type { ImageModel } from '@/components/imageEditorTypes.js';

const MODEL_NO_IMAGE: ImageModel = {
  imageWrapId: 'iw-1',
  imageHash: null,
};

const MODEL_WITH_IMAGE: ImageModel = {
  imageWrapId: 'iw-2',
  imageHash: 'abc123',
};

describe('ImageEditor', () => {
  it('renders Replace image button', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    expect(screen.getByRole('button', { name: /replace image/i })).toBeDefined();
  });

  it('shows no-image placeholder when imageHash is null', () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_NO_IMAGE } });
    expect(container.textContent).toMatch(/replace the image above/i);
  });

  it('shows crop section when imageHash is set', () => {
    const { container } = render(ImageEditor, { props: { model: MODEL_WITH_IMAGE } });
    expect(container.querySelector('.image-editor__crop-section')).not.toBeNull();
  });

  it('disables button when disabled=true', () => {
    render(ImageEditor, { props: { model: MODEL_NO_IMAGE, disabled: true } });
    const btn = screen.getByRole('button', { name: /replace image/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows loading skeleton when loading=true and imageHash is set', () => {
    const { container } = render(ImageEditor, {
      props: { model: MODEL_WITH_IMAGE, loading: true },
    });
    expect(container.querySelector('.image-editor__crop-skeleton')).not.toBeNull();
  });

  it('renders error UAlert when error prop is provided', () => {
    render(ImageEditor, {
      props: { model: MODEL_NO_IMAGE, error: 'Upload failed' },
    });
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
