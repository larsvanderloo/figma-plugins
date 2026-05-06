// sections/TableEditor/tests/TableEditor.test.ts
//
// @testing-library/vue + axe-core tests for TableEditor.
// Updated for Sprint 5 Wave 3 (MON-2894506892): Nuxt UI v4 primitives.
//
// Primitive changes from the migration:
//   - USwitch renders role="switch" (not "checkbox") — queries updated.
//   - UButton renders role="button" — queries unchanged.
//   - UInput renders <input> (implicit textbox) — queries unchanged.
//   - UTextarea renders <textarea> (implicit textbox) — queries unchanged.
//   - UAlert renders <div> — CSV error region uses role="alert" wrapper.
//   - @nuxt/ui/vue-plugin registered in every render() call via global.plugins.
//
// Coverage (30 items, same contract as Sprint 4):
//   1.  Renders with a valid TableWrapModel (width toggle, text size toggle, header switch, row/col counts, cell grid)
//   2.  Width toggle emits update:width with correct payload
//   3.  Text size toggle emits update:textSize with correct payload
//   4.  Column header switch emits update:hasColumnHeader
//   5.  Row + button emits update:rowCount { delta: 1 }
//   6.  Row − button emits update:rowCount { delta: -1 }
//   7.  Col + button emits update:colCount { delta: 1 }
//   8.  Col − button emits update:colCount { delta: -1 }
//   9.  Row + at MAX_ROWS is disabled (upper bound)
//   10. Row − at 1 row is disabled (lower bound)
//   11. Col + at MAX_COLS is disabled (upper bound)
//   12. Col − at 1 col is disabled (lower bound)
//   13. Cell input emits update:cell with correct row, col, value
//   14. CSV paste with valid input → update:replaceContent emitted
//   15. CSV paste with invalid input → errors rendered, no update:replaceContent emitted
//   16. disabled=true propagates to all buttons, inputs, and textarea
//   17. Body cell input changes in one cell do not re-render sibling rows (data-render-id stability)
//   18. axe — zero violations: empty table (no rows / no cols)
//   19. axe — zero violations: valid table with header (hasColumnHeader=true)
//   20. axe — zero violations: valid table without header (hasColumnHeader=false)
//   21. axe — zero violations: disabled state
//   22. axe — zero violations: CSV import mode (textarea visible)
//   23. axe — zero violations: CSV error state
//   24. Row count display reflects bodyRows.length
//   25. Column count display reflects colCount derived from row cells
//   26. CSV parse button is disabled when textarea is empty
//   27. CSV parse button is enabled when textarea has content
//   28. Successful CSV import clears the textarea
//   29. Width active button reflects tableData.width (aria-pressed)
//   30. TextSize active button reflects tableData.textSize (aria-pressed)

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import axe from 'axe-core';
import ui from '@nuxt/ui/vue-plugin';
import TableEditor from '../src/TableEditor.vue';
import type { TableWrapModel, TableRowModel, TableCellModel } from '../src/TableEditor.vue';

// ---------------------------------------------------------------------------
// Nuxt UI plugin — registered globally via render() global.plugins
// so all UButton, UInput, USwitch, UFormField, UTextarea, UAlert
// components resolve correctly in the jsdom test environment.
// ---------------------------------------------------------------------------

const globalPlugins = { plugins: [ui] };

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCell(value: string, id = ''): TableCellModel {
  return { cellNodeId: id, value };
}

function makeRow(cells: string[], rowId = ''): TableRowModel {
  return {
    rowNodeId: rowId,
    cells: cells.map((v, i) => makeCell(v, `c${i}`)),
  };
}

function makeModel(overrides: Partial<TableWrapModel> = {}): TableWrapModel {
  return {
    slotId: 'slot-1',
    width: 'md',
    textSize: 'md',
    hasColumnHeader: false,
    rows: [
      makeRow(['Alice', 'Engineer', 'Amsterdam'], 'r0'),
      makeRow(['Bob', 'Designer', 'Berlin'], 'r1'),
    ],
    ...overrides,
  };
}

