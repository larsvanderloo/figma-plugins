// sections/TableEditor/src/index.ts — barrel export.
//
// TableEditor section — CSV import schema + parser foundation.
// TableEditor.vue is 4.1's job and is NOT exported here yet.
//
// Consumer usage (from a plugin):
//   import { parseCsv, DEFAULT_CSV_PARSE_CONFIG } from '@figma-plugins/sections-table-editor';
//   import type { TableData, TableRow, TableCell, CsvParseError, CsvParseConfig } from '@figma-plugins/sections-table-editor';
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
