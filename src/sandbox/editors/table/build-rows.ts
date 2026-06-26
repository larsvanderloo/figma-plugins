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
import { buildDeltaBadgeNode } from '../_shared/delta-badge-node';
import type { TableLayoutMetrics } from './metrics';

/** Naam van de waarde-TEXT binnen een cell-FRAME (scan + truncation pakken deze). */
export const CELL_VALUE_NAME = 'CellValue';

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
  badgeTemplate: InstanceNode | null,
): FrameNode {
  const deltaLabel = tableDeltaDisplay(cell.delta);

  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableItem-c' + String(j);
  // Delta-cellen stapelen waarde + badge verticaal; gewone cellen blijven
  // horizontaal (één TEXT die de breedte FILLt).
  cellFrame.layoutMode = deltaLabel !== null ? 'VERTICAL' : 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = deltaLabel !== null ? 'FIXED' : 'AUTO';
  cellFrame.primaryAxisSizingMode = deltaLabel !== null ? 'AUTO' : 'FIXED';
  if (deltaLabel !== null) {
    cellFrame.itemSpacing = 2;
    cellFrame.counterAxisAlignItems = rightAlign ? 'MAX' : 'MIN';
  }
  cellFrame.fills = [];
  cellFrame.setPluginData('emphasis', cell.emphasis === true ? '1' : '');
  cellFrame.setPluginData('delta', deltaLabel !== null ? deltaLabel : '');

  const isEmphasis = cell.emphasis === true;
  const fontName: FontName = isEmphasis
    ? { family: 'Instrument Sans', style: 'SemiBold' }
    : { family: 'Inter', style: 'Regular' };

  const t = figma.createText();
  t.name = CELL_VALUE_NAME;
  t.fontName = fontName;
  t.fontSize = isEmphasis ? sizes.heading : sizes.body;
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

  if (deltaLabel !== null) {
    // Styled Badge-clone (zelfde component als de chart delta-badge), met
    // tekst-fallback wanneer de slide geen Badge-template heeft. De node
    // meet zichzelf (HUG); de cel-counterAxisAlignItems verzorgt links/rechts.
    const d = buildDeltaBadgeNode({
      template: badgeTemplate,
      label: deltaLabel,
      index: j,
      labelSize: sizes.body,
      dimmerVar: dimmerVar,
      dimmerRGB: dimmerRGB,
    });
    cellFrame.appendChild(d);
    if ('layoutSizingVertical' in d) {
      try {
        (d as InstanceNode | TextNode).layoutSizingVertical = 'HUG';
      } catch (_e) {
        /* silent */
      }
    }
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
  badgeTemplate: InstanceNode | null,
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  // Cellen top-aligned: in een rij met ongelijk-hoge (wrappende) cellen blijft
  // de tekst aan de bovenkant uitgelijnd i.p.v. verticaal gecentreerd.
  rowFrame.counterAxisAlignItems = 'MIN';
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
    const cellFrame = buildCell(
      row.cells[j],
      j,
      sizes,
      textVar,
      textRGB,
      dimmerVar,
      dimmerRGB,
      rightAlign,
      badgeTemplate,
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
