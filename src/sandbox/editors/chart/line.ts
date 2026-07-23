// Overflow budget: padTop reserves the MEASURED stack above the highest
// point (value label + delta badge); when the plot cannot fit, the chart
// degrades (value labels → delta badges → legend) instead of overflowing.

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartMaxValue,
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry, truncateToWidth } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';
import { trackPaint } from './palette';
import { probeTextHeight } from '../_shared/fonts';

const DOT_SIZE = 12;
const STROKE_W = 4;
/** Minimum readable line zone; below this, degrade instead of clipping. */
const MIN_INNER_H = 24;

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
  const rootGap = root.itemSpacing;

  let legend: FrameNode | null = null;
  if (model.showLegend && model.series.length > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < model.series.length; s++) {
      entries.push({
        label: model.series[s].name !== '' ? model.series[s].name : 'Serie ' + String(s + 1),
        color: ramp[s % ramp.length],
      });
    }
    // buildLegend degrades itself (font size → deltas → '+N meer') to fit the height budget.
    legend = buildLegend(
      entries,
      theme,
      labelSize,
      contentW,
      Math.max(labelSize * 2, Math.floor(contentH * 0.35)),
      true,
    );
    root.appendChild(legend);
  }

  const labelRowH = Math.round(labelSize * 1.6);
  const valueSize = Math.round(labelSize * 0.85);
  const valueH = model.showValues
    ? Math.ceil(
        Math.max(
          probeTextHeight('Inter', 'Medium', valueSize),
          probeTextHeight('Instrument Sans', 'SemiBold', valueSize),
        ),
      )
    : 0;

  const pad = DOT_SIZE; // margin so dots don't clip at the plot edge
  const innerW = contentW - pad * 2;
  // Labels/badges wider than their point step overlap their neighbours;
  // drop each such item individually rather than using a fixed px threshold.
  const slotStep = pointCount > 1 ? innerW / (pointCount - 1) : contentW;
  const deltaMaxW = pointCount > 1 ? Math.max(8, Math.floor(slotStep)) : contentW;

  // Build delta nodes upfront so the vertical budget uses the REAL node
  // height (badge clone vs. truncated-text fallback) instead of a guess.
  const deltaNodes: (SceneNode | null)[] = [];
  let deltaH = 0;
  if (model.showDelta === true) {
    for (let i = 0; i < pointCount; i++) {
      const node = buildDeltaNode(deltaCtx, i, deltaMaxW);
      deltaNodes.push(node);
      if (node !== null && node.height > deltaH) deltaH = node.height;
    }
    deltaH = Math.ceil(deltaH);
  }

  // If no value label/badge fits at all, drop its vertical reservation.
  let anyValueFits = false;
  if (model.showValues) {
    const wProbe = figma.createText();
    wProbe.fontSize = valueSize;
    for (let s = 0; s < model.series.length && !anyValueFits; s++) {
      for (let i = 0; i < pointCount && !anyValueFits; i++) {
        wProbe.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        wProbe.characters = chartValueLabel(model.series[s], model.series[s].values[i]);
        if (wProbe.width <= slotStep) anyValueFits = true;
      }
    }
    wProbe.remove();
  }
  let anyDeltaFits = false;
  for (let i = 0; i < deltaNodes.length; i++) {
    const n = deltaNodes[i];
    if (n !== null && n.width <= slotStep) anyDeltaFits = true;
  }

  let valuesOn = model.showValues && valueH > 0 && anyValueFits;
  let deltaOn = model.showDelta === true && deltaH > 0 && anyDeltaFits;
  let legendOn = legend !== null;

  const padTopFor = function (): number {
    let h = pad;
    if (valuesOn) h += valueH;
    if (deltaOn) h += deltaH;
    return h;
  };
  const availPlotH = function (): number {
    let h = contentH - labelRowH - rootGap;
    if (legendOn && legend !== null) h -= legend.height + rootGap;
    return h;
  };
  const fits = function (): boolean {
    return availPlotH() - padTopFor() - pad >= MIN_INNER_H;
  };

  // Drop a disproportionately tall wrapped legend first — it eats the whole plot on narrow cards.
  if (legendOn && legend !== null && legend.height + rootGap > contentH * 0.4) {
    legend.remove();
    legend = null;
    legendOn = false;
  }
  if (!fits() && valuesOn) valuesOn = false;
  if (!fits() && deltaOn) deltaOn = false;
  if (!fits() && legendOn && legend !== null) {
    legend.remove();
    legend = null;
    legendOn = false;
  }
  if (!deltaOn) {
    for (let i = 0; i < deltaNodes.length; i++) {
      const n = deltaNodes[i];
      if (n !== null) {
        try {
          n.remove();
        } catch (_e) {
          /* already removed */
        }
        deltaNodes[i] = null;
      }
    }
  }

  // Exactly the remaining budget — a higher floor (like max(80, ...)) would
  // push the x-axis row off the card on short slots.
  const plotH = Math.max(10, availPlotH());
  const padTop = padTopFor();
  const innerH = Math.max(4, plotH - padTop - pad);

  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.resize(contentW, plotH);
  plot.fills = [];
  plot.clipsContent = false;

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
  // 6% top headroom inside the plot so the highest line/dot does not touch
  // the top edge; value labels live in padTop above it.
  const plotTop = padTop + Math.round(innerH * 0.06);
  const plotSpan = innerH - Math.round(innerH * 0.06);
  const yFor = function (value: number): number {
    return plotTop + plotSpan - (value / max) * plotSpan;
  };
  // A point near the bottom (value ≈ 0) gets its value label BELOW the dot,
  // otherwise it collides with the x-axis labels.
  const labelBelow = function (value: number): boolean {
    return value / max < 0.12;
  };

  for (let s = 0; s < model.series.length; s++) {
    const color = ramp[s % ramp.length];
    let data = '';
    let minX = Infinity;
    let minY = Infinity;
    for (let i = 0; i < pointCount; i++) {
      const x = Math.round(xFor(i));
      const y = Math.round(yFor(model.series[s].values[i]));
      if (x < minX) minX = x;
      if (y < minY) minY = y;
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
    // Setting vectorPaths re-origins the vector to the path's bounding box
    // (x/y → 0); the path is in absolute plot coords, so restore minX/minY
    // or the line snaps to the plot top instead of landing on the dots.
    vector.x = minX === Infinity ? 0 : minX;
    vector.y = minY === Infinity ? 0 : minY;

    for (let i = 0; i < pointCount; i++) {
      const dot = figma.createEllipse();
      dot.name = 'Dot';
      dot.resize(DOT_SIZE, DOT_SIZE);
      dot.x = xFor(i) - DOT_SIZE / 2;
      dot.y = yFor(model.series[s].values[i]) - DOT_SIZE / 2;
      dot.fills = [{ type: 'SOLID', color: color }];
      plot.appendChild(dot);

      // padTop reserves exactly DOT_SIZE + valueH + deltaH, so the label
      // stack above the highest point stays inside the plot frame.
      const lowPoint = labelBelow(model.series[s].values[i]);
      let stackY = yFor(model.series[s].values[i]) - DOT_SIZE;
      if (deltaOn && s === 0 && !lowPoint) {
        const deltaNode = deltaNodes[i];
        if (deltaNode !== null) {
          if (deltaNode.width > contentW || (pointCount > 1 && deltaNode.width > slotStep)) {
            try {
              deltaNode.remove();
            } catch (_e) {
              /* already removed */
            }
            deltaNodes[i] = null;
          } else {
            plot.appendChild(deltaNode);
            deltaNode.x = Math.min(
              contentW - deltaNode.width,
              Math.max(0, xFor(i) - deltaNode.width / 2),
            );
            deltaNode.y = stackY - deltaNode.height;
            stackY = deltaNode.y;
          }
        }
      }
      if (valuesOn) {
        const valueText = figma.createText();
        valueText.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        valueText.fontSize = valueSize;
        valueText.characters = chartValueLabel(model.series[s], model.series[s].values[i]);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [{ type: 'SOLID', color: color }];
        if (valueText.width > contentW || (pointCount > 1 && valueText.width > slotStep)) {
          valueText.remove();
        } else {
          plot.appendChild(valueText);
          valueText.x = Math.min(
            contentW - valueText.width,
            Math.max(0, xFor(i) - valueText.width / 2),
          );
          if (labelBelow(model.series[s].values[i])) {
            valueText.y = yFor(model.series[s].values[i]) + DOT_SIZE / 2 + 2;
          } else {
            valueText.y = stackY - valueText.height;
          }
        }
      }
    }
  }

  root.appendChild(plot);

  const maxXLabelW = pointCount > 1 ? Math.max(24, Math.floor(contentW / pointCount)) : contentW;
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
    // Truncate to one line: a wrapping label would overflow the fixed labelRowH row.
    if (t.width > maxXLabelW) {
      truncateToWidth(t, maxXLabelW);
    }
    labels.appendChild(t);
    t.x = Math.min(contentW - t.width, Math.max(0, xFor(i) - t.width / 2));
    t.y = 0;
  }
  root.appendChild(labels);

  return root;
}
