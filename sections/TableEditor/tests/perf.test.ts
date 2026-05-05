// sections/TableEditor/tests/perf.test.ts
//
// Frame-trace perf gate — Sprint 4 task 4.1, R1.
//
// Gate: each PropertyPanel collapsible toggle must complete in < 16 ms
// (one frame at 60 Hz). This benchmark validates T42.21 Findings 1 + 3:
//
//   Finding 1: offset-based stable bodyRows reference. No slice() on
//   bodyRows means no new array reference per render cycle, no v-for re-key,
//   no forced layout triggered by Reka's getBoundingClientRect().
//
//   Finding 3: memoized truncationFlags computed map. Only re-runs when
//   bodyRows or colCount changes, not on toggle events.
//
// The test mounts TableEditor with a 50-row × 6-col fixture, toggles a
// PropertyPanel collapsible 10 times, and asserts each toggle resolves
// within 16 ms via performance.now() + nextTick().
//
// Gate rationale: toggling a collapsible panel must not block the main
// thread for more than one frame. If it does, the user perceives jank.
// This is the R1 merge-blocking gate.
//
// Note: this test runs in jsdom (same environment as TableEditor.test.ts)
// which does not have a real renderer. CSS transitions and layout are
// not executed. The timing budget covers Vue's reactive update cycle
// and any synchronous JS triggered by the toggle — not CSS animation.
// This is the correct level to measure the T42.21 fix (the jank was in
// Vue's diff path, not in CSS).
//
// Owner: ui-engineer.

import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { render, screen, fireEvent } from '@testing-library/vue';
import TableEditor from '../src/TableEditor.vue';
import type { TableWrapModel, TableRowModel } from '../src/TableEditor.vue';

// ---------------------------------------------------------------------------
// 50-row × 6-col fixture
// ---------------------------------------------------------------------------

function make50x6Model(): TableWrapModel {
  const rows: TableRowModel[] = Array.from({ length: 50 }, (_, rowIdx) => ({
    rowNodeId: `r${rowIdx}`,
    cells: Array.from({ length: 6 }, (_, colIdx) => ({
      cellNodeId: `r${rowIdx}-c${colIdx}`,
      value: `Row ${rowIdx + 1} Cell ${colIdx + 1}`,
    })),
  }));

  return {
    slotId: 'slot-perf',
    width: 'md',
    textSize: 'md',
    hasColumnHeader: false,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Perf gate: 10 toggles each < 16 ms
// ---------------------------------------------------------------------------

describe('TableEditor — frame-trace perf gate (R1)', () => {
  it('10 PropertyPanel collapsible toggles each complete in < 16 ms', async () => {
    render(TableEditor, {
      props: { tableData: make50x6Model() },
    });

    // Find a PropertyPanel toggle button (the Cells panel header is a button)
    // We use the Width panel header since it's the first collapsible.
    const toggleBtns = screen.getAllByRole('button', {
      name: (name) => {
        // PropertyPanel toggle buttons have their title as accessible name.
        // Match any of the property panel header buttons by name content.
        return ['Width', 'Text Size', 'Column Header', 'Dimensions', 'Cells', 'CSV Import'].some(
          (title) => name.toLowerCase().includes(title.toLowerCase()),
        );
      },
    });

    expect(toggleBtns.length).toBeGreaterThan(0);

    // Use the first available toggle button (Width panel).
    const toggleBtn = toggleBtns[0]!;

    const durations: number[] = [];

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      await fireEvent.click(toggleBtn);
      await nextTick();
      const t1 = performance.now();
      durations.push(t1 - t0);
    }

    // Report all durations for debugging (visible in --reporter=verbose output).
    const max = Math.max(...durations);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    console.warn(
      `[perf-gate] 10 toggles on 50×6 fixture:\n` +
        durations.map((d, i) => `  toggle ${i + 1}: ${d.toFixed(2)} ms`).join('\n') +
        `\n  avg: ${avg.toFixed(2)} ms  max: ${max.toFixed(2)} ms`,
    );

    // Gate: every toggle must complete in < 16 ms.
    for (let i = 0; i < durations.length; i++) {
      expect(
        durations[i]!,
        `Toggle ${i + 1} took ${durations[i]!.toFixed(2)} ms — exceeds 16 ms frame budget`,
      ).toBeLessThan(16);
    }
  });
});
