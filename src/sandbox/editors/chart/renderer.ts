// Chart renderer for ChartWrap slots — same architecture as the table
// editor: full-state PUT inside the SlotNode, with pluginData as the
// persisted source of truth for scans.

import type { ChartWrapModel } from '../../../shared/types';
import { normalizeChartModel } from '../../../shared/chart-calculations';
import { tableWidthForSurface } from '../../../shared/constants';
import { debugLog } from '../../../shared/debug';
import { findEnclosingSurfaceName } from '../../slide-machine';
import {
  loadAccentVars,
  resolveColor,
  resolveColorInNodeMode,
  TEXT_DIMMER_RGB,
} from '../_shared/accent-vars';
import { cardRamp } from './palette';
import type { ChartTheme } from './legend';
import { readChartModel, writeChartModel } from './plugin-data';
import { createDeltaContext } from './delta-badge';
import { buildDonut } from './donut';
import { buildBars } from './bars';
import { buildProgress } from './progress';
import { buildLine } from './line';
import { buildMatrix } from './matrix';

export { readChartModel } from './plugin-data';

export function scanChartSlot(slot: SlotNode): ChartWrapModel {
  return readChartModel(slot);
}

/** Styled to match the InstructorCards: fill bound to the `Text`
 * variable, radius 55 = the radius/rounded-4xl token. */
function buildChartCard(cardPaint: SolidPaint): FrameNode {
  const card = figma.createFrame();
  card.name = 'WelderChartContent';
  card.layoutMode = 'VERTICAL';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.primaryAxisAlignItems = 'CENTER';
  card.counterAxisAlignItems = 'CENTER';
  card.cornerRadius = 55;
  card.clipsContent = true;
  card.fills = [cardPaint];
  card.strokes = [];
  return card;
}

/** Finds the `Background` variable through the ancestor's fill binding
 * (the Slide instance binds its background to it) — no library key
 * needed. Returns null on failure; callers fall back to plain RGB. */
async function findBackgroundVariable(node: SceneNode): Promise<Variable | null> {
  try {
    const fills = (node as MinimalFillsMixin).fills;
    if (fills !== figma.mixed && Array.isArray(fills) && fills.length > 0) {
      const paint = fills[0] as SolidPaint;
      if (paint.boundVariables !== undefined && paint.boundVariables.color !== undefined) {
        return await figma.variables.getVariableByIdAsync(paint.boundVariables.color.id);
      }
    }
  } catch (_e) {
  }
  return null;
}

/** The outermost INSTANCE ancestor (the Slide) carries the explicit
 * theme-variable mode, so it is the right consumer for resolveForConsumer. */
function findSlideAncestor(slot: SlotNode): SceneNode {
  let node: BaseNode | null = slot;
  let lastInstance: SceneNode = slot;
  while (node !== null && node.type !== 'PAGE') {
    if (node.type === 'INSTANCE') lastInstance = node as SceneNode;
    node = node.parent;
  }
  return lastInstance;
}

/** Scales with slot height (same idea as the table formula): small for
 * dense charts, presentation-size on full slides. */
function chartLabelSize(slotH: number): number {
  let size = Math.round(slotH * 0.034);
  if (size < 16) size = 16;
  if (size > 26) size = 26;
  return size;
}

/** Aspect for legacy/invalid slots without a height: the standard slide slot is 1728×759. */
const CHART_FALLBACK_ASPECT = 759 / 1728;

/**
 * Full-state PUT: clears the slot and rebuilds from `desired`, then
 * persists the normalized model as pluginData. Returns false when the
 * library vars are missing — nothing is cleared or persisted then, so
 * canvas and pluginData consistently keep the old state.
 */
