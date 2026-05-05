// wrappers/TableWrap.ts — TableWrap detector, extractor, and applier (1.11)
//
// Finds the TableWrap INSTANCE within a slide, scans the slot contents into a
// TableWrapModel, and applies a desired model back (full-state PUT).
//
// Detection: name === 'TableWrap' (exact), or variant names starting with
// 'Tabel='/'Table=' without 'Timeline', or 'Property 1=' without 'Timeline'/'Chart'.
//
// Slot detection: FRAME named 'SlotNode', ending in '_slot', ' Slot', or 'Slot'.
// (Figma does not have a first-class SlotNode type in all versions — we detect
// by FRAME + name convention matching the Wave 1 isSlot predicate.)
//
// Scan reads: row FRAMEs named 'TableRow-*' or 'TableHeaderRow', cell FRAMEs
// named 'TableItem-*' or 'TableHeaderItem-*', first TEXT child value.
//
// Apply: full-state PUT — clears slot children, rebuilds container + rows + cells
// using Figma library variables (Text + Text Dimmer) for color binding.
// Width preset stored in pluginData. Font preload before any text write (FIG-FONT-01).
//
// Wave 1 wrapper usage:
//   - loadAllFontsForNode (fonts.ts) — NOT needed here; we load specific fonts
//     by name because we are creating new text nodes (not mutating existing ones).
//   - withAtomic (mutate.ts) — used per ADR-0004: table render produces many
//     node operations that should collapse to one Cmd-Z step.
//
// Variable binding: resolveVariableForConsumer from packages/figma-api/src/variables.ts
// (T28.2 pattern: never hardcode the fallback RGB).
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
// No ChartWrap — ADR-0007.
//
// Owner: figma-api-engineer

import type { TableWrapModel, TableRowModel, TableCellModel } from '@shared/messages';
import { findTableWrap, findTableSlot } from '../slide-machine';
import { withAtomic } from '@figma-plugins/figma-api';
import { resolveVariableForConsumer } from '@figma-plugins/figma-api';

// ---------------------------------------------------------------------------
// Constants (ported from widget-src/constants.ts TABLE_WIDTHS)
// ---------------------------------------------------------------------------

const TABLE_WIDTHS: { sm: number; md: number; lg: number } = {
  sm: 560,
  md: 800,
  lg: 1040,
};

// Fallback RGB values (only used as fallback when resolveForConsumer is unavailable).
// These are the canonical Welder brand values — see ADR-0005.
const TEXT_RGB_FALLBACK: RGB = { r: 1, g: 0.957, b: 0.918 };
const TEXT_DIMMER_RGB_FALLBACK: RGB = { r: 1, g: 0.698, b: 0.4 };

// Welder variable keys — published Slide Machine library (kAZqxj4nxpafYjB5FhfOru).
// Set by loadNamedVariables in main.ts init; accessed via module-level cache.
let cachedTextVar: Variable | null = null;
let cachedDimmerVar: Variable | null = null;

/** Called by main.ts after loadNamedVariables completes to prime this module. */
export function setTableVariables(textVar: Variable | null, dimmerVar: Variable | null): void {
  cachedTextVar = textVar;
  cachedDimmerVar = dimmerVar;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Finds the TableWrap INSTANCE within a slide. */
export function findTableWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findTableWrap(slide);
}

/** Finds the SlotNode (FRAME) within the TableWrap INSTANCE. */
export function findTableSlotNode(slide: InstanceNode): FrameNode | null {
  return findTableSlot(slide);
}

// ---------------------------------------------------------------------------
// Extraction (scan)
// ---------------------------------------------------------------------------

/**
 * Reads the current Slot contents into a TableWrapModel.
 * Row FRAMEs are named 'TableRow-*' or 'TableHeaderRow'.
 * Cell FRAMEs are named 'TableItem-*' or 'TableHeaderItem-*'.
 * pluginData carries 'width', 'hasColumnHeader', 'textSize'.
 */
