# sections/TableEditor

CSV import schema + parser foundation for the Welder Editor Graphs tab.

**Sprint 4 task 4.5.** TableEditor.vue (the composite Vue view) ships in task 4.1 and imports this module.

---

## What this package ships (4.5)

- **`parseCsv(input, config?)`** — typed result parser, never throws.
- **`CsvParseError`** — error type with `row`, `col`, `code`, `message`.
- **`TableData` / `TableRow` / `TableCell`** — local mirror of `messages.ts` types.
- **`CsvParseConfig` / `DEFAULT_CSV_PARSE_CONFIG`** — configurable limits.
- **Zod schema builders** — `buildHeaderRowSchema`, `buildBodyRowSchema`, etc.

## TableData shape

`TableData` carries only `rows: TableRow[]`. Consumers set `slotId`, `width`, `hasColumnHeader`, and `textSize` from UI state when constructing the full `TableWrapModel` for the message bus.

## Policy decisions

| Rule            | Decision                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Header cells    | Non-empty, no duplicates (case-insensitive), max `maxCols`                     |
| Body cells      | Empty string allowed; renderer handles fully-empty rows                        |
| Cell length     | Max 200 chars by default (configurable)                                        |
| Max rows        | 100 body rows by default (configurable)                                        |
| Max cols        | 10 by default (configurable; original build capped by width: sm=3, md=5, lg=8) |
| Quoted fields   | Supported: `"field with, comma"`, `"say ""hi"""`                               |
| Unicode/emoji   | Fully supported                                                                |
| Non-rectangular | Each offending row reported individually; all rows checked                     |

## Downstream note (4.1)

`TableEditor.vue` (task 4.1) will import `parseCsv` and `TableData` from this package. It will compose the result into `TableWrapModel` (adding `slotId`, `width`, `hasColumnHeader`, `textSize`) and dispatch an `apply-table` message to the code side.

The `TableWrapModel`, `TableRowModel`, and `TableCellModel` types live in `plugins/welder-editor/shared/messages.ts` (owned by figma-api-engineer). This section's `TableData` / `TableRow` / `TableCell` are local mirrors — structurally compatible, kept portable.

## Usage

```ts
import { parseCsv } from '@figma-plugins/sections-table-editor';
import type { CsvParseError } from '@figma-plugins/sections-table-editor';

const result = parseCsv(csvString);

if (result.ok) {
  // result.data.rows: TableRow[]
  const tableWrapModel = {
    slotId: currentSlotId,
    width: 'md',
    hasColumnHeader: true,
    textSize: 'md',
    rows: result.data.rows.map((r) => ({
      rowNodeId: r.rowNodeId,
      cells: r.cells.map((c) => ({ cellNodeId: c.cellNodeId, value: c.value })),
    })),
  };
  // dispatch apply-table message
} else {
  // result.errors: CsvParseError[]
  // surface as toast notifications in the UI
}
```

## Owner

ui-engineer.
