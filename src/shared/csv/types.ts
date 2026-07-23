/** 'semicolon' is the default: Dutch Excel exports separate with ';'. */
export type CsvDialect = 'comma' | 'semicolon' | 'tab';

export type CsvCell = string;

export type CsvRow = CsvCell[];
