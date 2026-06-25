// ============================================================
// editors/chart/delta-badge.ts
//
// Chart-specifieke wrapper rond de gedeelde delta-badge-bouwer
// (editors/_shared/delta-badge-node.ts). Levert de chart-context
// (Badge-template + theme + labelSize) en vertaalt categorie-index naar
// de delta-tekst via chartDeltaDisplay; de badge-clone/tekst-degradatie
// zelf zit in de gedeelde module zodat tabellen dezelfde styling delen.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartDeltaDisplay } from '../../../shared/chart-calculations';
import type { ChartTheme } from './legend';
import { findDeltaBadgeTemplate, buildDeltaBadgeNode } from '../_shared/delta-badge-node';

export interface DeltaBadgeContext {
  /** Omsluitende Slide-INSTANCE (mode-context + Badge-template-bron). */
  slide: SceneNode;
  model: ChartWrapModel;
  theme: ChartTheme;
  labelSize: number;
  /** Badge-template, één keer per apply gezocht; null → tekst-variant. */
  badgeTemplate: InstanceNode | null;
}

export function createDeltaContext(
  slide: SceneNode,
  model: ChartWrapModel,
  theme: ChartTheme,
  labelSize: number,
): DeltaBadgeContext {
  return {
    slide: slide,
    model: model,
    theme: theme,
    labelSize: labelSize,
    badgeTemplate: findDeltaBadgeTemplate(slide),
  };
}

/**
 * Delta-node voor categorie i (serie 0), of null wanneer er geen delta is
 * (eerste categorie zonder override, beide waarden 0, ...). De caller
 * appendt en positioneert; de node meet zichzelf (HUG/auto-resize).
 *
 * Optionele budgetten: maxW (kolom-cap) en maxH (rij-cap). Een badge-clone
 * die er na rescale niet in past degradeert naar de tekst-variant.
 */
export function buildDeltaNode(
  ctx: DeltaBadgeContext,
  i: number,
  maxW?: number,
  maxH?: number,
): SceneNode | null {
  const label = chartDeltaDisplay(ctx.model, i);
  if (label === null) return null;
  return buildDeltaBadgeNode({
    template: ctx.badgeTemplate,
    label: label,
    index: i,
    labelSize: ctx.labelSize,
    dimmerVar: ctx.theme.dimmerVar,
    dimmerRGB: ctx.theme.dimmerRGB,
    maxW: maxW,
    maxH: maxH,
  });
}
