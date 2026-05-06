// ============================================================
// Chart Builder Widget — CSV Types
// ============================================================

import type { DataPoint } from '../../types';

// ----------------------------------------------------------------
// Dialect
// ----------------------------------------------------------------

/**
 * Herkend scheidingsteken in een CSV-bestand.
 * 'semicolon' is de standaard voor Nederlandse Excel-exports.
 */
export type CsvDialect = 'comma' | 'semicolon' | 'tab';

// ----------------------------------------------------------------
// Raw tokenizer output
// ----------------------------------------------------------------

/** Een enkele cel-waarde (altijd string; semantiek bepaalt csv-mapper). */
export type CsvCell = string;

/** Een rij cellen. */
export type CsvRow = CsvCell[];

// ----------------------------------------------------------------
// Block detection
// ----------------------------------------------------------------

/**
 * Een aaneengesloten dataset binnen een CSV-bestand.
 * Sheet 4 bevat bv. twee blokken naast elkaar (kolom A+B en D+E)
 * gescheiden door een volledig lege kolom C.
 *
 * Fase 3 (herhaalde header-rijen voor verticale splitsing):
 *   Niet geïmplementeerd hier — noteer als TODO in csv-blocks.ts.
 */
export interface CsvBlock {
  /** 0-based volgnummer binnen het bestand. */
  index: number;
  /**
   * Automatisch gegenereerd label, bv. "Dataset 1" of de waarde van
   * de eerste header-cel als die leesbaar is ("Top 3").
   */
  label: string;
  /** Alle rijen die tot dit blok behoren, inclusief eventuele header-rij. */
  rows: CsvRow[];
  /**
   * Gedetecteerde kolomheaders per kolom in dit blok, of null als er
   * geen header-rij detecteerbaar was.
   */
  headers: string[] | null;
}

// ----------------------------------------------------------------
// Mapping (gebruikt door csv-mapper, opgezet door csv-ui)
// ----------------------------------------------------------------

export interface CsvMapping {
  /** 0-based kolomindex binnen het blok voor labels. */
  labelColumn: number;
  /** 0-based kolomindex binnen het blok voor waarden. */
  valueColumn: number;
  /** Heeft het blok een header-rij? Auto-gezet; user kan overriden. */
  hasHeader: boolean;
}

// ----------------------------------------------------------------
// Validation errors
// ----------------------------------------------------------------

export interface CsvRowError {
  /** 0-based rij-index (telt lege rijen mee). */
  rowIndex: number;
  /** Optionele 0-based kolomindex. */
  column?: number;
  /** Nederlandse foutmelding. */
  message: string;
  /** Ruwe celwaarde die de fout veroorzaakte. */
  rawValue?: string;
}

// ----------------------------------------------------------------
// Parse result
// ----------------------------------------------------------------

export interface CsvParseResult {
  dialect: CsvDialect;
  blocks: CsvBlock[];
}

// ----------------------------------------------------------------
// Mapping result (output van csv-mapper)
// ----------------------------------------------------------------

export interface CsvMappingResult {
  dataPoints: DataPoint[];
  errors: CsvRowError[];
  /** Niet-fatale meldingen (bv. rijen > 12 genegeerd). */
  warnings: string[];
  /** Aantal overgeslagen rijen (lege + TOTAAL-rijen). */
  skippedRows: number;
  /** Totaal aantal rijen in het blok (inclusief header en overgeslagen rijen). */
  totalRows: number;
}