export function scanTableSlotNode(slot: FrameNode): TableWrapModel {
  const width = readSlotWidth(slot);
  const hasColumnHeader = slot.getPluginData('hasColumnHeader') === '1';
  const textSizeRaw = slot.getPluginData('textSize');
  const textSize: 'sm' | 'md' | 'lg' =
    textSizeRaw === 'sm' || textSizeRaw === 'md' || textSizeRaw === 'lg' ? textSizeRaw : 'md';

  // Rows may be direct slot children (legacy) or inside a WelderTableContent FRAME.
  let rowParent: FrameNode = slot;
  for (let i = 0; i < slot.children.length; i++) {
    const child = slot.children[i]!;
    if (child.type === 'FRAME' && child.name === 'WelderTableContent') {
      rowParent = child as FrameNode;
      break;
    }
  }

  const rows: TableRowModel[] = [];
  for (let i = 0; i < rowParent.children.length; i++) {
    const rowNode = rowParent.children[i]!;
    if (rowNode.type !== 'FRAME') continue;
    if (rowNode.name.indexOf('TableRow') !== 0 && rowNode.name.indexOf('TableHeaderRow') !== 0) {
      continue;
    }
    const rowFrame = rowNode as FrameNode;

    const cells: TableCellModel[] = [];
    for (let j = 0; j < rowFrame.children.length; j++) {
      const cellNode = rowFrame.children[j]!;
      if (cellNode.type !== 'FRAME') continue;
      if (
        cellNode.name.indexOf('TableItem') !== 0 &&
        cellNode.name.indexOf('TableHeaderItem') !== 0
      ) {
        continue;
      }
      const cellFrame = cellNode as FrameNode;
      const textNode = cellFrame.findOne(function (n: SceneNode) {
        return n.type === 'TEXT';
      });
      const value =
        textNode !== null && textNode.type === 'TEXT' ? (textNode as TextNode).characters : '';
      cells.push({ cellNodeId: cellFrame.id, value });
    }
    rows.push({ rowNodeId: rowFrame.id, cells });
  }

  return { slotId: slot.id, width, hasColumnHeader, textSize, rows };
}

function readSlotWidth(slot: FrameNode): 'sm' | 'md' | 'lg' {
  const v = slot.getPluginData('width');
  if (v === 'sm' || v === 'md' || v === 'lg') return v;
  return 'md';
}

// ---------------------------------------------------------------------------
// Mutation (apply-table handler) — full-state PUT
// ---------------------------------------------------------------------------

/**
 * Applies a TableWrapModel to the SlotNode: clears existing children and
 * rebuilds the container, rows, and cells.
 *
 * Uses withAtomic (ADR-0004) so the entire table rebuild collapses to one
 * Cmd-Z step for the user.
 *
 * Color binding follows ADR-0005 / T28.2: resolveVariableForConsumer before
 * setBoundVariableForPaint. Falls back to plain SOLID fills when library
 * variables are unavailable.
 *
 * @figma-direct: figma.createFrame, figma.createText — no wrapper covers
 * node creation; figma.loadFontAsync — no wrapper covers specific named fonts.
 */
