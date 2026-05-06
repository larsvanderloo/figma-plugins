// plugins/welder-editor/tests/ui/components/TitleDescriptionEditor.test.ts
//
// Sprint 5 — TitleDescriptionEditor component tests (flat ui/components/ layout).
// Migrated from sections/TitleDescriptionEditor tests + updated to @shared/messages types.
//
// Owner: ui-engineer. Resolves MON-2894475033.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import TitleDescriptionEditor from '@/components/TitleDescriptionEditor.vue';
import type { TitleDescriptionSection } from '@shared/messages.js';

const BASE_MODEL: TitleDescriptionSection = {
  copyWrapId: 'c1',
  heading: 'Hello',
  paragraph: 'World',
  headingDim: null,
};

describe('TitleDescriptionEditor', () => {
  it('renders heading input with current value', () => {
    render(TitleDescriptionEditor, { props: { model: BASE_MODEL } });
    const input = screen.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(input.value).toBe('Hello');
  });

  it('renders paragraph textarea with current value when paragraph is non-null', () => {
    render(TitleDescriptionEditor, { props: { model: BASE_MODEL } });
    const textarea = screen.getByRole('textbox', { name: /paragraph/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('World');
  });

  it('does NOT render paragraph textarea when paragraph is null', () => {
    render(TitleDescriptionEditor, {
      props: { model: { ...BASE_MODEL, paragraph: null } },
    });
    expect(screen.queryByRole('textbox', { name: /paragraph/i })).toBeNull();
  });

  it('emits update:model with partial when heading changes (debounced)', async () => {
    const { emitted } = render(TitleDescriptionEditor, { props: { model: BASE_MODEL } });
    const input = screen.getByRole('textbox', { name: /heading/i });
    await fireEvent.update(input, 'Changed');
    await waitFor(
      () => {
        expect(emitted()['update:model']).toBeDefined();
      },
      { timeout: 400 },
    );
    const payload = (emitted()['update:model']?.[0] as [unknown])[0] as {
      heading: string;
      paragraph: string | null;
    };
    expect(payload.heading).toBe('Changed');
  });

  it('disables inputs when disabled prop is true', () => {
    render(TitleDescriptionEditor, { props: { model: BASE_MODEL, disabled: true } });
    const input = screen.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
