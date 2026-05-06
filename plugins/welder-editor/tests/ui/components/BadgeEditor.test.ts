// plugins/welder-editor/tests/ui/components/BadgeEditor.test.ts
//
// Sprint 5 — BadgeEditor component tests.
//
// Owner: ui-engineer.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import BadgeEditor from '@/components/BadgeEditor.vue';
import type { BadgeSection } from '@shared/messages.js';

const MODEL: BadgeSection = {
  badgeNodeId: 'badge-1',
  label: 'New',
  icon: 'sparkles',
};

describe('BadgeEditor', () => {
  it('renders badge label input with current value', () => {
    render(BadgeEditor, { props: { model: MODEL } });
    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input.value).toBe('New');
  });

  it('emits update:model when label changes (debounced)', async () => {
    const { emitted } = render(BadgeEditor, { props: { model: MODEL } });
    const input = screen.getByRole('textbox', { name: /badge label/i });
    await fireEvent.update(input, 'Updated');
    await waitFor(
      () => {
        expect(emitted()['update:model']).toBeDefined();
      },
      { timeout: 500 },
    );
    const payload = (emitted()['update:model']?.[0] as [unknown])[0] as {
      label: string;
      icon: string;
    };
    expect(payload.label).toBe('Updated');
    expect(payload.icon).toBe('sparkles');
  });

  it('disables label input when disabled=true', () => {
    render(BadgeEditor, { props: { model: MODEL, disabled: true } });
    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('renders icon-picker slot', () => {
    render(BadgeEditor, {
      props: { model: MODEL },
      slots: { 'icon-picker': '<span>icon-slot</span>' },
    });
    expect(screen.getByText('icon-slot')).toBeDefined();
  });
});
