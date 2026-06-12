// ============================================================
// editors/chart/bars.ts
//
// Bar-chart-builder (T47): verticale (gegroepeerde) bars via
// auto-layout. Per categorie een kolom-groep met per serie één bar;
// hoogtes schalen tegen de hoogste waarde over alle series. Waarde-
// labels boven de bars (showValues), categorie-labels eronder,
// serie-legenda erboven bij meerdere series (showLegend).
// Delta-badges (T48, showDelta): onder het waarde-label van serie 0
// de verandering t.o.v. de vorige categorie (▲ +12% / ▼ −5%).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartDeltaLabel,
  chartMaxValue,
  formatChartValue,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';

export function buildBars(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  theme: ChartTheme,
  labelSize: number,
  deltaCtx: DeltaBadgeContext,
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
    const legend = buildLegend(entries, theme, labelSize);
    legend.layoutMode = 'HORIZONTAL';
    legend.itemSpacing = Math.round(labelSize * 1.6);
    root.appendChild(legend);
    legendH = legend.height + root.itemSpacing;
  }

  const labelRowH = Math.round(labelSize * 1.5);
  const valueRowH = model.showValues ? Math.round(labelSize * 1.4) : 0;
  const deltaRowH = model.showDelta === true ? Math.round(labelSize * 1.1) : 0;
  const plotH = Math.max(
    60,
    contentH - legendH - labelRowH - root.itemSpacing - valueRowH - deltaRowH,
  );

  // T49 — bandverdeling à la d3 scaleBand / Chart.js: de breedte is
  // verdeeld in n gelijke band-steps; de groep vult ~80% van zijn step
  // (Chart.js categoryPercentage 0.8) en elke bar ~90% van zijn serie-
  // slot (Chart.js barPercentage 0.9) — samen ±72% inkt per step.
  // Groepen staan op band-centers via CENTER + berekende itemSpacing
  // (nooit edge-pinned zoals bij SPACE_BETWEEN); de bar-cap schaalt
  // mee met de beschikbare breedte i.p.v. de vaste 72px.
  const catCount = model.categories.length;
  const step = contentW / Math.max(1, catCount);
  const slotW = (step * 0.8) / seriesCount;
  const maxBarW = Math.min(160, Math.floor(contentW * 0.12));
  let barW = Math.floor(slotW * 0.9);
  if (barW < 10) barW = 10;
  if (barW > maxBarW) barW = maxBarW;
  let barGap = 0;
  if (seriesCount > 1) {
    barGap = Math.round(slotW * 0.1);
    if (barGap < 4) barGap = 4;
    if (barGap > 24) barGap = 24;
  }
  const barsW = seriesCount * barW + (seriesCount - 1) * barGap;
  // Spacing zo dat elke groep op zijn band-center valt (align 0.5).
  const groupSpacing = catCount > 1 ? Math.max(8, Math.round(step - barsW)) : 0;
  // Categorie-label mag zijn band niet uitlopen (anders schuift de
  // bandverdeling op); breder dan de band-step wordt afgekapt.
  const maxLabelW = Math.max(barsW, Math.round(step - Math.min(16, step * 0.1)));

  // Plot-rij: per categorie een groep op zijn band-center.
  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.layoutMode = 'HORIZONTAL';
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  plot.primaryAxisAlignItems = 'CENTER';
  plot.counterAxisAlignItems = 'MAX';
  plot.itemSpacing = groupSpacing;
  plot.fills = [];
  plot.resize(contentW, plotH + valueRowH + deltaRowH + labelRowH);

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
        valueText.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        valueText.fontSize = Math.round(labelSize * 0.85);
        valueText.characters = formatChartValue(value);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [
          figma.variables.setBoundVariableForPaint(
            { type: 'SOLID', color: theme.textRGB },
            'color',
            theme.textVar,
          ),
        ];
        barColumn.appendChild(valueText);
      }

      // Delta-badge (T48/T50): alleen serie 0, override-aware via engine.
      if (model.showDelta === true && s === 0) {
        const deltaNode = buildDeltaNode(deltaCtx, i);
        if (deltaNode !== null) barColumn.appendChild(deltaNode);
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
    barsRow.resize(barsRow.width, maxBarH + valueRowH + deltaRowH);

    group.appendChild(barsRow);

    const label = figma.createText();
    label.fontName = isCategoryEmphasized(model, i)
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    label.fontSize = labelSize;
    label.characters = model.categories[i];
    label.textAutoResize = 'WIDTH_AND_HEIGHT';
    label.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    if (label.width > maxLabelW) {
      label.textTruncation = 'ENDING';
      label.textAutoResize = 'HEIGHT';
      label.resize(maxLabelW, label.height);
    }
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
