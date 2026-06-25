// ============================================================
// editors/chart/donut.ts
//
// Donut- en pie-builder via native ellipse-arcData: per categorie
// één ELLIPSE-segment. Hoeken in radialen, 0 = 3 uur, positief = met de
// klok mee; start bovenaan (-PI/2). Nul-waarden worden overgeslagen
// (tenzij total === 0, dan gelijke verdeling). Naad-effect via stroke met
// cardPaint: aangrenzende randen dragen elk een halve streek bij zodat de
// naad even breed is ongeacht segmentbreedte.
// Delta-badges (showDelta): parts-of-whole — geen badge in de
// cirkel, de delta vs de vorige categorie staat als legenda-suffix.
//
// Overflow-invariant (meet-dan-reserveer, Highcharts/ECharts-boxmodel):
// de legenda wordt EERST gebouwd binnen een gecapt hoogte-budget
// (degradatie-ladder in legend.ts), de cirkel krijgt de rest.
// Center-totaal past in het GAT (√(w²+h²) ≤ hole-diameter), met het
// sublabel als eerste offer (R1-hide-volgorde). Eén zichtbaar segment
// rendert zonder naad-stroke (anders tekent de volle cirkel een
// card-kleurige radiale naad door het segment).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
  seriesTotal,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry, truncateToWidth } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';

const DONUT_INNER = 0.66; // innerRadius-ratio voor donut

