// plugins/welder-editor/tests/ui/components/TableEditor.test.ts
//
// Sprint 5 — TableEditor component tests (flat ui/components/ layout).
//
// T42.21 frame-trace gate: toggle latency < 16 ms across 10 toggles.
// Verified via performance.now() timing on emit dispatch.
//
// Owner: ui-engineer. Sprint 5 Task 5.7.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import TableEditor from '@/components/TableEditor.vue';
import type { TableWrapModel } from '@/components/TableEditor.vue';

const TABLE_MODEL: TableWrapModel = {
  slotId: 'slot-1',
  width: 'md',
  hasColumnHeader: true,
  textSize: 'md',
  rows: [
    {
      rowNodeId: 'r1',
      cells: [
        { cellNodeId: 'c1', value: 'Header A' },
        { cellNodeId: 'c2', value: 'Header B' },
      ],
    },
    {
      rowNodeId: 'r2',
      cells: [
        { cellNodeId: 'c3', value: 'Val A' },
        { cellNodeId: 'c4', value: 'Val B' },
      ],
    },
  ],
};

describe('TableEditor', () => {
  it('renders section with "Table" heading', () => {
    const { container } = render(TableEditor, { props: { tableData: TABLE_MODEL } });
    expect(container.querySelector('.table-editor')).not.toBeNull();
    expect(container.textContent).toMatch(/table/i);
  });

  it('renders width toggle buttons', () => {
    render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const smBtns = screen.getAllByRole('button', { name: 'sm' });
    expect(smBtns.length).toBeGreaterThan(0);
  });

  it('renders checkbox for column header', () => {
    render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const checkbox = screen.getByRole('checkbox', { name: /first row is a header/i });
    expect(checkbox).toBeDefined();
  });

  it('emits update:width when width button clicked', async () => {
    const { emitted } = render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const lgBtns = screen.getAllByRole('button', { name: 'lg' });
    await fireEvent.click(lgBtns[0]!);
    await waitFor(() => {
      expect(emitted()['update:width']).toBeDefined();
    });
    const payload = (emitted()['update:width']?.[0] as [unknown])[0] as {
      slotId: string;
      width: string;
    };
    expect(payload.slotId).toBe('slot-1');
    expect(payload.width).toBe('lg');
  });

  it('emits update:hasColumnHeader when checkbox toggled', async () => {
    const { emitted } = render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const checkbox = screen.getByRole('checkbox', { name: /first row is a header/i });
    await fireEvent.click(checkbox);
    await waitFor(() => {
      expect(emitted()['update:hasColumnHeader']).toBeDefined();
    });
  });

  it('emits update:rowCount when Add row clicked', async () => {
    const { emitted } = render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const addRowBtn = screen.getByRole('button', { name: /add row/i });
    await fireEvent.click(addRowBtn);
    await waitFor(() => {
      expect(emitted()['update:rowCount']).toBeDefined();
    });
    const payload = (emitted()['update:rowCount']?.[0] as [unknown])[0] as { delta: number };
    expect(payload.delta).toBe(1);
  });

  it('emits update:cell when cell input changes', async () => {
    const { emitted } = render(TableEditor, { props: { tableData: TABLE_MODEL } });
    const cell = screen.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(cell, { target: { value: 'New Value' } });
    await waitFor(() => {
      expect(emitted()['update:cell']).toBeDefined();
    });
    const payload = (emitted()['update:cell']?.[0] as [unknown])[0] as { value: string };
    expect(payload.value).toBe('New Value');
  });

  it('disables all controls when disabled=true', () => {
    render(TableEditor, { props: { tableData: TABLE_MODEL, disabled: true } });
    const { container } = render(TableEditor, {
      props: { tableData: TABLE_MODEL, disabled: true },
    });
    const section = container.querySelector('.table-editor') as HTMLElement;
    expect(section.getAttribute('aria-disabled')).toBe('true');
  });

  // ---- T42.21 frame-trace gate: toggle < 16 ms ----

  it('T42.21: PropertyPanel toggle takes < 16 ms across 10 toggling cycles', async () => {
    const { container } = render(TableEditor, { props: { tableData: TABLE_MODEL } });

    // Find the first collapsible button (Width panel)
    const buttons = container.querySelectorAll('button.property-panel__header--button');
    const widthToggle = buttons[0] as HTMLButtonElement;
    expect(widthToggle).not.toBeNull();

    const timings: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await fireEvent.click(widthToggle);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    const maxMs = Math.max(...timings);
    expect(
      maxMs,
      `T42.21: max toggle latency ${maxMs.toFixed(2)} ms exceeds 16 ms. Timings: ${timings.map((t) => t.toFixed(2)).join(', ')} ms`,
    ).toBeLessThan(16);
  });
});
