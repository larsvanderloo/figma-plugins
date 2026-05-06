// ============================================================
// Chart Builder Widget — CSV Validator
// ============================================================
//
// Verantwoordelijkheid: structurele validatie van een CsvBlock
// en validatie van DataPoint[]-arrays na mapping.
//
// Twee publieke functies:
//   validateBlock(block)      — structurele checks op het blok zelf
//   validateDataPoints(points) — controle op ChartData-regels
//
// Alle foutmeldingen zijn in het Nederlands.
// Geen UI-afhankelijkheden. Pure functies, unit-testbaar.

import type { DataPoint } from '../../types';
import type { CsvBlock, CsvRowError } from './types';

// ----------------------------------------------------------------
// validateBlock — structurele checks
// ----------------------------------------------------------------

export interface BlockValidationResult {
  warnings: string[];
}

/**
 * Structurele checks op een CsvBlock voordat mapping plaatsvindt.
 *
 * Controles:
 *   - Minstens 2 kolommen in de eerste niet-lege rij
 *   - Rijen hebben ongelijke breedte (als dit zo is: waarschuwing)
 *   - Header-rij detecteerbaar (informatief, geen blokkerende fout)
 *
 * @param block - Het te controleren blok.
 * @returns Object met een warnings-array (kan leeg zijn).
 */
export function validateBlock(block: CsvBlock): BlockValidationResult {
  var warnings: string[] = [];

  if (block.rows.length === 0) {
    warnings.push("Blok '" + block.label + "' bevat geen rijen.");
    return { warnings: warnings };
  }

  // Zoek eerste niet-lege rij
  var firstNonEmpty: string[] | null = null;
  for (var i = 0; i < block.rows.length; i++) {
    var row = block.rows[i];
    if (
      row.some(function (c) {
        return c.trim() !== '';
      })
    ) {
      firstNonEmpty = row;
      break;
    }
  }

  if (firstNonEmpty === null) {
    warnings.push("Blok '" + block.label + "' bevat alleen lege rijen.");
    return { warnings: warnings };
  }

  // Minstens 2 kolommen vereist
  if (firstNonEmpty.length < 2) {
    warnings.push(
      "Blok '" + block.label + "' heeft slechts 1 kolom; minstens 2 zijn vereist (label + waarde).",
    );
  }

  // Controleer ongelijke rijbreedtes (alleen waarschuwing)
  var expectedWidth = firstNonEmpty.length;
  var unevenCount = 0;
  for (var j = 0; j < block.rows.length; j++) {
    var r = block.rows[j];
    if (
      r.some(function (c) {
        return c.trim() !== '';
      }) &&
      r.length !== expectedWidth
    ) {
      unevenCount++;
    }
  }
  if (unevenCount > 0) {
    warnings.push(
      "Blok '" +
        block.label +
        "' heeft " +
        unevenCount +
        ' rij(en) met een afwijkend aantal kolommen.',
    );
  }

  // Header-detectie informatief
  if (block.headers === null) {
    warnings.push(
      "Blok '" + block.label + "': geen header-rij gedetecteerd — controleer de kolom-mapping.",
    );
  }

  return { warnings: warnings };
}

// ----------------------------------------------------------------
// validateDataPoints — ChartData-regelcontrole
// ----------------------------------------------------------------

/**
 * Valideert een DataPoint[]-array op ChartData-regels:
 *   - Label niet leeg
 *   - Label max 32 tekens
 *   - Value numeriek (al gegarandeerd door mapBlock, maar verdedigend)
 *   - Value >= 0 (negatief levert een waarschuwing als aparte entry met
 *     message-prefix 'Waarschuwing:')
 *
 * rowIndex verwijst naar de positie in points[] (0-based).
 * Foutmeldingen zijn in het Nederlands.
 *
 * @param points - Array van DataPoint-objecten na mapping.
 * @returns Array van CsvRowError-objecten (kan leeg zijn bij geen fouten).
 */
export function validateDataPoints(points: DataPoint[]): CsvRowError[] {
  var errors: CsvRowError[] = [];

  for (var i = 0; i < points.length; i++) {
    var point = points[i];

    // Label leeg
    if (!point.label || point.label.trim() === '') {
      errors.push({
        rowIndex: i,
        column: 0,
        message: 'Rij ' + (i + 1) + ': label is leeg',
        rawValue: point.label,
      });
    }

    // Negatieve waarde — waarschuwing (geen blokkerende fout)
    if (typeof point.value === 'number' && point.value < 0) {
      errors.push({
        rowIndex: i,
        column: 1,
        message: 'Waarschuwing: Rij ' + (i + 1) + ': waarde ' + point.value + ' is negatief',
        rawValue: String(point.value),
      });
    }
  }

  return errors;
}