export async function applyTableToSlot(slot: FrameNode, desired: TableWrapModel): Promise<void> {
  // FIG-FONT-01: load all fonts we will write before any createText calls.
  // @figma-direct: figma.loadFontAsync — no wrapper covers specific font loads by name.
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);

  // Wrap in a single undo group (ADR-0004).
  await withAtomic('apply-table', async function () {
    // Clear existing slot children.
    const snapshot: SceneNode[] = [];
    for (let i = 0; i < slot.children.length; i++) {
      snapshot.push(slot.children[i]!);
    }
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i]!.remove();
      } catch (_e) {
        // silent — node may already be removed
      }
    }

    const textVar = cachedTextVar;
    const dimmerVar = cachedDimmerVar;

    // Resolve fallback RGBs using T28.2 pattern.
    // resolveVariableForConsumer requires a SceneNode; slot is a FrameNode (SceneNode).
    let textRGB: RGB = TEXT_RGB_FALLBACK;
    let dimmerRGB: RGB = TEXT_DIMMER_RGB_FALLBACK;
    if (textVar !== null) {
      try {
        textRGB = resolveVariableForConsumer(textVar, slot) as RGB;
      } catch (_e) {
        // fallback stays
      }
    }
    if (dimmerVar !== null) {
      try {
        dimmerRGB = resolveVariableForConsumer(dimmerVar, slot) as RGB;
      } catch (_e) {
        // fallback stays
      }
    }

    const desiredWidth = TABLE_WIDTHS[desired.width] ?? TABLE_WIDTHS.md;

    // Build outer container frame.
    const container = buildTableContainer(dimmerVar, dimmerRGB);
    slot.appendChild(container);

    // Resize slot and container to the desired preset width.
    const slotParent = slot.parent;
    if (slotParent !== null && 'resize' in slotParent) {
      try {
        const p = slotParent as FrameNode | InstanceNode;
        p.resize(desiredWidth, p.height);
      } catch (_e) {
        // silent — parent may be locked
      }
    }
    try {
      slot.resize(desiredWidth, slot.height);
    } catch (_e) {
      // silent
    }

    const targetHeight = slot.height > 0 ? slot.height : container.height;
    try {
      container.resize(desiredWidth, targetHeight);
    } catch (_e) {
      // silent
    }
    container.counterAxisSizingMode = 'FIXED';
    container.primaryAxisSizingMode = 'FIXED';

    const hasHeader = desired.hasColumnHeader && desired.rows.length > 0;
    container.paddingTop = hasHeader ? 17 : 24;

    // Filter empty body rows (rows where all cells are '').
    const effectiveRows: TableRowModel[] = [];
    for (let i = 0; i < desired.rows.length; i++) {
      const dRow = desired.rows[i];
      if (dRow === undefined) continue;
      if (hasHeader && i === 0) {
        effectiveRows.push(dRow);
        continue;
      }
      let hasContent = false;
      for (let j = 0; j < dRow.cells.length; j++) {
        const dCell = dRow.cells[j];
        if (dCell !== undefined && dCell.value !== '') {
          hasContent = true;
          break;
        }
      }
      if (hasContent) effectiveRows.push(dRow);
    }

    const HEADER_HEIGHT_ESTIMATE = 50;
    const bodyRowCount = hasHeader ? effectiveRows.length - 1 : effectiveRows.length;
    const adjustedSlotHeight = hasHeader ? slot.height - HEADER_HEIGHT_ESTIMATE : slot.height;
    const sizes = getFontSizes(
      adjustedSlotHeight,
      bodyRowCount > 0 ? bodyRowCount : 1,
      desired.textSize,
    );

    const bodyRows: FrameNode[] = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      const effectiveRow = effectiveRows[i]!;
      let rowFrame: FrameNode;
      if (hasHeader && i === 0) {
        rowFrame = buildHeaderRow(effectiveRow, textVar, dimmerVar, textRGB, dimmerRGB);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          // silent
        }
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
          // silent
        }
      } else {
        const bodyIndex = hasHeader ? i - 1 : i;
        const rowPadding = computeRowPadding(bodyRowCount);
        rowFrame = buildRow(
          effectiveRow,
          bodyIndex,
          sizes,
          textVar,
          dimmerVar,
          textRGB,
          dimmerRGB,
          rowPadding,
        );
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          // silent
        }
        try {
          rowFrame.layoutSizingVertical = 'FILL';
        } catch (_e) {
          // silent
        }
        bodyRows.push(rowFrame);
      }
    }

    applyBodyTruncation(bodyRows);

    // Persist state to pluginData.
    slot.setPluginData('width', desired.width);
    slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
    slot.setPluginData('textSize', desired.textSize);
    slot.setPluginData('kind', 'welder-tablewrap');
    slot.setPluginData('v', '3');
  });
}