export async function applyChart(slot: SlotNode, desired: ChartWrapModel): Promise<boolean> {
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  const vars = await loadAccentVars();
  const model = normalizeChartModel(desired);

  // Bail before clearing: without Text/Dimmer no card can be built, and
  // clearing first would leave an empty slot out of sync with pluginData.
  if (vars.text === null || vars.dimmer === null) {
    console.log('[welder-slide-editor] applyChart: library-vars missing, skipping rebuild');
    return false;
  }

  // Removing children is allowed inside a SlotNode.
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slot.children.length; i++) snapshot.push(slot.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
    }
  }

  // resolveForConsumer on the slot/card resolves in the Theme collection's
  // DEFAULT mode, not the slide's mode (bound paints DO follow the slide
  // mode) — so resolve against the enclosing Slide instance instead.
  // Fallback is the orange-mode accent (#ff7700).
  const modeContext = findSlideAncestor(slot);
  const dimmerRGB = await resolveColorInNodeMode(vars.dimmer, modeContext, TEXT_DIMMER_RGB);
  const accentRGB = await resolveColorInNodeMode(vars.text, modeContext, {
    r: 1,
    g: 0.467,
    b: 0,
  });
  // Built once: reused for the card fill and as the donut/pie separator stroke.
  const cardPaint = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: accentRGB },
    'color',
    vars.text,
  ) as SolidPaint;
  const card = buildChartCard(cardPaint);
  slot.appendChild(card);

  // An auto-layout slot with padding places appended children at
  // (padX,padY) while the card is sized full-slot → overflow. ABSOLUTE
  // lifts the card out of the slot layout; x/y=0 also covers layout-NONE slots.
  try {
    if (slot.layoutMode !== 'NONE') {
      card.layoutPositioning = 'ABSOLUTE';
    }
  } catch (_e) {
    /* parent without auto-layout rejects ABSOLUTE */
  }
  card.x = 0;
  card.y = 0;
  // On-card content is light: bound to the `Background` variable, cream fallback.
  const backgroundVar = await findBackgroundVariable(modeContext);
  const lightRGB =
    backgroundVar !== null
      ? await resolveColorInNodeMode(backgroundVar, modeContext, { r: 1, g: 0.957, b: 0.918 })
      : { r: 1, g: 0.957, b: 0.918 };
  const labelVar = backgroundVar !== null ? backgroundVar : vars.dimmer;
  // The wrap may carry a flipped theme mode: the card fill then renders in
  // a different color than accentRGB. Resolve Text in the card's own mode
  // (possible now the card is in the tree) and pick the on-card text color
  // with the most channel contrast against the actual card color.
  const cardRGB = await resolveColorInNodeMode(vars.text, card, accentRGB);
  const distAccent =
    Math.abs(cardRGB.r - accentRGB.r) +
    Math.abs(cardRGB.g - accentRGB.g) +
    Math.abs(cardRGB.b - accentRGB.b);
  const distLight =
    Math.abs(cardRGB.r - lightRGB.r) +
    Math.abs(cardRGB.g - lightRGB.g) +
    Math.abs(cardRGB.b - lightRGB.b);
  const onCardRGB = distAccent >= distLight ? accentRGB : lightRGB;
  const theme: ChartTheme = {
    textVar: labelVar,
    dimmerVar: vars.dimmer,
    textRGB: lightRGB,
    dimmerRGB: dimmerRGB,
    accentRGB: accentRGB,
    onCardRGB: onCardRGB,
  };
  // A SlotNode hosts no FILL children, so resize the card explicitly to
  // the live slot size; the surface preset is only a fallback for
  // legacy/invalid slots.
  const surfaceName = findEnclosingSurfaceName(slot);
  const fallbackW = tableWidthForSurface(surfaceName, 1);
  const targetW = slot.width > 0 ? slot.width : fallbackW;
  const targetH = slot.height > 0 ? slot.height : Math.round(targetW * CHART_FALLBACK_ASPECT);
  try {
    card.resize(targetW, targetH);
  } catch (_e) {
    /* slot/card may be resize-locked */
  }

  // 16px padding floor keeps content from touching the edge on small slot variants.
  const padX = Math.max(16, Math.round(targetW * 0.045));
  const padY = Math.max(16, Math.round(targetH * 0.09));
  const contentW = Math.max(1, targetW - padX * 2);
  const contentH = Math.max(1, targetH - padY * 2);
  const labelSize = chartLabelSize(targetH);

  const rampCount =
    model.chartType === 'donut' || model.chartType === 'pie' || model.chartType === 'progress'
      ? model.categories.length
      : model.series.length;
  const ramp = cardRamp(lightRGB, accentRGB, rampCount);

  const deltaCtx = createDeltaContext(modeContext, model, theme, labelSize);

  let content: FrameNode;
  if (model.chartType === 'donut' || model.chartType === 'pie') {
    content = buildDonut(model, contentW, contentH, ramp, theme, labelSize, cardPaint, deltaCtx);
  } else if (model.chartType === 'bar') {
    content = buildBars(model, contentW, contentH, ramp, theme, labelSize, deltaCtx);
  } else if (model.chartType === 'progress') {
    content = buildProgress(model, contentW, contentH, ramp, lightRGB, theme, labelSize, deltaCtx);
  } else if (model.chartType === 'matrix') {
    content = buildMatrix(model, contentW, contentH, lightRGB, accentRGB, theme, labelSize);
  } else {
    content = buildLine(model, contentW, contentH, ramp, lightRGB, theme, labelSize, deltaCtx);
  }
  card.appendChild(content);
  try {
    content.layoutSizingHorizontal = 'FIXED';
    content.layoutSizingVertical = 'FIXED';
  } catch (_e) {
  }

  debugLog('chart', 'apply', {
    type: model.chartType,
    categories: model.categories.length,
    series: model.series.length,
    slotW: slot.width,
    slotH: slot.height,
  });

  // Persist only after the rebuild happened: pluginData is the scan truth
  // and must not claim state the canvas does not show.
  writeChartModel(slot, model);
  return true;
}
