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
import { tableDeltaDisplay } from '../../../shared/table-delta';
import { parseBullets } from '../../../shared/table-bullets';
import type { TableLayoutMetrics } from './metrics';
import {
  TABLE_VALUE_GAP_EM,
  TABLE_BADGE_LABEL_EM,
  tableBadgeHeight,
  tableBadgeChipPadX,
} from './metrics';

/** Naam van de waarde-TEXT binnen een cell-FRAME (scan + truncation pakken deze). */
export const CELL_VALUE_NAME = 'CellValue';

/**
 * Bouwt een badge-chip als kale pill: FRAME met vaste hoogte, 1px
 * Text-Dimmer-rand en een Inter-Medium-label erin. Bewust géén clone van
 * het library-Badge-component — de clone-route (clone + setProperties +
 * rescale, ×2 per cel) maakte een full render met veel badges ~1s traag
 * én liet Figma de instance-sublayers regenereren, waar de scan overheen
 * struikelde. Een platte frame+tekst heeft geen instance-internals, dus
 * niets om over te struikelen, en de hoogte is exact tableBadgeHeight —
 * de fit rekent met precies dezelfde formule.
 */
function buildBadgeChip(
  label: string,
  bodySize: number,
  dimmerVar: Variable,
  dimmerRGB: RGB,
  maxW: number | null,
): FrameNode {
  const chip = figma.createFrame();
  chip.name = 'CellBadgeChip';
  chip.layoutMode = 'HORIZONTAL';
  chip.primaryAxisSizingMode = 'AUTO';
  chip.counterAxisSizingMode = 'FIXED';
  chip.primaryAxisAlignItems = 'CENTER';
  chip.counterAxisAlignItems = 'CENTER';
  const padX = Math.round(tableBadgeChipPadX(bodySize) / 2);
  chip.paddingLeft = padX;
  chip.paddingRight = padX;
  chip.paddingTop = 0;
  chip.paddingBottom = 0;
  chip.fills = [];
  chip.clipsContent = false;
  const dimmerPaint = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: dimmerRGB },
    'color',
    dimmerVar,
  );
  chip.strokes = [dimmerPaint];
  chip.strokeWeight = 1;
  const h = tableBadgeHeight(bodySize);
  chip.cornerRadius = Math.ceil(h / 2);

  const t = figma.createText();
  t.name = 'BadgeLabel';
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = Math.max(10, Math.round(bodySize * TABLE_BADGE_LABEL_EM));
  t.characters = label;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.fills = [dimmerPaint];
  chip.appendChild(t);

  // Vaste hoogte NA appendChild (auto-layout past maten pas toe op een
  // geparente node); breedte blijft HUG rond label + padding.
  try {
    chip.resize(chip.width, h);
  } catch (_e) {
    /* silent */
  }
  // Kolom-budget: label trunceren i.p.v. de buurkolom overschilderen.
  if (maxW !== null && maxW > 0 && chip.width > maxW) {
    try {
      t.textTruncation = 'ENDING';
      t.maxLines = 1;
      t.textAutoResize = 'HEIGHT';
      t.resize(Math.max(8, maxW - padX * 2), t.height);
    } catch (_e) {
      /* silent */
    }
  }
  return chip;
}

// Lucide circle / circle-check, hard ge-embed: de sandbox-bundel draagt de
// grote SVG-map niet (die is UI-only) en het vinkje kent maar twee vormen.
// stroke="black" is een placeholder — na createNodeFromSvg worden de vectors
// aan de `Text`-library-variable gebonden zodat het icon de theme-kleur volgt.
const CHECK_SVG_ON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
const CHECK_SVG_OFF =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';

/**
 * Bouwt het per-cel vinkje (checked = circle-check, unchecked = circle) op
 * 1em van de waarde-tekst. Stroke schaalt licht mee met de iconmaat zodat
 * hij op grote tabellen niet spichtig wordt. Null bij een SVG-fout — de cel
 * rendert dan gewoon zonder vinkje (FIG-GUARD-01: nooit de build laten
 * falen op een cosmetisch element).
 */
