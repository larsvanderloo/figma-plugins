// ============================================================
// Chart Builder Widget — CSV Mapper
// ============================================================
//
// Verantwoordelijkheid: CsvBlock + CsvMapping → CsvMappingResult
//
//   - Slaat header-rij over als mapping.hasHeader
//   - Slaat lege rijen stilzwijgend over (alle cellen leeg/whitespace)
//   - Filtert TOTAAL-rij op label-kolom (case-insensitive match op
//     'totaal' of 'total')
//   - Parseert labels: trim, afkappen op 32 tekens
//   - Parseert waarden via parseDutchNumber():
//       - Strip %-teken als valueFormat='percentage'
//       - Vervang NL-notatie: 1.234,56 → 1234.56
//       - parseFloat — NaN → CsvRowError
//   - Max 12 datapunten: eerste 12 worden gebruikt, rest levert
//     een waarschuwing in warnings[]
//
// Geen UI-afhankelijkheden. Pure functies, unit-testbaar.

import type { DataPoint } from '../../types';
import type { CsvBlock, CsvMapping, CsvMappingResult, CsvRowError } from './types';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Zet een CsvBlock + CsvMapping om naar een CsvMappingResult.
 *
 * @param block         - Het te verwerken blok (output van csv-blocks).
 * @param mapping       - Kolom-mapping (labelColumn, valueColumn, hasHeader).
 * @param valueFormat   - Optioneel: 'percentage' (strip %) of 'number' (default).
 * @param maxDataPoints - Maximaal aantal datapunten; default 12. Geef de chart-type-afhankelijke
 *                        waarde mee via getMaxDataPoints() voor correcte cap per grafiektype.
 */
export function mapBlock(
  block: CsvBlock,
  mapping: CsvMapping,
  valueFormat?: 'number' | 'percentage',
  maxDataPoints?: number,
): CsvMappingResult {
  var rows = block.rows;
  var totalRows = rows.length;
  var dataPoints: DataPoint[] = [];
  var errors: CsvRowError[] = [];
  var warnings: string[] = [];
  var skippedRows = 0;

  // Startindex: sla header-rij over als hasHeader
  var startRow = mapping.hasHeader ? 1 : 0;

  var MAX_DATAPOINTS = maxDataPoints !== undefined ? maxDataPoints : 12;

  for (var i = startRow; i < rows.length; i++) {
    var row = rows[i];

    // Leeg-rij-skip: alle cellen leeg of whitespace
    if (isEmptyRow(row)) {
      skippedRows++;
      continue;
    }

    // Cel ophalen voor label en value
    var rawLabel = getCellValue(row, mapping.labelColumn);
    var rawValue = getCellValue(row, mapping.valueColumn);

    // TOTAAL-rij-filter op label-kolom (case-insensitive)
    var normalizedLabel = rawLabel.trim().toUpperCase();
    if (normalizedLabel === 'TOTAAL' || normalizedLabel === 'TOTAL') {
      skippedRows++;
      continue;
    }

    // Max datapunten bereikt: daarna alleen waarschuwing toevoegen
    if (dataPoints.length >= MAX_DATAPOINTS) {
      if (warnings.length === 0) {
        warnings.push(
          'Meer dan ' +
            MAX_DATAPOINTS +
            ' datapunten gevonden; rijen na rij ' +
            (i + 1) +
            ' worden genegeerd.',
        );
      }
      continue;
    }

    // Label parsen
    var label = rawLabel.trim();

    // Waarde parsen
    var parseResult = parseDutchNumber(rawValue, valueFormat);
    if (parseResult.error !== null) {
      errors.push({
        rowIndex: i,
        column: mapping.valueColumn,
        message: 'Rij ' + (i + 1) + ": waarde '" + rawValue + "' is niet numeriek",
        rawValue: rawValue,
      });
      continue;
    }

    dataPoints.push({
      label: label,
      value: parseResult.value,
    });
  }

  return {
    dataPoints: dataPoints,
    errors: errors,
    warnings: warnings,
    skippedRows: skippedRows,
    totalRows: totalRows,
  };
}

// ----------------------------------------------------------------
// Getal-parser
// ----------------------------------------------------------------

interface ParseNumberResult {
  value: number;
  error: string | null;
}

/**
 * Parset een celwaarde als getal, met ondersteuning voor:
 *   - Nederlands nummerformaat: 1.234,56 → 1234.56
 *   - Percentage-notatie: 63% → 63 (als valueFormat='percentage')
 *   - Engels nummerformaat: 1,234.56 → ook correct
 *
 * Heuristiek decimaalscheidingsteken:
 *   Als zowel '.' als ',' aanwezig zijn: het LAATSTE teken bepaalt.
 *   NL: 1.234,56 → komma is decimaal → 1234.56
 *   EN: 1,234.56 → punt is decimaal → 1234.56
 *   Alleen komma: NL-decimaal → 3,14 → 3.14
 *   Alleen punt:  standaard-float → 3.14 → 3.14
 *
 * @param raw         - Ruwe celwaarde (mag undefined/null zijn).
 * @param valueFormat - 'percentage' → strip %-teken voor parsing.
 */
export function parseDutchNumber(
  raw: string | undefined,
  valueFormat?: 'number' | 'percentage',
): ParseNumberResult {
  if (raw === undefined || raw === null) {
    return { value: 0, error: 'Lege celwaarde' };
  }

  var v = raw.trim();

  if (v === '') {
    return { value: 0, error: 'Lege celwaarde' };
  }

  // Strip %-teken (altijd; valueFormat bepaalt alleen hoe waarde opgeslagen wordt)
  var wasPercentage = v.charAt(v.length - 1) === '%';
  if (wasPercentage) {
    v = v.slice(0, v.length - 1).trim();
  }

  // Strip leading + teken (bv. "+2%")
  if (v.charAt(0) === '+') {
    v = v.slice(1);
  }

  var hasComma = v.indexOf(',') !== -1;
  var hasDot = v.indexOf('.') !== -1;

  if (hasComma && hasDot) {
    // Zowel punt als komma aanwezig: heuristiek op positie
    var lastComma = v.lastIndexOf(',');
    var lastDot = v.lastIndexOf('.');

    if (lastComma > lastDot) {
      // NL-formaat: 1.234,56 — komma = decimaal
      v = v.replace(/\./g, '').replace(',', '.');
    } else {
      // EN-formaat: 1,234.56 — punt = decimaal
      v = v.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Alleen komma: NL-decimaalscheidingsteken → 3,14 → 3.14
    v = v.replace(',', '.');
  }
  // Alleen punt of geen scheidingsteken: standaard parseFloat

  var num = parseFloat(v);

  if (isNaN(num) || !isFinite(num)) {
    return { value: 0, error: 'Niet numeriek: ' + raw };
  }

  return { value: num, error: null };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Geeft de celwaarde op index terug, of '' als de cel ontbreekt.
 */
function getCellValue(row: string[], colIndex: number): string {
  if (colIndex < 0 || colIndex >= row.length) {
    return '';
  }
  return row[colIndex];
}

/**
 * Controleert of een rij volledig leeg is (alle cellen leeg of whitespace).
 */
function isEmptyRow(row: string[]): boolean {
  for (var i = 0; i < row.length; i++) {
    if (row[i].trim() !== '') {
      return false;
    }
  }
  return true;
}