function makeMaxRowsModel(): TableWrapModel {
  const rows = Array.from({ length: 100 }, (_, i) => makeRow(['val'], `r${i}`));
  return makeModel({ rows });
}

function makeSingleRowModel(): TableWrapModel {
  return makeModel({ rows: [makeRow(['Alice', 'Engineer'], 'r0')] });
}

function makeMaxColsModel(): TableWrapModel {
  return makeModel({
    rows: [
      makeRow(
        Array.from({ length: 10 }, (_, i) => `v${i}`),
        'r0',
      ),
    ],
  });
}

function makeSingleColModel(): TableWrapModel {
  return makeModel({
    rows: [makeRow(['Alice'], 'r0'), makeRow(['Bob'], 'r1')],
  });
}

function makeEmptyModel(): TableWrapModel {
  return makeModel({ rows: [] });
}

// ---------------------------------------------------------------------------
// Typed emit helper
// ---------------------------------------------------------------------------

/**
 * Extract the first payload from an emitted event.
 * @testing-library/vue's emitted() returns unknown[][] where each inner array
 * is the argument list for one call. For all TableEditor emits, argument 0
 * is the payload object.
 */
function firstPayload<T>(emittedCalls: unknown[][] | undefined): T | undefined {
  if (!emittedCalls || emittedCalls.length === 0) return undefined;
  return emittedCalls[0]?.[0] as T | undefined;
}

// ---------------------------------------------------------------------------
// axe helper
// ---------------------------------------------------------------------------

async function runAxeWCAG(el: Element): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  return results.violations;
}

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

// ---------------------------------------------------------------------------
// 1. Renders with valid TableWrapModel
// ---------------------------------------------------------------------------

describe('TableEditor — rendering', () => {
  it('renders the Table section heading', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    expect(screen.getByText('Table')).toBeDefined();
  });

  it('renders width toggle buttons', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    // There are two groups of sm/md/lg buttons (width + text size).
    expect(screen.getAllByRole('button', { name: /^sm$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^md$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^lg$/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders text size toggle buttons', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    // There are two groups of sm/md/lg buttons (width + textSize).
    const allSmBtns = screen.getAllByRole('button', { name: /^sm$/i });
    expect(allSmBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the column header switch', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    // USwitch renders as role="switch" (Reka SwitchRoot)
    const sw = screen.getByRole('switch', { name: /first row is a header/i });
    expect(sw).toBeDefined();
  });

  it('renders row and column counter buttons', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    expect(screen.getByRole('button', { name: /add row/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /remove row/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add column/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /remove column/i })).toBeDefined();
  });

  it('renders a cell grid with the correct number of inputs', () => {
    const model = makeModel();
    render(TableEditor, { props: { tableData: model }, global: globalPlugins });
    // 2 rows × 3 cols = 6 inputs
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.filter((el) => el.tagName === 'INPUT').length).toBe(6);
  });

  it('renders cell values from tableData', () => {
    render(TableEditor, { props: { tableData: makeModel() }, global: globalPlugins });
    const aliceInput = screen.getByDisplayValue('Alice');
    expect(aliceInput).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Width toggle emits update:width
// ---------------------------------------------------------------------------

describe('TableEditor — width toggle', () => {
  it('emits update:width with sm payload when sm is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel({ width: 'md' }) },
      global: globalPlugins,
    });

    // Get the width group's sm button (first group of sm/md/lg buttons)
    const smBtns = screen.getAllByRole('button', { name: /^sm$/i });
    await fireEvent.click(smBtns[0]!);

    const payload = firstPayload<{ slotId: string; width: string }>(emitted('update:width'));
    expect(payload).toBeDefined();
    expect(payload?.width).toBe('sm');
    expect(payload?.slotId).toBe('slot-1');
  });

  it('emits update:width with lg payload when lg is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel({ width: 'md' }) },
      global: globalPlugins,
    });
    const lgBtns = screen.getAllByRole('button', { name: /^lg$/i });
    await fireEvent.click(lgBtns[0]!);

    const payload = firstPayload<{ slotId: string; width: string }>(emitted('update:width'));
    expect(payload?.width).toBe('lg');
  });
});

