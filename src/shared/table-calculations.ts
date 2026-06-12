import type {
  TableColumnCalculationSetting,
  TableColumnSummary,
  TableRowModel,
} from './types';

export function normalizeColumnCalculations(
  settings: readonly TableColumnCalculationSetting[] | undefined,
  columnCount: number,
): TableColumnCalculationSetting[] {
  const count = columnCount > 0 ? columnCount : 0;
  const out: TableColumnCalculationSetting[] = [];
  for (let i = 0; i < count; i++) {
    const value = settings !== undefined && i < settings.length ? settings[i] : null;
    out.push(value === 'sum' ? 'sum' : null);
  }
  return out;
}

export function hasColumnCalculations(settings: readonly TableColumnCalculationSetting[]): boolean {
  for (let i = 0; i < settings.length; i++) {
    if (settings[i] !== null) return true;
  }
  return false;
}

export function normalizeColumnEmphasis(
  emphasis: readonly boolean[] | undefined,
  columnCount: number,
): boolean[] {
  const count = columnCount > 0 ? columnCount : 0;
  const out: boolean[] = [];
  for (let i = 0; i < count; i++) {
    out.push(emphasis !== undefined && i < emphasis.length ? emphasis[i] === true : false);
  }
  return out;
}

export function normalizeColumnLabels(
  labels: readonly string[] | undefined,
  columnCount: number,
): string[] {
  const count = columnCount > 0 ? columnCount : 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(labels !== undefined && i < labels.length && typeof labels[i] === 'string' ? labels[i] : '');
  }
  return out;
}

export function columnLabelsEqual(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
  columnCount: number,
): boolean {
  const left = normalizeColumnLabels(a, columnCount);
  const right = normalizeColumnLabels(b, columnCount);
  for (let i = 0; i < columnCount; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function hasColumnLabels(labels: readonly string[]): boolean {
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== '') return true;
  }
  return false;
}

export function columnEmphasisEqual(
  a: readonly boolean[] | undefined,
  b: readonly boolean[] | undefined,
  columnCount: number,
): boolean {
  const left = normalizeColumnEmphasis(a, columnCount);
  const right = normalizeColumnEmphasis(b, columnCount);
  for (let i = 0; i < columnCount; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function columnCalculationsEqual(
  a: readonly TableColumnCalculationSetting[] | undefined,
  b: readonly TableColumnCalculationSetting[] | undefined,
  columnCount: number,
): boolean {
  const left = normalizeColumnCalculations(a, columnCount);
  const right = normalizeColumnCalculations(b, columnCount);
  for (let i = 0; i < columnCount; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function separatorCount(text: string, separator: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === separator) count += 1;
  }
  return count;
}

function shouldTreatSingleSeparatorAsDecimal(text: string, separator: string): boolean {
  const index = text.lastIndexOf(separator);
  if (index < 0) return false;
  const fractionalLength = text.length - index - 1;
  if (fractionalLength <= 0) return false;
  return fractionalLength !== 3;
}

function normalizeNumberText(text: string): string | null {
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let decimalSeparator = '';

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    decimalSeparator =
      separatorCount(text, ',') === 1 && shouldTreatSingleSeparatorAsDecimal(text, ',')
        ? ','
        : '';
  } else if (lastDot >= 0) {
    decimalSeparator =
      separatorCount(text, '.') === 1 && shouldTreatSingleSeparatorAsDecimal(text, '.')
        ? '.'
        : '';
  }

  const decimalIndex = decimalSeparator !== '' ? text.lastIndexOf(decimalSeparator) : -1;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char >= '0' && char <= '9') {
      out += char;
    } else if (i === decimalIndex) {
      out += '.';
    }
  }

  if (out === '' || out === '.') return null;
  if (!/^\d+(\.\d+)?$/.test(out)) return null;
  return out;
}

