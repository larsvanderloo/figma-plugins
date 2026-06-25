// ============================================================
// editors/chart/bars.ts
//
// Bar-chart-builder: verticale (gegroepeerde) bars via
// auto-layout. Per categorie een kolom-groep met per serie één bar;
// hoogtes schalen tegen de hoogste waarde over alle series. Waarde-
// labels boven de bars (showValues), categorie-labels eronder,
// serie-legenda erboven bij meerdere series (showLegend).
// Delta-badges (showDelta): onder het waarde-label van serie 0
// de verandering t.o.v. de vorige categorie (▲ +12% / ▼ −5%).
//
// Hard overflow-budget (meet-dan-reserveer, à la het box-layout
// van Chart.js/Highcharts): alle niet-plot-elementen worden eerst
// GEMETEN (tekst-probes + echte delta-nodes), de bar-zone krijgt
// exact wat overblijft. Past het niet, dan degradeert de chart in
// vaste volgorde (waarde-labels → delta-badges → legenda) i.p.v. de
// kaart uit te lopen. Breedte heeft een harde band-fit + gemeten
// backstop zodat de groepen contentW nooit overschrijden.
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

/** Verticale ruimte tussen waarde-label / delta-badge / bar in een kolom. */
const COL_GAP = 6;
/** Minimaal leesbare bar-zone; daaronder degraderen i.p.v. clippen. */
const MIN_PLOT_H = 48;
/** Absolute bar-breedte-vloer (antialiasing-grens, research ≥2-4px). */
const MIN_BAR_W = 2;
/** Platte baseline-markering voor exacte 0 (Highcharts minPointLength). */
const ZERO_BAR_H = 3;

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

/** Best-effort batch-opruimen (degradatie-paden). */
function removeNodes(nodes: SceneNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    try {
      nodes[i].remove();
    } catch (_e) {
      /* al verwijderd */
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

  // ---- Meten — legenda (gewrapt), tekst-probes, echte delta-nodes.
  let legend: FrameNode | null = null;
  if (model.showLegend && seriesCount > 1) {
    const entries: LegendEntry[] = [];
    for (let s = 0; s < seriesCount; s++) {
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

  // ---- Breedte-budget — bandverdeling met harde fit. De d3-
  // scaleBand-gedachte blijft (groep ~80% van zijn step, bar ~90% van
  // zijn serie-slot, cap ~12% contentW), maar bars/gaps krimpen door
  // tot de groep ALTIJD binnen zijn band past (vloer MIN_BAR_W).
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
    // Krappe band (veel categorieën × series): gap naar 1px en bars
    // krimpen tot de fit klopt — nooit de band uitlopen.
    if (seriesCount > 1) barGap = 1;
    barW = Math.floor((groupBudget - (seriesCount - 1) * barGap) / seriesCount);
    if (barW < MIN_BAR_W) barW = MIN_BAR_W;
    barsW = seriesCount * barW + (seriesCount - 1) * barGap;
  }
  // Categorie-label mag zijn band niet uitlopen; breder wordt afgekapt.
  const maxLabelW = Math.max(
    barsW,
    Math.floor(step) - Math.max(minGroupGap, Math.min(16, Math.round(step * 0.1))),
  );
  // Waarde-label-budget per kolom (research: "hide when it doesn't
  // fit") — een breder label zou de auto-layout-kolom oprekken en de
  // bandverdeling laten overlopen.
  const availValueW = seriesCount > 1 ? barW + barGap : maxLabelW;

  // Delta-nodes vooraf bouwen mét band-breedte-cap: het verticale
  // budget rekent met de ECHTE node-hoogte (badge-clone ≈ labelSize*1.4,
  // tekst-fallback lager) i.p.v. een aanname per route, en de engine
  // degradeert te brede badges zelf naar een afgekapte tekst-variant.
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

  // Fit-voorcheck via één herbruikbare probe: past er ÜBERHAUPT
  // een waarde-label/badge, anders vervalt de verticale reservering.
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

  // ---- Verticaal budget — plot = contentH minus ALLE gemeten
  // niet-plot-hoogtes en gaps. Zakt de bar-zone onder MIN_PLOT_H, dan
  // degraderen in vaste volgorde i.p.v. clippen.
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

  // Disproportioneel hoge (gewrapte) legenda eerst weg — eet anders de
  // hele plot op smalle kaarten op (Highcharts responsive rule 1).
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
          /* al verwijderd */
        }
        deltaNodes[i] = null;
      }
    }
  }

  const plotH = Math.max(4, contentH - overheadH());
  // Vaste rij-hoogte voor ELKE groep: bar-max + gemeten top-stapel.
  // Kolommen zijn bottom-aligned binnen de rij, dus alle bars delen
  // exact dezelfde baseline en niets steekt boven de rij uit.
  const rowH = plotH + topStackH();

  // Plot-rij: per categorie een groep op zijn band-center.
  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.layoutMode = 'HORIZONTAL';
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  plot.primaryAxisAlignItems = 'CENTER';
  // MIN i.p.v. MAX: alle bar-rijen zijn even hoog (rowH), dus
  // top-uitlijnen houdt de baselines gelijk én laat de (per categorie
  // licht variërende) labelhoogte binnen de catLabelH-zone vallen.
  plot.counterAxisAlignItems = 'MIN';
  plot.itemSpacing = 0; // na het bouwen gemeten gezet (zie backstop)
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
      // Exacte 0 rendert een platte baseline-markering; kleine-
      // maar-niet-nul waarden minimaal dezelfde zichtbare hoogte.
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
        // Past het label niet in zijn kolom-budget → laten vallen
        // (Highcharts allowOverlap=false-gedrag), nooit de band oprekken.
        if (valueText.width > availValueW) {
          valueText.remove();
        } else {
          barColumn.appendChild(valueText);
          valueNodes.push(valueText);
        }
      }

      // Delta-badge: alleen serie 0, override-aware via engine.
      if (deltaOn && s === 0) {
        const deltaNode = deltaNodes[i];
        if (deltaNode !== null) {
          if (deltaNode.width > maxLabelW) {
            // Badge breder dan de band → vervalt i.p.v. overlopen.
            try {
              deltaNode.remove();
            } catch (_e) {
              /* al verwijderd */
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
    // Single-line ellipsen (maxLines 1): de oude HEIGHT-zonder-
    // maxLines-route liet lange labels wikkelen en blies catLabelH op.
    if (label.width > maxLabelW) {
      truncateToWidth(label, maxLabelW);
    }
    group.appendChild(label);

    plot.appendChild(group);
  }

  // ---- Backstop: GEMETEN totaalbreedte mag contentW nooit
  // overschrijden (kolommen kunnen door labels/badges breder zijn dan
  // barW). Drop-volgorde: waarde-labels → delta-badges.
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
  // Band-center-spacing uit GEMETEN groepsbreedtes: gap = step minus
  // gemiddelde groep → totaal ≤ contentW met halve gaps aan de randen
  // (CENTER), nooit edge-pinned zoals bij SPACE_BETWEEN.
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