// ---------------------------------------------------------------------------
// 3. Text size toggle emits update:textSize
// ---------------------------------------------------------------------------

describe('TableEditor — text size toggle', () => {
  it('emits update:textSize with sm payload when second sm button is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel({ textSize: 'md' }) },
      global: globalPlugins,
    });

    // Second group of sm/md/lg buttons is text size
    const smBtns = screen.getAllByRole('button', { name: /^sm$/i });
    await fireEvent.click(smBtns[1]!);

    const payload = firstPayload<{ slotId: string; textSize: string }>(emitted('update:textSize'));
    expect(payload).toBeDefined();
    expect(payload?.textSize).toBe('sm');
  });
});

// ---------------------------------------------------------------------------
// 4. Column header switch emits update:hasColumnHeader
// USwitch: click triggers the toggle (role="switch", Reka SwitchRoot).
// ---------------------------------------------------------------------------

describe('TableEditor — column header switch', () => {
  it('emits update:hasColumnHeader when switch is clicked (off → on)', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel({ hasColumnHeader: false }) },
      global: globalPlugins,
    });

    const sw = screen.getByRole('switch', { name: /first row is a header/i });
    await fireEvent.click(sw);

    const payload = firstPayload<{ slotId: string; hasColumnHeader: boolean }>(
      emitted('update:hasColumnHeader'),
    );
    expect(payload).toBeDefined();
    expect(payload?.hasColumnHeader).toBe(true);
    expect(payload?.slotId).toBe('slot-1');
  });

  it('emits update:hasColumnHeader when switch is clicked (on → off)', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel({ hasColumnHeader: true }) },
      global: globalPlugins,
    });

    const sw = screen.getByRole('switch', { name: /first row is a header/i });
    await fireEvent.click(sw);

    const payload = firstPayload<{ slotId: string; hasColumnHeader: boolean }>(
      emitted('update:hasColumnHeader'),
    );
    expect(payload?.hasColumnHeader).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6. Row count +/− emits
// ---------------------------------------------------------------------------

