// sections/TableEditor/src/index.ts — barrel export.
//
// TableEditor section — CSV import schema + parser + TableEditor.vue composite view.
//
// Consumer usage (from a plugin):
//   import { TableEditor, parseCsv, DEFAULT_CSV_PARSE_CONFIG } from '@figma-plugins/sections-table-editor';
//   import type { TableData, TableRow, TableCell, CsvParseError, CsvParseConfig, TableWrapModel } from '@figma-plugins/sections-table-editor';
//
// Owner: ui-engineer.

export {
  parseCsv,
  DEFAULT_CSV_PARSE_CONFIG,
  buildCellSchema,
  buildHeaderCellSchema,
  buildHeaderRowSchema,
  buildBodyRowSchema,
} from './csv-schema.js';

export type {
  TableData,
  TableRow,
  TableCell,
  NodeId,
  CsvParseConfig,
  CsvParseError,
} from './csv-schema.js';

export { default as TableEditor } from './TableEditor.vue';

export type {
  TableEditorProps,
  TableEditorEmits,
  TableWrapModel,
  TableRowModel,
  TableCellModel,
} from './TableEditor.vue';
