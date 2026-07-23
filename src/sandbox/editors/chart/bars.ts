// Overflow is measure-then-reserve (cf. Chart.js/Highcharts box layout): non-plot
// elements are measured first, the bar zone gets the remainder, and on overflow the
// chart degrades in fixed order (value labels → deltas → legend) instead of overrunning.

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartMaxValue,
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry, truncateToWidth } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';
import { probeTextHeight } from '../_shared/fonts';

const COL_GAP = 6;
/** Smallest readable plot height; below it features degrade instead of clipping. */
const MIN_PLOT_H = 48;
/** Bar-width floor: thinner bars antialias into near-invisibility. */
const MIN_BAR_W = 2;
/** Flat marker height for exact-zero values (cf. Highcharts minPointLength). */
const ZERO_BAR_H = 3;

function removeNodes(nodes: SceneNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    try {
      nodes[i].remove();
    } catch (_e) {
      /* already removed */
    }
  }
}

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
  const catCount = model.categories.length;

  const root = figma.createFrame();
  root.name = 'ChartBars';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = Math.round(labelSize * 1.2);
  root.fills = [];
  root.resize(contentW, contentH);
  const rootGap = root.itemSpacing;

  let legend: FrameNode | null = null;
  if (model.showLegend && seriesCount > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < seriesCount; s++) {
      entries.push({
        label: model.series[s].name !== '' ? model.series[s].name : 'Serie ' + String(s + 1),
        color: ramp[s % ramp.length],
      });
    }
    // buildLegend degrades itself (font size → deltas → '+N more') until it fits
    // the height budget.
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

  const catLabelH = Math.ceil(
    Math.max(
      probeTextHeight('Inter', 'Regular', labelSize),
      probeTextHeight('Instrument Sans', 'SemiBold', labelSize),
    ),
  );
  const valueFontSize = Math.round(labelSize * 0.85);
  const valueH = model.showValues
    ? Math.ceil(
        Math.max(
          probeTextHeight('Inter', 'Medium', valueFontSize),
          probeTextHeight('Instrument Sans', 'SemiBold', valueFontSize),
        ),
      )
    : 0;

  // Band layout à la d3 scaleBand (group ~80% of its step, bar cap ~12% of contentW),
  // but bars and gaps shrink until the group always fits its band (floor MIN_BAR_W).
  const step = contentW / Math.max(1, catCount);
  const minGroupGap = catCount > 1 ? 2 : 0;
  const groupBudget = Math.max(seriesCount * MIN_BAR_W, Math.floor(step) - minGroupGap);
  const maxBarW = Math.min(160, Math.floor(contentW * 0.12));
  let barGap = 0;
  if (seriesCount > 1) {
    barGap = Math.round(((step * 0.8) / seriesCount) * 0.1);
    if (barGap < 1) barGap = 1;
    if (barGap > 24) barGap = 24;
  }
  let barW = Math.floor((step * 0.8 - (seriesCount - 1) * barGap) / seriesCount);
  if (barW < 10) barW = 10;
  if (barW > maxBarW) barW = maxBarW;
  let barsW = seriesCount * barW + (seriesCount - 1) * barGap;
  if (barsW > groupBudget) {
    if (seriesCount > 1) barGap = 1;
    barW = Math.floor((groupBudget - (seriesCount - 1) * barGap) / seriesCount);
    if (barW < MIN_BAR_W) barW = MIN_BAR_W;
    barsW = seriesCount * barW + (seriesCount - 1) * barGap;
  }
  const maxLabelW = Math.max(
    barsW,
    Math.floor(step) - Math.max(minGroupGap, Math.min(16, Math.round(step * 0.1))),
  );
  // A value label wider than this would stretch its auto-layout column and break the
  // band layout, so wider labels are dropped instead.
  const availValueW = seriesCount > 1 ? barW + barGap : maxLabelW;

  // Deltas are built up front so the vertical budget uses the real node height (badge
  // clone vs lower text fallback) instead of a per-route assumption.
  const deltaNodes: (SceneNode | null)[] = [];
  let deltaH = 0;
  if (model.showDelta === true) {
    for (let i = 0; i < catCount; i++) {
      const node = buildDeltaNode(deltaCtx, i, maxLabelW);
      deltaNodes.push(node);
      if (node !== null && node.height > deltaH) deltaH = node.height;
    }
    deltaH = Math.ceil(deltaH);
  }

  // If no value label fits anywhere, the vertical reservation is dropped entirely.
  let anyValueFits = false;
  if (model.showValues) {
    const wProbe = figma.createText();
    wProbe.fontSize = valueFontSize;
    for (let s = 0; s < seriesCount && !anyValueFits; s++) {
      for (let i = 0; i < catCount && !anyValueFits; i++) {
        wProbe.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        wProbe.characters = chartValueLabel(model.series[s], model.series[s].values[i]);
        if (wProbe.width <= availValueW) anyValueFits = true;
      }
    }
    wProbe.remove();
  }
  let anyDeltaFits = false;
  for (let i = 0; i < deltaNodes.length; i++) {
    const n = deltaNodes[i];
    if (n !== null && n.width <= maxLabelW) anyDeltaFits = true;
  }

  const groupGap = Math.round(labelSize * 0.5);
  let valuesOn = model.showValues && valueH > 0 && anyValueFits;
  let deltaOn = model.showDelta === true && deltaH > 0 && anyDeltaFits;
  let legendOn = legend !== null;

  const topStackH = function (): number {
    let h = 0;
    if (valuesOn) h += valueH + COL_GAP;
    if (deltaOn) h += deltaH + COL_GAP;
    return h;
  };
  const overheadH = function (): number {
    let h = topStackH() + groupGap + catLabelH;
    if (legendOn && legend !== null) h += legend.height + rootGap;
    return h;
  };

  // A disproportionately tall wrapped legend goes first — otherwise it eats the
  // whole plot on narrow cards.
  if (legendOn && legend !== null && legend.height + rootGap > contentH * 0.4) {
    legend.remove();
    legend = null;
    legendOn = false;
  }
  if (valuesOn && contentH - overheadH() < MIN_PLOT_H) valuesOn = false;
  if (deltaOn && contentH - overheadH() < MIN_PLOT_H) deltaOn = false;
  if (legendOn && legend !== null && contentH - overheadH() < MIN_PLOT_H) {
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

  const plotH = Math.max(4, contentH - overheadH());
  // Same fixed row height for every group: columns are bottom-aligned within it, so
  // all bars share one baseline and nothing pokes above the row.
  const rowH = plotH + topStackH();

  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.layoutMode = 'HORIZONTAL';
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  plot.primaryAxisAlignItems = 'CENTER';
  // MIN, not MAX: all bar rows share rowH, so top-aligning keeps baselines equal while
  // the slightly varying label heights stay inside the catLabelH zone.
  plot.counterAxisAlignItems = 'MIN';
  plot.itemSpacing = 0; // set from measured widths after building (see backstop)
  plot.fills = [];
  plot.resize(contentW, rowH + groupGap + catLabelH);

  const valueNodes: TextNode[] = [];
  const appendedDeltas: SceneNode[] = [];

  for (let i = 0; i < catCount; i++) {
    const group = figma.createFrame();
    group.name = 'Group-' + String(i);
    group.layoutMode = 'VERTICAL';
    group.primaryAxisSizingMode = 'AUTO';
    group.counterAxisSizingMode = 'AUTO';
    group.counterAxisAlignItems = 'CENTER';
    group.itemSpacing = groupGap;
    group.fills = [];

    const barsRow = figma.createFrame();
    barsRow.name = 'Bars';
    barsRow.layoutMode = 'HORIZONTAL';
    barsRow.primaryAxisSizingMode = 'AUTO';
    barsRow.counterAxisSizingMode = 'FIXED';
    barsRow.counterAxisAlignItems = 'MAX';
    barsRow.itemSpacing = barGap;
    barsRow.fills = [];

    for (let s = 0; s < seriesCount; s++) {
      const value = model.series[s].values[i];
      const barH =
        value === 0 ? ZERO_BAR_H : Math.max(ZERO_BAR_H, Math.round((value / max) * plotH));

      const barColumn = figma.createFrame();
      barColumn.name = 'BarColumn';
      barColumn.layoutMode = 'VERTICAL';
      barColumn.primaryAxisSizingMode = 'AUTO';
      barColumn.counterAxisSizingMode = 'AUTO';
      barColumn.counterAxisAlignItems = 'CENTER';
      barColumn.itemSpacing = COL_GAP;
      barColumn.fills = [];

      if (valuesOn) {
        const valueText = figma.createText();
        valueText.fontName = isPointEmphasized(model.series[s], i)
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        valueText.fontSize = valueFontSize;
        valueText.characters = chartValueLabel(model.series[s], value);
        valueText.textAutoResize = 'WIDTH_AND_HEIGHT';
        valueText.fills = [
          figma.variables.setBoundVariableForPaint(
            { type: 'SOLID', color: theme.textRGB },
            'color',
            theme.textVar,
          ),
        ];
        if (valueText.width > availValueW) {
          valueText.remove();
        } else {
          barColumn.appendChild(valueText);
          valueNodes.push(valueText);
        }
      }

      if (deltaOn && s === 0) {
        const deltaNode = deltaNodes[i];
        if (deltaNode !== null) {
          if (deltaNode.width > maxLabelW) {
            try {
              deltaNode.remove();
            } catch (_e) {
              /* already removed */
            }
            deltaNodes[i] = null;
          } else {
            barColumn.appendChild(deltaNode);
            appendedDeltas.push(deltaNode);
          }
        }
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
    barsRow.resize(Math.max(1, barsRow.width), rowH);

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
    // Truncate to a single line: a wrapping label would blow past the measured catLabelH.
    if (label.width > maxLabelW) {
      truncateToWidth(label, maxLabelW);
    }
    group.appendChild(label);

    plot.appendChild(group);
  }

  // Backstop: labels/badges can make columns wider than barW, so re-measure and drop
  // value labels, then deltas, until the total fits contentW.
  const measureGroups = function (): number {
    let w = 0;
    for (let c = 0; c < plot.children.length; c++) w += plot.children[c].width;
    return w;
  };
  let sumGroups = measureGroups();
  if (sumGroups > contentW && valueNodes.length > 0) {
    removeNodes(valueNodes);
    valueNodes.length = 0;
    sumGroups = measureGroups();
  }
  if (sumGroups > contentW && appendedDeltas.length > 0) {
    removeNodes(appendedDeltas);
    appendedDeltas.length = 0;
    sumGroups = measureGroups();
  }
  // gap = step minus average measured group width; with CENTER alignment that leaves
  // half-gaps at the edges instead of SPACE_BETWEEN's edge-pinned groups.
  let groupSpacing = 0;
  if (catCount > 1) {
    groupSpacing = Math.floor((contentW - sumGroups) / catCount);
    if (groupSpacing < 0) groupSpacing = 0;
  }
  plot.itemSpacing = groupSpacing;

  root.appendChild(plot);
  try {
    plot.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    /* silent */
  }
  return root;
}
