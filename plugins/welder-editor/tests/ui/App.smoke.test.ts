// App.vue — @testing-library/vue smoke test
//
// Sprint 5 Wave 2 update: stacked panels, UApp chrome, UAlert empty states.
//
// The harness smoke test verifies @testing-library/vue is wired correctly.
// Tests mount App with a populated Pinia store (lastKnownAt > 0) to bypass
// the initializing skeleton. The skeleton state is tested in App.test.ts.
//
// Owner: ui-engineer

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';

// Cleanup and Pinia bootstrap are handled globally by tests/setup.ts.

describe('App.vue — @testing-library/vue harness smoke test', () => {
  it('renders the slide picker section (header card visible after init)', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    // Populate store with lastKnownAt > 0 to bypass the initializing skeleton.
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    render(App, { global: { plugins: [pinia] } });

    // The header card renders the Welder logo img and intro paragraph.
    // SlidePicker renders a native <select> (role="combobox") in the header.
    const picker = screen.getByRole('combobox');
    expect(picker).toBeDefined();
  });

  it('renders the no-slide empty state (UAlert) when no slide is selected', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    render(App, { global: { plugins: [pinia] } });

    // The no-slide UAlert contains the picker instruction text.
    const emptyState = screen.getByText(/pick a slide above to start editing/i);
    expect(emptyState).toBeDefined();
  });

  it('does not render any editor section before a slide is selected', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    render(App, { global: { plugins: [pinia] } });

    // No heading input should be present in the empty state.
    const headingInput = screen.queryByRole('textbox', { name: /heading/i });
    expect(headingInput).toBeNull();
  });
});
