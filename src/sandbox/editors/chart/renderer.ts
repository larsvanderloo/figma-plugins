// ============================================================
// editors/chart/renderer.ts
//
// Slot-based chart-renderer voor ChartWrap-instances (T47) — zelfde
// architectuur als de tabel: full-state PUT binnen de SlotNode, witte
// kaart-container die de actuele Slot-afmetingen volgt, theming via
// de library-variables (accent-ramp afgeleid van `Text`).
//
// Public API:
//   - scanChartSlot(slot)       → ChartWrapModel (pluginData-truth)
//   - applyChart(slot, desired) → full-state PUT (clear + rebuild)
//
// Per-type-builders leven in `./donut.ts`, `./bars.ts`,
// `./progress.ts`, `./line.ts`; gedeelde stukken in `./palette.ts`,
// `./legend.ts`, `./plugin-data.ts`.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { normalizeChartModel } from '../../../shared/chart-calculations';
import { debugLog } from '../../../shared/debug';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from '../_shared/accent-vars';
import { accentRamp, cardTextColor, CHART_CARD_RGB } from './palette';
import { readChartModel, writeChartModel } from './plugin-data';
import { buildDonut } from './donut';
import { buildBars } from './bars';
import { buildProgress } from './progress';
import { buildLine } from './line';

export { readChartModel } from './plugin-data';

/** pluginData-truth scan: lees het gepersisteerde model van de Slot. */
export function scanChartSlot(slot: SlotNode): ChartWrapModel {
  return readChartModel(slot);
}

/** Witte kaart-container — spiegel van de tabel-container-stijl
 * (radius 55, 2px dimmer-border) maar met witte fill. */
function buildChartCard(dimmerVar: Variable, dimmerRGB: RGB): FrameNode {
  const card = figma.createFrame();
  card.name = 'WelderChartContent';
  card.layoutMode = 'VERTICAL';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.primaryAxisAlignItems = 'CENTER';
  card.counterAxisAlignItems = 'CENTER';
  card.cornerRadius = 55;
  card.clipsContent = true;
  card.fills = [{ type: 'SOLID', color: CHART_CARD_RGB }];
  card.strokes = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: dimmerRGB },
      'color',
      dimmerVar,
    ),
  ];
  card.strokeWeight = 2;
  card.strokeAlign = 'INSIDE';
  return card;
}

/** Label-fontSize geschaald op slot-hoogte (zelfde gedachte als de
 * tabel-formule): klein genoeg voor dense charts, presentatie-groot
 * op volledige slides. */
function chartLabelSize(slotH: number): number {
  let size = Math.round(slotH * 0.034);
  if (size < 16) size = 16;
  if (size > 26) size = 26;
  return size;
}

/**
 * Full-state PUT: clear alle Slot-children en bouw opnieuw uit
 * `desired`. Persisteert het genormaliseerde model als pluginData
 * (source of truth voor de volgende scan).
 */
export async function applyChart(slot: SlotNode, desired: ChartWrapModel): Promise<void> {
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  const vars = await loadAccentVars();
  const model = normalizeChartModel(desired);

  // Clear bestaande children (toegestaan binnen SlotNode).
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slot.children.length; i++) snapshot.push(slot.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
      /* silent */
    }
  }

  if (vars.text !== null && vars.dimmer !== null) {
    const accentRGB = resolveColor(vars.text, slot, { r: 0.3, g: 0.45, b: 1 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);
    const textRGB = cardTextColor(accentRGB);

    const card = buildChartCard(vars.dimmer, dimmerRGB);
    slot.appendChild(card);
    const targetW = slot.width > 0 ? slot.width : card.width;
    const targetH = slot.height > 0 ? slot.height : card.height;
    try {
      card.resize(targetW, targetH);
    } catch (_e) {
      /* silent — slot/card kan resize-locked zijn */
    }

    const padX = Math.round(targetW * 0.045);
    const padY = Math.round(targetH * 0.09);
    const contentW = targetW - padX * 2;
    const contentH = targetH - padY * 2;
    const labelSize = chartLabelSize(targetH);

    // Donut/pie kleuren per categorie; bar/line/progress per serie —
    // ramp-lengte volgt de variant met de meeste tinten nodig.
    const rampCount =
      model.chartType === 'donut' || model.chartType === 'pie' || model.chartType === 'progress'
        ? model.categories.length
        : model.series.length;
    const ramp = accentRamp(accentRGB, rampCount);

    let content: FrameNode;
    if (model.chartType === 'donut' || model.chartType === 'pie') {
      content = buildDonut(model, contentW, contentH, ramp, textRGB, dimmerRGB, labelSize);
    } else if (model.chartType === 'bar') {
      content = buildBars(model, contentW, contentH, ramp, textRGB, labelSize);
    } else if (model.chartType === 'progress') {
      content = buildProgress(model, contentW, contentH, ramp, accentRGB, textRGB, labelSize);
    } else {
      content = buildLine(model, contentW, contentH, ramp, accentRGB, textRGB, labelSize);
    }
    card.appendChild(content);
    try {
      content.layoutSizingHorizontal = 'FIXED';
      content.layoutSizingVertical = 'FIXED';
    } catch (_e) {
      /* silent */
    }

    debugLog('chart', 'apply', {
      type: model.chartType,
      categories: model.categories.length,
      series: model.series.length,
      slotW: slot.width,
      slotH: slot.height,
    });
  } else {
    console.log('[welder-slide-editor] applyChart: library-vars missing, skipping rebuild');
  }

  writeChartModel(slot, model);
}
