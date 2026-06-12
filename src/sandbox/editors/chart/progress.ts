// ============================================================
// editors/chart/progress.ts
//
// Progress-bar-builder (T47): per categorie een rij met label, track
// en waarde. De referentieschaal is max(100, hoogste waarde) zodat
// percentages (0-100) natuurlijk vullen en grotere reeksen relatief
// schalen. Track in lichte accent-tint, fill in serie-0-kleur.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartMaxValue, formatChartValue } from '../../../shared/chart-calculations';
import { trackTint } from './palette';

export function buildProgress(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  ramp: RGB[],
  accent: RGB,
  textRGB: RGB,
  labelSize: number,
): FrameNode {
  const series = model.series[0];
  const reference = Math.max(100, chartMaxValue(model));

  const root = figma.createFrame();
  root.name = 'ChartProgress';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.primaryAxisAlignItems = 'CENTER';
  root.itemSpacing = Math.max(
    12,
    Math.round((contentH - model.categories.length * labelSize * 1.4) / (model.categories.length + 1)),
  );
  root.fills = [];
  root.resize(contentW, contentH);

  const labelW = Math.round(contentW * 0.22);
  const valueW = Math.round(contentW * 0.1);
  const gap = 24;
  const trackW = contentW - labelW - valueW - gap * 2;
  const trackH = Math.max(12, Math.round(labelSize * 0.7));

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
    label.fontName = { family: 'Inter', style: 'Regular' };
    label.fontSize = labelSize;
    label.characters = model.categories[i];
    label.textAutoResize = 'HEIGHT';
    label.textTruncation = 'ENDING';
    label.fills = [{ type: 'SOLID', color: textRGB }];
    row.appendChild(label);
    label.resize(labelW, label.height);

    const track = figma.createFrame();
    track.name = 'Track';
    track.resize(trackW, trackH);
    track.cornerRadius = trackH / 2;
    track.fills = [{ type: 'SOLID', color: trackTint(accent) }];
    track.clipsContent = true;

    const ratio = Math.min(1, series.values[i] / reference);
    const fillW = Math.max(trackH, Math.round(trackW * ratio));
    const fill = figma.createFrame();
    fill.name = 'Fill';
    fill.resize(fillW, trackH);
    fill.cornerRadius = trackH / 2;
    fill.fills = [{ type: 'SOLID', color: ramp[i % ramp.length] }];
    track.appendChild(fill);
    row.appendChild(track);

    const value = figma.createText();
    value.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
    value.fontSize = labelSize;
    value.characters = model.showValues ? formatChartValue(series.values[i]) : '';
    value.textAutoResize = 'HEIGHT';
    value.textAlignHorizontal = 'RIGHT';
    value.fills = [{ type: 'SOLID', color: textRGB }];
    row.appendChild(value);
    value.resize(valueW, value.height);

    root.appendChild(row);
    try {
      row.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }
  return root;
}