export function parseTableNumber(raw: string): number | null {
  let text = raw.trim();
  if (text === '') return null;

  let negative = false;
  if (text[0] === '(' && text[text.length - 1] === ')') {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  let multiplier = 1;
  const suffixMatch = text.match(/([kKmMbB])$/);
  if (suffixMatch !== null) {
    const suffix = suffixMatch[1].toLowerCase();
    if (suffix === 'k') multiplier = 1_000;
    if (suffix === 'm') multiplier = 1_000_000;
    if (suffix === 'b') multiplier = 1_000_000_000;
    text = text.slice(0, -1).trim();
  }

  text = text.replace(/[€$£¥₹₽₩₺₴%]/g, '').trim();
  if (/[A-Za-z]/.test(text)) return null;

  let sign = 1;
  if (text[0] === '-') {
    sign = -1;
    text = text.slice(1);
  } else if (text[0] === '+') {
    text = text.slice(1);
  }
  if (negative) sign *= -1;

  text = text.replace(/[\s']/g, '');
  if (text === '' || /[^0-9.,]/.test(text)) return null;

  const normalized = normalizeNumberText(text);
  if (normalized === null) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value * multiplier * sign;
}

export function formatTableNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  if (rounded === 0) return '0';

  const fixed = rounded.toFixed(2);
  const parts = fixed.split('.');
  let intPart = parts[0];
  let decimalPart = parts.length > 1 ? parts[1] : '';
  while (decimalPart.endsWith('0')) decimalPart = decimalPart.slice(0, -1);

  let grouped = '';
  while (intPart.length > 3) {
    grouped = '.' + intPart.slice(-3) + grouped;
    intPart = intPart.slice(0, -3);
  }
  grouped = intPart + grouped;

  const sign = value < 0 ? '-' : '';
  return sign + grouped + (decimalPart !== '' ? ',' + decimalPart : '');
}

/**
 * Per-column "is dit een getallen-kolom?"-detectie voor uitlijning.
 * Een kolom telt als numeriek wanneer minstens één niet-lege body-cel
 * een getal is (volgens parseTableNumber: ook `€ 45`, `12%`, `1,2M`)
 * en géén enkele niet-lege body-cel tekst bevat ('45 mensen' → false).
 * De header-rij (indien aanwezig) telt niet mee.
 */
export function computeNumericColumns(
  rows: readonly TableRowModel[],
  hasColumnHeader: boolean,
  columnCount: number,
): boolean[] {
  const out: boolean[] = [];
  const startRow = hasColumnHeader ? 1 : 0;

  for (let col = 0; col < columnCount; col++) {
    let numericCount = 0;
    let textCount = 0;
    for (let row = startRow; row < rows.length; row++) {
      const cells = rows[row].cells;
      if (col >= cells.length) continue;
      const value = cells[col].value.trim();
      if (value === '') continue;
      if (parseTableNumber(value) !== null) {
        numericCount += 1;
      } else {
        textCount += 1;
      }
    }
    out.push(numericCount > 0 && textCount === 0);
  }

  return out;
}

export function computeTableColumnSummaries(
  rows: readonly TableRowModel[],
  hasColumnHeader: boolean,
  settings: readonly TableColumnCalculationSetting[],
  columnCount: number,
  emphasis?: readonly boolean[],
  currency?: readonly boolean[],
  percent?: readonly boolean[],
): Array<TableColumnSummary | null> {
  const normalized = normalizeColumnCalculations(settings, columnCount);
  const normalizedEmphasis = normalizeColumnEmphasis(emphasis, columnCount);
  const normalizedCurrency = normalizeColumnEmphasis(currency, columnCount);
  const normalizedPercent = normalizeColumnEmphasis(percent, columnCount);
  const out: Array<TableColumnSummary | null> = [];
  const startRow = hasColumnHeader ? 1 : 0;

  for (let col = 0; col < columnCount; col++) {
    if (normalized[col] !== 'sum') {
      out.push(null);
      continue;
    }

    let sum = 0;
    let count = 0;
    for (let row = startRow; row < rows.length; row++) {
      const cells = rows[row].cells;
      if (col >= cells.length) continue;
      const value = parseTableNumber(cells[col].value);
      if (value === null) continue;
      sum += value;
      count += 1;
    }

    out.push({
      calculation: 'sum',
      // `value` is always the plain formatted number. Currency/percent are
      // signalled via the flags: consumers (UI footer + canvas renderer)
      // add the `€`-prefix or `%`-suffix themselves.
      value: formatTableNumber(sum),
      numericValue: sum,
      numericCount: count,
      emphasis: normalizedEmphasis[col],
      currency: normalizedCurrency[col],
      percent: normalizedPercent[col],
    });
  }

  return out;
}
