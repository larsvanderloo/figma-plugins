// ============================================================
// Chart Builder Widget — CSV Blocks Detectie
// ============================================================
//
// Verantwoordelijkheid: string[][] → CsvBlock[]
//
// Heuristieken (Fase 2):
//
//   (a) Horizontale split — volledig lege kolom:
//       Als een kolomindex in de MEERDERHEID van niet-lege rijen
//       uitsluitend lege of ontbrekende cellen bevat, geldt die kolom
//       als scheiding. Rijen links van de scheiding vormen blok 0,
//       rechts blok 1. Meerdere lege kolommen → meerdere blokken.
//
//   (b) Verticale split (herhaalde headers) — FASE 3, NIET HIER.
//       TODO Fase 3: als een rij geen numerieke waarden bevat én
//       afwijkt van het blok erboven, start zij een nieuw verticaal blok.
//
// Header-detectie per blok:
//   De eerste rij van een blok wordt als header beschouwd als GEEN van
//   de cellen in de vermoedelijke waarde-kolommen (alle niet-eerste cellen)
//   numeriek zijn. Headers worden opgeslagen als `block.headers`.
//   Als de eerste rij numerieke cellen bevat → `headers: null`.
//
// Lege rijen (alle cellen leeg) tellen NIET mee voor de kolom-leegte-
// heuristiek, maar worden WEL meegegeven in block.rows (filtering is
// csv-mapper-verantwoordelijkheid).

import type { CsvRow, CsvBlock } from './types';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Detecteert afzonderlijke datasets (blokken) binnen een rijen-matrix.
 *
 * @param rows - Ruwe tokenizer-output: string[][]
 * @returns Een of meer CsvBlock-objecten.
 */
export function detectBlocks(rows: CsvRow[]): CsvBlock[] {
  if (rows.length === 0) {
    return [];
  }

  // Bepaal de maximale kolombreedte over alle rijen
  var maxCols = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > maxCols) {
      maxCols = rows[i].length;
    }
  }

  if (maxCols === 0) {
    return [];
  }

  // Detecteer horizontaal lege kolom-indexen
  var emptyColIndices = findEmptyColumnIndices(rows, maxCols);

  if (emptyColIndices.length === 0) {
    // Enkelvoudig blok — alle kolommen zijn gevuld
    return [buildBlock(0, rows, 0, maxCols - 1)];
  }

  // Splits op lege kolom-grenzen
  var blocks: CsvBlock[] = [];
  var blockIndex = 0;
  var startCol = 0;

  for (var j = 0; j < emptyColIndices.length; j++) {
    var emptyCol = emptyColIndices[j];
    if (emptyCol > startCol) {
      blocks.push(buildBlock(blockIndex, rows, startCol, emptyCol - 1));
      blockIndex++;
    }
    startCol = emptyCol + 1;
  }

  // Resterende kolommen na de laatste lege kolom
  if (startCol <= maxCols - 1) {
    blocks.push(buildBlock(blockIndex, rows, startCol, maxCols - 1));
  }

  // Filter blokken die geen bruikbare cellen bevatten
  blocks = blocks.filter(function (b) {
    return b.rows.some(function (r) {
      return r.some(function (c) {
        return c.trim() !== '';
      });
    });
  });

  return blocks;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Geeft de kolomindexen terug die in de MEERDERHEID van niet-lege
 * rijen volledig leeg zijn.
 *
 * "Volledig leeg" = cel ontbreekt óf cel.trim() === ''.
 * "Meerderheid" = > 50% van de niet-lege rijen.
 */
function findEmptyColumnIndices(rows: CsvRow[], maxCols: number): number[] {
  var nonEmptyRows = rows.filter(function (r) {
    return r.some(function (c) {
      return c.trim() !== '';
    });
  });

  if (nonEmptyRows.length === 0) {
    return [];
  }

  var threshold = Math.floor(nonEmptyRows.length / 2) + 1;
  var result: number[] = [];

  for (var col = 0; col < maxCols; col++) {
    var emptyCount = 0;
    for (var r = 0; r < nonEmptyRows.length; r++) {
      var cell = nonEmptyRows[r][col];
      if (cell === undefined || cell === null || cell.trim() === '') {
        emptyCount++;
      }
    }
    if (emptyCount >= threshold) {
      result.push(col);
    }
  }

  return result;
}

/**
 * Bouwt een CsvBlock van een subset van kolommen.
 * Slices elke rij op [startCol, endCol] (inclusief).
 */
function buildBlock(index: number, rows: CsvRow[], startCol: number, endCol: number): CsvBlock {
  var slicedRows = rows.map(function (row) {
    return row.slice(startCol, endCol + 1);
  });

  var headers = detectHeaders(slicedRows);
  var label = buildLabel(index, headers);

  return {
    index: index,
    label: label,
    rows: slicedRows,
    headers: headers,
  };
}

/**
 * Detecteert of de eerste niet-lege rij een header-rij is.
 *
 * Header-detectie: als geen van de cellen in de vermoedelijke
 * waarde-posities (alle kolommen behalve de eerste) numeriek is,
 * beschouwen we de rij als header.
 *
 * Retourneert de getrimde celwaarden als headers, of null.
 */
function detectHeaders(rows: CsvRow[]): string[] | null {
  // Zoek eerste niet-lege rij
  var firstRow: CsvRow | null = null;
  for (var i = 0; i < rows.length; i++) {
    if (
      rows[i].some(function (c) {
        return c.trim() !== '';
      })
    ) {
      firstRow = rows[i];
      break;
    }
  }

  if (firstRow === null) {
    return null;
  }

  // Controleer of niet-eerste cellen numeriek zijn
  var hasNumericNonFirst = false;
  for (var j = 1; j < firstRow.length; j++) {
    var cell = firstRow[j].trim();
    if (cell !== '' && isNumericLike(cell)) {
      hasNumericNonFirst = true;
      break;
    }
  }

  if (hasNumericNonFirst) {
    // Eerste rij is data, geen header
    return null;
  }

  // Eerste rij zijn headers
  return firstRow.map(function (c) {
    return c.trim();
  });
}

/**
 * Controleert of een celwaarde numeriek lijkt (incl. percentage en
 * Nederlands nummerformaat).
 *
 * Voorbeelden die TRUE opleveren: "42", "3,14", "1.234,56", "63%"
 * Voorbeelden die FALSE opleveren: "Status", "Aantal", "Top 3"
 */
function isNumericLike(value: string): boolean {
  // Strip percentage-teken
  var v = value.replace(/%$/, '').trim();
  // Strip duizendtallen-punten (NL: punt als duizendtalscheider)
  // en vervang komma door punt als decimaalscheidingsteken
  // Heuristiek: als zowel . als , in de waarde staan,
  //             is de LAATSTE het decimaalteken.
  var hasComma = v.indexOf(',') !== -1;
  var hasDot = v.indexOf('.') !== -1;

  if (hasComma && hasDot) {
    // NL-formaat: 1.234,56 → 1234.56
    v = v.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Alleen komma: NL decimaalscheidingsteken → 3,14 → 3.14
    v = v.replace(',', '.');
  }

  return !isNaN(parseFloat(v)) && isFinite(Number(v));
}

/**
 * Bouwt een leesbaar label voor een blok.
 * Gebruikt de eerste header-cel als die informatief is,
 * anders "Dataset N" (1-based voor de gebruiker).
 */
function buildLabel(index: number, headers: string[] | null): string {
  if (headers !== null && headers.length > 0) {
    var firstHeader = headers[0].trim();
    if (firstHeader !== '') {
      return firstHeader;
    }
  }
  return 'Dataset ' + (index + 1);
}
