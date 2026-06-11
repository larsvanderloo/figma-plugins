/**
 * Herkend scheidingsteken in een CSV-bestand. 'semicolon' is de standaard
 * voor Nederlandse Excel-exports.
 */
export type CsvDialect = 'comma' | 'semicolon' | 'tab';

/** Een enkele cel-waarde (altijd string). */
export type CsvCell = string;

/** Een rij cellen. */
export type CsvRow = CsvCell[];
