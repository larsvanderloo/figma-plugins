// ============================================================
// editors/chart/line.ts
//
// Line-chart-builder (T47): per serie een VECTOR-polyline + punt-dots
// in een layout-NONE plotvlak, met subtiele horizontale gridlines en
// categorie-labels op de x-as. Waarden schalen tegen de hoogste waarde
// over alle series; punten verdelen de breedte gelijkmatig.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartMaxValue, formatChartValue } from '../../../shared/chart-calculations';
import { buildLegend, LegendEntry } from './legend';
import { trackTint } from './palette';

const DOT_SIZE = 12;
const STROKE_W = 4;

export function buildLine(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  accent: RGB,
  textRGB: RGB,
  labelSize: number,
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
    const legend = buildLegend(entries, textRGB, labelSize);
    legend.layoutMode = 'HORIZONTAL';
    legend.itemSpacing = Math.round(labelSize * 1.6);
    root.appendChild(legend);
    legendH = legend.height + root.itemSpacing;
  }

  const labelRowH = Math.round(labelSize * 1.6);
  const plotH = Math.max(80, contentH - legendH - labelRowH - root.itemSpacing);
  const pad = DOT_SIZE; // marge zodat dots niet clippen op de plot-rand
  const innerW = contentW - pad * 2;
  const innerH = plotH - pad * 2;

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
    line.y = pad + Math.round((innerH * g) / 3);
    line.fills = [{ type: 'SOLID', color: trackTint(accent) }];
    plot.appendChild(line);
  }

  const xFor = function (i: number): number {
    if (pointCount <= 1) return pad + innerW / 2;
    return pad + (innerW * i) / (pointCount - 1);
  };
  const yFor = function (value: number): number {
    return pad + innerH - (value / max) * innerH;
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

      if (model.showValues) {
        const valueText = figma.createText();
        valueText.fontName = { family: 'Inter', style: 'Medium' };
        valueText.fontSize = Math.round(labelSize * 0.85);
        valueText.characters = formatChartValue(model.series[s].values[i]);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [{ type: 'SOLID', color: color }];
        plot.appendChild(valueText);
        valueText.x = xFor(i) - valueText.width / 2;
        valueText.y = yFor(model.series[s].values[i]) - DOT_SIZE - valueText.height;
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
    t.fontName = { family: 'Inter', style: 'Regular' };
    t.fontSize = labelSize;
    t.characters = model.categories[i];
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    t.fills = [{ type: 'SOLID', color: textRGB }];
    labels.appendChild(t);
    t.x = Math.min(contentW - t.width, Math.max(0, xFor(i) - t.width / 2));
    t.y = 0;
  }
  root.appendChild(labels);

  return root;
}
