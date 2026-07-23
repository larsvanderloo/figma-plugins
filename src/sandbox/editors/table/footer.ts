import type { TableColumnSummary } from '../../../shared/types';
import type { TableLayoutMetrics } from './metrics';

// The UI renders identical text in its grid footer — keep the two in sync.
// `currency` and `percent` are mutually exclusive on the UI side.
export function footerCanvasText(summary: TableColumnSummary | null): string {
  if (summary === null) return '';
  let text = summary.value;
  if (summary.currency === true) text = '€' + text;
  if (summary.percent === true) text = text + '%';
  return text;
}

function buildFooterCell(
  summary: TableColumnSummary | null,
  label: string,
  j: number,
  sizes: { heading: number; body: number },
  textVar: Variable,
  textRGB: RGB,
): FrameNode {
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableFooterItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = 'AUTO';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisAlignItems = 'MIN';
  cellFrame.counterAxisAlignItems = 'CENTER';
  cellFrame.fills = [];
  // No clip: leadingTrim descenders hang outside the text box (see build-rows.ts buildCell).
  cellFrame.clipsContent = false;
  cellFrame.setPluginData('emphasis', '');

  // Styling mirrors body cells, incl. the per-cell `emphasis` style in buildCell().
  // Sum columns are numeric, so right-aligned (Notion style); label-only columns align left.
  const emphasized = summary !== null && summary.emphasis === true;
  const t = figma.createText();
  t.fontName = emphasized
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };
  t.fontSize = emphasized ? sizes.heading : sizes.body;
  t.characters = summary !== null ? footerCanvasText(summary) : label;
  t.textAutoResize = 'HEIGHT';
  // Cap-height trim optically centers the text (see buildCell).
  try {
    t.leadingTrim = 'CAP_HEIGHT';
  } catch (_e) {
    /* older Figma API without leadingTrim */
  }
  t.textAlignHorizontal = summary !== null ? 'RIGHT' : 'LEFT';
  try {
    t.maxLines = 1;
  } catch (_e) {
    /* older Figma API */
  }
  try {
    t.textTruncation = 'ENDING';
  } catch (_e) {
    /* older Figma API */
  }
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
  ];

  cellFrame.appendChild(t);
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    /* older Figma API */
  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {
    /* older Figma API */
  }
  return cellFrame;
}

export function buildFooterRow(
  summaries: Array<TableColumnSummary | null>,
  labels: readonly string[],
  sizes: { heading: number; body: number },
  textVar: Variable,
  textRGB: RGB,
  dimmerVar: Variable,
  dimmerRGB: RGB,
  rowPadding: number,
  metrics: TableLayoutMetrics,
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableFooterRow';
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  // No clip: leadingTrim descenders hang outside the text box.
  rowFrame.clipsContent = false;
  rowFrame.itemSpacing = metrics.rowGap;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  rowFrame.paddingLeft = metrics.rowPadX;
  rowFrame.paddingRight = metrics.rowPadX;
  rowFrame.fills = [];
  rowFrame.strokes = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: dimmerRGB },
      'color',
      dimmerVar,
    ),
  ];
  rowFrame.strokeAlign = 'INSIDE';
  rowFrame.strokeTopWeight = 1;
  rowFrame.strokeBottomWeight = 0;
  rowFrame.strokeLeftWeight = 0;
  rowFrame.strokeRightWeight = 0;

  for (let j = 0; j < summaries.length; j++) {
    const label = j < labels.length ? labels[j] : '';
    const cellFrame = buildFooterCell(summaries[j], label, j, sizes, textVar, textRGB);
    rowFrame.appendChild(cellFrame);
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* older Figma API */
    }
    try {
      cellFrame.layoutSizingVertical = 'HUG';
    } catch (_e) {
      /* older Figma API */
    }
  }
  return rowFrame;
}
