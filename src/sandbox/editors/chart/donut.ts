// ============================================================
// editors/chart/donut.ts
//
// Donut- en pie-builder via native ellipse-arcData (T47): per categorie
// één ELLIPSE-segment. Hoeken in radialen, 0 = 3 uur, positief = met de
// klok mee; start bovenaan (-PI/2). Nul-waarden worden overgeslagen
// (tenzij total === 0, dan gelijke verdeling). Naad-effect via stroke met
// cardPaint: aangrenzende randen dragen elk een halve streek bij zodat de
// naad even breed is ongeacht segmentbreedte (T50/R3).
// Delta-badges (T48, showDelta): parts-of-whole — geen badge in de
// cirkel, de delta vs de vorige categorie staat als legenda-suffix.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartDeltaDisplay,
  chartValueLabel,
  formatChartValue,
  isCategoryEmphasized,
  isPointEmphasized,
  seriesTotal,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';

const DONUT_INNER = 0.66; // innerRadius-ratio voor donut

export function buildDonut(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  theme: ChartTheme,
  labelSize: number,
  cardPaint: SolidPaint,
  deltaCtx: DeltaBadgeContext,
): FrameNode {
  const isDonut = model.chartType === 'donut';
  const series = model.series[0];
  const total = seriesTotal(series);

  // T50.10 — breakpoint: op smalle/portrait-kaarten past de legenda
  // niet meer naast de cirkel (clipt aan de rechterrand). Onder
  // ~560px content-breedte of bij portrait stapelt de layout verticaal:
  // cirkel boven, legenda eronder.
  const stacked = contentW < 560 || contentW < contentH;

  const root = figma.createFrame();
  root.name = isDonut ? 'ChartDonut' : 'ChartPie';
  root.layoutMode = stacked ? 'VERTICAL' : 'HORIZONTAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.primaryAxisAlignItems = 'CENTER';
  root.counterAxisAlignItems = 'CENTER';
  root.itemSpacing = stacked ? Math.round(contentH * 0.06) : Math.round(contentW * 0.06);
  root.fills = [];
  root.resize(contentW, contentH);

  // Cirkel-container (layout NONE zodat segmenten + center-totaal
  // absoluut gepositioneerd kunnen worden).
  const diameter = stacked
    ? Math.min(contentW * 0.8, contentH * 0.55)
    : Math.min(contentH, contentW * 0.55);
  const circle = figma.createFrame();
  circle.name = 'Segments';
  circle.resize(diameter, diameter);
  circle.fills = [];
  circle.clipsContent = false;

  // Naad-dikte: half op elk aangrenzend segment → constante naad.
  const strokeWeight = Math.max(2, Math.round(diameter * 0.015));

  let angle = -Math.PI / 2;
  for (let i = 0; i < model.categories.length; i++) {
    const value = series.values[i];
    // Nul-waarden overslaan wanneer er een zinvol totaal is (T50/R3).
    if (total > 0 && value === 0) continue;
    const fraction = total > 0 ? value / total : 1 / model.categories.length;
    const sweep = fraction * (Math.PI * 2);
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
    // Naadstrook: aangrenzende randen dragen elk een halve stroke bij →
    // constante-breedte parallel-edged seams op pie én donut.
    // Omtrek-stroke valt weg achter card-achtergrond (cardPaint = onzichtbaar).
    segment.strokes = [cardPaint];
    segment.strokeAlign = 'CENTER';
    segment.strokeWeight = strokeWeight;
    circle.appendChild(segment);
    angle += sweep;
  }

  // Donut: center-totaal zoals het referentie-dashboard ("100 / totaal").
  if (isDonut) {
    // T50.4 — override + nadruk op het center-totaal; label editbaar.
    const totalOverride =
      typeof model.donutTotalOverride === 'string' ? model.donutTotalOverride.trim() : '';
    const totalEmphasis = model.donutTotalEmphasis !== false;
    const totalText = figma.createText();
    totalText.fontName = totalEmphasis
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    totalText.fontSize = Math.max(32, Math.round(diameter * 0.16));
    totalText.characters = totalOverride !== '' ? totalOverride : chartValueLabel(series, total);
    // T50.5 — totaal in de slide-level accent (zelfde kleurbron als de
    // segmenten): binnen de wrap resolven gebonden paints in de
    // geïnverteerde card-mode (Text = card-kleur → onzichtbaar), dus
    // solid; theme-switch re-rendert charts toch al.
    totalText.textAutoResize = 'WIDTH_AND_HEIGHT';
    totalText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
    circle.appendChild(totalText);

    const subText = figma.createText();
    // T50.9 — brandregel: Instrument Sans bestaat alleen in SemiBold;
    // niet-benadrukte tekst is altijd Inter Regular.
    subText.fontName =
      model.donutTotalLabelEmphasis === true
        ? { family: 'Instrument Sans', style: 'SemiBold' }
        : { family: 'Inter', style: 'Regular' };
    subText.fontSize = labelSize;
    subText.characters =
      typeof model.donutTotalLabel === 'string' && model.donutTotalLabel !== ''
        ? model.donutTotalLabel
        : 'totaal';
    subText.textAutoResize = 'WIDTH_AND_HEIGHT';
    // T50.5 — onderschrift in dezelfde slide-level accent als het totaal
    // (dimmer-binding resolvede in de card-mode te bleek).
    subText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
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
      // Nul-waarden wel in de legenda tonen — data bestaat nog steeds.
      let label = model.categories[i];
      if (model.showValues) label = label + '  —  ' + chartValueLabel(series, series.values[i]);
      entries.push({
        label: label,
        color: ramp[i % ramp.length],
        emphasis: isPointEmphasized(series, i) || isCategoryEmphasized(model, i),
        deltaNode: model.showDelta === true ? buildDeltaNode(deltaCtx, i) : null,
      });
    }
    const legendBudget = stacked
      ? contentW
      : Math.max(120, contentW - diameter - root.itemSpacing);
    root.appendChild(buildLegend(entries, theme, labelSize, legendBudget));
  }

  return root;
}
