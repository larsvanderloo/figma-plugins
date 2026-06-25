// ============================================================
// editors/chart/csv.ts
//
// CSV-import voor een ChartWrap-Slot.
//
// Mapping-regels:
//   - Rij 0 = header: cells[1..] zijn serie-namen (getrimmed;
//     leeg → 'Serie N'); cells[0] wordt genegeerd.
//   - Als er slechts één niet-lege rij bestaat, behandel die rij
//     als data i.p.v. als header (anders gaat die rij verloren).
//   - Rijen 1..: cells[0] = categorie-label (getrimmed);
//     cells[1..] = waarden via parseTableNumber, null → 0.
//   - Data gecapt op CHART_MAX_CATEGORIES rijen en CHART_MAX_SERIES
//     value-kolommen.
//   - Bestaande chartType, showLegend, showValues, showDelta,
//     progressMax worden BEWAARD (uit readChartModel).
//   - emphasis, categoryEmphasis, deltaOverrides worden GERESET
//     (rij-identiteit is veranderd door de import).
//   - normalizeChartModel zorgt voor defaults/rechthoek.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel, ChartSeriesModel } from '../../../shared/types';
import { CHART_MAX_CATEGORIES, CHART_MAX_SERIES } from '../../../shared/chart-calculations';
import { tokenize } from '../../../shared/csv';
import { parseTableNumber } from '../../../shared/table-calculations';
import { applyChart, readChartModel } from './renderer';

export async function importChartCSV(slot: SlotNode, csv: string): Promise<void> {
  const existing = readChartModel(slot);
  const tokenized = tokenize(csv);

  // Stap 1: lege rijen eruit filteren.
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

  // Stap 2: header vs. data-rijen bepalen.
  // Als er maar één niet-lege rij is: behandel als data (auto serie-namen).
  let headerRow: string[] | null = null;
  let dataRows: string[][];

  if (nonEmptyRows.length <= 1) {
    // Geen aparte header; de enige (of geen) rij is data.
    headerRow = null;
    dataRows = nonEmptyRows;
  } else {
    headerRow = nonEmptyRows[0];
    dataRows = nonEmptyRows.slice(1);
  }

  // Stap 3: serie-namen afleiden uit de header (cells[1..]).
  // Maximaal CHART_MAX_SERIES namen; lege cellen → 'Serie N'.
  const serieNames: string[] = [];
  if (headerRow !== null) {
    for (let j = 1; j < headerRow.length && serieNames.length < CHART_MAX_SERIES; j++) {
      const name = headerRow[j].trim();
      serieNames.push(name !== '' ? name : 'Serie ' + String(j));
    }
  }

  // Stap 4: data-rijen → categories + series-waarden.
  // Cap op CHART_MAX_CATEGORIES rijen.
  const categories: string[] = [];
  // seriesValues[s][i] = waarde voor serie s, categorie i
  const seriesValues: number[][] = [];

  const maxDataRows =
    dataRows.length < CHART_MAX_CATEGORIES ? dataRows.length : CHART_MAX_CATEGORIES;

  for (let i = 0; i < maxDataRows; i++) {
    const row = dataRows[i];
    const label = row.length > 0 ? row[0].trim() : '';
    categories.push(label);

    // Waarde-kolommen: cells[1..], gecapt op CHART_MAX_SERIES.
    const maxCols =
      row.length - 1 < CHART_MAX_SERIES ? row.length - 1 : CHART_MAX_SERIES;
    for (let s = 0; s < maxCols; s++) {
      if (seriesValues.length <= s) seriesValues.push([]);
      const raw = row[s + 1];
      const parsed = parseTableNumber(raw !== undefined ? raw : '');
      seriesValues[s].push(parsed !== null ? parsed : 0);
    }
  }

  // Stap 5: serie-objecten bouwen.
  // Vul aan met nullen als een serie minder waarden heeft dan categories
  // (kan gebeuren bij ragged rijen — normalizeChartModel pakt dit ook op).
  const seriesCount =
    seriesValues.length > 0
      ? seriesValues.length
      : serieNames.length > 0
        ? serieNames.length
        : 1;

  const series: ChartSeriesModel[] = [];
  for (let s = 0; s < seriesCount; s++) {
    const values: number[] = seriesValues.length > s ? seriesValues[s] : [];
    // Vul op tot categories.length als de rij ragged was.
    while (values.length < categories.length) values.push(0);
    const name =
      serieNames.length > s && serieNames[s] !== undefined
        ? serieNames[s]
        : 'Serie ' + String(s + 1);
    // Emphasis niet overnemen — rij-identiteit is veranderd.
    series.push({ name: name, values: values });
  }

  // Stap 6: desired-model bouwen met behoud van bestaande display-vlaggen.
  const desired: ChartWrapModel = {
    slotId: slot.id,
    chartType: existing.chartType,
    categories: categories.length > 0 ? categories : [''],
    series: series,
    showLegend: existing.showLegend,
    showValues: existing.showValues,
    showDelta: existing.showDelta === true,
    progressMax: existing.progressMax !== undefined ? existing.progressMax : null,
    // emphasis, categoryEmphasis, deltaOverrides worden weggelaten (RESET).
  };

  await applyChart(slot, desired);
}
