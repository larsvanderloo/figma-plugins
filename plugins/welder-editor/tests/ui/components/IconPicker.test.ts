// plugins/welder-editor/tests/ui/components/IconPicker.test.ts
//
// Sprint 5 — IconPicker component tests (flat ui/components/ layout).
//
// Owner: ui-engineer. Sprint 5 Task 5.5.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import IconPicker from '@/components/IconPicker.vue';

describe('IconPicker', () => {
  it('renders search input with correct aria-label', () => {
    render(IconPicker, { props: { modelValue: '' } });
    expect(screen.getByRole('textbox', { name: /search icons/i })).toBeDefined();
  });

  it('disables search input when disabled=true', () => {
    render(IconPicker, { props: { modelValue: '', disabled: true } });
    const input = screen.getByRole('textbox', { name: /search icons/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('shows loading status before manifest is ready', () => {
    // On mount, manifestReady is false until onMounted resolves
    render(IconPicker, { props: { modelValue: '' } });
    // The status message "Loading icons…" is shown initially
    expect(screen.getByText(/loading icons/i)).toBeDefined();
  });

  it('mounts without throwing', () => {
    expect(() => render(IconPicker, { props: { modelValue: 'sparkles' } })).not.toThrow();
  });
});
