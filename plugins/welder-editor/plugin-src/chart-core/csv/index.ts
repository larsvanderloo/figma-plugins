// ============================================================
// Chart Builder Widget — CSV Barrel / Public API
// ============================================================

import { tokenize as _tokenize, dialectToSeparator as _dialectToSeparator } from './csv-tokenizer';
import { detectBlocks as _detectBlocks } from './csv-blocks';
import { mapBlock as _mapBlock, parseDutchNumber as _parseDutchNumber } from './csv-mapper';
import {
  validateBlock as _validateBlock,
  validateDataPoints as _validateDataPoints,
} from './csv-validator';
import type { CsvParseResult } from './types';

// Re-exports — types
export type {
  CsvDialect,
  CsvCell,
  CsvRow,
  CsvBlock,
  CsvMapping,
  CsvRowError,
  CsvParseResult,
  CsvMappingResult,
} from './types';

// Re-exports — tokenizer
export { _tokenize as tokenize, _dialectToSeparator as dialectToSeparator };
export type { TokenizeResult } from './csv-tokenizer';

// Re-exports — blocks
export { _detectBlocks as detectBlocks };

// Re-exports — mapper (Taak 8)
export { _mapBlock as mapBlock, _parseDutchNumber as parseDutchNumber };

// Re-exports — validator (Taak 8)
export { _validateBlock as validateBlock, _validateDataPoints as validateDataPoints };
export type { BlockValidationResult } from './csv-validator';

// ----------------------------------------------------------------
// parseCSV — convenience-wrapper voor Taak 8/9
// ----------------------------------------------------------------

/**
 * Hoog-niveau ingangspunt: ruwe CSV-string → CsvParseResult.
 *
 * Combineert tokenize + detectBlocks in één aanroep.
 * csv-mapper en csv-validator zijn aparte functies (Taak 8) die
 * per blok + CsvMapping worden aangeroepen.
 *
 * @param input - Ruwe CSV-tekst van clipboard of bestand.
 * @returns Dialect + array van blokken.
 */
export function parseCSV(input: string): CsvParseResult {
  var result = _tokenize(input);
  var blocks = _detectBlocks(result.rows);
  return {
    dialect: result.dialect,
    blocks: blocks,
  };
}