// ---------------------------------------------------------------------------
// Font size calculation
// ---------------------------------------------------------------------------

function getFontSizes(
  slotHeight: number,
  rowCount: number,
  textSize: 'sm' | 'md' | 'lg',
): { heading: number; body: number } {
  const safeRowCount = rowCount > 0 ? rowCount : 1;
  let rowHeight = (slotHeight - 48) / safeRowCount;
  if (rowHeight < 16) rowHeight = 16;

  let mult: number;
  let headingMin: number;
  let headingMax: number;
  let bodyMin: number;
  let bodyMax: number;

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

  let heading = Math.round(rowHeight * 0.36 * mult);
  if (heading < headingMin) heading = headingMin;
  if (heading > headingMax) heading = headingMax;

  let body = Math.round(rowHeight * 0.3 * mult);
  if (body < bodyMin) body = bodyMin;
  if (body > bodyMax) body = bodyMax;

  return { heading, body };
}

// ---------------------------------------------------------------------------
// Row padding
// ---------------------------------------------------------------------------

function computeRowPadding(rowCount: number): number {
  if (rowCount <= 3) return 28;
  if (rowCount <= 6) return 20;
  if (rowCount <= 9) return 14;
  return 8;
}

// ---------------------------------------------------------------------------
// Frame builders — @figma-direct (no wrappers cover frame/text creation)
// ---------------------------------------------------------------------------

function buildTableContainer(dimmerVar: Variable | null, dimmerRGB: RGB): FrameNode {
  // @figma-direct: figma.createFrame — no wrapper covers node creation.
  const container = figma.createFrame();
  container.name = 'WelderTableContent';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'FIXED';
  container.counterAxisSizingMode = 'FIXED';
  container.itemSpacing = 0;
  container.paddingTop = 24;
  container.paddingBottom = 24;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.cornerRadius = 55;
  container.clipsContent = true;
  container.fills = [];

  if (dimmerVar !== null) {
    container.strokes = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: dimmerRGB },
        'color',
        dimmerVar,
      ),
    ];
  } else {
    container.strokes = [{ type: 'SOLID', color: dimmerRGB }];
  }
  container.strokeWeight = 2;
  container.strokeAlign = 'INSIDE';
  return container;
}

function buildCell(
  cell: TableCellModel,
  j: number,
  sizes: { heading: number; body: number },
  textVar: Variable | null,
  textRGB: RGB,
): FrameNode {
  // @figma-direct: figma.createFrame, figma.createText.
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
  t.textAlignHorizontal = 'LEFT';

  if (textVar !== null) {
    t.fills = [
      figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
    ];
  } else {
    t.fills = [{ type: 'SOLID', color: textRGB }];
  }

  cellFrame.appendChild(t);
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    // silent
  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {
    // silent
  }
  return cellFrame;
}

function buildHeaderCell(
  cell: TableCellModel,
  j: number,
  textVar: Variable | null,
  textRGB: RGB,
): FrameNode {
  // @figma-direct: figma.createFrame, figma.createText.
  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableHeaderItem-c' + String(j);
  cellFrame.layoutMode = 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisAlignItems = 'MIN';
  cellFrame.counterAxisAlignItems = 'CENTER';
  cellFrame.paddingTop = 14;
  cellFrame.paddingBottom = 24;
  cellFrame.fills = [];

  const t = figma.createText();
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = 18;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  t.textAlignHorizontal = 'LEFT';
  try {
    t.maxLines = 1;
  } catch (_e) {
    // silent — older Figma API
  }
  try {
    t.textTruncation = 'ENDING';
  } catch (_e) {
    // silent
  }

  if (textVar !== null) {
    t.fills = [
      figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
    ];
  } else {
    t.fills = [{ type: 'SOLID', color: textRGB }];
  }

  cellFrame.appendChild(t);
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    // silent
  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {
    // silent
  }
  return cellFrame;
}

