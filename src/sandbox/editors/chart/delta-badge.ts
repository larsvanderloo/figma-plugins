// Badge cloning and text-fallback degradation live in the shared builder
// (_shared/delta-badge-node) so tables and charts keep identical badge styling.

import type { ChartWrapModel } from '../../../shared/types';
import { chartDeltaDisplay } from '../../../shared/chart-calculations';
import type { ChartTheme } from './legend';
import { findDeltaBadgeTemplate, buildDeltaBadgeNode } from '../_shared/delta-badge-node';

export interface DeltaBadgeContext {
  /** Enclosing slide instance: supplies variable-mode context and the Badge template. */
  slide: SceneNode;
  model: ChartWrapModel;
  theme: ChartTheme;
  labelSize: number;
  /** Looked up once per apply; null → plain-text fallback. */
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
 * Returns null when there is no delta to show (first category without
 * override, both values 0). Caller appends and positions; the node hugs its
 * content. A badge clone still exceeding maxW/maxH after rescale degrades
 * to the text variant.
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
