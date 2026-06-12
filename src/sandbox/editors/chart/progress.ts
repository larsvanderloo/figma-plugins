// ============================================================
// editors/chart/progress.ts
//
// Progress-bar-builder (T47): per categorie een rij met label, track
// en waarde. De referentieschaal is max(100, hoogste waarde) zodat
// percentages (0-100) natuurlijk vullen en grotere reeksen relatief
// schalen. Track in lichte accent-tint, fill in serie-0-kleur.
// Delta-badges (T48, showDelta): extra kolom rechts van de waarde met
// de verandering t.o.v. de vorige categorie (▲ +12% / ▼ −5%).
//
// T52 — budget-discipline (meet-en-reserveer, à la het box-layout van
// Chart.js/Highcharts): elke niet-track-kolom wordt eerst gemeten én
// gecapt, de track krijgt de rest. Verticaal krimpt het korps mee met
// de rij-band en degraderen badges naar de tekst-variant vóórdat iets
// de content-frame uit kan lopen. Binnen de envelope (content vanaf
// 240×160, t/m 12 categorieën) clipt en overflowt er NIETS.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartProgressReference,
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { trackPaint } from './palette';
import type { ChartTheme } from './legend';
import { buildDeltaNode, DeltaBadgeContext } from './delta-badge';

