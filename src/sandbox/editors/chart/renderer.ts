// ============================================================
// editors/chart/renderer.ts
//
// Slot-based chart-renderer voor ChartWrap-instances — zelfde
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

/** pluginData-truth scan: lees het gepersisteerde model van de Slot. */
export function scanChartSlot(slot: SlotNode): ChartWrapModel {
  return readChartModel(slot);
}

/** Accent-kaart — zelfde taal als de InstructorCards (MCP-referentie
 * 2026-06-12): fill gebonden aan de `Text`-variable (saturated accent),
 * radius 55 (radius/rounded-4xl), geen border. */
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

/**
 * Vind de `Background`-variable via de fill-binding van een ancestor-node
 * (de Slide-instance bindt z'n achtergrond aan `Background`). Geen eigen
 * library-key nodig; faalt stil naar null (caller valt terug op RGB).
 */
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
    /* silent */
  }
  return null;
}

/**
 * Klim van de Slot omhoog naar de buitenste INSTANCE-ancestor (de Slide):
 * dat is de node die de expliciete theme-variable-mode draagt, en dus de
 * juiste consumer voor resolveForConsumer.
 */
function findSlideAncestor(slot: SlotNode): SceneNode {
  let node: BaseNode | null = slot;
  let lastInstance: SceneNode = slot;
  while (node !== null && node.type !== 'PAGE') {
    if (node.type === 'INSTANCE') lastInstance = node as SceneNode;
    node = node.parent;
  }
  return lastInstance;
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

/** Fallback-aspect voor legacy/invalid slots zonder hoogte: de bekende
 * slide-slot is 1728×759 → hoogte ≈ 0.44 × breedte. */
const CHART_FALLBACK_ASPECT = 759 / 1728;

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
    // MCP-geverifieerd (2026-06-12): resolveForConsumer op de Slot/kaart
    // resolved in de DEFAULT-mode van de Theme-collectie, niet in de mode
    // van de slide (gebonden paints volgen de slide-mode wél). Resolve
    // daarom tegen de omsluitende Slide-INSTANCE; fallback = orange-mode
    // accent (#ff7700).
    const modeContext = findSlideAncestor(slot);
    const dimmerRGB = await resolveColorInNodeMode(vars.dimmer, modeContext, TEXT_DIMMER_RGB);
    const accentRGB = await resolveColorInNodeMode(vars.text, modeContext, {
      r: 1,
      g: 0.467,
      b: 0,
    });
    // Kaart-paint één keer bouwen: hergebruikt voor de kaart-fill én als
    // segment-separator-stroke in de donut/pie.
    const cardPaint = figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: accentRGB },
      'color',
      vars.text,
    ) as SolidPaint;
    const card = buildChartCard(cardPaint);
    slot.appendChild(card);

    // Pin de kaart op (0,0) binnen de Slot. Een auto-layout-Slot (met
    // padding) plaatst appended children anders op (padX,padY) terwijl de
    // kaart full-slot gesized wordt → overflow rechts/onder. ABSOLUTE haalt
    // de kaart uit de slot-layout; x/y=0 dekt ook layout-NONE slots.
    try {
      if (slot.layoutMode !== 'NONE') {
        card.layoutPositioning = 'ABSOLUTE';
      }
    } catch (_e) {
      /* silent — parent zonder auto-layout accepteert geen ABSOLUTE */
    }
    card.x = 0;
    card.y = 0;
    // Content op de accent-kaart is licht: bind aan de `Background`-
    // variable (gevonden via de slide-fill-binding), fallback cream.
    const backgroundVar = await findBackgroundVariable(modeContext);
    const lightRGB =
      backgroundVar !== null
        ? await resolveColorInNodeMode(backgroundVar, modeContext, { r: 1, g: 0.957, b: 0.918 })
        : { r: 1, g: 0.957, b: 0.918 };
    const labelVar = backgroundVar !== null ? backgroundVar : vars.dimmer;
    // De wrap kan een geflipte theme-mode voeren: de kaart-fill
    // (Text-binding) rendert dan in een ANDERE kleur dan accentRGB op
    // slide-niveau. Resolve Text in de kaart-mode (de kaart hangt nu in
    // de tree) en kies als on-card-tekstkleur de variant met het meeste
    // kanaal-contrast t.o.v. de werkelijke kaartkleur.
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
    // Zelfde als de tabel: SlotNode host geen FILL-children —
    // expliciete resize naar de actuele slot-afmetingen, zodat de kaart
    // toekomstige smallere/kortere slot-varianten automatisch volgt.
    // Surface-preset is alleen fallback voor legacy/invalid slots.
    const surfaceName = findEnclosingSurfaceName(slot);
    const fallbackW = tableWidthForSurface(surfaceName, 1);
    const targetW = slot.width > 0 ? slot.width : fallbackW;
    const targetH = slot.height > 0 ? slot.height : Math.round(targetW * CHART_FALLBACK_ASPECT);
    try {
      card.resize(targetW, targetH);
    } catch (_e) {
      /* silent — slot/card kan resize-locked zijn */
    }

    // Inner padding volledig proportioneel met de kaart (4.5% breedte,
    // 9% hoogte), met een 16px-floor zodat kleine slot-varianten geen
    // rand-rakende content krijgen. Bij 800×400: padX=36, padY=36 →
    // content 728×328.
    const padX = Math.max(16, Math.round(targetW * 0.045));
    const padY = Math.max(16, Math.round(targetH * 0.09));
    const contentW = Math.max(1, targetW - padX * 2);
    const contentH = Math.max(1, targetH - padY * 2);
    const labelSize = chartLabelSize(targetH);

    // Donut/pie kleuren per categorie; bar/line/progress per serie —
    // ramp-lengte volgt de variant met de meeste tinten nodig.
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
