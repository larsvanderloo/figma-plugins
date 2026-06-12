// ============================================================
// editors/table/footer.ts
//
// Footer-rij-builders (T46): toont per-kolom calculation-summaries
// (som) onder de body-rijen. Styling volgt de body-cells; sum-kolommen
// zijn rechts uitgelijnd (Notion number-column-stijl, T46.1).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableColumnSummary } from '../../../shared/types';
import type { TableLayoutMetrics } from './metrics';

// Canvas footer-tekst: `€`-prefix bij currency, `%`-suffix bij percent,
// anders kale waarde. (De UI rendert dezelfde tekst in de grid-footer;
// de twee vlaggen zijn UI-zijdig mutually exclusive.)
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
  cellFrame.setPluginData('emphasis', '');

  // T46 — footer-cell styling volgt de body-cells (Inter Regular, body-fontSize,
  // volledige Text-kleur, geen eigen padding — die zit op de row).
  // Per-column emphasis bold't alleen de footer-waarde, identiek aan de
  // per-cell `emphasis`-stijl in buildCell().
  // T46.1 — sum-kolommen zijn numeriek; waarde rechts uitgelijnd (Notion-stijl).
  // T46.4 — kolommen ZONDER som tonen een vrije label-tekst (bv. "Totaal"),
  // links uitgelijnd zoals normale body-cells.
  const emphasized = summary !== null && summary.emphasis === true;
  const t = figma.createText();
  t.fontName = emphasized
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };
  t.fontSize = emphasized ? sizes.heading : sizes.body;
  t.characters = summary !== null ? footerCanvasText(summary) : label;
  t.textAutoResize = 'HEIGHT';
  t.textAlignHorizontal = summary !== null ? 'RIGHT' : 'LEFT';
  try {
    t.maxLines = 1;
  } catch (_e) {
    /* silent */
  }
  try {
    t.textTruncation = 'ENDING';
  } catch (_e) {
    /* silent */
  }
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
  ];

  cellFrame.appendChild(t);
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    /* silent */
  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {
    /* silent */
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
  rowFrame.itemSpacing = metrics.rowGap;
  // T46.1 — footer-row padding volgt dezelfde body-rij-padding zodat de
  // footer-rij visueel niet afwijkt van de data-rijen.
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
      /* silent */
    }
    try {
      cellFrame.layoutSizingVertical = 'HUG';
    } catch (_e) {
      /* silent */
    }
  }
  return rowFrame;
}
