// ============================================================
// editors/chart/bars.ts
//
// Bar-chart-builder (T47): verticale (gegroepeerde) bars via
// auto-layout. Per categorie een kolom-groep met per serie één bar;
// hoogtes schalen tegen de hoogste waarde over alle series. Waarde-
// labels boven de bars (showValues), categorie-labels eronder,
// serie-legenda erboven bij meerdere series (showLegend).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartMaxValue, formatChartValue } from '../../../shared/chart-calculations';
import { buildLegend, LegendEntry } from './legend';

export function buildBars(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  textRGB: RGB,
  labelSize: number,
): FrameNode {
  const max = Math.max(1, chartMaxValue(model));
  const seriesCount = model.series.length;

  const root = figma.createFrame();
  root.name = 'ChartBars';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = Math.round(labelSize * 1.2);
  root.fills = [];
  root.resize(contentW, contentH);

  let legendH = 0;
  if (model.showLegend && seriesCount > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < seriesCount; s++) {
      entries.push({
        label: model.series[s].name !== '' ? model.series[s].name : 'Serie ' + String(s + 1),
        color: ramp[s % ramp.length],
      });
    }
    const legend = buildLegend(entries, textRGB, labelSize);
    legend.layoutMode = 'HORIZONTAL';
    legend.itemSpacing = Math.round(labelSize * 1.6);
    root.appendChild(legend);
    legendH = legend.height + root.itemSpacing;
  }

  const labelRowH = Math.round(labelSize * 1.5);
  const valueRowH = model.showValues ? Math.round(labelSize * 1.4) : 0;
  const plotH = Math.max(60, contentH - legendH - labelRowH - root.itemSpacing - valueRowH);

  // Plot-rij: per categorie een groep (gelijk verdeeld over de breedte).
  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.layoutMode = 'HORIZONTAL';
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  plot.primaryAxisAlignItems = 'SPACE_BETWEEN';
  plot.counterAxisAlignItems = 'MAX';
  plot.fills = [];
  plot.resize(contentW, plotH + valueRowH + labelRowH);

  const groupW = Math.floor(contentW / model.categories.length) - 16;
  const barGap = 6;
  const barW = Math.max(
    10,
    Math.min(72, Math.floor((Math.min(groupW, 140) - (seriesCount - 1) * barGap) / seriesCount)),
  );

  for (let i = 0; i < model.categories.length; i++) {
    const group = figma.createFrame();
    group.name = 'Group-' + String(i);
    group.layoutMode = 'VERTICAL';
    group.primaryAxisSizingMode = 'AUTO';
    group.counterAxisSizingMode = 'AUTO';
    group.counterAxisAlignItems = 'CENTER';
    group.itemSpacing = Math.round(labelSize * 0.5);
    group.fills = [];

    const barsRow = figma.createFrame();
    barsRow.name = 'Bars';
    barsRow.layoutMode = 'HORIZONTAL';
    barsRow.primaryAxisSizingMode = 'AUTO';
    barsRow.counterAxisSizingMode = 'FIXED';
    barsRow.counterAxisAlignItems = 'MAX';
    barsRow.itemSpacing = barGap;
    barsRow.fills = [];

    let maxBarH = 0;
    for (let s = 0; s < seriesCount; s++) {
      const value = model.series[s].values[i];
      const barH = Math.max(6, Math.round((value / max) * plotH));
      if (barH > maxBarH) maxBarH = barH;

      const barColumn = figma.createFrame();
      barColumn.name = 'BarColumn';
      barColumn.layoutMode = 'VERTICAL';
      barColumn.primaryAxisSizingMode = 'AUTO';
      barColumn.counterAxisSizingMode = 'AUTO';
      barColumn.counterAxisAlignItems = 'CENTER';
      barColumn.itemSpacing = 6;
      barColumn.fills = [];

      if (model.showValues) {
        const valueText = figma.createText();
        valueText.fontName = { family: 'Inter', style: 'Medium' };
        valueText.fontSize = Math.round(labelSize * 0.85);
        valueText.characters = formatChartValue(value);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [{ type: 'SOLID', color: textRGB }];
        barColumn.appendChild(valueText);
      }

      const bar = figma.createRectangle();
      bar.name = 'Bar';
      bar.resize(barW, barH);
      bar.topLeftRadius = Math.min(10, barW / 2);
      bar.topRightRadius = Math.min(10, barW / 2);
      bar.fills = [{ type: 'SOLID', color: ramp[s % ramp.length] }];
      barColumn.appendChild(bar);

      barsRow.appendChild(barColumn);
    }
    barsRow.resize(barsRow.width, maxBarH + (model.showValues ? valueRowH : 0));

    group.appendChild(barsRow);

    const label = figma.createText();
    label.fontName = { family: 'Inter', style: 'Regular' };
    label.fontSize = labelSize;
    label.characters = model.categories[i];
    label.textAutoResize = 'WIDTH_AND_HEIGHT';
    label.fills = [{ type: 'SOLID', color: textRGB }];
    group.appendChild(label);

    plot.appendChild(group);
  }

  root.appendChild(plot);
  try {
    plot.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    /* silent */
  }
  return root;
}