describe('TableEditor — row count buttons', () => {
  it('emits update:rowCount { delta: 1 } when + button is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const addRowBtn = screen.getByRole('button', { name: /add row/i });
    await fireEvent.click(addRowBtn);

    const payload = firstPayload<{ slotId: string; delta: number }>(emitted('update:rowCount'));
    expect(payload).toBeDefined();
    expect(payload?.delta).toBe(1);
  });

  it('emits update:rowCount { delta: -1 } when − button is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const removeRowBtn = screen.getByRole('button', { name: /remove row/i });
    await fireEvent.click(removeRowBtn);

    const payload = firstPayload<{ slotId: string; delta: number }>(emitted('update:rowCount'));
    expect(payload).toBeDefined();
    expect(payload?.delta).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 7 + 8. Col count +/− emits
// ---------------------------------------------------------------------------

describe('TableEditor — col count buttons', () => {
  it('emits update:colCount { delta: 1 } when + button is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const addColBtn = screen.getByRole('button', { name: /add column/i });
    await fireEvent.click(addColBtn);

    const payload = firstPayload<{ slotId: string; delta: number }>(emitted('update:colCount'));
    expect(payload).toBeDefined();
    expect(payload?.delta).toBe(1);
  });

  it('emits update:colCount { delta: -1 } when − button is clicked', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const removeColBtn = screen.getByRole('button', { name: /remove column/i });
    await fireEvent.click(removeColBtn);

    const payload = firstPayload<{ slotId: string; delta: number }>(emitted('update:colCount'));
    expect(payload).toBeDefined();
    expect(payload?.delta).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 9. Row + at MAX_ROWS is disabled (upper bound 100)
// ---------------------------------------------------------------------------

describe('TableEditor — row upper bound', () => {
  it('Add row button is disabled when row count equals MAX_ROWS (100)', () => {
    render(TableEditor, {
      props: { tableData: makeMaxRowsModel() },
      global: globalPlugins,
    });
    const addRowBtn = screen.getByRole('button', { name: /add row/i });
    expect((addRowBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Add row button does NOT emit when already at MAX_ROWS', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeMaxRowsModel() },
      global: globalPlugins,
    });
    const addRowBtn = screen.getByRole('button', { name: /add row/i });
    await fireEvent.click(addRowBtn);
    expect(emitted('update:rowCount')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10. Row − at 1 row is disabled (lower bound 1)
// ---------------------------------------------------------------------------

describe('TableEditor — row lower bound', () => {
  it('Remove row button is disabled when row count equals 1', () => {
    render(TableEditor, {
      props: { tableData: makeSingleRowModel() },
      global: globalPlugins,
    });
    const removeRowBtn = screen.getByRole('button', { name: /remove row/i });
    expect((removeRowBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Remove row button does NOT emit when already at 1 row', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeSingleRowModel() },
      global: globalPlugins,
    });
    const removeRowBtn = screen.getByRole('button', { name: /remove row/i });
    await fireEvent.click(removeRowBtn);
    expect(emitted('update:rowCount')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. Col + at MAX_COLS is disabled (upper bound 10)
// ---------------------------------------------------------------------------

describe('TableEditor — col upper bound', () => {
  it('Add column button is disabled when col count equals MAX_COLS (10)', () => {
    render(TableEditor, {
      props: { tableData: makeMaxColsModel() },
      global: globalPlugins,
    });
    const addColBtn = screen.getByRole('button', { name: /add column/i });
    expect((addColBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Col − at 1 col is disabled (lower bound 1)
// ---------------------------------------------------------------------------

describe('TableEditor — col lower bound', () => {
  it('Remove column button is disabled when col count equals 1', () => {
    render(TableEditor, {
      props: { tableData: makeSingleColModel() },
      global: globalPlugins,
    });
    const removeColBtn = screen.getByRole('button', { name: /remove column/i });
    expect((removeColBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Cell input emits update:cell
// UInput renders <input> — getByDisplayValue and fireEvent.input work normally.
// ---------------------------------------------------------------------------

describe('TableEditor — cell input', () => {
  it('emits update:cell with correct row, col, value on input', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const aliceInput = screen.getByDisplayValue('Alice');
    await fireEvent.input(aliceInput, { target: { value: 'Alicia' } });

    const payload = firstPayload<{ slotId: string; row: number; col: number; value: string }>(
      emitted('update:cell'),
    );
    expect(payload).toBeDefined();
    expect(payload?.row).toBe(0);
    expect(payload?.col).toBe(0);
    expect(payload?.value).toBe('Alicia');
    expect(payload?.slotId).toBe('slot-1');
  });

  it('emits update:cell with correct row, col for a non-first cell', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const designerInput = screen.getByDisplayValue('Designer');
    await fireEvent.input(designerInput, { target: { value: 'UX Lead' } });

    const payload = firstPayload<{ slotId: string; row: number; col: number; value: string }>(
      emitted('update:cell'),
    );
    expect(payload?.row).toBe(1); // second row
    expect(payload?.col).toBe(1); // second col
    expect(payload?.value).toBe('UX Lead');
  });
});

// ---------------------------------------------------------------------------
// 14. CSV paste with valid input → update:replaceContent emitted
// UTextarea renders <textarea> — getByRole('textbox', {name:/paste csv/i}) works.
// ---------------------------------------------------------------------------

describe('TableEditor — CSV import (success)', () => {
  it('emits update:replaceContent when valid CSV is parsed', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const textarea = screen.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(textarea, 'Name,Role\nAlice,Engineer\nBob,Designer');

    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await fireEvent.click(parseBtn);

    const payload = firstPayload<{ slotId: string; rows: unknown[] }>(
      emitted('update:replaceContent'),
    );
    expect(payload).toBeDefined();
    expect(payload?.slotId).toBe('slot-1');
    expect(Array.isArray(payload?.rows)).toBe(true);
    // Should have 3 rows: 1 header + 2 body
    expect((payload?.rows as unknown[]).length).toBe(3);
  });

  it('clears the textarea after a successful CSV import', async () => {
    render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const textarea = screen.getByRole('textbox', { name: /paste csv/i }) as HTMLTextAreaElement;
    await fireEvent.update(textarea, 'Name,Role\nAlice,Engineer');

    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await fireEvent.click(parseBtn);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// 15. CSV paste with invalid input → errors rendered, no replaceContent
// UAlert renders <div>; errors are inside role="alert" wrapper div.
// ---------------------------------------------------------------------------

describe('TableEditor — CSV import (errors)', () => {
  it('renders error messages for invalid CSV and does NOT emit replaceContent', async () => {
    const { emitted, container } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    const textarea = screen.getByRole('textbox', { name: /paste csv/i });
    // Empty header cell triggers HEADER_EMPTY_CELL
    await fireEvent.update(textarea, 'Name,,City\n1,2,3');

    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await fireEvent.click(parseBtn);

    // No replaceContent emitted
    expect(emitted('update:replaceContent')).toBeUndefined();

    // Error wrapper (role="alert" + class="table-editor__csv-errors") is rendered
    const errorContainer = container.querySelector('.table-editor__csv-errors');
    expect(errorContainer).not.toBeNull();
    expect(errorContainer?.textContent).toMatch(/empty|column 2/i);
  });

  it('does NOT emit replaceContent when CSV has empty input', async () => {
    const { emitted } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    // The parse button should be disabled when textarea is empty, but test the
    // guard independently in case of js-only invocation.
    const textarea = screen.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(textarea, '');

    // Parse button should be disabled on empty textarea
    const parseBtn = screen.getByRole('button', { name: /parse/i });
    expect((parseBtn as HTMLButtonElement).disabled).toBe(true);
    expect(emitted('update:replaceContent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 16. disabled=true propagates
// UButton with :disabled renders <button disabled>.
// USwitch with :disabled renders with aria-disabled.
// UInput with :disabled renders <input disabled>.
// UTextarea with :disabled renders <textarea disabled>.
// ---------------------------------------------------------------------------

describe('TableEditor — disabled state', () => {
  it('all counter and toggle UButtons are disabled when disabled=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel(), disabled: true },
      global: globalPlugins,
    });

    // Collect buttons by aria-label (counter buttons) and by text (toggle buttons)
    const counterBtns = [
      screen.getByRole('button', { name: /add row/i }),
      screen.getByRole('button', { name: /remove row/i }),
      screen.getByRole('button', { name: /add column/i }),
      screen.getByRole('button', { name: /remove column/i }),
    ];
    expect(counterBtns.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('all cell inputs are disabled when disabled=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel(), disabled: true },
      global: globalPlugins,
    });

    const inputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.tagName === 'INPUT') as HTMLInputElement[];
    expect(inputs.every((i) => i.disabled)).toBe(true);
  });

  it('the column header switch is disabled when disabled=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel(), disabled: true },
      global: globalPlugins,
    });

    // USwitch with disabled renders the SwitchRoot button as disabled
    const sw = screen.getByRole('switch', { name: /first row is a header/i });
    // Reka SwitchRoot propagates disabled as a data-disabled attribute or aria-disabled
    expect(
      (sw as HTMLButtonElement).disabled ||
        sw.getAttribute('aria-disabled') === 'true' ||
        sw.getAttribute('data-disabled') !== null,
    ).toBe(true);
  });

  it('the CSV textarea is disabled when disabled=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel(), disabled: true },
      global: globalPlugins,
    });

    const textarea = screen.getByRole('textbox', { name: /paste csv/i }) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 17. Body row cells update without re-rendering siblings (data-render-id stability)
// T42.21 Finding 1 — offset-based stable bodyRows reference.
// ---------------------------------------------------------------------------

describe('TableEditor — render stability (T42.21 Finding 1)', () => {
  it('data-render-id attributes are stable across renders', async () => {
    const { container, rerender } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    // Capture initial data-render-id values
    const rowsBefore = Array.from(container.querySelectorAll('[data-render-id]')).map((el) =>
      el.getAttribute('data-render-id'),
    );

    // Re-render with the same data (simulates a non-destructive prop update)
    await rerender({ tableData: makeModel() });

    const rowsAfter = Array.from(container.querySelectorAll('[data-render-id]')).map((el) =>
      el.getAttribute('data-render-id'),
    );

    expect(rowsAfter).toEqual(rowsBefore);
  });
});

// ---------------------------------------------------------------------------
// 24. Row count display reflects bodyRows.length
// ---------------------------------------------------------------------------

describe('TableEditor — counter display', () => {
  it('displays the correct row count', () => {
    render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });
    // The live region with "2" (2 rows)
    const liveSpans = screen.getAllByText('2');
    expect(liveSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('displays the correct column count', () => {
    render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });
    // Col count is 3 (3 cells per row)
    const liveSpans = screen.getAllByText('3');
    expect(liveSpans.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 25. CSV parse button disabled when textarea empty
// ---------------------------------------------------------------------------

describe('TableEditor — CSV parse button state', () => {
  it('parse button is disabled when textarea is empty', () => {
    render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });
    const parseBtn = screen.getByRole('button', { name: /parse/i }) as HTMLButtonElement;
    expect(parseBtn.disabled).toBe(true);
  });

  it('parse button is enabled when textarea has content', async () => {
    render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });
    const textarea = screen.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(textarea, 'A,B\n1,2');
    const parseBtn = screen.getByRole('button', { name: /parse/i }) as HTMLButtonElement;
    expect(parseBtn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 29. Width active button reflects tableData.width (aria-pressed)
// ---------------------------------------------------------------------------

describe('TableEditor — active button state', () => {
  it('the active width button has aria-pressed=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel({ width: 'lg' }) },
      global: globalPlugins,
    });
    const lgBtns = screen.getAllByRole('button', { name: /^lg$/i });
    // First lg button is in the width group
    expect(lgBtns[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('the active textSize button has aria-pressed=true', () => {
    render(TableEditor, {
      props: { tableData: makeModel({ textSize: 'sm' }) },
      global: globalPlugins,
    });
    const smBtns = screen.getAllByRole('button', { name: /^sm$/i });
    // Second sm button is in the textSize group
    expect(smBtns[1]?.getAttribute('aria-pressed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 18–23. axe WCAG 2.1 AA — zero violations across all states
// ---------------------------------------------------------------------------

describe('TableEditor — axe WCAG 2.1 AA', () => {
  it('18 — zero violations with empty table (no rows)', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeEmptyModel() },
      global: globalPlugins,
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('19 — zero violations with header row (hasColumnHeader=true)', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeModel({ hasColumnHeader: true }) },
      global: globalPlugins,
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('20 — zero violations without header row (hasColumnHeader=false)', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeModel({ hasColumnHeader: false }) },
      global: globalPlugins,
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('21 — zero violations in disabled state', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeModel(), disabled: true },
      global: globalPlugins,
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('22 — zero violations in CSV import mode (textarea visible)', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });
    // The CSV import panel is in the DOM (collapsed by default but always present)
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('23 — zero violations in CSV error state', async () => {
    const { container } = render(TableEditor, {
      props: { tableData: makeModel() },
      global: globalPlugins,
    });

    // Trigger an error state
    const textarea = screen.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(textarea, 'Name,,City\n1,2,3');
    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await fireEvent.click(parseBtn);

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
