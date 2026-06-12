// ============================================================
// editors/table/renderer.ts
//
// Slot-based table-renderer voor TableWrap-instances (T34.2, v0.2.0).
//
// TableWrap is een library-INSTANCE met een `<Slot>` erin; binnen die
// Slot bouwt de plugin zelf FRAMEs + TEXT-nodes. SlotNodes accepteren
// `appendChild` / `remove` zonder de "inside an instance"-constraint
// (T34-research §3.2, MCP-bevestigd 2026-04-24).
//
// Public API:
//   - scanTableSlot(slot)       → TableWrapModel (rij/kolom-structuur)
//   - applyTable(slot, desired) → full-state PUT (clear + rebuild)
//
// CSV-import zit in `./csv.ts` (split om de 200-LOC-budget te halen).
//
// Theme-binding: cell-kleuren + row-dividers via `setBoundVariableForPaint`
// op de library-variables `Text` + `Text Dimmer`. Theme-switching werkt
// automatisch via Figma's variable-modes.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type {
  TableWrapModel,
  TableRowModel,
  TableCellModel,
  TableColumnCalculationSetting,
  TableColumnSummary,
} from '../../../shared/types';
import {
  tableWidthForSurface,
  TABLE_AUTOFIT_MIN_COL,
  TABLE_AUTOFIT_MAX_COL_FRACTION,
} from '../../../shared/constants';
import { debugLog } from '../../../shared/debug';
import {
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';
import { findEnclosingSurfaceName } from '../../slide-machine';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from '../_shared/accent-vars';
import { computeColumnWidths, type CellSpec } from './column-autofit';
import { createTextMeasurer } from './measure';

/**
 * Tekst-fontSize afgeleid van actual rowHeight (T39.1.1, v0.2.2).
 *
 * `rowHeight` is hier de OUTER row-height (= row's eigen FILL-share van de
 * container). Inner content-area per rij is rowHeight - 40 (rowFrame
 * paddingTop+paddingBottom = 20+20). De ratios 0.36/0.30 zijn empirisch
 * gekalibreerd op outer-rowHeight zodat heading + body comfortabel binnen
 * inner-area passen met line-height ~1.2.
 *
 * Formule:
 *   rowHeight = (slotHeight - 48) / rowCount        // T41.9: container.padding 24+24
 *   heading/body ratios and max-clamps become smaller once the table has
 *   several body rows, so dense tables read as information tables rather
 *   than oversized presentation cards.
 *
 * T44: de textSize-multiplier (T42.9, sm/lg-branches) is weer verwijderd —
 * fontSize is volledig automatisch; de clamps zijn de eerdere 'md'-waardes
 * (T42.21-kalibratie).
 */
function getFontSizes(slotHeight: number, rowCount: number): { heading: number; body: number } {
  var safeRowCount = rowCount > 0 ? rowCount : 1;
  var rowHeight = (slotHeight - 48) / safeRowCount;
  if (rowHeight < 16) rowHeight = 16;

  var headingRatio = 0.36;
  var bodyRatio = 0.3;
  var headingMax = 32;
  var bodyMax = 24;
  if (safeRowCount >= 7) {
    headingRatio = 0.26;
    bodyRatio = 0.22;
    headingMax = 24;
    bodyMax = 18;
  } else if (safeRowCount >= 4) {
    headingRatio = 0.3;
    bodyRatio = 0.24;
    headingMax = 28;
    bodyMax = 20;
  }

  var heading = Math.round(rowHeight * headingRatio);
  if (heading < 16) heading = 16;
  if (heading > headingMax) heading = headingMax;

  var body = Math.round(rowHeight * bodyRatio);
  if (body < 14) body = 14;
  if (body > bodyMax) body = bodyMax;

  return { heading: heading, body: body };
}

// -------------------------------------------------------------------
// Scan — lees huidige Slot-content in een TableWrapModel
// -------------------------------------------------------------------

/** T40 — leest of de tabel een header-rij heeft. Default false. */
function readHasColumnHeader(slot: SlotNode): boolean {
  return slot.getPluginData('hasColumnHeader') === '1';
}

export function readColumnCalculations(
  slot: SlotNode,
  columnCount: number,
): TableColumnCalculationSetting[] {
  const raw = slot.getPluginData('columnCalculations');
  if (raw === '') return normalizeColumnCalculations(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnCalculations(undefined, columnCount);
    return normalizeColumnCalculations(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnCalculations(undefined, columnCount);
  }
}

function writeColumnCalculations(
  slot: SlotNode,
  settings: readonly TableColumnCalculationSetting[],
  columnCount: number,
): void {
  const normalized = normalizeColumnCalculations(settings, columnCount);
  if (!hasColumnCalculations(normalized)) {
    slot.setPluginData('columnCalculations', '');
    return;
  }
  slot.setPluginData('columnCalculations', JSON.stringify(normalized));
}

function hasAnyEmphasis(emphasis: readonly boolean[]): boolean {
  for (let i = 0; i < emphasis.length; i++) {
    if (emphasis[i] === true) return true;
  }
  return false;
}

export function readColumnCalculationEmphasis(slot: SlotNode, columnCount: number): boolean[] {
  const raw = slot.getPluginData('columnCalculationEmphasis');
  if (raw === '') return normalizeColumnEmphasis(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnEmphasis(undefined, columnCount);
    return normalizeColumnEmphasis(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnEmphasis(undefined, columnCount);
  }
}

function writeColumnCalculationEmphasis(
  slot: SlotNode,
  emphasis: readonly boolean[],
  columnCount: number,
): void {
  const normalized = normalizeColumnEmphasis(emphasis, columnCount);
  if (!hasAnyEmphasis(normalized)) {
    slot.setPluginData('columnCalculationEmphasis', '');
    return;
  }
  slot.setPluginData('columnCalculationEmphasis', JSON.stringify(normalized));
}

export function readColumnCalculationCurrency(slot: SlotNode, columnCount: number): boolean[] {
  const raw = slot.getPluginData('columnCalculationCurrency');
  if (raw === '') return normalizeColumnEmphasis(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnEmphasis(undefined, columnCount);
    return normalizeColumnEmphasis(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnEmphasis(undefined, columnCount);
  }
}

function writeColumnCalculationCurrency(
  slot: SlotNode,
  currency: readonly boolean[],
  columnCount: number,
): void {
  const normalized = normalizeColumnEmphasis(currency, columnCount);
  if (!hasAnyEmphasis(normalized)) {
    slot.setPluginData('columnCalculationCurrency', '');
    return;
  }
  slot.setPluginData('columnCalculationCurrency', JSON.stringify(normalized));
}

/**
 * Lees de huidige Slot-inhoud. Row-FRAMEs heten `TableRow-*`,
 * cell-FRAMEs `TableItem-*`; overige kinderen worden overgeslagen.
 *
 * T39.2: legacy `textSize`-pluginData wordt niet meer gelezen — fontSize
 * wordt door applyTable afgeleid uit slot.height + rows.length.
 */
export function scanTableSlot(slot: SlotNode): TableWrapModel {
  // Legacy-detection (T34.4): oude v0.1.x slides hadden pluginData op de
  // TableWrap-INSTANCE met `kind='welder-table'` + `v='2'`; nu zit de
  // canonieke marker op de Slot zelf als `kind='welder-tablewrap'` + `v='3'`.
  // Als we een oude marker zien, log het en ga door met canvas-truth
  // (geen data-mapping, de canvas is leading).
  const legacyKind = slot.getPluginData('kind');
  const legacyV = slot.getPluginData('v');
  if (legacyKind === 'welder-table' && legacyV === '2') {
    console.log(
      '[welder-slide-editor] T34.4 legacy pluginData detected (v0.1.x format) — using canvas-truth',
    );
  }

  // Rows kunnen ofwel direct in de Slot staan (legacy layout, geen outer
  // wrapper) of genest in een `WelderTableContent`-container (huidige layout
  // met border+padding). Zoek eerst de container; fallback op slot.children.
  let rowParent: SlotNode | FrameNode = slot;
  for (let i = 0; i < slot.children.length; i++) {
    const child = slot.children[i];
    if (child.type === 'FRAME' && child.name === 'WelderTableContent') {
      rowParent = child as FrameNode;
      break;
    }
  }

  const rows: TableRowModel[] = [];
  for (let i = 0; i < rowParent.children.length; i++) {
    const rowNode = rowParent.children[i];
    if (rowNode.type !== 'FRAME') continue;
    // T40: matcht óók TableHeaderRow zodat re-edit de header-rij niet verliest.
    if (rowNode.name.indexOf('TableRow') !== 0 && rowNode.name.indexOf('TableHeaderRow') !== 0)
      continue;
    const rowFrame = rowNode as FrameNode;

    const cells: TableCellModel[] = [];
    for (let j = 0; j < rowFrame.children.length; j++) {
      const cellNode = rowFrame.children[j];
      if (cellNode.type !== 'FRAME') continue;
      // T40: matcht óók TableHeaderItem (header-cells).
      if (
        cellNode.name.indexOf('TableItem') !== 0 &&
        cellNode.name.indexOf('TableHeaderItem') !== 0
      )
        continue;
      const cellFrame = cellNode as FrameNode;

      const textNode = cellFrame.findOne((n: SceneNode) => n.type === 'TEXT');
      const value =
        textNode !== null && textNode.type === 'TEXT' ? (textNode as TextNode).characters : '';
      const emphasis = cellFrame.getPluginData('emphasis') === '1';
      cells.push({ cellNodeId: cellFrame.id, value: value, emphasis: emphasis });
    }
    rows.push({ rowNodeId: rowFrame.id, cells: cells });
  }

  let scannedColumnCount = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > scannedColumnCount) scannedColumnCount = rows[i].cells.length;
  }

  return {
    slotId: slot.id,
    hasColumnHeader: readHasColumnHeader(slot),
    columnCalculations: readColumnCalculations(slot, scannedColumnCount),
    columnCalculationEmphasis: readColumnCalculationEmphasis(slot, scannedColumnCount),
    columnCalculationCurrency: readColumnCalculationCurrency(slot, scannedColumnCount),
    rows: rows,
  };
}

// -------------------------------------------------------------------
// Apply — full-state PUT binnen de Slot
// -------------------------------------------------------------------

/**
 * Bouwt de outer wrapper-FRAME waar alle rijen in komen.
 * Styling conform design-reference (Figma MCP node 91:3175):
 * - 2px border bound aan Text Dimmer
 * - 32px corner radius
 * - 32px horizontaal + 24px verticaal padding
 * Caller roept `container.resize(targetWidth, targetHeight)` NA appendChild
 * aan de Slot, zodat de container de actuele Slot-afmetingen volgt.
 */
function buildTableContainer(dimmerVar: Variable, dimmerRGB: RGB): FrameNode {
  const container = figma.createFrame();
  container.name = 'WelderTableContent';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'FIXED'; // T39: slot-FILL
  container.counterAxisSizingMode = 'FIXED';
  container.itemSpacing = 0;
  // T41.10: paddings synchroon met user-canvas-design.
  // - paddingLeft/Right = 32 (was 0 in T41.6) — dividers krijgen weer
  //   32px gap voor de container-borders. Caller MOET paddingTop
  //   conditioneel zetten op hasHeader (24 zonder, 17 met) om symmetrie
  //   met body's eigen padding te bewaren.
  container.paddingTop = 24; // default; caller overschrijft naar 17 als hasHeader
  container.paddingBottom = 24;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.cornerRadius = 55;
  // T42.5: clip body-cell-overflow zodat te lange wrappende text niet
  // visueel uitloopt naar andere rijen of de header-area.
  container.clipsContent = true;
  container.fills = [];
  container.strokes = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: dimmerRGB },
      'color',
      dimmerVar,
    ),
  ];
  container.strokeWeight = 2;
  container.strokeAlign = 'INSIDE';
  return container;
}

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
/**
 * T43.4 — responsive row-padding op basis van bodyRowCount.
 * Bij weinig rijen: ruime padding voor breathing room. Bij veel rijen:
 * compactere padding zodat text-area per rij voldoende blijft.
 */