// Minimale zinvolle diameter voor een center-gelabelde donut:
// PatternFly's center-label (24px waarde) impliceert dat het gat ~24px
// tekst moet kunnen dragen → ±64px totale diameter als ondergrens.
const DONUT_MIN_DIAMETER = 64;

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

  // Breakpoint: op smalle/portrait-kaarten past de legenda
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

  let entries: LegendEntry[] | null = null;
  if (model.showLegend) {
    entries = [];
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
  }

  // Meet-dan-reserveer: legenda eerst (gecapt), cirkel = rest.
  // Voorheen was de cirkel vast (0.55×h) en kreeg de legenda GEEN
  // verticaal budget — 12 categorieën liepen dan ver de kaart uit.
  let legend: FrameNode | null = null;
  let diameter: number;
  if (stacked) {
    if (entries !== null) {
      // Legenda-cap: max ~45% van de hoogte, en altijd genoeg rest voor
      // een center-label-dragende donut (DONUT_MIN_DIAMETER) + spacing.
      const legendMaxH = Math.max(
        40,
        Math.min(
          Math.round(contentH * 0.45),
          contentH - DONUT_MIN_DIAMETER - root.itemSpacing,
        ),
      );
      // WRAP-modus: horizontale items die binnen contentW wikkelen —
      // 12 categorieën worden 3-6 rijen i.p.v. 12 kolomrijen (Carbon:
      // legenda horizontaal onder de plot vóór verbergen).
      legend = buildLegend(entries, theme, labelSize, contentW, legendMaxH, true);
    }
    const legendH = legend !== null ? legend.height + root.itemSpacing : 0;
    diameter =
      legend !== null
        ? Math.min(contentW * 0.8, contentH - legendH)
        : Math.min(contentW * 0.8, contentH * 0.55);
  } else {
    diameter = Math.min(contentH, contentW * 0.55);
    if (entries !== null) {
      // Kolom-legenda rechts: breedte = wat er werkelijk naast de cirkel
      // overblijft (geen vaste 120px-vloer die de rij kon laten uitsteken),
      // hoogte gecapt op contentH via de ladder in buildLegend.
      const legendMaxW = Math.max(60, contentW - diameter - root.itemSpacing);
      legend = buildLegend(entries, theme, labelSize, legendMaxW, contentH, false);
    }
  }
  if (diameter < 16) diameter = 16;

  // Cirkel-container (layout NONE zodat segmenten + center-totaal
  // absoluut gepositioneerd kunnen worden).
  const circle = figma.createFrame();
  circle.name = 'Segments';
  circle.resize(diameter, diameter);
  circle.fills = [];
  circle.clipsContent = false;

  // Zichtbare segmenten tellen (zelfde skip-regel als de
  // render-lus): bepaalt of er überhaupt naden bestaan.
  let visibleCount = 0;
  for (let i = 0; i < model.categories.length; i++) {
    if (!(total > 0 && series.values[i] === 0)) visibleCount = visibleCount + 1;
  }

  // Naad-dikte: half op elk aangrenzend segment → constante naad.
  // Gecapt op 2.5% van de diameter zodat de naad op kleine
  // cirkels geen dunne slices opeet (≥3px zichtbare inkt-regel), en
  // 0 bij één zichtbaar segment: een volle-cirkel-arc zou anders een
  // card-kleurige radiale naadlijn door het segment tekenen.
  let seamWeight = Math.max(2, Math.round(diameter * 0.015));
  const seamCap = Math.max(1, Math.floor(diameter * 0.025));
  if (seamWeight > seamCap) seamWeight = seamCap;
  if (visibleCount <= 1) seamWeight = 0;

  let angle = -Math.PI / 2;
  for (let i = 0; i < model.categories.length; i++) {
    const value = series.values[i];
    // Nul-waarden overslaan wanneer er een zinvol totaal is.
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
    if (seamWeight > 0) {
      segment.strokes = [cardPaint];
      segment.strokeAlign = 'CENTER';
      segment.strokeWeight = seamWeight;
    } else {
      segment.strokes = [];
    }
    circle.appendChild(segment);
    angle += sweep;
  }

  // Donut: center-totaal zoals het referentie-dashboard ("100 / totaal").
  if (isDonut) {
    // Override + nadruk op het center-totaal; label editbaar.
    const totalOverride =
      typeof model.donutTotalOverride === 'string' ? model.donutTotalOverride.trim() : '';
    const totalEmphasis = model.donutTotalEmphasis !== false;
    const totalText = figma.createText();
    totalText.fontName = totalEmphasis
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    // Startkorps zoals voorheen; de fit-lus hieronder schaalt het
    // korps tegen het GAT (0.66×d) i.p.v. de cirkel, want bij kleine
    // diameters (<~140) liep het 32px-vloerkorps het gat uit.
    let totalFont = Math.max(32, Math.round(diameter * 0.16));
    totalText.fontSize = totalFont;
    totalText.characters = totalOverride !== '' ? totalOverride : chartValueLabel(series, total);
    // Totaal in de slide-level accent (zelfde kleurbron als de
    // segmenten): binnen de wrap resolven gebonden paints in de
    // geïnverteerde card-mode (Text = card-kleur → onzichtbaar), dus
    // solid; theme-switch re-rendert charts toch al.
    totalText.textAutoResize = 'WIDTH_AND_HEIGHT';
    totalText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
    circle.appendChild(totalText);

    const subText = figma.createText();
    // Brandregel: Instrument Sans bestaat alleen in SemiBold;
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
    // Onderschrift in dezelfde slide-level accent als het totaal
    // (dimmer-binding resolvede in de card-mode te bleek).
    subText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
    circle.appendChild(subText);

    // Pasvorm: een blok w×h past in een cirkelgat met diameter D
    // wanneer √(w²+h²) ≤ D. De binnenrand-stroke (CENTER) snoept een
    // halve naad per zijde van het gat af.
    const holeD = diameter * DONUT_INNER - seamWeight;
    // Lang sublabel eerst op chord-breedte ellipsen (ECharts-volgorde:
    // truncate vóór droppen) zodat het de fit-lus niet domineert.
    if (subText.width > holeD * 0.8) truncateToWidth(subText, Math.round(holeD * 0.8));
    // R1-hide-volgorde: korps schalen; zakt het totaal onder ~1.25× het
    // sublabel-korps (PatternFly-verhouding 24/14 als richtpunt), dan
    // vervalt het sublabel eerst.
    const subDropFloor = Math.round(labelSize * 1.25);
    let subVisible = true;
    let guard = 0;
    while (guard < 10) {
      guard = guard + 1;
      const blockW = Math.max(totalText.width, subVisible ? subText.width : 0);
      const blockH = totalText.height + (subVisible ? subText.height : 0);
      const diag = Math.sqrt(blockW * blockW + blockH * blockH);
      if (diag <= holeD) break;
      if (totalFont <= 12) {
        // 12px-vloer (ONS): eerst nog het sublabel offeren, daarna
        // rest alleen de harde chord-clamp hieronder.
        if (subVisible) {
          subVisible = false;
          continue;
        }
        break;
      }
      let next = Math.floor(totalFont * (holeD / diag));
      if (next >= totalFont) next = totalFont - 1;
      if (subVisible && next < subDropFloor) {
        subVisible = false;
        continue;
      }
      if (next < 12) next = 12;
      totalFont = next;
      totalText.fontSize = totalFont;
    }
    if (!subVisible) subText.remove();
    // Harde breedte-clamp voor lange overrides op de korps-vloer:
    // ellipsis op de chord-breedte die bij de blokhoogte hoort.
    const clampH = totalText.height + (subVisible ? subText.height : 0);
    const chordSq = holeD * holeD - clampH * clampH;
    const chordW = chordSq > 64 ? Math.floor(Math.sqrt(chordSq)) : 8;
    if (totalText.width > chordW) truncateToWidth(totalText, chordW);
    if (subVisible && subText.width > chordW) truncateToWidth(subText, chordW);

    const blockH = totalText.height + (subVisible ? subText.height : 0);
    totalText.x = (diameter - totalText.width) / 2;
    totalText.y = (diameter - blockH) / 2;
    if (subVisible) {
      subText.x = (diameter - subText.width) / 2;
      subText.y = totalText.y + totalText.height;
    }
  }

  root.appendChild(circle);
  try {
    circle.layoutSizingHorizontal = 'FIXED';
    circle.layoutSizingVertical = 'FIXED';
  } catch (_e) {
    /* silent */
  }

  if (legend !== null) {
    root.appendChild(legend);
  }

  return root;
}