export function buildProgress(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  light: RGB,
  theme: ChartTheme,
  labelSize: number,
  deltaCtx: DeltaBadgeContext,
): FrameNode {
  const series = model.series[0];
  const reference = chartProgressReference(model);
  const n = Math.max(1, model.categories.length);

  const root = figma.createFrame();
  root.name = 'ChartProgress';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.primaryAxisAlignItems = 'CENTER';
  root.fills = [];
  // Backstop voor buiten-envelope-input: clippen op de content-rand is
  // dan minder erg dan de kaart uit lopen. Binnen de envelope zorgt de
  // budgettering hieronder dat dit clippen nooit triggert.
  root.clipsContent = true;
  root.resize(contentW, contentH);

  // ---- Verticaal budget (T52) -------------------------------------
  // rowCap = de band (contentH / n) bij nul spacing: een rij mag die
  // NOOIT overschrijden, anders duwt n × rij de frame uit. Het korps
  // krimpt mee (regelhoogte ≈ 1.3 × korps), met 9px als absolute vloer
  // (ONS-vloer is 12; 9-10 alleen op de regels die anders zouden
  // clippen — binnen de envelope komt 12 rijen × 160px uit op 10px).
  const band = contentH / n;
  const rowCap = Math.max(10, Math.floor(band));
  let ef = labelSize;
  const fontCap = Math.floor(rowCap / 1.3);
  if (ef > fontCap) ef = fontCap;
  if (ef < 9) ef = 9;
  const lineH = Math.ceil(ef * 1.3);

  // T49 — responsieve track-dikte via rij-banden (d3 scaleBand-idee):
  // de track vult ~45% van zijn band, geklemd tussen een dunne
  // ondergrens (korps-gebonden, veel rijen) en 48px (chunky pill), en
  // nooit boven de rij-cap.
  const minTrackH = Math.max(8, Math.round(ef * 0.6));
  let trackH = Math.round(band * 0.45);
  if (trackH < minTrackH) trackH = minTrackH;
  if (trackH > 48) trackH = 48;
  if (trackH > rowCap) trackH = rowCap;

  // ---- Horizontaal budget: meet-en-reserveer ----------------------
  // Caps per kolom (22% label, 18% waarde, 20% delta) + responsieve
  // gap (~3%, 8-24px): samen maximaal ~70%, dus de track houdt altijd
  // ≥ ~30% van de content-breedte over.
  const gap = Math.max(8, Math.min(24, Math.round(contentW * 0.03)));
  const labelW = Math.round(contentW * 0.22);

  // Waarde-kolom: alleen reserveren wanneer zichtbaar (showValues uit →
  // geen lege kolom + gap verspillen). Breedte = breedste gemeten
  // waarde, gecapt — gemeten tekst mag de reservering nooit
  // ongelimiteerd laten groeien (ECharts containLabel-principe).
  const valueCap = Math.round(contentW * 0.18);
  const valueNodes: TextNode[] = [];
  let valueW = 0;
  if (model.showValues) {
    for (let i = 0; i < model.categories.length; i++) {
      const value = figma.createText();
      value.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
      value.fontSize = ef;
      value.characters = chartValueLabel(series, series.values[i]);
      value.textAutoResize = 'WIDTH_AND_HEIGHT';
      value.textAlignHorizontal = 'RIGHT';
      value.fills = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: theme.textRGB },
          'color',
          theme.textVar,
        ),
      ];
      valueNodes.push(value);
      const w = Math.ceil(value.width);
      if (w > valueW) valueW = w;
    }
    if (valueW > valueCap) valueW = valueCap;
  }

  // Delta-kolom (T48/T50/T52): nodes eerst bouwen, dan de kolom op de
  // breedste node maten — geen vaste 11%-gok die smaller kan zijn dan
  // een badge. Badges mogen alleen wanneer ze verticaal in de rij-cap
  // passen (anders forceert badgeTemplate=null de tekst-variant);
  // maxW/maxH-doorvoer laat delta-badge.ts zelf naar tekst degraderen.
  const deltaCap = Math.round(contentW * 0.2);
  const deltaNodes: Array<SceneNode | null> = [];
  let deltaW = 0;
  let deltaH = 0;
  if (model.showDelta === true) {
    const badgeFits = Math.ceil(ef * 1.4) <= rowCap;
    const localCtx: DeltaBadgeContext = {
      slide: deltaCtx.slide,
      model: deltaCtx.model,
      theme: deltaCtx.theme,
      labelSize: ef,
      badgeTemplate: badgeFits ? deltaCtx.badgeTemplate : null,
    };
    for (let i = 0; i < model.categories.length; i++) {
      const node = buildDeltaNode(localCtx, i, deltaCap, rowCap);
      deltaNodes.push(node);
      if (node !== null) {
        const w = Math.ceil(node.width);
        const h = Math.ceil(node.height);
        if (w > deltaW) deltaW = w;
        if (h > deltaH) deltaH = h;
      }
    }
    if (deltaW > deltaCap) deltaW = deltaCap;
  }

  // Degradatievolgorde wanneer de track te smal wordt (buiten de
  // envelope; Highcharts/Carbon-volgorde: annotaties eerst weg, dan
  // waarde-labels — label + track zijn het minimum-viable-rijtje).
  const minTrackW = Math.max(32, Math.round(contentW * 0.15));
  let trackW = contentW - labelW - valueW - deltaW - gap * (1 + (valueW > 0 ? 1 : 0) + (deltaW > 0 ? 1 : 0));
  if (trackW < minTrackW && deltaW > 0) {
    for (let i = 0; i < deltaNodes.length; i++) {
      const node = deltaNodes[i];
      if (node !== null) node.remove();
      deltaNodes[i] = null;
    }
    deltaW = 0;
    deltaH = 0;
    trackW = contentW - labelW - valueW - gap * (1 + (valueW > 0 ? 1 : 0));
  }
  if (trackW < minTrackW && valueW > 0) {
    for (let i = 0; i < valueNodes.length; i++) valueNodes[i].remove();
    valueNodes.length = 0;
    valueW = 0;
    trackW = contentW - labelW - gap;
  }

  // Rijhoogte = hoogste kolom (per constructie ≤ rowCap); de spacing
  // krijgt wat overblijft, inclusief boven-/onderrand (delen door
  // n + 1). Vloer 0 — een vast 12px-minimum zou bij veel rijen de
  // frame uit duwen.
  const rowH = Math.max(trackH, lineH, deltaH);
  root.itemSpacing = Math.max(0, Math.floor((contentH - n * rowH) / (n + 1)));

  for (let i = 0; i < model.categories.length; i++) {
    const row = figma.createFrame();
    row.name = 'ProgressRow-' + String(i);
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    // T52 — vaste rijhoogte uit het budget i.p.v. HUG: geen meet-races
    // met auto-layout en geen rijen die door wrappende tekst oprekken.
    row.counterAxisSizingMode = 'FIXED';
    row.counterAxisAlignItems = 'CENTER';
    row.clipsContent = false;
    row.itemSpacing = gap;
    row.fills = [];
    row.resize(contentW, rowH);

    const label = figma.createText();
    label.fontName = isPointEmphasized(series, i) || isCategoryEmphasized(model, i)
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    label.fontSize = ef;
    label.characters = model.categories[i];
    label.textAutoResize = 'HEIGHT';
    // T52 — maxLines is VERPLICHT naast ENDING: bij autoResize HEIGHT
    // truncate Figma anders nooit en wrappen lange labels de rij uit.
    label.textTruncation = 'ENDING';
    label.maxLines = 1;
    label.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    row.appendChild(label);
    label.resize(labelW, label.height);

    const track = figma.createFrame();
    track.name = 'Track';
    track.resize(trackW, trackH);
    track.cornerRadius = trackH / 2;
    track.fills = [trackPaint(light)];
    track.clipsContent = true;

    // T52 — nul-conventie (Highcharts/Chart.js): GEEN inkt voor waarde
    // 0, en ook niet voor bijna-nul onder de halve pill-radius
    // (trackH / 4) — de oude Math.max(trackH, …) rendert anders een
    // losse cirkel die een waarde suggereert waar geen is.
    const ratio = Math.min(1, Math.max(0, series.values[i] / reference));
    const rawW = Math.round(trackW * ratio);
    if (series.values[i] > 0 && rawW >= trackH / 4) {
      const fill = figma.createFrame();
      fill.name = 'Fill';
      // Minimale pill = volle cirkel (trackH breed) zodat kleine maar
      // echte waarden zichtbaar blijven (minPointLength-principe).
      fill.resize(Math.max(trackH, rawW), trackH);
      fill.cornerRadius = trackH / 2;
      fill.fills = [{ type: 'SOLID', color: light }];
      track.appendChild(fill);
      fill.x = 0;
      fill.y = 0;
    }
    row.appendChild(track);

    if (valueW > 0) {
      const value = valueNodes[i];
      // Van meet-modus (WIDTH_AND_HEIGHT) naar kolom-modus: vaste
      // breedte, één regel, truncation-backstop voor outliers boven
      // de kolom-cap.
      value.textTruncation = 'ENDING';
      value.maxLines = 1;
      value.textAutoResize = 'HEIGHT';
      row.appendChild(value);
      value.resize(valueW, value.height);
    }

    // Delta-kolom (T48/T50): vaste-breedte cel zodat rij-alignment
    // behouden blijft wanneer een categorie geen delta heeft.
    if (deltaW > 0) {
      const deltaCell = figma.createFrame();
      deltaCell.name = 'DeltaCell';
      deltaCell.layoutMode = 'HORIZONTAL';
      deltaCell.primaryAxisSizingMode = 'FIXED';
      // T52 — GEEN hoogte-meting op de net-gevulde cel: dat racet met
      // auto-layout en kneep badges tot een ~1px-sliver. De hoogte
      // komt uit het bekende rij-budget en de cel clipt nooit.
      deltaCell.counterAxisSizingMode = 'FIXED';
      deltaCell.counterAxisAlignItems = 'CENTER';
      deltaCell.clipsContent = false;
      deltaCell.fills = [];
      deltaCell.resize(deltaW, rowH);
      const deltaNode = deltaNodes[i];
      if (deltaNode !== null) deltaCell.appendChild(deltaNode);
      row.appendChild(deltaCell);
    }

    root.appendChild(row);
    try {
      row.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }
  return root;
}
