// plugins/welder-editor/tests/ui/components/SlidePicker.test.ts
//
// Sprint 5 — SlidePicker component tests (flat ui/components/ layout).
//
// Owner: ui-engineer.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import SlidePicker from '@/components/SlidePicker.vue';
import type { SlideSummary } from '@shared/messages.js';

const SLIDES: SlideSummary[] = [
  { id: 'slide-1', number: 1, name: 'Slide One', isSkipped: false },
  { id: 'slide-2', number: 2, name: 'Slide Two', isSkipped: null },
];

describe('SlidePicker', () => {
  it('renders a combobox (USelectMenu)', () => {
    render(SlidePicker, { props: { slides: SLIDES, activeSlideId: null } });
    // USelectMenu renders a combobox role
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeDefined();
  });

  it('shows loading placeholder when loading is true', () => {
    render(SlidePicker, { props: { slides: [], activeSlideId: null, loading: true } });
    // The placeholder text in USelectMenu
    expect(screen.getByText(/loading slides/i)).toBeDefined();
  });

  it('shows no-slides placeholder when slide list is empty and not loading', () => {
    render(SlidePicker, { props: { slides: [], activeSlideId: null } });
    expect(screen.getByText(/no welder slides/i)).toBeDefined();
  });

  it('renders an alert when error prop is set', () => {
    render(SlidePicker, {
      props: { slides: SLIDES, activeSlideId: null, error: 'Load failed' },
    });
    // UAlert renders with role="alert"
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
  });
});
