// sections/TableEditor/src/csv-schema.ts
//
// CSV import schema + parser for the TableEditor section.
//
// Exports:
//   - csvParseConfig          — default + configurable limits
//   - csvHeaderSchema         — Zod schema for the header row
//   - csvRowSchema            — Zod schema for a single body row (needs colCount)
//   - parseCsv(input, config) — typed result parser, never throws
//   - CsvParseError           — error type with location info
//   - TableData / TableRow    — local mirror of messages.ts TableWrapModel shape
//
// This module is pure TypeScript — no Vue, no DOM.
// Import this in the TableEditor section (4.1) and in any code-side validation.
//
// Policy decisions (documented):
//   - Header row: required; cells must be non-empty strings, no duplicates.
//   - Body cells: empty strings are allowed (original csv.ts allowed empty cells;
//     the renderer filters fully-empty rows at render time).
//   - Cell value length: capped at MAX_CELL_LENGTH (default 200 chars).
//   - Row count: capped at maxRows (default 100, exclusive of header).
//   - Column count: capped at maxCols (default 10).
//   - Rows with mismatched column count are individually reported as errors.
//   - Non-rectangular input does not short-circuit — all rows are checked.
//   - Unicode and emoji cells are fully supported (no ASCII restriction).
//   - Quoted CSV fields: a minimal tokenizer handles double-quoted fields
//     including embedded commas and escaped quotes ("").
//
// Owner: ui-engineer

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Local type mirrors
// ---------------------------------------------------------------------------
// These intentionally re-declare shapes from plugins/welder-editor/shared/messages.ts
// so this section remains portable. The shapes must stay structurally compatible;
// any deviation is a type error at the call site in the consuming plugin.

/** Figma node-id string. Empty string for cells that have not been written to canvas yet. */
export type NodeId = string;

/** A single cell within a table row. */
export interface TableCell {
  /** FRAME node-id; empty string for new cells not yet on canvas. */
  cellNodeId: NodeId;
  /** Cell text content. May be empty string for body cells. */
  value: string;
}

/** A single row within a table. */
export interface TableRow {
  /** FRAME node-id; empty string for new rows not yet on canvas. */
  rowNodeId: NodeId;
  cells: TableCell[];
}

/**
 * Top-level table data shape — mirrors messages.ts TableWrapModel.
 * slotId/width/hasColumnHeader/textSize are intentionally absent here;
 * the consumer (TableEditor.vue in 4.1) sets those from UI state.
 * This type carries only the parsed CSV rows.
 */
