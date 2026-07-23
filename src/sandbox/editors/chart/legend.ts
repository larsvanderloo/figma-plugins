// Shared legend builder for donut/pie (category) and bar/line (series) legends.
// Hard invariant: the legend never overflows the content frame — whatever does
// not fit is degraded or dropped before it can clip.

export interface LegendEntry {
  label: string;
  color: RGB;
  emphasis?: boolean;
  deltaNode?: SceneNode | null;
}

/** Each color ships as Variable + resolved RGB: bound paints still need a concrete base color. */
export interface ChartTheme {
  textVar: Variable;
  dimmerVar: Variable;
  textRGB: RGB;
  dimmerRGB: RGB;
  /** Slide-level resolved accent (same source as the swatch ramp). */
  accentRGB: RGB;
  /** Accent or light, whichever sits farthest from the actual card color — survives mode flips. */
  onCardRGB: RGB;
}

/**
 * Single-line ellipsis at a fixed width. maxLines=1 is load-bearing: with plain
 * HEIGHT auto-resize, long labels wrap into extra lines instead of truncating
 * and blow the vertical budget.
 */
export function truncateToWidth(t: TextNode, width: number): void {
  if (width < 8) width = 8;
  t.textTruncation = 'ENDING';
  t.maxLines = 1;
  t.textAutoResize = 'HEIGHT';
  t.resize(width, t.height);
}

/**
 * Width degradation ladder: ellipsize label, then drop the delta suffix, then
 * hard-clamp. Guarantees row.width <= budget as long as budget > swatch + spacing + 8px.
 */
function fitRowToWidth(
  row: FrameNode,
  label: TextNode,
  deltaNode: SceneNode | null,
  budget: number,
  fontSize: number,
): void {
  if (!(budget > 0) || row.width <= budget) return;
  const minLabelW = Math.round(fontSize * 3);
  let target = budget - (row.width - label.width);
  if (target < minLabelW) target = minLabelW;
  if (target < label.width) truncateToWidth(label, target);
  if (row.width <= budget) return;
  // Drop the delta suffix before the label: the value detail is more expendable than the category name.
  if (deltaNode !== null && deltaNode.parent !== null) deltaNode.remove();
  if (row.width <= budget) return;
  // Clamp below the minimum label width: the no-overflow invariant beats readability.
  target = budget - (row.width - label.width);
  truncateToWidth(label, target);
}

/** Font size and derived sizes (swatch, spacings) are set together so each height-ladder step measures a consistent state. */
function applyLegendFont(
  legend: FrameNode,
  rows: FrameNode[],
  labels: TextNode[],
  swatches: RectangleNode[],
  f: number,
  isWrap: boolean,
): void {
  legend.itemSpacing = isWrap ? Math.round(f * 1.4) : Math.round(f * 0.9);
  if (isWrap) legend.counterAxisSpacing = Math.round(f * 0.6);
  for (let i = 0; i < rows.length; i++) {
    rows[i].itemSpacing = Math.round(f * 0.6);
  }
  for (let i = 0; i < swatches.length; i++) {
    const s = Math.round(f * 0.8);
    swatches[i].resize(s, s);
    swatches[i].cornerRadius = Math.max(3, Math.round(s * 0.28));
  }
  for (let i = 0; i < labels.length; i++) {
    labels[i].fontSize = f;
  }
}

