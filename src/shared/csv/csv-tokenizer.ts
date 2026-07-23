// Raw text → string[][] only. Empty rows and empty cells are kept on purpose:
// filtering and all semantics (headers, totals, number parsing) live in csv-mapper.

import type { CsvDialect, CsvRow } from './types';

export interface TokenizeResult {
  dialect: CsvDialect;
  rows: CsvRow[];
}

export function tokenize(input: string): TokenizeResult {
  if (!input) {
    return { dialect: 'semicolon', rows: [] };
  }

  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawLines = normalized.split('\n');

  const dialect = detectDialect(rawLines);
  const separator = dialectToSeparator(dialect);

  const rows: CsvRow[] = rawLines.map(function (line) {
    return parseLine(line, separator);
  });

  return { dialect: dialect, rows: rows };
}

const SAMPLE_LINES = 5;

function detectDialect(lines: string[]): CsvDialect {
  var semicolonTotal = 0;
  var commaTotal = 0;
  var tabTotal = 0;
  var sampled = 0;

  for (var i = 0; i < lines.length && sampled < SAMPLE_LINES; i++) {
    var line = lines[i];
    if (line.trim() === '') {
      continue;
    }
    sampled++;

    semicolonTotal += countOutsideQuotes(line, ';');
    commaTotal += countOutsideQuotes(line, ',');
    tabTotal += countOutsideQuotes(line, '\t');
  }

  // Tab wins ties: least likely to be a false positive in free text.
  if (tabTotal > 0 && tabTotal >= semicolonTotal && tabTotal >= commaTotal) {
    return 'tab';
  }
  if (semicolonTotal >= commaTotal) {
    return 'semicolon';
  }
  return 'comma';
}

function countOutsideQuotes(line: string, char: string): number {
  var count = 0;
  var inQuote = false;

  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuote) {
      if (c === '"') {
        // "" is an escaped quote (RFC 4180), not the end of the field.
        if (i + 1 < line.length && line[i + 1] === '"') {
          i++;
        } else {
          inQuote = false;
        }
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === char) {
        count++;
      }
    }
  }

  return count;
}

// An empty line yields one empty cell so the row matrix stays consistent.
function parseLine(line: string, separator: string): CsvRow {
  var cells: string[] = [];
  var current = '';
  var inQuote = false;
  var i = 0;

  while (i < line.length) {
    var c = line[i];

    if (inQuote) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuote = false;
          i++;
          continue;
        }
      } else {
        current += c;
        i++;
      }
    } else {
      if (c === '"' && current === '') {
        // A quote opens a quoted field only at the start of a cell; mid-cell quotes are literal.
        inQuote = true;
        i++;
      } else if (c === separator) {
        cells.push(current);
        current = '';
        i++;
      } else {
        current += c;
        i++;
      }
    }
  }

  cells.push(current);

  return cells;
}

export function dialectToSeparator(dialect: CsvDialect): string {
  if (dialect === 'semicolon') return ';';
  if (dialect === 'tab') return '\t';
  return ',';
}
