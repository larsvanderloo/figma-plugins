// CSV utilities — currently only the tokenizer (consumed by the Table editor
// to parse pasted CSV/TSV into a row matrix).

export { tokenize, dialectToSeparator } from './csv-tokenizer';
export type { TokenizeResult } from './csv-tokenizer';
export type { CsvDialect, CsvCell, CsvRow } from './types';