function buildCheckIcon(
  checked: boolean,
  size: number,
  textVar: Variable,
  textRGB: RGB,
): FrameNode | null {
  let icon: FrameNode;
  try {
    icon = figma.createNodeFromSvg(checked ? CHECK_SVG_ON : CHECK_SVG_OFF);
  } catch (e) {
    console.log('[table] check-icon createNodeFromSvg failed: ' + String(e));
    return null;
  }
  icon.name = 'CellCheck';
  icon.fills = [];
  icon.clipsContent = false;
  try {
    icon.resize(size, size);
  } catch (_e) {
    /* silent */
  }
  const stroke = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: textRGB },
    'color',
    textVar,
  );
  const vectors = icon.findAll(function (n: SceneNode) {
    return n.type === 'VECTOR';
  });
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i] as VectorNode;
    v.strokes = [stroke];
    v.strokeWeight = Math.max(1.5, size / 12);
  }
  return icon;
}

/**
 * Zet de cel-waarde op een TEXT-node, inclusief per-regel bullet-styling.
 * Single source of truth voor zowel de full build (buildCell) als de in-place
 * fast-path update (apply-text). Wist bestaande list-styling vóór het opnieuw
 * zetten zodat een bullet→plain wijziging geen oude bullets achterlaat.
 */
export function applyCellText(t: TextNode, value: string): void {
  const parsed = parseBullets(value);
  t.characters = parsed.text;
  if (t.characters.length === 0) return;
  // Clear any prior list-styling across the whole range (handles bullet→plain
  // and shrinking lists), then (re)apply per bulleted-line range.
  try {
    t.setRangeListOptions(0, t.characters.length, { type: 'NONE' });
  } catch (_e) {
    /* silent */
  }
  if (parsed.ranges.length > 0) {
    try {
      t.paragraphSpacing = 0;
    } catch (_e) {
      /* silent */
    }
    for (let r = 0; r < parsed.ranges.length; r++) {
      try {
        t.setRangeListOptions(parsed.ranges[r].start, parsed.ranges[r].end, { type: 'UNORDERED' });
      } catch (_e) {
        /* silent — oudere Figma API zonder list-support */
      }
      try {
        t.setRangeListSpacing(parsed.ranges[r].start, parsed.ranges[r].end, 0);
      } catch (_e) {
        /* silent */
      }
    }
  }
}

/**
 * Bouwt één cell-FRAME met TEXT-kind. Emphasis is per cell opt-in;
 * columns never get automatic visual treatment.
 * TEXT-fill is bound aan de `Text`-library-variable.
 *
 * Bij een niet-lege `cell.delta` wordt de cel een VERTICALE stack: waarde
 * boven, delta-badge eronder. De badge is een CLONE van het slide-Badge-
 * component (zelfde styling als de chart delta-badge); zonder template valt
 * hij terug op losse Text Dimmer-tekst. De rauwe delta-string gaat naar
 * cell-pluginData zodat de scan hem exact terugleest (net als emphasis).
 *
 * Caller zet `layoutSizingHorizontal='FILL'` + `layoutSizingVertical='HUG'`
 * NA appendChild aan de row (Figma-API-quirk).
 */
