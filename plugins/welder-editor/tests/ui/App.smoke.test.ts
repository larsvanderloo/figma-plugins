// App.vue — @testing-library/vue smoke test
//
// Owner: ui-engineer
//
// Purpose: prove the @testing-library/vue harness is wired and working.
// Updated in Sprint 2 Task 2.9 to match the assembled App.vue contract.
// The stub assertions are replaced with assertions against the real UI.
//
// Why @testing-library/vue instead of @vue/test-utils directly:
//   - @testing-library/vue wraps @vue/test-utils and enforces role-based,
//     accessible-name-based querying. Tests written against roles and labels
//     survive refactors; tests written against class names or DOM structure
//     do not. The axe.test.ts in this directory uses @vue/test-utils because
//     axe.run() needs the raw DOM element — that is the one correct use of
//     the lower-level API. All behavioral tests use @testing-library/vue.
//
// Environment: jsdom (set by vitest.config.ts environmentMatchGlobs tests/ui/*).
//
// Import path convention used by Sprint 2+ section tests:
//   import { render, screen, fireEvent } from '@testing-library/vue'
//   import ComponentUnderTest from '../../ui/<path>/ComponentUnderTest.vue'

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';

// App.vue is the stable entry point. It always lives at ui/App.vue regardless
// of sprint. This test reflects the Sprint 2 assembled plugin UI.
import App from '../../ui/App.vue';

// Cleanup and Pinia bootstrap are handled globally by tests/setup.ts
// (registered via setupFiles in vitest.config.ts). No per-file afterEach
// needed here.

describe('App.vue — @testing-library/vue harness smoke test', () => {
  it('renders the slide picker combobox', () => {
    // render() mounts the component into a real jsdom DOM node.
    // Cleanup is handled globally by tests/setup.ts.
    render(App);

    // SlidePicker renders a native <select> (role="combobox").
    // With an empty store this is the first interactive element in the plugin.
    const picker = screen.getByRole('combobox');
    expect(picker).toBeDefined();
  });

  it('renders the empty-state message before a slide is selected', () => {
    render(App);

    // When no slide is selected, App.vue shows the "pick a slide above" prompt.
    const emptyState = screen.getByText(/pick a slide above/i);
    expect(emptyState).toBeDefined();
  });

  it('does not render any editor section before a slide is selected', () => {
    render(App);

    // No heading input should be present in the empty state.
    const headingInput = screen.queryByRole('textbox', { name: /heading/i });
    expect(headingInput).toBeNull();
  });
});