export function buildLegend(
  entries: LegendEntry[],
  theme: ChartTheme,
  fontSize: number,
  maxWidth?: number,
  maxHeight?: number,
  wrap?: boolean,
): FrameNode {
  // Wrap mode needs a width budget: layoutWrap requires a FIXED primary axis.
  const wrapWidth = wrap === true && typeof maxWidth === 'number' && maxWidth > 0 ? maxWidth : 0;
  const isWrap = wrapWidth > 0;

  const legend = figma.createFrame();
  legend.name = 'ChartLegend';
  legend.layoutMode = isWrap ? 'HORIZONTAL' : 'VERTICAL';
  if (isWrap) {
    legend.layoutWrap = 'WRAP';
    legend.primaryAxisSizingMode = 'FIXED';
    legend.counterAxisSizingMode = 'AUTO';
    legend.primaryAxisAlignItems = 'CENTER';
    legend.itemSpacing = Math.round(fontSize * 1.4);
    legend.counterAxisSpacing = Math.round(fontSize * 0.6);
  } else {
    legend.primaryAxisSizingMode = 'AUTO';
    legend.counterAxisSizingMode = 'AUTO';
    legend.itemSpacing = Math.round(fontSize * 0.9);
  }
  legend.fills = [];

  const rows: FrameNode[] = [];
  const labels: TextNode[] = [];
  const swatches: RectangleNode[] = [];
  const deltas: SceneNode[] = [];

  for (let i = 0; i < entries.length; i++) {
    const row = figma.createFrame();
    row.name = 'LegendItem';
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.counterAxisAlignItems = 'CENTER';
    row.itemSpacing = Math.round(fontSize * 0.6);
    row.fills = [];

    const swatch = figma.createRectangle();
    swatch.name = 'Swatch';
    const swatchSize = Math.round(fontSize * 0.8);
    swatch.resize(swatchSize, swatchSize);
    swatch.cornerRadius = Math.max(3, Math.round(swatchSize * 0.28));
    swatch.fills = [{ type: 'SOLID', color: entries[i].color }];
    row.appendChild(swatch);

    const t = figma.createText();
    t.fontName =
      entries[i].emphasis === true
        ? { family: 'Instrument Sans', style: 'SemiBold' }
        : { family: 'Inter', style: 'Regular' };
    t.fontSize = fontSize;
    t.characters = entries[i].label;
    t.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    row.appendChild(t);

    const entryDelta = entries[i].deltaNode;
    const deltaNode = entryDelta !== undefined && entryDelta !== null ? entryDelta : null;
    if (deltaNode !== null) {
      row.appendChild(deltaNode);
      deltas.push(deltaNode);
    }

    if (typeof maxWidth === 'number' && maxWidth > 0) {
      fitRowToWidth(row, t, deltaNode, maxWidth, fontSize);
    }

    legend.appendChild(row);
    rows.push(row);
    labels.push(t);
    swatches.push(swatch);
  }

  if (isWrap) {
    legend.resize(wrapWidth, Math.max(1, legend.height));
  }

  // Height budget: the caller hands the plot whatever is left, so the legend must end up <= maxHeight.
  if (typeof maxHeight === 'number' && maxHeight > 0 && legend.height > maxHeight) {
    // Step 1: shrink the font, stopping at the 12px legibility floor.
    let f = fontSize;
    while (legend.height > maxHeight && f > 12) {
      f = f - 1;
      applyLegendFont(legend, rows, labels, swatches, f, isWrap);
    }
    // Step 2: drop delta badges — they do not scale with the font and dominate the row height.
    if (legend.height > maxHeight) {
      for (let d = 0; d < deltas.length; d++) {
        if (deltas[d].parent !== null) deltas[d].remove();
      }
    }
    // Step 3: cap rows behind a '+N' summary row rather than clip; at least one item stays.
    if (legend.height > maxHeight && rows.length > 1) {
      const more = figma.createText();
      more.name = 'LegendMore';
      more.fontName = { family: 'Inter', style: 'Regular' };
      more.fontSize = f;
      more.characters = '+1 meer';
      more.textAutoResize = 'WIDTH_AND_HEIGHT';
      more.fills = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: theme.textRGB },
          'color',
          theme.textVar,
        ),
      ];
      legend.appendChild(more);
      let hidden = 0;
      for (let r = rows.length - 1; r > 0 && legend.height > maxHeight; r--) {
        rows[r].remove();
        hidden = hidden + 1;
      }
      more.characters = '+' + String(hidden) + ' meer';
    }
  }

  return legend;
}
