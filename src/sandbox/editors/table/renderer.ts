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

import type { TableWrapModel, TableRowModel, TableCellModel } from '../../../shared/types';
import { tableWidthsForSurface } from '../../../shared/constants';
import { findEnclosingSurfaceName } from '../../slide-machine';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from '../_shared/accent-vars';

type WidthKey = 'sm' | 'md' | 'lg';

/**
 * Tekst-fontSize afgeleid van actual rowHeight (T39.1.1, v0.2.2).
 * Vervangt user-pick textSize én de eerdere rowCount-matrix uit T39.1.
 *
 * `rowHeight` is hier de OUTER row-height (= row's eigen FILL-share van de
 * container). Inner content-area per rij is rowHeight - 40 (rowFrame
 * paddingTop+paddingBottom = 20+20). De ratios 0.36/0.30 zijn empirisch
 * gekalibreerd op outer-rowHeight zodat heading + body comfortabel binnen
 * inner-area passen met line-height ~1.2.
 *
 * Formule:
 *   rowHeight = (slotHeight - 48) / rowCount        // T41.9: container.padding 24+24
 *   heading   = clamp(round(rowHeight * 0.36 * mult), 16, 40)
 *   body      = clamp(round(rowHeight * 0.30 * mult), 12, 32)
 *
 * Multiplier (T42.9 — textSize-picker terug):
 *   sm: 0.75 — kleinere tekst
 *   md: 1.00 — default
 *   lg: 1.25 — grotere tekst
 *
 * T42.9: width-clamp uit T42.6-T42.8 verwijderd. Responsiveness blijft
 * alleen op hoogte; user-control via textSize-picker (sm/md/lg).
 */
function getFontSizes(
  slotHeight: number,
  rowCount: number,
  textSize: 'sm' | 'md' | 'lg',
): { heading: number; body: number } {
  var safeRowCount = rowCount > 0 ? rowCount : 1;
  var rowHeight = (slotHeight - 48) / safeRowCount;
  if (rowHeight < 16) rowHeight = 16;
  // T42.21: getoned-down clamps na user-feedback dat lg te groot was en
  // sm niet klein genoeg. Drie altijd-onderscheiden waardes met
  // realistischere typografie-range.
  var mult: number;
  var headingMin: number;
  var headingMax: number;
  var bodyMin: number;
  var bodyMax: number;
  if (textSize === 'sm') {
    mult = 0.55;
    headingMin = 12;
    headingMax = 22;
    bodyMin = 10;
    bodyMax = 16;
  } else if (textSize === 'lg') {
    mult = 1.3;
    headingMin = 24;
    headingMax = 48;
    bodyMin = 20;
    bodyMax = 36;
  } else {
    mult = 1.0;
    headingMin = 16;
    headingMax = 32;
    bodyMin = 14;
    bodyMax = 24;
  }

  var heading = Math.round(rowHeight * 0.36 * mult);
  if (heading < headingMin) heading = headingMin;
  if (heading > headingMax) heading = headingMax;

  var body = Math.round(rowHeight * 0.3 * mult);
  if (body < bodyMin) body = bodyMin;
  if (body > bodyMax) body = bodyMax;

  return { heading: heading, body: body };
}

// -------------------------------------------------------------------
// Scan — lees huidige Slot-content in een TableWrapModel
// -------------------------------------------------------------------

function readWidth(slot: SlotNode): WidthKey {
  const v = slot.getPluginData('width');
  if (v === 'sm' || v === 'md' || v === 'lg') return v;
  return 'md';
}

/** T40 — leest of de tabel een header-rij heeft. Default false. */
function readHasColumnHeader(slot: SlotNode): boolean {
  return slot.getPluginData('hasColumnHeader') === '1';
}

