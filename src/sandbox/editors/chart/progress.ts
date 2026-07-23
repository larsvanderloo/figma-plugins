// Measure-and-reserve budgeting: every non-track column is measured and capped
// first, the track gets the rest; rows shrink before anything can overflow.
// Within the envelope (content from 240x160, up to 12 categories) nothing clips.

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
  // Backstop for out-of-envelope input: clipping at the content edge beats
  // overflowing the card. Within the envelope the budgeting below never triggers it.
  root.clipsContent = true;
  root.resize(contentW, contentH);

  // Vertical budget: rowCap = the band (contentH / n) at zero spacing — a row
  // must NEVER exceed it or n × row pushes out of the frame. The font shrinks
  // with it (line height ≈ 1.3 × font), 9px absolute floor; 9-10 only on rows
  // that would otherwise clip.
  const band = contentH / n;
  const rowCap = Math.max(10, Math.floor(band));
  let ef = labelSize;
  const fontCap = Math.floor(rowCap / 1.3);
  if (ef > fontCap) ef = fontCap;
  if (ef < 9) ef = 9;
  const lineH = Math.ceil(ef * 1.3);

  // Responsive track thickness via row bands: the track fills ~45% of its
  // band, clamped between a thin font-bound minimum and 48px, never above the
  // row cap.
  const minTrackH = Math.max(8, Math.round(ef * 0.6));
  let trackH = Math.round(band * 0.45);
  if (trackH < minTrackH) trackH = minTrackH;
  if (trackH > 48) trackH = 48;
  if (trackH > rowCap) trackH = rowCap;

  // Horizontal budget, measure-and-reserve: column caps (22% label, 18%
  // value, 20% delta) + responsive gap (~3%, 8-24px) total at most ~70%, so
  // the track always keeps ≥ ~30% of the content width.
  const gap = Math.max(8, Math.min(24, Math.round(contentW * 0.03)));
  const labelW = Math.round(contentW * 0.22);

  // Value column: only reserved when visible (showValues off must not waste a
  // column + gap). Width = widest measured value, capped so measured text can
  // never grow the reservation unbounded.
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

  // Delta column: build the nodes first, then size the column to the widest
  // one — a fixed 11% guess can be narrower than a badge. Badges only when
  // they fit the row cap vertically (badgeTemplate=null forces the text
  // variant otherwise); maxW/maxH lets delta-badge.ts degrade to text itself.
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

  // Degradation order when the track gets too narrow (outside the envelope):
  // annotations first, then value labels — label + track is the minimum
  // viable row.
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

  // Row height = tallest column (≤ rowCap by construction); spacing gets the
  // remainder, including top/bottom edges (divide by n + 1). Floor 0 — a fixed
  // 12px minimum would push out of the frame at many rows.
  const rowH = Math.max(trackH, lineH, deltaH);
  root.itemSpacing = Math.max(0, Math.floor((contentH - n * rowH) / (n + 1)));

  for (let i = 0; i < model.categories.length; i++) {
    const row = figma.createFrame();
    row.name = 'ProgressRow-' + String(i);
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    // Fixed row height from the budget instead of HUG: no measurement races
    // with auto-layout and no rows stretched by wrapping text.
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
    // maxLines is REQUIRED next to ENDING: with autoResize HEIGHT Figma
    // otherwise never truncates and long labels wrap the row open.
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

    // Zero convention: NO ink for value 0, nor for near-zero under half the
    // pill radius (trackH / 4) — Math.max(trackH, …) would render a loose
    // circle suggesting a value where there is none.
    const ratio = Math.min(1, Math.max(0, series.values[i] / reference));
    const rawW = Math.round(trackW * ratio);
    if (series.values[i] > 0 && rawW >= trackH / 4) {
      const fill = figma.createFrame();
      fill.name = 'Fill';
      // Minimum pill = a full circle (trackH wide) so small but real values
      // stay visible.
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
      // From measure mode (WIDTH_AND_HEIGHT) to column mode: fixed width,
      // one line, truncation backstop for outliers above the column cap.
      value.textTruncation = 'ENDING';
      value.maxLines = 1;
      value.textAutoResize = 'HEIGHT';
      row.appendChild(value);
      value.resize(valueW, value.height);
    }

    // Fixed-width delta cell so row alignment survives categories without a
    // delta.
    if (deltaW > 0) {
      const deltaCell = figma.createFrame();
      deltaCell.name = 'DeltaCell';
      deltaCell.layoutMode = 'HORIZONTAL';
      deltaCell.primaryAxisSizingMode = 'FIXED';
      // NO height measurement on the just-filled cell: that races auto-layout
      // and squeezed badges to a ~1px sliver. Height comes from the known row
      // budget; the cell never clips.
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
