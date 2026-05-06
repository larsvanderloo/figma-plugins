// ============================================================
// editors/chart/bar.ts
//
// Imperatieve bar-chart-renderer (plugin-API). Port van de declaratieve
// widget-JSX-versie in widgets/chart-builder/widget-src/renderers/bar.tsx.
//
// Outer-frame: VERTICAL AutoLayout (title + body + x-axis-labels-row).
// Plot-area: HORIZONTAL AutoLayout met per-bar kolom (DataLabel / Bar).
// Per-bar kleur uit theme.palette (cyclisch). Bar-hoogtes geschaald op
// data.max/min of auto-max uit de datapunten.
//
// v0.1.0-scope (spec §11):
//   - Geen benchmark-badges (TODO na v0.1.0).
//   - Geen y-as-ticks — uitgesteld tot we het asdesign afstemmen.
//   - Geen wrap-math voor lange labels — rely op AutoLayout hug-height.
//
// Alle font-mutaties verwachten dat REQUIRED_FONTS al preloaded is via
// code.ts::loadFonts (FIG-FONT-01). De caller (renderer.ts) load extra
// safety-net vóór de eerste text-node wordt aangemaakt.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartData, DataPoint } from '../../types';
import type { ChartRenderContext } from './types';

// -------------------------------------------------------------------
// Color helpers
// -------------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const h = hex.indexOf('#') === 0 ? hex.substring(1) : hex;
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function solid(hex: string, opacity?: number): SolidPaint {
  if (opacity === undefined) {
    return { type: 'SOLID', color: hexToRgb(hex) };
  }
  return { type: 'SOLID', color: hexToRgb(hex), opacity: opacity };
}

// -------------------------------------------------------------------
// Text-node helpers (fonts are preloaded by caller — FIG-FONT-01)
// -------------------------------------------------------------------

function createText(
  chars: string,
  font: FontName,
  size: number,
  color: string,
  align: 'LEFT' | 'CENTER' | 'RIGHT',
): TextNode {
  const t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.fills = [solid(color)];
  t.textAlignHorizontal = align;
  t.characters = chars;
  t.textAutoResize = 'HEIGHT';
  return t;
}

// -------------------------------------------------------------------
// Bar column — DataLabel boven, Bar-rectangle daaronder.
// Kolomhoogte = plotBodyHeight (zodat alle kolommen even hoog zijn en
// de AutoLayout ze netjes naast elkaar zet); de bar zelf is korter en
// wordt via een bovenliggend spacer-frame naar beneden geduwd.
// -------------------------------------------------------------------

