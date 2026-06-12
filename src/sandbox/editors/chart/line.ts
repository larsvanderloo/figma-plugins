// ============================================================
// editors/chart/line.ts
//
// Line-chart-builder (T47): per serie een VECTOR-polyline + punt-dots
// in een layout-NONE plotvlak, met subtiele horizontale gridlines en
// categorie-labels op de x-as. Waarden schalen tegen de hoogste waarde
// over alle series; punten verdelen de breedte gelijkmatig.
// Delta-badges (T48, showDelta): boven elk serie-0-punt de verandering
// t.o.v. de vorige categorie, gestapeld onder het waarde-label.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartDeltaLabel,
  chartMaxValue,
  chartValueLabel,
  formatChartValue,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';
import { trackPaint } from './palette';

const DOT_SIZE = 12;
const STROKE_W = 4;

export function buildLine(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  light: RGB,
  theme: ChartTheme,
  labelSize: number,
  deltaCtx: DeltaBadgeContext,
): FrameNode {
  const max = Math.max(1, chartMaxValue(model));
  const pointCount = model.categories.length;

  const root = figma.createFrame();
  root.name = 'ChartLine';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = Math.round(labelSize * 1.0);
  root.fills = [];
  root.resize(contentW, contentH);

  let legendH = 0;
  if (model.showLegend && model.series.length > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < model.series.length; s++) {
      entries.push({
        label: model.series[s].name !== '' ? model.series[s].name : 'Serie ' + String(s + 1),
        color: ramp[s % ramp.length],
      });
    }
    const legend = buildLegend(entries, theme, labelSize, contentW);
    legend.layoutMode = 'HORIZONTAL';
    legend.itemSpacing = Math.round(labelSize * 1.6);
    root.appendChild(legend);
    legendH = legend.height + root.itemSpacing;
  }

  const labelRowH = Math.round(labelSize * 1.6);
  const plotH = Math.max(80, contentH - legendH - labelRowH - root.itemSpacing);
  const pad = DOT_SIZE; // marge zodat dots niet clippen op de plot-rand
  // showValues: waarde-labels staan op yFor(v) - DOT_SIZE - labelhoogte.
  // Zonder extra top-marge valt het label van het hoogste punt volledig
  // boven het plot-frame (root clipt children) — reserveer headroom.
  const valueSize = Math.round(labelSize * 0.85);
  const padTop = model.showValues ? pad + Math.round(valueSize * 1.4) : pad;
  const innerW = contentW - pad * 2;
  const innerH = Math.max(10, plotH - padTop - pad);

  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.resize(contentW, plotH);
  plot.fills = [];
  plot.clipsContent = false;

  // Gridlines: 4 subtiele horizontale lijnen (0/33/66/100%).
  for (let g = 0; g <= 3; g++) {
    const line = figma.createRectangle();
    line.name = 'Gridline';
    line.resize(contentW, 1);
    line.x = 0;
    line.y = padTop + Math.round((innerH * g) / 3);
    line.fills = [trackPaint(light)];
    plot.appendChild(line);
  }

  const xFor = function (i: number): number {
    if (pointCount <= 1) return pad + innerW / 2;
    return pad + (innerW * i) / (pointCount - 1);
  };
  const yFor = function (value: number): number {
    return padTop + innerH - (value / max) * innerH;
  };

  for (let s = 0; s < model.series.length; s++) {
    const color = ramp[s % ramp.length];
    let data = '';
    for (let i = 0; i < pointCount; i++) {
      const x = Math.round(xFor(i));
      const y = Math.round(yFor(model.series[s].values[i]));
      data += (i === 0 ? 'M ' : ' L ') + String(x) + ' ' + String(y);
    }
    const vector = figma.createVector();
    vector.name = 'Line-' + String(s);
    vector.vectorPaths = [{ windingRule: 'NONE', data: data }];
    vector.strokes = [{ type: 'SOLID', color: color }];
    vector.strokeWeight = STROKE_W;
    vector.strokeCap = 'ROUND';
    vector.strokeJoin = 'ROUND';
    vector.fills = [];
    plot.appendChild(vector);
    vector.x = 0;
    vector.y = 0;

    for (let i = 0; i < pointCount; i++) {
      const dot = figma.createEllipse();
      dot.name = 'Dot';
      dot.resize(DOT_SIZE, DOT_SIZE);
      dot.x = xFor(i) - DOT_SIZE / 2;
      dot.y = yFor(model.series[s].values[i]) - DOT_SIZE / 2;
      dot.fills = [{ type: 'SOLID', color: color }];
      plot.appendChild(dot);

      // Label-stapel boven het punt: waarde bovenaan, delta-badge
      // (T48, alleen serie 0) eronder, dichtst bij de dot.
      let stackY = yFor(model.series[s].values[i]) - DOT_SIZE;
      if (model.showDelta === true && s === 0) {
        const deltaNode = buildDeltaNode(deltaCtx, i);
        if (deltaNode !== null) {
          plot.appendChild(deltaNode);
          deltaNode.x = Math.min(
            contentW - deltaNode.width,
            Math.max(0, xFor(i) - deltaNode.width / 2),
          );
          deltaNode.y = stackY - deltaNode.height;
          stackY = deltaNode.y;
        }
      }
      if (model.showValues) {
        const valueText = figma.createText();
        valueText.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        valueText.fontSize = valueSize;
        valueText.characters = chartValueLabel(model.series[s], model.series[s].values[i]);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [{ type: 'SOLID', color: color }];
        plot.appendChild(valueText);
        // Clamp binnen het plot-frame (zelfde patroon als de x-as-labels):
        // randpunten (i=0 / laatste) zouden anders w/2 - pad uitsteken.
        valueText.x = Math.min(
          contentW - valueText.width,
          Math.max(0, xFor(i) - valueText.width / 2),
        );
        valueText.y = stackY - valueText.height;
      }
    }
  }

  root.appendChild(plot);

  // X-as-labels: zelfde x-posities als de datapunten (layout NONE).
  const labels = figma.createFrame();
  labels.name = 'XLabels';
  labels.resize(contentW, labelRowH);
  labels.fills = [];
  for (let i = 0; i < pointCount; i++) {
    const t = figma.createText();
    t.fontName = isCategoryEmphasized(model, i)
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    t.fontSize = labelSize;
    t.characters = model.categories[i];
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    t.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    labels.appendChild(t);
    t.x = Math.min(contentW - t.width, Math.max(0, xFor(i) - t.width / 2));
    t.y = 0;
  }
  root.appendChild(labels);

  return root;
}
