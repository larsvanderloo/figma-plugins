// ============================================================
// editors/chart/delta-badge.ts
//
// Delta-badge-engine (T50): bouwt per categorie een delta-node voor
// serie 0. Deze foundation-versie levert de TEKST-variant (gedrags-
// neutraal t.o.v. de eerdere inline delta-teksten in de builders);
// de library-Badge-clone-variant (template vinden → clonen → hernoemen
// naar 'DeltaBadge-<i>' → label sync zetten → rescalen, met deze
// tekst-variant als fallback-keten) vervangt de interne implementatie
// zonder de API te wijzigen.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartDeltaDisplay } from '../../../shared/chart-calculations';
import type { ChartTheme } from './legend';

export interface DeltaBadgeContext {
  /** Omsluitende Slide-INSTANCE (mode-context + Badge-template-bron). */
  slide: SceneNode;
  model: ChartWrapModel;
  theme: ChartTheme;
  labelSize: number;
}

export function createDeltaContext(
  slide: SceneNode,
  model: ChartWrapModel,
  theme: ChartTheme,
  labelSize: number,
): DeltaBadgeContext {
  return { slide: slide, model: model, theme: theme, labelSize: labelSize };
}

/**
 * Delta-node voor categorie i (serie 0), of null wanneer er geen delta
 * is (eerste categorie zonder override, beide waarden 0, ...). De caller
 * appendt en positioneert; de node meet zichzelf (HUG/auto-resize).
 */
export function buildDeltaNode(ctx: DeltaBadgeContext, i: number): SceneNode | null {
  const label = chartDeltaDisplay(ctx.model, i);
  if (label === null) return null;
  return buildDeltaText(ctx, label);
}

/** Tekst-variant: Inter Medium ~70% labelSize in Text Dimmer-binding. */
function buildDeltaText(ctx: DeltaBadgeContext, label: string): TextNode {
  const t = figma.createText();
  t.name = 'DeltaText';
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = Math.round(ctx.labelSize * 0.7);
  t.characters = label;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.fills = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: ctx.theme.dimmerRGB },
      'color',
      ctx.theme.dimmerVar,
    ),
  ];
  return t;
}
