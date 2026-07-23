// Donut/pie via native ellipse arcData: angles are radians, 0 = 3 o'clock,
// positive clockwise, segments start at the top (-PI/2). Deltas (showDelta)
// render as legend suffixes, never as badges inside the circle.

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
  seriesTotal,
} from '../../../shared/chart-calculations';
import { buildLegend, ChartTheme, LegendEntry, truncateToWidth } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';

const DONUT_INNER = 0.66;

// PatternFly's 24px center label needs roughly a 64px total diameter
// before the hole can carry it.
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

  // Below ~560px content width (or portrait) a side legend clips at the
  // right edge, so the layout stacks: circle above, legend below.
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
      // Zero values keep a legend entry even though their segments are skipped.
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

  // Measure-then-reserve: legend first (capped), circle gets the rest. A fixed
  // circle gave the legend no vertical budget and 12 categories overflowed the card.
  let legend: FrameNode | null = null;
  let diameter: number;
  if (stacked) {
    if (entries !== null) {
      // Legend cap: ~45% of height, always leaving room for a center-label
      // donut (DONUT_MIN_DIAMETER) plus spacing.
      const legendMaxH = Math.max(
        40,
        Math.min(
          Math.round(contentH * 0.45),
          contentH - DONUT_MIN_DIAMETER - root.itemSpacing,
        ),
      );
      // WRAP mode: horizontal items wrapping within contentW — 12 categories
      // become 3-6 rows instead of 12 stacked ones.
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
      // Right column legend: width = whatever actually remains next to the
      // circle (a fixed 120px floor could overflow the row); height capped via
      // buildLegend's ladder.
      const legendMaxW = Math.max(60, contentW - diameter - root.itemSpacing);
      legend = buildLegend(entries, theme, labelSize, legendMaxW, contentH, false);
    }
  }
  if (diameter < 16) diameter = 16;

  // Layout NONE so segments and the center total can be positioned absolutely.
  const circle = figma.createFrame();
  circle.name = 'Segments';
  circle.resize(diameter, diameter);
  circle.fills = [];
  circle.clipsContent = false;

  // Count visible segments (same skip rule as the render loop): decides
  // whether seams exist at all.
  let visibleCount = 0;
  for (let i = 0; i < model.categories.length; i++) {
    if (!(total > 0 && series.values[i] === 0)) visibleCount = visibleCount + 1;
  }

  // Seam width: half a stroke on each adjacent segment → constant seams.
  // Capped at 2.5% of the diameter so seams don't eat thin slices on small
  // circles; 0 with one visible segment, else its full-circle arc draws a
  // card-colored radial seam through it.
  let seamWeight = Math.max(2, Math.round(diameter * 0.015));
  const seamCap = Math.max(1, Math.floor(diameter * 0.025));
  if (seamWeight > seamCap) seamWeight = seamCap;
  if (visibleCount <= 1) seamWeight = 0;

  let angle = -Math.PI / 2;
  for (let i = 0; i < model.categories.length; i++) {
    const value = series.values[i];
    // Skip zero values when there is a meaningful total.
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
    // Adjacent edges each carry half a stroke → constant-width parallel seams
    // on pie and donut; the outer stroke disappears against the card background.
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

  if (isDonut) {
    const totalOverride =
      typeof model.donutTotalOverride === 'string' ? model.donutTotalOverride.trim() : '';
    const totalEmphasis = model.donutTotalEmphasis !== false;
    const totalText = figma.createText();
    totalText.fontName = totalEmphasis
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    // The fit loop below scales the font against the HOLE (0.66×d), not the
    // circle: at small diameters the 32px floor font overflowed the hole.
    let totalFont = Math.max(32, Math.round(diameter * 0.16));
    totalText.fontSize = totalFont;
    totalText.characters = totalOverride !== '' ? totalOverride : chartValueLabel(series, total);
    // Solid accent, not a bound paint: inside the wrap, bound paints resolve
    // in the inverted card mode (Text = card color → invisible). Theme
    // switches re-render charts anyway.
    totalText.textAutoResize = 'WIDTH_AND_HEIGHT';
    totalText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
    circle.appendChild(totalText);

    const subText = figma.createText();
    // Brand rule: Instrument Sans exists only in SemiBold; non-emphasized
    // text is always Inter Regular.
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
    // Same slide-level accent as the total (the dimmer binding resolved too
    // pale in card mode).
    subText.fills = [{ type: 'SOLID', color: theme.onCardRGB }];
    circle.appendChild(subText);

    // A w×h block fits a circular hole of diameter D when √(w²+h²) ≤ D; the
    // CENTER inner stroke eats half a seam per side of the hole.
    const holeD = diameter * DONUT_INNER - seamWeight;
    // Ellipsize a long sublabel to chord width first (truncate before
    // dropping) so it doesn't dominate the fit loop.
    if (subText.width > holeD * 0.8) truncateToWidth(subText, Math.round(holeD * 0.8));
    // Hide order: scale the font; once the total drops under ~1.25× the
    // sublabel size, drop the sublabel first.
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
        // 12px floor: sacrifice the sublabel first; after that only the hard
        // chord clamp below remains.
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
    // Hard width clamp for long overrides at the font floor: ellipsize at
    // the chord width matching the block height.
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
