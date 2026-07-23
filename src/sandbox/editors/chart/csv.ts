import type { ChartWrapModel, ChartSeriesModel } from '../../../shared/types';
import { CHART_MAX_CATEGORIES, CHART_MAX_SERIES } from '../../../shared/chart-calculations';
import { tokenize } from '../../../shared/csv';
import { parseTableNumber } from '../../../shared/table-calculations';
import { applyChart, readChartModel } from './renderer';

export async function importChartCSV(slot: SlotNode, csv: string): Promise<void> {
  const existing = readChartModel(slot);
  const tokenized = tokenize(csv);

  const nonEmptyRows: string[][] = [];
  for (let i = 0; i < tokenized.rows.length; i++) {
    const row = tokenized.rows[i];
    let allEmpty = true;
    for (let j = 0; j < row.length; j++) {
      if (row[j].length > 0) {
        allEmpty = false;
        break;
      }
    }
    if (!allEmpty) nonEmptyRows.push(row);
  }

  // A lone non-empty row is data, not a header — otherwise the only row would be lost.
  let headerRow: string[] | null = null;
  let dataRows: string[][];

  if (nonEmptyRows.length <= 1) {
    headerRow = null;
    dataRows = nonEmptyRows;
  } else {
    headerRow = nonEmptyRows[0];
    dataRows = nonEmptyRows.slice(1);
  }

  const serieNames: string[] = [];
  if (headerRow !== null) {
    for (let j = 1; j < headerRow.length && serieNames.length < CHART_MAX_SERIES; j++) {
      const name = headerRow[j].trim();
      serieNames.push(name !== '' ? name : 'Serie ' + String(j));
    }
  }

  const categories: string[] = [];
  // seriesValues[s][i] = value for series s, category i (series-major, not row-major)
  const seriesValues: number[][] = [];

  const maxDataRows =
    dataRows.length < CHART_MAX_CATEGORIES ? dataRows.length : CHART_MAX_CATEGORIES;

  for (let i = 0; i < maxDataRows; i++) {
    const row = dataRows[i];
    const label = row.length > 0 ? row[0].trim() : '';
    categories.push(label);

    const maxCols =
      row.length - 1 < CHART_MAX_SERIES ? row.length - 1 : CHART_MAX_SERIES;
    for (let s = 0; s < maxCols; s++) {
      if (seriesValues.length <= s) seriesValues.push([]);
      const raw = row[s + 1];
      const parsed = parseTableNumber(raw !== undefined ? raw : '');
      seriesValues[s].push(parsed !== null ? parsed : 0);
    }
  }

  const seriesCount =
    seriesValues.length > 0
      ? seriesValues.length
      : serieNames.length > 0
        ? serieNames.length
        : 1;

  const series: ChartSeriesModel[] = [];
  for (let s = 0; s < seriesCount; s++) {
    const values: number[] = seriesValues.length > s ? seriesValues[s] : [];
    while (values.length < categories.length) values.push(0);
    const name =
      serieNames.length > s && serieNames[s] !== undefined
        ? serieNames[s]
        : 'Serie ' + String(s + 1);
    series.push({ name: name, values: values });
  }

  const desired: ChartWrapModel = {
    slotId: slot.id,
    chartType: existing.chartType,
    categories: categories.length > 0 ? categories : [''],
    series: series,
    showLegend: existing.showLegend,
    showValues: existing.showValues,
    showDelta: existing.showDelta === true,
    progressMax: existing.progressMax !== undefined ? existing.progressMax : null,
    // emphasis, categoryEmphasis, deltaOverrides deliberately omitted (reset):
    // the import changed row identity, so per-row overrides no longer apply.
  };

  await applyChart(slot, desired);
}
