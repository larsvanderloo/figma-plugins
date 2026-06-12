// ============================================================
// editors/chart/donut.ts
//
// Donut- en pie-builder via native ellipse-arcData (T47): per categorie
// één ELLIPSE-segment. Hoeken in radialen, 0 = 3 uur, positief = met de
// klok mee; start bovenaan (-PI/2) met een kleine angular gap tussen
// segmenten. Donut toont een center-totaal ("100 totaal"); de legenda
// (categorieën, optioneel met waarde) komt rechts naast de cirkel.
// Delta-badges (T48, showDelta): parts-of-whole — geen badge in de
// cirkel, de delta vs de vorige categorie staat als legenda-suffix.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartDeltaLabel,
  formatChartValue,
  isCategoryEmphasized,
  isPointEmphasized,
  seriesTotal,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry } from './legend';
import type { DeltaBadgeContext } from './delta-badge';

const SEGMENT_GAP = 0.03; // radialen tussen segmenten
const DONUT_INNER = 0.66; // innerRadius-ratio voor donut

export function buildDonut(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  theme: ChartTheme,
  labelSize: number,
  _cardPaint: SolidPaint,
  _deltaCtx: DeltaBadgeContext,
): FrameNode {
  const isDonut = model.chartType === 'donut';
  const series = model.series[0];
  const total = seriesTotal(series);

  const root = figma.createFrame();
  root.name = isDonut ? 'ChartDonut' : 'ChartPie';
  root.layoutMode = 'HORIZONTAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.primaryAxisAlignItems = 'CENTER';
  root.counterAxisAlignItems = 'CENTER';
  root.itemSpacing = Math.round(contentW * 0.06);
  root.fills = [];
  root.resize(contentW, contentH);

  // Cirkel-container (layout NONE zodat segmenten + center-totaal
  // absoluut gepositioneerd kunnen worden).
  const diameter = Math.min(contentH, contentW * 0.55);
  const circle = figma.createFrame();
  circle.name = 'Segments';
  circle.resize(diameter, diameter);
  circle.fills = [];
  circle.clipsContent = false;

  let angle = -Math.PI / 2;
  const gap = model.categories.length > 1 ? SEGMENT_GAP : 0;
  for (let i = 0; i < model.categories.length; i++) {
    const value = series.values[i];
    const fraction = total > 0 ? value / total : 1 / model.categories.length;
    const sweep = fraction * (Math.PI * 2 - gap * model.categories.length);
    const segment = figma.createEllipse();
    segment.name = 'Segment-' + String(i);
    segment.resize(diameter, diameter);
    segment.x = 0;
    segment.y = 0;
    segment.arcData = {
      startingAngle: angle,
      endingAngle: angle + sweep,
      innerRadius: isDonut ? DONUT_INNER : 0,
    };
    segment.fills = [{ type: 'SOLID', color: ramp[i % ramp.length] }];
    circle.appendChild(segment);
    angle += sweep + gap;
  }

  // Donut: center-totaal zoals het referentie-dashboard ("100 / totaal").
  if (isDonut) {
    const totalText = figma.createText();
    totalText.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
    totalText.fontSize = Math.max(32, Math.round(diameter * 0.16));
    totalText.characters = formatChartValue(total);
    totalText.textAutoResize = 'WIDTH_AND_HEIGHT';
    totalText.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    circle.appendChild(totalText);

    const subText = figma.createText();
    subText.fontName = { family: 'Inter', style: 'Regular' };
    subText.fontSize = labelSize;
    subText.characters = 'totaal';
    subText.textAutoResize = 'WIDTH_AND_HEIGHT';
    subText.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.dimmerRGB },
        'color',
        theme.dimmerVar,
      ),
    ];
    circle.appendChild(subText);

    const blockH = totalText.height + subText.height;
    totalText.x = (diameter - totalText.width) / 2;
    totalText.y = (diameter - blockH) / 2;
    subText.x = (diameter - subText.width) / 2;
    subText.y = totalText.y + totalText.height;
  }

  root.appendChild(circle);
  try {
    circle.layoutSizingHorizontal = 'FIXED';
    circle.layoutSizingVertical = 'FIXED';
  } catch (_e) {
    /* silent */
  }

  if (model.showLegend) {
    const entries: LegendEntry[] = [];
    for (let i = 0; i < model.categories.length; i++) {
      let label = model.categories[i];
      if (model.showValues) label = label + '  —  ' + formatChartValue(series.values[i]);
      if (model.showDelta === true) {
        const delta = chartDeltaLabel(series.values, i);
        if (delta !== null) label = label + '  ' + delta;
      }
      entries.push({
        label: label,
        color: ramp[i % ramp.length],
        emphasis: isPointEmphasized(series, i) || isCategoryEmphasized(model, i),
      });
    }
    root.appendChild(buildLegend(entries, theme, labelSize));
  }

  return root;
}