export interface TableData {
  rows: TableRow[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CsvParseConfig {
  /** Maximum number of body rows (excluding header). Default: 100. */
  maxRows: number;
  /** Maximum number of columns (enforced on header row). Default: 10. */
  maxCols: number;
  /** Maximum character count per cell value. Default: 200. */
  maxCellLength: number;
}

export const DEFAULT_CSV_PARSE_CONFIG: CsvParseConfig = {
  maxRows: 100,
  maxCols: 10,
  maxCellLength: 200,
};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export interface CsvParseError {
  /**
   * 0-based row index in the raw CSV (including the header row at index 0).
   * -1 for structural errors that do not map to a specific row (e.g. empty input).
   */
  row: number;
  /**
   * 0-based column index within the row, or -1 when the error applies to
   * the whole row rather than a specific cell.
   */
  col: number;
  /** Human-readable message suitable for display in a toast. */
  message: string;
  /** Machine-readable error code for programmatic handling. */
  code:
    | 'EMPTY_INPUT'
    | 'HEADER_EMPTY_CELL'
    | 'HEADER_DUPLICATE'
    | 'HEADER_TOO_MANY_COLS'
    | 'ROW_COL_MISMATCH'
    | 'CELL_TOO_LONG'
    | 'TOO_MANY_ROWS';
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single cell value.
 * Accepts any string (including empty, unicode, emoji) up to maxCellLength.
 * Pass the config to build the schema — this is a factory to allow configurable bounds.
 */
export function buildCellSchema(maxCellLength: number): z.ZodString {
  return z.string().max(maxCellLength, `Cell value exceeds ${maxCellLength} character limit`);
}

/**
 * Zod schema for a header cell: non-empty string, length-bounded.
 */
export function buildHeaderCellSchema(maxCellLength: number): z.ZodString {
  return z
    .string()
    .min(1, 'Header cell must not be empty')
    .max(maxCellLength, `Header cell exceeds ${maxCellLength} character limit`);
}

/**
 * Zod schema for the header row: array of non-empty, length-bounded strings.
 * Duplicate detection is done after Zod parse (Zod cannot express cross-item uniqueness).
 */
export function buildHeaderRowSchema(
  maxCols: number,
  maxCellLength: number,
): z.ZodArray<z.ZodString> {
  return z
    .array(buildHeaderCellSchema(maxCellLength))
    .min(1, 'Header row must have at least one column')
    .max(maxCols, `Header row exceeds ${maxCols} column limit`);
}

/**
 * Zod schema for a body row: array of strings (empty allowed), fixed length.
 * The colCount constraint is enforced structurally (not via Zod) because the
 * expected column count is determined by the header row at runtime.
 */
export function buildBodyRowSchema(maxCellLength: number): z.ZodArray<z.ZodString> {
  return z.array(buildCellSchema(maxCellLength));
}

// ---------------------------------------------------------------------------
// Minimal CSV tokenizer (~25 LOC, no deps)
// ---------------------------------------------------------------------------

/**
 * Split a single CSV line into fields, respecting double-quoted fields.
 * Supports:
 *   - Quoted fields containing commas: `"hello, world"` → `hello, world`
 *   - Escaped double-quotes inside quoted fields: `"say ""hi"""` → `say "hi"`
 *   - Unquoted fields: trimmed of leading/trailing whitespace.
 *   - Quoted fields: NOT trimmed (whitespace inside quotes is preserved).
 *   - Trailing comma: produces a trailing empty-string field.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let pos = 0;
  const len = line.length;

  // An empty line produces one empty field (consistent with RFC 4180).
  // Callers filter blank lines before calling this function.

  while (pos < len) {
    if (line[pos] === '"') {
      // Quoted field.
      pos++; // skip opening quote
      let value = '';
      while (pos < len) {
        if (line[pos] === '"') {
          if (pos + 1 < len && line[pos + 1] === '"') {
            // Escaped quote ("").
            value += '"';
            pos += 2;
          } else {
            pos++; // skip closing quote
            break;
          }
        } else {
          value += line[pos];
          pos++;
        }
      }
      fields.push(value);
      // Skip comma separator.
      if (pos < len && line[pos] === ',') pos++;
    } else {
      // Unquoted field — read until comma or end of line.
      const start = pos;
      while (pos < len && line[pos] !== ',') pos++;
      fields.push(line.slice(start, pos).trim());
      if (pos < len) pos++; // skip comma
    }
  }

  // Handle the case where the line is empty or ends with a comma:
  // a trailing comma means one more empty field.
  if (len === 0 || line[len - 1] === ',') {
    fields.push('');
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into a typed TableData result.
 *
 * Returns `{ ok: true; data: TableData }` on success,
 * or `{ ok: false; errors: CsvParseError[] }` when any validation rule fails.
 *
 * The parser is non-short-circuiting: all rows are checked even after an
 * error is found, so the caller can surface all problems at once.
 *
 * Never throws.
 */
export function parseCsv(
  input: string,
  config: CsvParseConfig = DEFAULT_CSV_PARSE_CONFIG,
): { ok: true; data: TableData } | { ok: false; errors: CsvParseError[] } {
  const errors: CsvParseError[] = [];

  // Guard: empty input.
  if (typeof input !== 'string' || input.trim().length === 0) {
    return {
      ok: false,
      errors: [
        {
          row: -1,
          col: -1,
          code: 'EMPTY_INPUT',
          message: 'CSV input is empty.',
        },
      ],
    };
  }

  // Split into non-empty lines (skip blank lines, consistent with original csv.ts).
  const rawLines = input.split(/\r?\n/);
  const lines: string[] = rawLines.filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      errors: [
        {
          row: -1,
          col: -1,
          code: 'EMPTY_INPUT',
          message: 'CSV input contains no data rows.',
        },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Parse + validate header row (line index 0).
  // ---------------------------------------------------------------------------
  const headerLine = lines[0];
  // Non-null assertion safe: lines is non-empty after the guard above.
  const headerFields = splitCsvLine(headerLine!);

  // Validate header cells via Zod.
  const headerSchema = buildHeaderRowSchema(config.maxCols, config.maxCellLength);
  const headerResult = headerSchema.safeParse(headerFields);

  if (!headerResult.success) {
    // Map Zod issues to CsvParseError entries.
    for (const issue of headerResult.error.issues) {
      const colIndex =
        issue.path.length > 0 && typeof issue.path[0] === 'number' ? issue.path[0] : -1;

      if (issue.code === 'too_big' && issue.path.length === 0) {
        // Array-level max — too many columns.
        errors.push({
          row: 0,
          col: -1,
          code: 'HEADER_TOO_MANY_COLS',
          message: `Header has ${headerFields.length} columns; maximum is ${config.maxCols}.`,
        });
      } else if (issue.code === 'too_small' && colIndex >= 0) {
        // Empty header cell.
        errors.push({
          row: 0,
          col: colIndex,
          code: 'HEADER_EMPTY_CELL',
          message: `Header cell at column ${colIndex + 1} is empty.`,
        });
      } else if (issue.code === 'too_big' && colIndex >= 0) {
        // Header cell too long.
        errors.push({
          row: 0,
          col: colIndex,
          code: 'CELL_TOO_LONG',
          message: `Header cell at column ${colIndex + 1} exceeds ${config.maxCellLength} characters.`,
        });
      } else {
        // Fallback for any other Zod issue.
        errors.push({
          row: 0,
          col: colIndex,
          code: 'HEADER_EMPTY_CELL',
          message: issue.message,
        });
      }
    }
  }

  // Check duplicate header names (after Zod, on valid header fields).
  // Only run duplicate check if the header cells themselves passed Zod validation.
  const seen = new Set<string>();
  for (let c = 0; c < headerFields.length; c++) {
    const cell = headerFields[c];
    // Only flag non-empty cells for duplicates (empty cells already reported above).
    if (cell !== undefined && cell.length > 0) {
      const normalized = cell.toLowerCase();
      if (seen.has(normalized)) {
        errors.push({
          row: 0,
          col: c,
          code: 'HEADER_DUPLICATE',
          message: `Duplicate header name "${cell}" at column ${c + 1}.`,
        });
      } else {
        seen.add(normalized);
      }
    }
  }

  // Column count is determined by the (possibly-clamped) header.
  // If header has too many cols, we use maxCols as the expected col count
  // so body row validation still runs sensibly.
  const colCount = Math.min(headerFields.length, config.maxCols);

  // ---------------------------------------------------------------------------
  // Parse + validate body rows (line indices 1..N).
  // ---------------------------------------------------------------------------
  const bodyLines = lines.slice(1);
  const bodyRowSchema = buildBodyRowSchema(config.maxCellLength);

  // Check row count limit.
  if (bodyLines.length > config.maxRows) {
    errors.push({
      row: config.maxRows + 1, // 1-based for human readability in the message
      col: -1,
      code: 'TOO_MANY_ROWS',
      message: `CSV has ${bodyLines.length} data rows; maximum is ${config.maxRows}.`,
    });
  }

  const parsedRows: TableRow[] = [];

  // Add header as row 0.
  if (errors.length === 0 || !errors.some((e) => e.row === 0 && e.col === -1)) {
    // Only add header row if it passed column-count validation.
    const headerCells: TableCell[] = headerFields
      .slice(0, colCount)
      .map((v) => ({ cellNodeId: '', value: v }));
    parsedRows.push({ rowNodeId: '', cells: headerCells });
  }

  // Process body rows up to maxRows limit.
  const cappedBodyLines = bodyLines.slice(0, config.maxRows);

  for (let i = 0; i < cappedBodyLines.length; i++) {
    const rawLine = cappedBodyLines[i];
    // Non-null assertion safe: we are iterating over a slice of a non-empty array.
    const fields = splitCsvLine(rawLine!);
    const lineIndex = i + 1; // 0-based index in `lines` (header is index 0)

    // Check column count parity.
    if (fields.length !== colCount) {
      errors.push({
        row: lineIndex,
        col: -1,
        code: 'ROW_COL_MISMATCH',
        message: `Row ${lineIndex + 1} has ${fields.length} column${fields.length === 1 ? '' : 's'}; expected ${colCount}.`,
      });
      // Continue validation — still check cell lengths on this row.
    }

    // Validate cell values via Zod.
    const rowResult = bodyRowSchema.safeParse(fields);
    if (!rowResult.success) {
      for (const issue of rowResult.error.issues) {
        const colIndex =
          issue.path.length > 0 && typeof issue.path[0] === 'number' ? issue.path[0] : -1;
        errors.push({
          row: lineIndex,
          col: colIndex,
          code: 'CELL_TOO_LONG',
          message: `Cell at row ${lineIndex + 1}, column ${colIndex + 1} exceeds ${config.maxCellLength} characters.`,
        });
      }
    }

    if (rowResult.success) {
      const cells: TableCell[] = rowResult.data
        .slice(0, colCount)
        .map((v) => ({ cellNodeId: '', value: v }));
      parsedRows.push({ rowNodeId: '', cells });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: { rows: parsedRows } };
}
