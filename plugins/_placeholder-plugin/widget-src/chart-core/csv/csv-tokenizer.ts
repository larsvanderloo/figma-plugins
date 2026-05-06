// ============================================================
// Chart Builder Widget — CSV Tokenizer
// ============================================================
//
// Verantwoordelijkheid: ruwe tekst → string[][]
//   - Dialect-detectie (';' / ',' / tab) op basis van per-regel-frequentie
//     over de eerste 5 rijen.
//   - RFC 4180-achtige quote-handling:
//       "foo,bar"  → één cel met waarde  foo,bar
//       ""         → escaped aanhalingsteken, levert "
//   - Lege rijen worden BEHOUDEN (filtering is verantwoordelijkheid van
//     csv-mapper, niet van de tokenizer).
//   - Lege cellen worden BEHOUDEN (idem).
//
// Geen semantiek hier: geen header-detectie, geen TOTAAL-filter,
// geen nummerparse — die horen in csv-mapper.

import type { CsvDialect, CsvRow } from './types';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export interface TokenizeResult {
  dialect: CsvDialect;
  rows: CsvRow[];
}

/**
 * Tokeniseer een CSV/TSV-string naar een matrix van cellen.
 *
 * @param input - Ruwe CSV-tekst, afkomstig van clipboard-plak of bestand.
 * @returns Gedetecteerd dialect + matrix van cellen.
 */
export function tokenize(input: string): TokenizeResult {
  if (!input) {
    return { dialect: 'semicolon', rows: [] };
  }

  // Normaliseer regelafbrekers: \r\n en \r → \n
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawLines = normalized.split('\n');

  // Detecteer dialect op basis van de eerste 5 niet-lege regels.
  const dialect = detectDialect(rawLines);
  const separator = dialectToSeparator(dialect);

  const rows: CsvRow[] = rawLines.map(function (line) {
    return parseLine(line, separator);
  });

  return { dialect: dialect, rows: rows };
}

// ----------------------------------------------------------------
// Dialect detection
// ----------------------------------------------------------------

/**
 * Telt het voorkomen van elk delimiterteken per regel over de eerste
 * SAMPLE_LINES niet-lege regels en kiest het meest voorkomende.
 * Tab wint bij gelijkspel (minder kans op vals-positief in vrije tekst).
 */
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

  // Volgorde: tab > puntkomma > komma (tab is unambiguous)
  if (tabTotal > 0 && tabTotal >= semicolonTotal && tabTotal >= commaTotal) {
    return 'tab';
  }
  if (semicolonTotal >= commaTotal) {
    return 'semicolon';
  }
  return 'comma';
}

/**
 * Telt hoe vaak `char` buiten aanhalingstekens voorkomt in `line`.
 * Quotes volgen RFC 4180: veld begint met " → alles tot sluitend "
 * (met "" als escape voor ") is quoted.
 */
function countOutsideQuotes(line: string, char: string): number {
  var count = 0;
  var inQuote = false;

  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuote) {
      if (c === '"') {
        // Kijk vooruit: "" = escaped quote, geen einde van het veld
        if (i + 1 < line.length && line[i + 1] === '"') {
          i++; // sla tweede " over
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

// ----------------------------------------------------------------
// Line parser
// ----------------------------------------------------------------

/**
 * Splitst één regel op `separator`, met RFC 4180 quote-handling.
 * Lege regel → één lege cel (zodat de rij-matrix consistent blijft).
 */
function parseLine(line: string, separator: string): CsvRow {
  var cells: string[] = [];
  var current = '';
  var inQuote = false;
  var i = 0;

  while (i < line.length) {
    var c = line[i];

    if (inQuote) {
      if (c === '"') {
        // Kijk vooruit voor ""
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
        // Quoted veld begint alleen als " direct na separator of aan het begin staat
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

  // Laatste cel
  cells.push(current);

  return cells;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

export function dialectToSeparator(dialect: CsvDialect): string {
  if (dialect === 'semicolon') return ';';
  if (dialect === 'tab') return '\t';
  return ',';
}
