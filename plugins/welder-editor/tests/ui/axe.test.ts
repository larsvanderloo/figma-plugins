// Accessibility gate — axe-core WCAG 2.1 AA scan against the stub App.vue.
//
// Owner: plugin-tester (test harness) + ui-engineer (violations are theirs to fix).
//
// Gating policy (matches .github/workflows/validate.yml `axe` job comment):
//   BLOCKING now   — impact "serious" or "critical"
//   WARN only now  — impact "moderate" or "minor" (promoted to blocking at Sprint 2 RC)
//
// This test runs in jsdom (set by vitest.config.ts environmentMatchGlobs:
// tests/ui/* → jsdom). axe-core works in jsdom with the caveats below.
//
// jsdom caveats:
//   - CSS media-queries (prefers-color-scheme, prefers-reduced-motion) are not
//     evaluated. Color-contrast checks that depend on computed styles may produce
//     false negatives. Manual checks supplement this scan (see VoiceOver pass in
//     the sprint RC checklist).
//   - ARIA roles that require an accessible name (button, link, input) are caught
//     correctly by axe in jsdom.
//   - Shadow DOM is not exercised here; Nuxt UI v4 does not use shadow DOM.
//
// Sprint 2 RC upgrade path:
//   1. Remove the impact filter and the "warn only" assertion block below.
//   2. All violations at any impact level become hard failures.
//   3. ui-engineer resolves moderate/minor findings before RC.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import axe from 'axe-core';

// App.vue is a stub in Sprint 0. This test will be re-run at every Sprint RC
// against the assembled plugin. The test is intentionally import-path stable —
// App.vue always lives at ui/App.vue regardless of Sprint.
import App from '../../ui/App.vue';

// ---------------------------------------------------------------------------
// Helper: run axe against a mounted component root.
// Returns only violations at the specified impact levels.
// ---------------------------------------------------------------------------
async function runAxe(el: Element, impactFilter: axe.ImpactValue[]): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  return results.violations.filter(
    (v) => v.impact !== undefined && impactFilter.includes(v.impact as axe.ImpactValue),
  );
}

// ---------------------------------------------------------------------------
// Format a violation list into a human-readable assertion message.
// ---------------------------------------------------------------------------
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

describe('App.vue — axe WCAG 2.1 AA scan', () => {
  let wrapper: ReturnType<typeof mount>;
  let el: Element;

  beforeEach(() => {
    // Mount App.vue in jsdom. The stub renders a simple <main> with loading
    // state and a close button — a representative surface for the gate.
    wrapper = mount(App, {
      attachTo: document.body,
    });
    el = wrapper.element;
  });

  afterEach(() => {
    wrapper.unmount();
  });

  it('has zero serious or critical WCAG 2.1 AA violations (blocking gate)', async () => {
    const blocking = await runAxe(el, ['serious', 'critical']);
    expect(blocking, `BLOCKING axe violations found:\n${formatViolations(blocking)}`).toHaveLength(
      0,
    );
  });

  it('reports moderate and minor violations as warnings (non-blocking until Sprint 2 RC)', async () => {
    const advisory = await runAxe(el, ['moderate', 'minor']);
    if (advisory.length > 0) {
      // Use console.warn so the CI log is visible but the test does not fail.
      // UPGRADE PATH: replace this block with a hard expect().toHaveLength(0)
      // at Sprint 2 RC, once ui-engineer has addressed all moderate/minor items.
      console.warn(
        `axe advisory (non-blocking, Sprint 2 RC target):\n${formatViolations(advisory)}`,
      );
    }
    // This assertion always passes — its purpose is to produce a log entry, not
    // block CI. The comment above is the contract.
    expect(advisory.length).toBeGreaterThanOrEqual(0);
  });
});
