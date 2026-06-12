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
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartDeltaLabel,
  chartProgressReference,
  chartValueLabel,
  formatChartValue,
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

  const root = figma.createFrame();
  root.name = 'ChartProgress';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.primaryAxisAlignItems = 'CENTER';
  root.fills = [];
  root.resize(contentW, contentH);

  // T49 — responsieve track-dikte via rij-banden (d3 scaleBand-idee):
  // band = contentH / n; de track vult ~45% van zijn band, geklemd
  // tussen een dunne ondergrens (labelSize-gebonden, veel rijen) en
  // 48px (chunky pill — dashboard-conventie is 4-30px op UI-schaal,
  // presentatie-slides verdragen dikker). Restruimte wordt gelijk
  // verdeeld, inclusief boven-/onderrand (delen door n + 1).
  const n = model.categories.length;
  const band = contentH / Math.max(1, n);
  const minTrackH = Math.max(12, Math.round(labelSize * 0.6));
  let trackH = Math.round(band * 0.45);
  if (trackH < minTrackH) trackH = minTrackH;
  if (trackH > 48) trackH = 48;
  const rowH = Math.max(trackH, Math.ceil(labelSize * 1.4));
  root.itemSpacing = Math.max(12, Math.round((contentH - n * rowH) / (n + 1)));

  const labelW = Math.round(contentW * 0.22);
  const valueW = Math.round(contentW * 0.1);
  const deltaW = model.showDelta === true ? Math.round(contentW * 0.11) : 0;
  const gap = 24;
  const trackW = contentW - labelW - valueW - deltaW - gap * (model.showDelta === true ? 3 : 2);

  for (let i = 0; i < model.categories.length; i++) {
    const row = figma.createFrame();
    row.name = 'ProgressRow-' + String(i);
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    row.counterAxisSizingMode = 'AUTO';
    row.counterAxisAlignItems = 'CENTER';
    row.itemSpacing = gap;
    row.fills = [];

    const label = figma.createText();
    label.fontName = isPointEmphasized(series, i) || isCategoryEmphasized(model, i)
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Regular' };
    label.fontSize = labelSize;
    label.characters = model.categories[i];
    label.textAutoResize = 'HEIGHT';
    label.textTruncation = 'ENDING';
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

    const ratio = Math.min(1, series.values[i] / reference);
    const fillW = Math.max(trackH, Math.round(trackW * ratio));
    const fill = figma.createFrame();
    fill.name = 'Fill';
    fill.resize(fillW, trackH);
    fill.cornerRadius = trackH / 2;
    fill.fills = [{ type: 'SOLID', color: light }];
    track.appendChild(fill);
    fill.x = 0;
    fill.y = 0;
    row.appendChild(track);

    const value = figma.createText();
    value.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
    value.fontSize = labelSize;
    value.characters = model.showValues ? chartValueLabel(series, series.values[i]) : '';
    value.textAutoResize = 'HEIGHT';
    value.textAlignHorizontal = 'RIGHT';
    value.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    row.appendChild(value);
    value.resize(valueW, value.height);

    // Delta-kolom (T48/T50): vaste-breedte cel zodat rij-alignment
    // behouden blijft wanneer een categorie geen delta heeft.
    if (model.showDelta === true) {
      const deltaCell = figma.createFrame();
      deltaCell.name = 'DeltaCell';
      deltaCell.layoutMode = 'HORIZONTAL';
      deltaCell.primaryAxisSizingMode = 'FIXED';
      deltaCell.counterAxisSizingMode = 'AUTO';
      deltaCell.counterAxisAlignItems = 'CENTER';
      deltaCell.fills = [];
      const deltaNode = buildDeltaNode(deltaCtx, i);
      if (deltaNode !== null) deltaCell.appendChild(deltaNode);
      row.appendChild(deltaCell);
      deltaCell.resize(deltaW, Math.max(deltaCell.height, 1));
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