function renderBarColumn(
  point: DataPoint,
  color: string,
  barW: number,
  plotBodyH: number,
  dataLabelH: number,
  barHeight: number,
  dataLabelFont: FontName,
  dataFontSize: number,
  barCornerRadius: number,
  mutedText: string,
): FrameNode {
  const col = figma.createFrame();
  col.name = 'Column: ' + point.label;
  col.layoutMode = 'VERTICAL';
  col.primaryAxisAlignItems = 'MAX'; // bars aligned to bottom
  col.counterAxisAlignItems = 'CENTER';
  col.itemSpacing = 4;
  col.paddingTop = 0;
  col.paddingBottom = 0;
  col.paddingLeft = 0;
  col.paddingRight = 0;
  col.fills = [];
  col.resize(barW, plotBodyH);
  col.clipsContent = false;

  // Data-label — fixed height, horizontaal gecentreerd.
  const label = createText(String(point.value), dataLabelFont, dataFontSize, mutedText, 'CENTER');
  label.name = 'DataLabel: ' + point.label;
  label.textAlignVertical = 'BOTTOM';
  col.appendChild(label);
  label.layoutSizingHorizontal = 'FILL';

  // Bar-rectangle — hoogte uit scale-math; breedte = kolombreedte.
  const bar = figma.createRectangle();
  bar.name = 'Bar: ' + point.label;
  bar.fills = [solid(color)];
  bar.topLeftRadius = barCornerRadius;
  bar.topRightRadius = barCornerRadius;
  bar.bottomLeftRadius = 0;
  bar.bottomRightRadius = 0;
  bar.resize(barW, Math.max(4, barHeight));
  col.appendChild(bar);
  bar.layoutSizingHorizontal = 'FILL';

  return col;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

export function renderBar(data: ChartData, ctx: ChartRenderContext): FrameNode {
  const theme = ctx.theme;
  const outerWidth = ctx.width;
  const outerHeight = ctx.height;
  const pad = 48;
  const titleH = 64;

  const titleFont: FontName = { family: 'Instrument Sans', style: 'SemiBold' };
  const axisFont: FontName = { family: 'Inter', style: 'Medium' };
  const dataLabelFont: FontName = { family: 'Inter', style: 'Regular' };

  // Outer card — VERTICAL AutoLayout met title + body + axis-labels-row.
  const card = figma.createFrame();
  card.name = 'BarChart';
  card.layoutMode = 'VERTICAL';
  card.counterAxisSizingMode = 'FIXED';
  card.resize(outerWidth, outerHeight);
  card.primaryAxisSizingMode = 'FIXED';
  card.cornerRadius = 32;
  card.itemSpacing = 16;
  card.paddingTop = pad;
  card.paddingBottom = pad;
  card.paddingLeft = pad;
  card.paddingRight = pad;
  card.fills = [solid(theme.background)];
  card.strokes = [solid(theme.accent)];
  card.strokeWeight = 2;
  card.strokeAlign = 'INSIDE';

  // Title — fixed height regel bovenaan.
  const title = createText(data.title, titleFont, 40, theme.foreground, 'LEFT');
  title.name = 'Title';
  card.appendChild(title);
  title.layoutSizingHorizontal = 'FILL';

  const points = data.dataPoints;
  const n = points.length;

  // Empty-state: alleen title tonen, rest van het frame blijft leeg.
  if (n === 0) return card;

  // Auto-max + min/max-clamp voor bar-scale.
  let autoMax = 0;
  for (let j = 0; j < n; j++) {
    if (points[j].value > autoMax) autoMax = points[j].value;
  }
  if (autoMax === 0) autoMax = 1;
  const minRef = data.min !== undefined ? data.min : 0;
  let maxRef = data.max !== undefined ? data.max : autoMax;
  if (maxRef === minRef) maxRef = minRef + 1;

  // Scale-factor — spec van chart-builder bar.tsx (clamp 0.5..2.5).
  const plotW = outerWidth - pad * 2;
  const plotH = outerHeight - pad * 2 - 16 * 2 - titleH;
  let scale = Math.min(plotW, plotH) / 500;
  if (scale < 0.5) scale = 0.5;
  if (scale > 2.5) scale = 2.5;

  const dataFontSize = Math.round(20 * scale);
  const axisFontSize = Math.max(
    14,
    Math.min(19, Math.round(14 + ((outerWidth - 555) / (1141 - 555)) * 5)),
  );
  const barGap = Math.max(2, Math.round(8 * scale));
  const barCornerR = Math.max(2, Math.round(6 * scale));
  const dataLabelH = dataFontSize + 8;

  // Kolom-breedte — verdeel plotW over n kolommen met gap-ruimte.
  const totalGap = (n - 1) * barGap;
  const barW = Math.max(8, Math.floor((plotW - totalGap) / n));

  // Axis-label-rij-hoogte: 1-2 regels + marge. Wrap-math bewust
  // simpel gehouden in v0.1.0 — AutoLayout rekt mee als labels >1 regel.
  const axisLabelsRowH = Math.round(axisFontSize * 2 + 8);
  let barAreaH = plotH - dataLabelH - axisLabelsRowH;
  if (barAreaH < 20) barAreaH = 20;
  const plotBodyH = dataLabelH + barAreaH;

  // ChartBody — HORIZONTAL AutoLayout met 1 kolom per datapunt.
  const body = figma.createFrame();
  body.name = 'ChartBody';
  body.layoutMode = 'HORIZONTAL';
  body.primaryAxisAlignItems = 'MIN';
  body.counterAxisAlignItems = 'MAX'; // bars bottom-aligned
  body.itemSpacing = barGap;
  body.paddingTop = 0;
  body.paddingBottom = 0;
  body.paddingLeft = 0;
  body.paddingRight = 0;
  body.fills = [];
  body.resize(plotW, plotBodyH);
  body.primaryAxisSizingMode = 'FIXED';
  body.counterAxisSizingMode = 'FIXED';
  body.clipsContent = false;
  card.appendChild(body);

  for (let i = 0; i < n; i++) {
    const point = points[i];
    let frac = (point.value - minRef) / (maxRef - minRef);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    const barHeight = Math.round(frac * barAreaH);
    const color = theme.palette[i % theme.palette.length];
    const col = renderBarColumn(
      point,
      color,
      barW,
      plotBodyH,
      dataLabelH,
      barHeight,
      dataLabelFont,
      dataFontSize,
      barCornerR,
      theme.mutedText,
    );
    body.appendChild(col);
  }

  // AxisLabels-rij — per kolom een label, zelfde breedte als de bar.
  const axis = figma.createFrame();
  axis.name = 'AxisLabels';
  axis.layoutMode = 'HORIZONTAL';
  axis.primaryAxisAlignItems = 'MIN';
  axis.counterAxisAlignItems = 'MIN';
  axis.itemSpacing = barGap;
  axis.paddingTop = 0;
  axis.paddingBottom = 0;
  axis.paddingLeft = 0;
  axis.paddingRight = 0;
  axis.fills = [];
  axis.resize(plotW, axisLabelsRowH);
  axis.primaryAxisSizingMode = 'FIXED';
  axis.counterAxisSizingMode = 'FIXED';
  axis.clipsContent = false;
  card.appendChild(axis);

  for (let i = 0; i < n; i++) {
    const point = points[i];
    const labelCell = figma.createFrame();
    labelCell.name = 'AxisLabel: ' + point.label;
    labelCell.layoutMode = 'VERTICAL';
    labelCell.primaryAxisAlignItems = 'MIN';
    labelCell.counterAxisAlignItems = 'CENTER';
    labelCell.itemSpacing = 4;
    labelCell.fills = [];
    labelCell.resize(barW, axisLabelsRowH);
    labelCell.primaryAxisSizingMode = 'FIXED';
    labelCell.counterAxisSizingMode = 'FIXED';

    const labelText = createText(point.label, axisFont, axisFontSize, theme.mutedText, 'CENTER');
    labelText.name = 'Label';
    labelCell.appendChild(labelText);
    labelText.layoutSizingHorizontal = 'FILL';

    axis.appendChild(labelCell);
  }

  return card;
}