/** T42.9 — leest textSize-preset (sm/md/lg). Default 'md'. */
function readTextSize(slot: SlotNode): 'sm' | 'md' | 'lg' {
  const v = slot.getPluginData('textSize');
  if (v === 'sm' || v === 'md' || v === 'lg') return v;
  return 'md';
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
      cells.push({ cellNodeId: cellFrame.id, value: value });
    }
    rows.push({ rowNodeId: rowFrame.id, cells: cells });
  }

  return {
    slotId: slot.id,
    width: readWidth(slot),
    hasColumnHeader: readHasColumnHeader(slot),
    textSize: readTextSize(slot),
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
 * Caller roept `container.resize(TABLE_WIDTHS[width], container.height)`
 * NA appendChild aan de Slot, zodat de container onafhankelijk van de
 * slot-breedte altijd de preset-breedte aanneemt (karakter-wrap-fix).
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
 * Bouwt één cell-FRAME met TEXT-kind. Eerste kolom (j===0) krijgt
 * Instrument Sans SemiBold + heading-size; overige Inter Regular + body-size.
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
): FrameNode {
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = 'AUTO';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.fills = [];

  const isFirst = j === 0;
  const fontName: FontName = isFirst
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };

  const t = figma.createText();
  t.fontName = fontName;
  t.fontSize = isFirst ? sizes.heading : sizes.body;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  // T41.8: alle body-cells LEFT-aligned voor consistente, minimalistische
  // look. Cells krijgen uniforme cell-width via FILL-distribution; padding
  // tussen cells komt van row.itemSpacing (32).
  t.textAlignHorizontal = 'LEFT';
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
  if (rowCount <= 3) return 28;
  if (rowCount <= 6) return 20;
  if (rowCount <= 9) return 14;
  return 8; // 10-15 rijen
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
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = 56;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  // T41.6: horizontal padding verhuisd vanaf container — top-dividers (i > 0)
  // spannen nu de volle container.width en raken de container-borders.
  rowFrame.paddingLeft = 32;
  rowFrame.paddingRight = 32;
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
    const cellFrame = buildCell(row.cells[j], j, sizes, textVar, textRGB);
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
 * T40 / T41.2 / T41.3 — bouwt een header-cell met centered text in
 * Text-color, fontSize 22. Cells met j > 0 krijgen een 1px left-stroke
 * in Text Dimmer als verticale kolom-separator. Corner-cell (j===0)
 * heeft geen left-stroke (dat zou aan de container-binnenkant rusten).
 */
