// App.vue — @testing-library/vue smoke test
//
// Owner: ui-engineer
//
// Purpose: prove the @testing-library/vue harness is wired and working.
// This is NOT a coverage test — it is a harness-validation test. Sprint 2+
// section tests follow the same import pattern established here.
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
//   // or from sections: import SectionName from '../../../sections/SectionName/SectionName.vue'

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';

// App.vue is the stable entry point. It always lives at ui/App.vue regardless
// of sprint. Sprint 2 replaces the stub with the assembled plugin; this test
// re-runs unchanged and the assertions remain valid as long as the plugin
// renders a heading and a close control.
import App from '../../ui/App.vue';

describe('App.vue — @testing-library/vue harness smoke test', () => {
  it('renders the plugin heading', () => {
    // render() mounts the component into a real jsdom DOM node and returns
    // query utilities bound to that container. No manual cleanup needed —
    // @testing-library/vue registers an afterEach cleanup automatically.
    render(App);

    // Query by role + accessible name. This is the correct pattern for
    // Sprint 2+ section tests: never query by class name or test-id.
    // The stub App.vue renders <h1 class="text-base font-semibold">Welder Editor</h1>.
    const heading = screen.getByRole('heading', { name: /welder editor/i });
    expect(heading).toBeDefined();
  });

  it('renders the loading state before the init message arrives', () => {
    render(App);

    // The stub App.vue sets ready = false initially, which renders:
    //   <p v-if="!ready" class="text-sm text-gray-500">Loading…</p>
    // Query by visible text content. getByText returns the element or throws.
    const loadingText = screen.getByText(/loading/i);
    expect(loadingText).toBeDefined();
  });

  it('does not render the close button before ready', () => {
    render(App);

    // The close button is inside v-else (renders only when ready === true).
    // queryByRole returns null when the element is absent (vs getByRole which throws).
    // Sprint 2+ tests use queryBy for "should not exist" assertions.
    const closeButton = screen.queryByRole('button', { name: /close plugin/i });
    expect(closeButton).toBeNull();
  });
});