function computeRowPadding(rowCount: number): number {
  if (rowCount <= 3) return 24;
  if (rowCount <= 6) return 14;
  if (rowCount <= 9) return 10;
  return 6; // 10-15 rijen
}

interface TableLayoutMetrics {
  containerPadX: number;
  rowPadX: number;
  rowGap: number;
  headerPadTop: number;
  headerPadBottom: number;
}

function computeTableLayoutMetrics(columnCount: number, bodyRowCount: number): TableLayoutMetrics {
  const dense = bodyRowCount >= 5 || columnCount >= 4;
  const veryDense = bodyRowCount >= 8 || columnCount >= 5;

  return {
    containerPadX: veryDense ? 24 : dense ? 28 : 32,
    rowPadX: veryDense ? 20 : dense ? 24 : 32,
    rowGap: columnCount >= 5 ? 24 : dense ? 32 : 44,
    headerPadTop: dense ? 10 : 14,
    headerPadBottom: dense ? 16 : 24,
  };
}

function buildRow(
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
function buildHeaderRow(
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

// Canvas footer-tekst: `€ `-prefix bij currency, anders kale waarde.
// (De UI gebruikt een lucide-euro icon i.p.v. deze tekst-prefix.)
function footerCanvasText(summary: TableColumnSummary | null): string {
  if (summary === null) return '';
  return summary.currency === true ? '€' + summary.value : summary.value;
}

function buildFooterCell(
  summary: TableColumnSummary | null,
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
  // volledige Text-kleur, geen eigen padding — die zit op de row). Alleen de
  // berekende waarde wordt getoond; geen 'Som'-label of -symbool op canvas.
  // Per-column emphasis bold't alleen de footer-waarde, identiek aan de
  // per-cell `emphasis`-stijl in buildCell().
  // T46.1 — sum-kolommen zijn numeriek; waarde rechts uitgelijnd (Notion-stijl).
  const emphasized = summary !== null && summary.emphasis === true;
  const t = figma.createText();
  t.fontName = emphasized
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };
  t.fontSize = emphasized ? sizes.heading : sizes.body;
  t.characters = footerCanvasText(summary);
  t.textAutoResize = 'HEIGHT';
  t.textAlignHorizontal = 'RIGHT';
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

function buildFooterRow(
  summaries: Array<TableColumnSummary | null>,
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
    const cellFrame = buildFooterCell(summaries[j], j, sizes, textVar, textRGB);
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

function tableCellBudget(
  totalWidth: number,
  columnCount: number,
  metrics: TableLayoutMetrics,
): number {
  if (columnCount <= 0) return 0;
  const gapWidth = columnCount > 1 ? metrics.rowGap * (columnCount - 1) : 0;
  const budget = totalWidth - metrics.containerPadX * 2 - metrics.rowPadX * 2 - gapWidth;
  return budget > columnCount ? budget : columnCount;
}

function positiveDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveTableRenderWidth(
  slot: SlotNode,
  surfaceName: string | null,
  columnCount: number,
): number {
  const fallbackWidth = tableWidthForSurface(surfaceName, columnCount);
  const slotWidth = positiveDimension(slot.width);
  if (slotWidth !== null) return slotWidth;
  return fallbackWidth;
}

function buildColumnSpecs(
  rows: TableRowModel[],
  hasHeader: boolean,
  sizes: { heading: number; body: number },
  columnCount: number,
  footerSummaries: Array<TableColumnSummary | null>,
): CellSpec[][] {
  // Keep these font choices in lockstep with buildHeaderCell() and buildCell();
  // autofit must measure the same typography the renderer actually draws.
  const columns: CellSpec[][] = [];
  for (let j = 0; j < columnCount; j++) columns.push([]);

  for (let i = 0; i < rows.length; i++) {
    const isHeader = hasHeader && i === 0;
    for (let j = 0; j < columnCount; j++) {
      const cell = j < rows[i].cells.length ? rows[i].cells[j] : null;
      const text = cell !== null ? cell.value : '';
      let font: FontName;
      let fontSize: number;
      if (isHeader) {
        font = { family: 'Inter', style: 'Medium' };
        fontSize = 18;
      } else if (cell !== null && cell.emphasis === true) {
        font = { family: 'Instrument Sans', style: 'SemiBold' };
        fontSize = sizes.heading;
      } else {
        font = { family: 'Inter', style: 'Regular' };
        fontSize = sizes.body;
      }
      columns[j].push({ text: text, font: font, fontSize: fontSize });
    }
  }

  for (let j = 0; j < columnCount && j < footerSummaries.length; j++) {
    const summary = footerSummaries[j];
    if (summary === null) continue;
    const emphasized = summary.emphasis === true;
    columns[j].push({
      text: footerCanvasText(summary),
      font: emphasized
        ? { family: 'Instrument Sans', style: 'SemiBold' }
        : { family: 'Inter', style: 'Regular' },
      fontSize: emphasized ? sizes.heading : sizes.body,
    });
  }

  return columns;
}

function applyColumnSizing(rowFrame: FrameNode, colWidths: number[]): void {
  if (colWidths.length === 0) return;
  const last = colWidths.length - 1;
  for (let j = 0; j < rowFrame.children.length && j < colWidths.length; j++) {
    const child = rowFrame.children[j];
    if (child.type !== 'FRAME') continue;
    const cellFrame = child as FrameNode;
    if (j < last) {
      try {
        cellFrame.layoutSizingHorizontal = 'FIXED';
      } catch (_e) {
        /* silent */
      }
      try {
        cellFrame.resize(colWidths[j], cellFrame.height);
      } catch (_e) {
        /* silent */
      }
    } else {
      try {
        cellFrame.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
    }
  }
}

/**
 * T42.18 — direct cell+text FILL-vertical + textTruncation. Vervangt
 * de maxLines-berekening (T42.16/T42.17) die niet betrouwbaar werkte.
 *
 * Aanpak:
 * 1. Cell layoutSizingVertical = 'FILL' → cell.height = row's FILL-share.
 * 2. Text layoutSizingHorizontal/Vertical = 'FILL' → text exact cell-bounds.
 * 3. Text textTruncation = 'ENDING' + textAutoResize = 'NONE' → Figma
 *    truncate't visueel wanneer content niet past in cell-bounds.
 *
 * Geen maxLines-formule meer nodig — Figma doet de math native via FILL.
 */
function applyBodyTruncation(bodyRows: FrameNode[]): void {
  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r];

    for (var c = 0; c < row.children.length; c++) {
      var cell = row.children[c];
      if (cell.type !== 'FRAME') continue;
      var cellFrame = cell as FrameNode;

      // Cell vertical FILL → cell.height = row.FILL-share. Vereist
      // counterAxisSizingMode='FIXED' (was 'AUTO' = HUG).
      try {
        cellFrame.counterAxisSizingMode = 'FIXED';
      } catch (_e) {
        /* silent */
      }
      try {
        cellFrame.layoutSizingVertical = 'FILL';
      } catch (_e) {
        /* silent */
      }

      var t = cellFrame.findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t === null || t.type !== 'TEXT') continue;

      var textNode = t as TextNode;
      // Text fills cell-bounds exact. textAutoResize='NONE' = beide
      // dimensies zijn extern bepaald (via FILL).
      try {
        textNode.textAutoResize = 'NONE';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.layoutSizingVertical = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        textNode.textTruncation = 'ENDING';
      } catch (_e) {
        /* silent */
      }
    }
  }
}

/**
 * Full-state PUT: clear alle Slot-children en bouw opnieuw uit `desired`.
 * Persisteer `hasColumnHeader` + migration-marker op pluginData. (T44:
 * width/textSize-keys worden actief gewist — tabelbreedte volgt de actuele
 * Slot-breedte, fontSize wordt rendertime afgeleid uit slot.height + rowCount.)
 *
 * Width-strategie:
 * - Container rendert full-width binnen de actuele Slot-breedte.
 * - Surface presets zijn alleen fallback voor legacy/invalid slots.
 * - De renderer pusht TableWrap/Slot niet meer terug naar de surface-width,
 *   zodat toekomstige smallere slot-varianten automatisch gevolgd worden.
 *
 * Silent-fallback wanneer library-vars niet geladen kunnen worden:
 * pluginData wordt nog steeds geschreven, alleen de content-rebuild
 * skipt (user ziet lege Slot + log-melding).
 */
export async function applyTable(slot: SlotNode, desired: TableWrapModel): Promise<void> {
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  const vars = await loadAccentVars();

  // Clear existing children (toegestaan binnen SlotNode).
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slot.children.length; i++) snapshot.push(slot.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
      /* silent */
    }
  }

  // Pad ragged rows (CSV-import kan rijen met minder cellen leveren) tot een
  // rechthoek — FIXED kolom-breedtes mogen niet per rij verspringen.
  let columnCount = 0;
  for (let i = 0; i < desired.rows.length; i++) {
    if (desired.rows[i].cells.length > columnCount) columnCount = desired.rows[i].cells.length;
  }
  for (let i = 0; i < desired.rows.length; i++) {
    const cells = desired.rows[i].cells;
    while (cells.length < columnCount) cells.push({ cellNodeId: '', value: '' });
  }
  const columnCalculations = normalizeColumnCalculations(desired.columnCalculations, columnCount);
  const columnCalculationEmphasis = normalizeColumnEmphasis(
    desired.columnCalculationEmphasis,
    columnCount,
  );
  const columnCalculationCurrency = normalizeColumnEmphasis(
    desired.columnCalculationCurrency,
    columnCount,
  );
  // T46.1 — kolommen met een (numerieke) som-berekening worden volledig
  // rechts uitgelijnd (Notion number-column-stijl): header, body én footer.
  const rightAlignColumns: boolean[] = [];
  for (let j = 0; j < columnCount; j++) rightAlignColumns.push(columnCalculations[j] === 'sum');

  const surfaceName = findEnclosingSurfaceName(slot);
  const targetWidth = resolveTableRenderWidth(slot, surfaceName, columnCount);

  if (vars.text !== null && vars.dimmer !== null) {
    const textRGB = resolveColor(vars.text, slot, { r: 1, g: 0.957, b: 0.918 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);

    // Outer wrapper-frame met border + padding + rounded corners.
    // Rijen komen in de container, niet direct in de Slot.
    const container = buildTableContainer(vars.dimmer, dimmerRGB);
    slot.appendChild(container);

    // T39.1.1: SlotNode host geen auto-layout-FILL-children — `layoutSizingVertical='FILL'`
    // faalt silent voor slot-kinderen. Gebruik EXPLICIETE resize naar slot.height,
    // en naar de gemeten slot.width zodat content met toekomstige
    // smallere slot-varianten meebeweegt.
    // Container blijft FIXED in beide assen (al ingesteld in buildTableContainer).
    const targetHeight = slot.height > 0 ? slot.height : container.height;
    try {
      container.resize(targetWidth, targetHeight);
    } catch (_e) {
      /* silent — slot/container kan resize-locked zijn */
    }
    container.counterAxisSizingMode = 'FIXED';
    container.primaryAxisSizingMode = 'FIXED';

    // T41.2 — filter body-rijen die volledig leeg zijn (alle cells === '').
    // Header rij (rij 0 wanneer hasHeader) blijft altijd staan ongeacht inhoud.
    // Lege rijen blijven in de UI/data, alleen de canvas-rendering skipt ze.
    // De round-trip (scan → iframe-watch) wordt afgevangen door TableEditor's
    // echo-guard zodat de user's in-progress structure niet geclobberd wordt
    // door de canvas-truth scan na een filter-shrink (zie 2026-05-07 fix).
    const hasHeader = desired.hasColumnHeader && desired.rows.length > 0;

    const effectiveRows: TableRowModel[] = [];
    for (let i = 0; i < desired.rows.length; i++) {
      if (hasHeader && i === 0) {
        effectiveRows.push(desired.rows[i]);
        continue;
      }
      let hasContent = false;
      for (let j = 0; j < desired.rows[i].cells.length; j++) {
        if (desired.rows[i].cells[j].value !== '') {
          hasContent = true;
          break;
        }
      }
      if (hasContent) effectiveRows.push(desired.rows[i]);
    }

    // T40 — body-fontSize-formule: alleen body-rijen krijgen FILL;
    // header reserveert ~50px van de slot-hoogte (text-area + 16+16 padding).
    const HEADER_HEIGHT_ESTIMATE = 50;
    const FOOTER_HEIGHT_ESTIMATE = 40;
    const bodyRowCount = hasHeader ? effectiveRows.length - 1 : effectiveRows.length;
    const hasFooter = hasColumnCalculations(columnCalculations);
    const footerSummaries = computeTableColumnSummaries(
      desired.rows,
      hasHeader,
      columnCalculations,
      columnCount,
      columnCalculationEmphasis,
      columnCalculationCurrency,
    );
    const adjustedSlotHeight =
      slot.height - (hasHeader ? HEADER_HEIGHT_ESTIMATE : 0) - (hasFooter ? FOOTER_HEIGHT_ESTIMATE : 0);
    const metrics = computeTableLayoutMetrics(columnCount, bodyRowCount);
    container.paddingLeft = metrics.containerPadX;
    container.paddingRight = metrics.containerPadX;
    container.paddingTop = hasHeader ? metrics.headerPadTop + 3 : metrics.headerPadBottom;
    container.paddingBottom = metrics.headerPadBottom;

    // T44: fontSize volledig automatisch uit hoogte + rowCount.
    const sizes = getFontSizes(adjustedSlotHeight, bodyRowCount > 0 ? bodyRowCount : 1);

    const cellBudget = tableCellBudget(targetWidth, columnCount, metrics);
    const columnSpecs = buildColumnSpecs(
      effectiveRows,
      hasHeader,
      sizes,
      columnCount,
      footerSummaries,
    );
    const measurer = createTextMeasurer();
    const measured = measurer !== null;
    let colWidths: number[] = [];
    try {
      colWidths = computeColumnWidths(
        columnSpecs,
        {
          totalWidth: cellBudget,
          minColWidth: TABLE_AUTOFIT_MIN_COL,
          maxColFraction: TABLE_AUTOFIT_MAX_COL_FRACTION,
        },
        measurer !== null ? measurer.measure : null,
      );
    } finally {
      if (measurer !== null) measurer.dispose();
    }
    debugLog('table', 'autofit', {
      colWidths: colWidths,
      budget: cellBudget,
      targetWidth: targetWidth,
      slotWidth: slot.width,
      measured: measured,
      gap: metrics.rowGap,
      rowPadX: metrics.rowPadX,
      containerPadX: metrics.containerPadX,
    });

    // T42.16: collect body-rows voor post-FILL truncation pass.
    const bodyRows: FrameNode[] = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      let rowFrame: FrameNode;
      if (hasHeader && i === 0) {
        rowFrame = buildHeaderRow(
          effectiveRows[i],
          vars.text,
          vars.dimmer,
          textRGB,
          dimmerRGB,
          rightAlignColumns,
          metrics,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          /* silent */
        }
        // T40: header is HUG-vertical (compact, niet mee-rekken).
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
          /* silent */
        }
      } else {
        // Body row — bodyIndex zorgt dat eerste body-rij geen top-divider krijgt
        // (anders dubbel met de header's bottom-divider).
        const bodyIndex = hasHeader ? i - 1 : i;
        const rowPadding = computeRowPadding(bodyRowCount);
        rowFrame = buildRow(
          effectiveRows[i],
          bodyIndex,
          sizes,
          vars.text,
          vars.dimmer,
          textRGB,
          dimmerRGB,
          rowPadding,
          rightAlignColumns,
          metrics,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          /* silent */
        }
        // T39: rows FILL vertical (was HUG) — verdelen container-hoogte gelijk.
        try {
          rowFrame.layoutSizingVertical = 'FILL';
        } catch (_e) {
          /* silent */
        }
        bodyRows.push(rowFrame);
      }
    }

    if (hasFooter) {
      const footerRow = buildFooterRow(
        footerSummaries,
        sizes,
        vars.text,
        textRGB,
        vars.dimmer,
        dimmerRGB,
        computeRowPadding(bodyRowCount),
        metrics,
      );
      applyColumnSizing(footerRow, colWidths);
      container.appendChild(footerRow);
      try {
        footerRow.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        footerRow.layoutSizingVertical = 'HUG';
      } catch (_e) {
        /* silent */
      }
    }

    // T42.18: cell + text beide FILL-vertical → text fills exact cell-bounds,
    // textTruncation='ENDING' truncate't visueel. Geen analytische berekening
    // meer nodig; Figma doet de math native.
    applyBodyTruncation(bodyRows);
  } else {
    console.log('[welder-slide-editor] applyTable: library-vars missing, skipping rebuild');
  }

  // T44: stale width/textSize-keys actief wissen (lege string = delete).
  slot.setPluginData('width', '');
  slot.setPluginData('textSize', '');
  slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
  writeColumnCalculations(slot, columnCalculations, columnCount);
  writeColumnCalculationEmphasis(slot, columnCalculationEmphasis, columnCount);
  writeColumnCalculationCurrency(slot, columnCalculationCurrency, columnCount);
  slot.setPluginData('kind', 'welder-tablewrap');
  slot.setPluginData('v', '4');
}