function buildHeaderCell(
  cell: TableCellModel,
  j: number,
  textVar: Variable,
  textRGB: RGB,
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
  // T41.10: asymmetrische padding voor header-cell — 14 top / 24 bottom
  // matcht user's canvas-design (header-text iets dichter naar de top).
  cellFrame.paddingTop = 14;
  cellFrame.paddingBottom = 24;
  cellFrame.fills = [];

  // T41.8: verticale cell-separators verwijderd — minimalistische look.

  const t = figma.createText();
  // T41.10: header → Inter Medium + Text-color (full contrast) per
  // user-edits direct op canvas. Was Inter Regular + Text Dimmer (T41.9).
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = 18;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  t.textAlignHorizontal = 'LEFT';
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
 * border in Text Dimmer. Cells minimaal: muted Text Dimmer color,
 * left-aligned, 18px Instrument Sans SemiBold, geen verticale separators.
 */
function buildHeaderRow(
  row: TableRowModel,
  textVar: Variable,
  dimmerVar: Variable,
  textRGB: RGB,
  dimmerRGB: RGB,
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableHeaderRow';
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = 56;
  // T41.5: padding verhuisd naar cell-niveau (24+24 op elke cell) zodat
  // cells FILL-vertical kunnen en verticale strokes tot row-edges reiken
  // (raken bottom-divider). Row zelf heeft nu 0 vertical padding.
  rowFrame.paddingTop = 0;
  rowFrame.paddingBottom = 0;
  // T41.6: horizontal padding 32 (was 0) — verhuisd vanaf container zodat
  // de bottom-divider full container.width spant en de container-borders
  // raakt op beide hoeken.
  rowFrame.paddingLeft = 32;
  rowFrame.paddingRight = 32;
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
    const cellFrame = buildHeaderCell(row.cells[j], j, textVar, textRGB);
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
 * Persisteer `width` + migration-marker op pluginData. (T39.2: textSize-write
 * verwijderd — fontSize wordt rendertime afgeleid uit slot.height + rowCount.)
 *
 * Width-strategie (T37-fix — karakter-wrap in smalle slots):
 * 1. Probeer parent-chain (TableWrap-instance, dan Slot) te resizen naar
 *    `TABLE_WIDTHS[width]` zodat het omringende layout mee-schaalt.
 * 2. Zet EXPLICIT `container.resize(...)` zodat de content altijd de
 *    preset-breedte heeft, ook als slot/parent niet konden resizen
 *    (container overflow't dan visueel — user-feedback om slide-layout
 *    aan te passen).
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

  // Surface-aware breedte: een Slide (1920) en een Whitepaper (1240) hebben
  // verschillende Slot-breedte-presets. Bepaal de omsluitende surface vanaf
  // de Slot en kies de bijbehorende preset-tabel; onbekend → Slide-default.
  const surfaceName = findEnclosingSurfaceName(slot);
  const desiredWidth = tableWidthsForSurface(surfaceName)[desired.width];

  if (vars.text !== null && vars.dimmer !== null) {
    const textRGB = resolveColor(vars.text, slot, { r: 1, g: 0.957, b: 0.918 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);

    // Outer wrapper-frame met border + padding + rounded corners.
    // Rijen komen in de container, niet direct in de Slot.
    const container = buildTableContainer(vars.dimmer, dimmerRGB);
    slot.appendChild(container);

    // Probeer de parent-chain (TableWrap-INSTANCE, dan Slot) te resizen
    // zodat het omringende layout mee-schaalt. Silent-fallback wanneer
    // parents in auto-layout constraint-locked zijn.
    const slotParent = slot.parent;
    if (slotParent !== null && 'resize' in slotParent) {
      try {
        const p = slotParent as FrameNode | InstanceNode;
        p.resize(desiredWidth, p.height);
      } catch (_e) {
        /* silent — TableWrap kan locked zijn in auto-layout Layout */
      }
    }
    try {
      slot.resize(desiredWidth, slot.height);
    } catch (_e) {
      /* silent — slot kan auto-layout-managed zijn */
    }

    // T39.1.1: SlotNode host geen auto-layout-FILL-children — `layoutSizingVertical='FILL'`
    // faalt silent voor slot-kinderen. Gebruik EXPLICIETE resize naar slot.height,
    // vergelijkbaar met de bestaande T38 width-resize-strategie.
    // Container blijft FIXED in beide assen (al ingesteld in buildTableContainer).
    const targetHeight = slot.height > 0 ? slot.height : container.height;
    try {
      container.resize(desiredWidth, targetHeight);
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

    // T41.10: container.paddingTop conditioneel — 17px bij header (header-cell
    // heeft eigen 14/24 padding wat dit balanceert), 24px zonder header voor
    // symmetrische breathing room rond de eerste body-row.
    container.paddingTop = hasHeader ? 17 : 24;

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
    const bodyRowCount = hasHeader ? effectiveRows.length - 1 : effectiveRows.length;
    const adjustedSlotHeight = hasHeader ? slot.height - HEADER_HEIGHT_ESTIMATE : slot.height;
    // T42.9: width-clamp uit T42.6-T42.8 verwijderd. Alleen hoogte +
    // textSize-multiplier (sm/md/lg user-pick).
    const sizes = getFontSizes(
      adjustedSlotHeight,
      bodyRowCount > 0 ? bodyRowCount : 1,
      desired.textSize,
    );

    // T42.16: collect body-rows voor post-FILL truncation pass.
    const bodyRows: FrameNode[] = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      let rowFrame: FrameNode;
      if (hasHeader && i === 0) {
        rowFrame = buildHeaderRow(effectiveRows[i], vars.text, vars.dimmer, textRGB, dimmerRGB);
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
        );
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

    // T42.18: cell + text beide FILL-vertical → text fills exact cell-bounds,
    // textTruncation='ENDING' truncate't visueel. Geen analytische berekening
    // meer nodig; Figma doet de math native.
    applyBodyTruncation(bodyRows);
  } else {
    console.log('[welder-slide-editor] applyTable: library-vars missing, skipping rebuild');
  }

  slot.setPluginData('width', desired.width);
  slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
  slot.setPluginData('textSize', desired.textSize); // T42.9: re-introduced
  slot.setPluginData('kind', 'welder-tablewrap');
  slot.setPluginData('v', '3');
}
