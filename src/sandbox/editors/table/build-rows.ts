// ============================================================
// editors/table/build-rows.ts
//
// Node-builders voor body- en header-rijen (FRAMEs + TEXT-kinderen
// binnen de Slot). Theme-binding via `setBoundVariableForPaint` op de
// library-variables `Text` + `Text Dimmer`; layout-metrics komen uit
// `./metrics`.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableRowModel, TableCellModel } from '../../../shared/types';
import type { TableLayoutMetrics } from './metrics';

/**
 * Bouwt één cell-FRAME met TEXT-kind. Emphasis is per cell opt-in;
 * columns never get automatic visual treatment.
 * TEXT-fill is bound aan de `Text`-library-variable.
 * Caller zet `layoutSizingHorizontal='FILL'` + `layoutSizingVertical='HUG'`
 * NA appendChild aan de row (Figma-API-quirk).
 */
function buildCell(
  cell: TableCellModel,
  j: number,
  sizes: { heading: number; body: number },
  textVar: Variable,
  textRGB: RGB,
  rightAlign: boolean,
): FrameNode {
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = 'AUTO';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.fills = [];
  cellFrame.setPluginData('emphasis', cell.emphasis === true ? '1' : '');

  const isEmphasis = cell.emphasis === true;
  const fontName: FontName = isEmphasis
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };

  const t = figma.createText();
  t.fontName = fontName;
  t.fontSize = isEmphasis ? sizes.heading : sizes.body;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  // T41.8/T45: body-cells standaard LEFT-aligned voor consistente scanbaarheid.
  // T46.1: kolommen met een som-berekening zijn numeriek → RIGHT-aligned
  // (Notion number-column-stijl). Horizontale ruimte komt uit content-weighted
  // autofit; row.itemSpacing wordt compacter bij informatierijke tabellen.
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // T42.10: maxLines + textTruncation verwijderd — body-text mag vrij
  // wrappen zolang er ruimte is. Truncation eerder (T42.5) zorgde voor
  // ge-trunceerde 1-regel wanneer wrapping juist beter was. Container
  // clipsContent=true (T42.5) blijft visuele overflow voorkomen.
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

/**
 * Bouwt één rij-FRAME met horizontale auto-layout. Rij 2+ krijgt een
 * top-stroke (1px) bound aan `Text Dimmer`.
 */
export function buildRow(
  row: TableRowModel,
  i: number,
  sizes: { heading: number; body: number },
  textVar: Variable,
  dimmerVar: Variable,
  textRGB: RGB,
  dimmerRGB: RGB,
  rowPadding: number,
  rightAlignColumns: readonly boolean[],
  metrics: TableLayoutMetrics,
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = metrics.rowGap;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  // T41.6: horizontal padding verhuisd vanaf container — top-dividers (i > 0)
  // spannen nu de volle container.width en raken de container-borders.
  rowFrame.paddingLeft = metrics.rowPadX;
  rowFrame.paddingRight = metrics.rowPadX;
  rowFrame.fills = [];

  if (i > 0) {
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
  } else {
    rowFrame.strokes = [];
  }

  for (let j = 0; j < row.cells.length; j++) {
    const rightAlign = j < rightAlignColumns.length && rightAlignColumns[j] === true;
    const cellFrame = buildCell(row.cells[j], j, sizes, textVar, textRGB, rightAlign);
    rowFrame.appendChild(cellFrame);
    // Modern sizing-API (vervangt legacy `layoutGrow=1`); MOET na appendChild.
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

/**
 * T40 / T41.8 — bouwt een header-cell met left-aligned text in Text-color.
 * Header padding volgt dezelfde dense-table metrics als de body rows.
 */
function buildHeaderCell(
  cell: TableCellModel,
  j: number,
  textVar: Variable,
  textRGB: RGB,
  rightAlign: boolean,
  metrics: TableLayoutMetrics,
): FrameNode {
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableHeaderItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  // T41.5: cell-padding zodat row-edges (bottom-divider) blijven werken
  // ook bij FILL-vertical cells.
  cellFrame.counterAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisAlignItems = 'MIN';
  cellFrame.counterAxisAlignItems = 'CENTER';
  // Asymmetrische padding voor header-cell — iets dichter naar de top.
  cellFrame.paddingTop = metrics.headerPadTop;
  cellFrame.paddingBottom = metrics.headerPadBottom;
  cellFrame.fills = [];
  cellFrame.setPluginData('emphasis', '');

  // T41.8: verticale cell-separators verwijderd — minimalistische look.

  const t = figma.createText();
  // T41.10: header → Inter Medium + Text-color (full contrast) per
  // user-edits direct op canvas. Was Inter Regular + Text Dimmer (T41.9).
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = 18;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  // T46.1: header van een som-kolom volgt de body/footer-uitlijning (RIGHT).
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // T42.4: lange header-text wrapt anders naar meerdere regels en duwt
  // row HUG-vertical enorm op. Single-line + ellipsis = clean grid look.
  try {
    t.maxLines = 1;
  } catch (_e) {
    /* silent — oudere Figma API */
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

/**
 * T40 / T41.8 — bouwt de header-rij. HUG-vertical (compact), 2px bottom-
 * border in Text Dimmer. Cells zijn left-aligned, 18px Inter Medium,
 * geen verticale separators.
 */
export function buildHeaderRow(
  row: TableRowModel,
  textVar: Variable,
  dimmerVar: Variable,
  textRGB: RGB,
  dimmerRGB: RGB,
  rightAlignColumns: readonly boolean[],
  metrics: TableLayoutMetrics,
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableHeaderRow';
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = metrics.rowGap;
  // T41.5: padding verhuisd naar cell-niveau (24+24 op elke cell) zodat
  // cells FILL-vertical kunnen en verticale strokes tot row-edges reiken
  // (raken bottom-divider). Row zelf heeft nu 0 vertical padding.
  rowFrame.paddingTop = 0;
  rowFrame.paddingBottom = 0;
  // T41.6: horizontal padding 32 (was 0) — verhuisd vanaf container zodat
  // de bottom-divider full container.width spant en de container-borders
  // raakt op beide hoeken.
  rowFrame.paddingLeft = metrics.rowPadX;
  rowFrame.paddingRight = metrics.rowPadX;
  rowFrame.fills = [];

  // Bottom-divider in Text Dimmer — 2px voor duidelijke header-body-scheiding.
  rowFrame.strokes = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: dimmerRGB },
      'color',
      dimmerVar,
    ),
  ];
  rowFrame.strokeAlign = 'INSIDE';
  rowFrame.strokeTopWeight = 0;
  rowFrame.strokeBottomWeight = 2;
  rowFrame.strokeLeftWeight = 0;
  rowFrame.strokeRightWeight = 0;

  for (let j = 0; j < row.cells.length; j++) {
    const rightAlign = j < rightAlignColumns.length && rightAlignColumns[j] === true;
    const cellFrame = buildHeaderCell(row.cells[j], j, textVar, textRGB, rightAlign, metrics);
    rowFrame.appendChild(cellFrame);
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
    // T41.5: cells FILL vertical zodat strokes de volle row-hoogte beslaan.
    try {
      cellFrame.layoutSizingVertical = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }
  return rowFrame;
}