function buildRow(
  row: TableRowModel,
  i: number,
  sizes: { heading: number; body: number },
  textVar: Variable | null,
  dimmerVar: Variable | null,
  textRGB: RGB,
  dimmerRGB: RGB,
  rowPadding: number,
): FrameNode {
  // @figma-direct: figma.createFrame.
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = 56;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  rowFrame.paddingLeft = 32;
  rowFrame.paddingRight = 32;
  rowFrame.fills = [];

  if (i > 0 && dimmerVar !== null) {
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
  } else if (i > 0) {
    rowFrame.strokes = [{ type: 'SOLID', color: dimmerRGB }];
    rowFrame.strokeAlign = 'INSIDE';
    rowFrame.strokeTopWeight = 1;
    rowFrame.strokeBottomWeight = 0;
    rowFrame.strokeLeftWeight = 0;
    rowFrame.strokeRightWeight = 0;
  } else {
    rowFrame.strokes = [];
  }

  for (let j = 0; j < row.cells.length; j++) {
    const cellFrame = buildCell(row.cells[j]!, j, sizes, textVar, textRGB);
    rowFrame.appendChild(cellFrame);
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      // silent
    }
    try {
      cellFrame.layoutSizingVertical = 'HUG';
    } catch (_e) {
      // silent
    }
  }
  return rowFrame;
}

function buildHeaderRow(
  row: TableRowModel,
  textVar: Variable | null,
  dimmerVar: Variable | null,
  textRGB: RGB,
  dimmerRGB: RGB,
): FrameNode {
  // @figma-direct: figma.createFrame.
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableHeaderRow';
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  rowFrame.counterAxisAlignItems = 'CENTER';
  rowFrame.itemSpacing = 56;
  rowFrame.paddingTop = 0;
  rowFrame.paddingBottom = 0;
  rowFrame.paddingLeft = 32;
  rowFrame.paddingRight = 32;
  rowFrame.fills = [];

  if (dimmerVar !== null) {
    rowFrame.strokes = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: dimmerRGB },
        'color',
        dimmerVar,
      ),
    ];
  } else {
    rowFrame.strokes = [{ type: 'SOLID', color: dimmerRGB }];
  }
  rowFrame.strokeAlign = 'INSIDE';
  rowFrame.strokeTopWeight = 0;
  rowFrame.strokeBottomWeight = 2;
  rowFrame.strokeLeftWeight = 0;
  rowFrame.strokeRightWeight = 0;

  for (let j = 0; j < row.cells.length; j++) {
    const cellFrame = buildHeaderCell(row.cells[j]!, j, textVar, textRGB);
    rowFrame.appendChild(cellFrame);
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      // silent
    }
    try {
      cellFrame.layoutSizingVertical = 'FILL';
    } catch (_e) {
      // silent
    }
  }
  return rowFrame;
}

function applyBodyTruncation(bodyRows: FrameNode[]): void {
  for (let r = 0; r < bodyRows.length; r++) {
    const row = bodyRows[r]!;
    for (let c = 0; c < row.children.length; c++) {
      const cell = row.children[c]!;
      if (cell.type !== 'FRAME') continue;
      const cellFrame = cell as FrameNode;
      try {
        cellFrame.counterAxisSizingMode = 'FIXED';
      } catch (_e) {
        // silent
      }
      try {
        cellFrame.layoutSizingVertical = 'FILL';
      } catch (_e) {
        // silent
      }
      const textNode = cellFrame.findOne(function (n: SceneNode) {
        return n.type === 'TEXT';
      });
      if (textNode === null || textNode.type !== 'TEXT') continue;
      const t = textNode as TextNode;
      try {
        t.textAutoResize = 'NONE';
      } catch (_e) {
        // silent
      }
      try {
        t.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        // silent
      }
      try {
        t.layoutSizingVertical = 'FILL';
      } catch (_e) {
        // silent
      }
      try {
        t.textTruncation = 'ENDING';
      } catch (_e) {
        // silent
      }
    }
  }
}
