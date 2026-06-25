// ============================================================
// editors/chart/line.ts
//
// Line-chart-builder: per serie een VECTOR-polyline + punt-dots
// in een layout-NONE plotvlak, met subtiele horizontale gridlines en
// categorie-labels op de x-as. Waarden schalen tegen de hoogste waarde
// over alle series; punten verdelen de breedte gelijkmatig.
// Delta-badges (showDelta): boven elk serie-0-punt de verandering
// t.o.v. de vorige categorie, gestapeld onder het waarde-label.
//
// Hard overflow-budget: de top-headroom (padTop) reserveert de
// GEMETEN stapel boven het hoogste punt (waarde-label + delta-badge,
// de oude reservering vergat de badge), de legenda wrapt binnen
// contentW en telt met zijn echte hoogte mee. Past het niet, dan
// degradeert de chart (waarde-labels → delta-badges → legenda)
// i.p.v. de kaart uit te lopen; labels/badges breder dan hun punt-
// step vervallen per stuk (auto-hide on overlap).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

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

const DOT_SIZE = 12;
const STROKE_W = 4;
/** Minimaal leesbare lijn-zone; daaronder degraderen i.p.v. clippen. */
const MIN_INNER_H = 24;

/** Single-line teksthoogte voor font/korps via een wegwerp-probe
 * (fonts zijn al geladen door applyChart vóór de builders draaien). */
function probeTextHeight(family: string, style: string, fontSize: number): number {
  const probe = figma.createText();
  probe.fontName = { family: family, style: style };
  probe.fontSize = fontSize;
  probe.characters = 'Ag';
  const h = probe.height;
  probe.remove();
  return h;
}

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

  // ---- Meten: legenda (gewrapt), tekst-probes, echte delta-nodes.
  let legend: FrameNode | null = null;
  if (model.showLegend && model.series.length > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < model.series.length; s++) {
      entries.push({
        label: model.series[s].name !== '' ? model.series[s].name : 'Serie ' + String(s + 1),
        color: ramp[s % ramp.length],
      });
    }
    // Gewrapte horizontale rij met hoogte-budget: buildLegend
    // degradeert zelf (korps → delta's → '+N meer') tot het past.
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

  const pad = DOT_SIZE; // marge zodat dots niet clippen op de plot-rand
  const innerW = contentW - pad * 2;
  // Horizontaal budget per punt: labels/badges breder dan hun step
  // overlappen hun buren onleesbaar → per stuk laten vallen (research:
  // auto-hide on overlap, geen vaste px-drempel).
  const slotStep = pointCount > 1 ? innerW / (pointCount - 1) : contentW;
  const deltaMaxW = pointCount > 1 ? Math.max(8, Math.floor(slotStep)) : contentW;

  // Delta-nodes vooraf bouwen mét punt-step-cap: het verticale
  // budget rekent met de ECHTE node-hoogte (badge-clone vs. tekst-
  // fallback) i.p.v. een aanname, en de engine degradeert te brede
  // badges zelf naar een afgekapte tekst-variant.
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

  // Fit-voorcheck via één herbruikbare probe: past er ÜBERHAUPT
  // een waarde-label/badge, anders vervalt de verticale reservering.
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

  // ---- Verticaal budget: plot = contentH minus gemeten legenda,
  // x-as-rij en gaps; padTop = dot-marge + GEMETEN waarde/delta-stapel.
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

  // Disproportioneel hoge (gewrapte) legenda eerst weg — eet anders de
  // hele plot op smalle kaarten op (Highcharts responsive rule 1).
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
          /* al verwijderd */
        }
        deltaNodes[i] = null;
      }
    }
  }

  // Exact de rest van het budget — geen vloer die het budget overschrijdt
  // (de oude max(80, ...) duwde de x-as-rij de kaart uit op lage slots).
  const plotH = Math.max(10, availPlotH());
  const padTop = padTopFor();
  const innerH = Math.max(4, plotH - padTop - pad);

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
  // 6% top-headroom binnen het plotvlak zodat de hoogste lijn/dot
  // niet de bovenrand raakt; de waarde-labels zitten in padTop daarboven.
  const plotTop = padTop + Math.round(innerH * 0.06);
  const plotSpan = innerH - Math.round(innerH * 0.06);
  const yFor = function (value: number): number {
    return plotTop + plotSpan - (value / max) * plotSpan;
  };
  // Een punt onderin (waarde ≈ 0) krijgt z'n waarde-label ONDER de dot,
  // anders botst het met de x-as-labels.
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
    // MCP-geverifieerd: na het zetten van vectorPaths her-origint
    // Figma de vector naar de bounding-box van het pad (vector.x/y → 0).
    // Het pad is in absolute plot-coördinaten gerekend, dus plaats de
    // vector op de minX/minY van het pad zodat de lijn op de dots valt
    // i.p.v. naar de plot-top te klappen.
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

      // Label-stapel boven het punt: waarde bovenaan, delta-badge
      // (alleen serie 0) eronder, dichtst bij de dot. padTop
      // reserveert exact DOT_SIZE + valueH + deltaH, dus de stapel
      // van het hoogste punt blijft binnen het plot-frame.
      const lowPoint = labelBelow(model.series[s].values[i]);
      let stackY = yFor(model.series[s].values[i]) - DOT_SIZE;
      if (deltaOn && s === 0 && !lowPoint) {
        const deltaNode = deltaNodes[i];
        if (deltaNode !== null) {
          if (deltaNode.width > contentW || (pointCount > 1 && deltaNode.width > slotStep)) {
            // Breder dan de punt-step: vervalt per stuk.
            try {
              deltaNode.remove();
            } catch (_e) {
              /* al verwijderd */
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
          // Breder dan de punt-step: vervalt per stuk.
          valueText.remove();
        } else {
          plot.appendChild(valueText);
          // Clamp binnen het plot-frame (zelfde patroon als de x-as-
          // labels): randpunten zouden anders w/2 - pad uitsteken.
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

  // X-as-labels: zelfde x-posities als de datapunten (layout NONE).
  // Labels breder dan hun punt-step worden getruncate (ECharts
  // axisLabel.overflow 'truncate'); x is geclampt binnen contentW.
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
    // Single-line ellipsen (maxLines 1): zonder maxLines zou een
    // lang label wikkelen en de vaste labelRowH-rij uitlopen.
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