function buildCell(
  cell: TableCellModel,
  j: number,
  sizes: { heading: number; body: number },
  textVar: Variable,
  textRGB: RGB,
  dimmerVar: Variable,
  dimmerRGB: RGB,
  rightAlign: boolean,
  cellWidth: number | null,
): FrameNode {
  const deltaLabel = tableDeltaDisplay(cell.delta);
  const badgeLabel =
    typeof cell.badge === 'string' && cell.badge.trim() !== '' ? cell.badge.trim() : null;
  const hasCheck = cell.check === true || cell.check === false;
  // Alleen de delta stapelt verticaal (chip ónder de waarde); vinkje en
  // nummer-badge staan IN de waarderegel (icon links, badge rechts), dus die
  // houden de cel horizontaal.
  const stacked = deltaLabel !== null;
  const valueSize = cell.emphasis === true ? sizes.heading : sizes.body;

  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableItem-c' + String(j);
  cellFrame.layoutMode = stacked ? 'VERTICAL' : 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = stacked ? 'FIXED' : 'AUTO';
  cellFrame.primaryAxisSizingMode = stacked ? 'AUTO' : 'FIXED';
  if (stacked) {
    // De getrimde waarde-tekst eindigt op de baseline, dus de descender
    // (~0.25em) hangt ÓNDER het tekst-vak de stack-gap in. Schaal de gap mee
    // zodat g/p/j de badge eronder niet raken — vóór de cap-height-trim zat
    // de descent nog binnen het line-box en volstond een vaste 2px.
    cellFrame.itemSpacing = 2 + Math.round(valueSize * 0.25);
    cellFrame.counterAxisAlignItems = rightAlign ? 'MAX' : 'MIN';
  } else if (hasCheck || badgeLabel !== null) {
    // Horizontale cel met vinkje en/of badge: gap tussen de delen, optisch
    // gecentreerd tegen het cap-getrimde tekst-vak.
    cellFrame.itemSpacing = Math.round(valueSize * TABLE_VALUE_GAP_EM);
    cellFrame.counterAxisAlignItems = 'CENTER';
  }
  cellFrame.fills = [];
  // `figma.createFrame()` clipt default (clipsContent=true). De cel HUGt zijn
  // tekst-vak exact, dus elke typografie die glyphs buiten dat vak laat hangen
  // (leadingTrim-descenders) werd op de vak-rand afgekapt — dáárom sneden de
  // eerdere leadingTrim/strakke-lineHeight-pogingen de g/p/j-staarten af.
  // Overflow-bewaking is bewust container-niveau (container.clipsContent).
  cellFrame.clipsContent = false;
  cellFrame.setPluginData('emphasis', cell.emphasis === true ? '1' : '');
  cellFrame.setPluginData('delta', deltaLabel !== null ? deltaLabel : '');
  // '' = geen vinkje, '1' = aangevinkt, '0' = uitgevinkt — zelfde
  // pluginData-round-trip-discipline als emphasis/delta (scan leest exact).
  cellFrame.setPluginData('check', hasCheck ? (cell.check === true ? '1' : '0') : '');
  cellFrame.setPluginData('badge', badgeLabel !== null ? badgeLabel : '');

  const isEmphasis = cell.emphasis === true;
  const fontName: FontName = isEmphasis
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };

  const t = figma.createText();
  t.name = CELL_VALUE_NAME;
  t.fontName = fontName;
  t.fontSize = isEmphasis ? sizes.heading : sizes.body;
  // Optisch centreren: trim het tekst-vak tot cap-height..baseline. Bij
  // 'normal' leading zit er meer lege ruimte ónder de baseline (descent) dan
  // boven de kapitalen, dus een geometrisch gecentreerd vak oogt naar boven
  // geplakt in een hoge rij-band. Het getrimde vak centreert de visuele
  // tekstmassa; descenders hangen buiten het vak en renderen gewoon nu de
  // cel/rij niet meer clippen. Interlinie blijft 'normal' voor wrap-tekst.
  try {
    t.leadingTrim = 'CAP_HEIGHT';
  } catch (_e) {
    /* silent — oudere Figma API zonder leadingTrim */
  }
  // Per-line bullets (Apple-Notes stijl): regels die met `- `/`• `/`* `
  // beginnen worden een Figma UNORDERED-lijst, andere regels blijven platte
  // prosa. Gedeelde helper met de in-place fast-path.
  applyCellText(t, cell.value);
  t.textAutoResize = 'HEIGHT';
  // Body-cells standaard LEFT-aligned voor consistente scanbaarheid.
  // Kolommen met een som-berekening zijn numeriek → RIGHT-aligned
  // (Notion number-column-stijl). Horizontale ruimte komt uit content-weighted
  // autofit; row.itemSpacing wordt compacter bij informatierijke tabellen.
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // maxLines + textTruncation verwijderd — body-text mag vrij
  // wrappen zolang er ruimte is. Truncation eerder zorgde voor
  // ge-trunceerde 1-regel wanneer wrapping juist beter was. Container
  // clipsContent=true blijft visuele overflow voorkomen.
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
  ];

  // Waarderegel: [vinkje] [nummer-badge] [tekst] — vinkje en badge staan vóór
  // de tekst, alles op één regel. De tekst FILLt de rest van de regel, dus de
  // badge houdt een vaste kolom-positie i.p.v. mee te schuiven met de
  // tekstlengte; alleen de delta blijft eronder gestapeld.
  // In een gestapelde cel (delta eronder) krijgt de regel een eigen
  // horizontale 'CellValueRow' zodat de verticale stack intact blijft; in
  // een platte cel is de (horizontale) cel zelf de regel. Scan en fast-path
  // vinden de CellValue-TEXT via recursieve findOne — wrapper-neutraal.
  const checkIcon = hasCheck
    ? buildCheckIcon(cell.check === true, Math.round(valueSize), textVar, textRGB)
    : null;
  let badgeNode: SceneNode | null = null;
  if (badgeLabel !== null) {
    badgeNode = buildBadgeChip(badgeLabel, sizes.body, dimmerVar, dimmerRGB, cellWidth);
    badgeNode.name = 'CellNumberBadge';
  }

  let valueHost: FrameNode = cellFrame;
  if (stacked && (checkIcon !== null || badgeNode !== null)) {
    const valueRow = figma.createFrame();
    valueRow.name = 'CellValueRow';
    valueRow.layoutMode = 'HORIZONTAL';
    valueRow.primaryAxisSizingMode = 'FIXED';
    valueRow.counterAxisSizingMode = 'AUTO';
    valueRow.counterAxisAlignItems = 'CENTER';
    valueRow.itemSpacing = Math.round(valueSize * TABLE_VALUE_GAP_EM);
    valueRow.fills = [];
    valueRow.clipsContent = false;
    cellFrame.appendChild(valueRow);
    try {
      valueRow.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
    valueHost = valueRow;
  }
  if (checkIcon !== null) valueHost.appendChild(checkIcon);
  if (badgeNode !== null) {
    // Chip houdt zijn eigen vaste hoogte (buildBadgeChip); geen HUG-override
    // nodig — de waarderegel centreert hem verticaal.
    valueHost.appendChild(badgeNode);
  }
  valueHost.appendChild(t);
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

  if (deltaLabel !== null) {
    // Zelfde kale chip als de nummer-badge (▲/▼ zit al in het label);
    // maxW = kolombreedte zodat een brede delta trunceert i.p.v. de
    // buurkolom te overschilderen (de cel clipt niet meer).
    const d = buildBadgeChip(deltaLabel, sizes.body, dimmerVar, dimmerRGB, cellWidth);
    d.name = 'CellDeltaBadge';
    cellFrame.appendChild(d);
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
  colWidths: readonly number[],
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  // Geen clip: leadingTrim-descenders hangen buiten cel én rij (in de
  // rij-padding); de container bewaakt de tabel-overflow.
  rowFrame.clipsContent = false;
  // Cellen verticaal gecentreerd. Top-align liet vroeger de cap-toppen van
  // buurcellen exact samenvallen — die vlieger gaat niet meer op zodra één cel
  // een vinkje of badge draagt: die cel is zo hoog als de chip (~2× de tekst)
  // en centreert zijn tekst daarbinnen, terwijl een kale buurcel zijn tekst op
  // y=0 houdt. Top-align zette de twee dan zichtbaar uit elkaar (~een halve
  // chip-hoogte). CENTER lijnt ze wél uit: elke cel centreert in de rij, dus de
  // optische midden van kale tekst, chip-tekst en badge vallen samen. Prijs:
  // in een rij met een wrappende cel zweeft een korte buur nu op het midden
  // i.p.v. bij de eerste regel — met chips klopte die uitlijning toch al niet.
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = metrics.rowGap;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  // Horizontal padding verhuisd vanaf container — top-dividers (i > 0)
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
    // Kolombreedte als badge-budget voor delta-cellen (zie buildCell).
    const cellWidth = j < colWidths.length ? colWidths[j] : null;
    const cellFrame = buildCell(
      row.cells[j],
      j,
      sizes,
      textVar,
      textRGB,
      dimmerVar,
      dimmerRGB,
      rightAlign,
      cellWidth,
    );
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
 * Bouwt een header-cell met left-aligned text in Text-color.
 * Header padding volgt dezelfde dense-table metrics als de body rows.
 */
function buildHeaderCell(
  cell: TableCellModel,
  j: number,
  sizes: { heading: number; body: number },
  textVar: Variable,
  textRGB: RGB,
  rightAlign: boolean,
  metrics: TableLayoutMetrics,
): FrameNode {
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableHeaderItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  // Cell-padding zodat row-edges (bottom-divider) blijven werken
  // ook bij FILL-vertical cells.
  cellFrame.counterAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisAlignItems = 'MIN';
  cellFrame.counterAxisAlignItems = 'CENTER';
  // Asymmetrische padding voor header-cell — iets dichter naar de top.
  cellFrame.paddingTop = metrics.headerPadTop;
  cellFrame.paddingBottom = metrics.headerPadBottom;
  cellFrame.fills = [];
  // Geen clip: leadingTrim-descenders mogen buiten het tekst-vak hangen
  // (zie buildCell).
  cellFrame.clipsContent = false;
  cellFrame.setPluginData('emphasis', '');

  // Verticale cell-separators verwijderd — minimalistische look.

  const t = figma.createText();
  // Koprij → Instrument Sans SemiBold, iets groter, in Text-color
  // (full contrast). Was Inter Medium 18.
  t.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
  // Header-fontSize schaalt mee met de gefitte body — net iets groter voor
  // hiërarchie, maar NIET zo groot als sizes.heading (de emphasis-maat), want
  // dat duwde de koprij naar 2 regels en uit verhouding. body × 1.1, capped.
  var headerSize = Math.round(sizes.body * 1.1);
  if (headerSize > 24) headerSize = 24;
  if (headerSize < 14) headerSize = 14;
  t.fontSize = headerSize;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  // Cap-height-trim voor optisch gecentreerde header-tekst (zie buildCell).
  try {
    t.leadingTrim = 'CAP_HEIGHT';
  } catch (_e) {
    /* silent — oudere Figma API zonder leadingTrim */
  }
  // Header van een som-kolom volgt de body/footer-uitlijning (RIGHT).
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // Header-tekst mag wrappen i.p.v. agressief naar "…" te truncaten: bij smalle
  // kolommen (6 cols) kapte maxLines=1+ENDING de titel weg tot een ellipsis.
  // De rij HUGt verticaal, dus een 2-regelige header verspringt netjes mee.
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
 * Bouwt de header-rij. HUG-vertical (compact), 2px bottom-
 * border in Text Dimmer. Cells zijn left-aligned, 18px Inter Medium,
 * geen verticale separators.
 */
export function buildHeaderRow(
  row: TableRowModel,
  sizes: { heading: number; body: number },
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
  // Geen clip: leadingTrim-descenders hangen buiten het tekst-vak (zie buildRow).
  rowFrame.clipsContent = false;
  rowFrame.itemSpacing = metrics.rowGap;
  // Padding verhuisd naar cell-niveau (24+24 op elke cell) zodat
  // cells FILL-vertical kunnen en verticale strokes tot row-edges reiken
  // (raken bottom-divider). Row zelf heeft nu 0 vertical padding.
  rowFrame.paddingTop = 0;
  rowFrame.paddingBottom = 0;
  // Horizontal padding 32 (was 0) — verhuisd vanaf container zodat
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
    const cellFrame = buildHeaderCell(row.cells[j], j, sizes, textVar, textRGB, rightAlign, metrics);
    rowFrame.appendChild(cellFrame);
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
    // Cells FILL vertical zodat strokes de volle row-hoogte beslaan.
    try {
      cellFrame.layoutSizingVertical = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }
  return rowFrame;
}
