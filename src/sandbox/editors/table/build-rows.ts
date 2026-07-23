import type { TableRowModel, TableCellModel } from '../../../shared/types';
import { tableDeltaDisplay } from '../../../shared/table-delta';
import { parseBullets } from '../../../shared/table-bullets';
import { buildDeltaBadgeNode } from '../_shared/delta-badge-node';
import type { DeltaBadgeOptions } from '../_shared/delta-badge-node';
import type { TableLayoutMetrics } from './metrics';

/** Name of the value TEXT inside a cell frame — scan and the fast-path update find it by this name. */
export const CELL_VALUE_NAME = 'CellValue';

// Embedded Lucide SVGs: the big SVG map is UI-only, not in the sandbox bundle.
// stroke="black" is a placeholder — after createNodeFromSvg the vectors are
// rebound to the `Text` variable so the icon follows the theme.
const CHECK_SVG_ON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
const CHECK_SVG_OFF =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';

/**
 * Null on SVG failure: the cell then renders without a check — never fail
 * the build on a cosmetic element.
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
  } catch (_e) {  }
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
 * Shared by the full build and the in-place fast-path update (apply-text).
 * Clears prior list styling first so a bullet→plain edit leaves no stale bullets.
 */
export function applyCellText(t: TextNode, value: string): void {
  const parsed = parseBullets(value);
  t.characters = parsed.text;
  if (t.characters.length === 0) return;
  try {
    t.setRangeListOptions(0, t.characters.length, { type: 'NONE' });
  } catch (_e) {  }
  if (parsed.ranges.length > 0) {
    try {
      t.paragraphSpacing = 0;
    } catch (_e) {    }
    for (let r = 0; r < parsed.ranges.length; r++) {
      try {
        t.setRangeListOptions(parsed.ranges[r].start, parsed.ranges[r].end, { type: 'UNORDERED' });
      } catch (_e) {
        /* older Figma API without list support */
      }
      try {
        t.setRangeListSpacing(parsed.ranges[r].start, parsed.ranges[r].end, 0);
      } catch (_e) {      }
    }
  }
}

/**
 * Emphasis is per-cell opt-in; columns never get automatic styling. Delta,
 * check, and badge round-trip verbatim through pluginData for the scan.
 * Caller must set layoutSizing FILL/HUG AFTER appendChild — the setters
 * throw before the node sits in an auto-layout parent.
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
  cellWidth: number | null,
): FrameNode {
  const deltaLabel = tableDeltaDisplay(cell.delta);
  const badgeLabel =
    typeof cell.badge === 'string' && cell.badge.trim() !== '' ? cell.badge.trim() : null;
  const hasCheck = cell.check === true || cell.check === false;
  // Only the delta stacks vertically (chip under the value); check and
  // number badge sit inline in the value row.
  const stacked = deltaLabel !== null;
  const valueSize = cell.emphasis === true ? sizes.heading : sizes.body;

  const cellFrame = figma.createFrame();
  cellFrame.name = 'TableItem-c' + String(j);
  cellFrame.layoutMode = stacked ? 'VERTICAL' : 'HORIZONTAL';
  cellFrame.counterAxisSizingMode = stacked ? 'FIXED' : 'AUTO';
  cellFrame.primaryAxisSizingMode = stacked ? 'AUTO' : 'FIXED';
  if (stacked) {
    // The cap-trimmed value box ends at the baseline, so descenders (~0.25em)
    // hang below it into the stack gap; scale the gap so g/p/j miss the badge.
    cellFrame.itemSpacing = 2 + Math.round(valueSize * 0.25);
    cellFrame.counterAxisAlignItems = rightAlign ? 'MAX' : 'MIN';
  } else if (hasCheck || badgeLabel !== null) {
    cellFrame.itemSpacing = Math.round(valueSize * 0.35);
    cellFrame.counterAxisAlignItems = 'CENTER';
  }
  cellFrame.fills = [];
  // createFrame clips by default and the cell hugs its text box exactly,
  // which cut off leadingTrim descenders. Overflow guarding is deliberately
  // container-level (container.clipsContent).
  cellFrame.clipsContent = false;
  cellFrame.setPluginData('emphasis', cell.emphasis === true ? '1' : '');
  cellFrame.setPluginData('delta', deltaLabel !== null ? deltaLabel : '');
  // '' = no check, '1' = checked, '0' = unchecked — the scan reads these back verbatim.
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
  // CAP_HEIGHT trim centers the visual text mass: with normal leading the
  // descent below the baseline makes a geometrically centered box look pushed
  // up. Descenders hang outside the box; cell and row no longer clip.
  try {
    t.leadingTrim = 'CAP_HEIGHT';
  } catch (_e) {
    /* older Figma API without leadingTrim */
  }
  applyCellText(t, cell.value);
  t.textAutoResize = 'HEIGHT';
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // Deliberately no maxLines/textTruncation: truncation forced ellipsised
  // single lines where wrapping read better; the container clip guards overflow.
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
  ];

  // In a stacked cell the [check][text][badge] line gets its own CellValueRow
  // wrapper; scan and fast-path find CellValue via recursive findOne, so the
  // extra wrapper is safe.
  const checkIcon = hasCheck
    ? buildCheckIcon(cell.check === true, Math.round(valueSize), textVar, textRGB)
    : null;
  let badgeNode: SceneNode | null = null;
  if (badgeLabel !== null) {
    // Same Badge clone as the delta chip, just with a free label and no arrow.
    const numOpts: DeltaBadgeOptions = {
      template: badgeTemplate,
      label: badgeLabel,
      index: j,
      labelSize: sizes.body,
      dimmerVar: dimmerVar,
      dimmerRGB: dimmerRGB,
    };
    if (cellWidth !== null && cellWidth > 0) numOpts.maxW = cellWidth;
    badgeNode = buildDeltaBadgeNode(numOpts);
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
    valueRow.itemSpacing = Math.round(valueSize * 0.35);
    valueRow.fills = [];
    valueRow.clipsContent = false;
    cellFrame.appendChild(valueRow);
    try {
      valueRow.layoutSizingHorizontal = 'FILL';
    } catch (_e) {    }
    valueHost = valueRow;
  }
  if (checkIcon !== null) valueHost.appendChild(checkIcon);
  valueHost.appendChild(t);
  if (badgeNode !== null) {
    valueHost.appendChild(badgeNode);
    if ('layoutSizingVertical' in badgeNode) {
      try {
        (badgeNode as InstanceNode | TextNode).layoutSizingVertical = 'HUG';
      } catch (_e) {      }
    }
  }
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {  }

  if (deltaLabel !== null) {
    // maxW = column width: the cell no longer clips, so an over-wide badge
    // would paint over the neighbour column; with a budget the badge node
    // degrades to truncated text itself.
    const badgeOpts: DeltaBadgeOptions = {
      template: badgeTemplate,
      label: deltaLabel,
      index: j,
      labelSize: sizes.body,
      dimmerVar: dimmerVar,
      dimmerRGB: dimmerRGB,
    };
    if (cellWidth !== null && cellWidth > 0) badgeOpts.maxW = cellWidth;
    const d = buildDeltaBadgeNode(badgeOpts);
    cellFrame.appendChild(d);
    if ('layoutSizingVertical' in d) {
      try {
        (d as InstanceNode | TextNode).layoutSizingVertical = 'HUG';
      } catch (_e) {      }
    }
  }
  return cellFrame;
}

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
  colWidths: readonly number[],
): FrameNode {
  const rowFrame = figma.createFrame();
  rowFrame.name = 'TableRow-' + String(i);
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.primaryAxisAlignItems = 'MIN';
  // No clip: leadingTrim descenders hang into the row padding; the container
  // guards table overflow.
  rowFrame.clipsContent = false;
  // Top-align cells so wrapping neighbours keep their cap tops flush (the
  // cap-height trim lines them up exactly).
  rowFrame.counterAxisAlignItems = 'MIN';
  rowFrame.itemSpacing = metrics.rowGap;
  rowFrame.paddingTop = rowPadding;
  rowFrame.paddingBottom = rowPadding;
  // Horizontal padding sits on the row, not the container, so top dividers
  // span the full container width.
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
    // Column width doubles as the badge width budget (see buildCell).
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
      badgeTemplate,
      cellWidth,
    );
    rowFrame.appendChild(cellFrame);
    // Must run after appendChild — layoutSizing throws outside an auto-layout parent.
    try {
      cellFrame.layoutSizingHorizontal = 'FILL';
    } catch (_e) {    }
    try {
      cellFrame.layoutSizingVertical = 'HUG';
    } catch (_e) {    }
  }
  return rowFrame;
}

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
  // Padding lives on the cell so FILL-vertical cells keep the row's
  // bottom divider intact.
  cellFrame.counterAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisSizingMode = 'FIXED';
  cellFrame.primaryAxisAlignItems = 'MIN';
  cellFrame.counterAxisAlignItems = 'CENTER';
  // Deliberately asymmetric: header text sits slightly toward the top.
  cellFrame.paddingTop = metrics.headerPadTop;
  cellFrame.paddingBottom = metrics.headerPadBottom;
  cellFrame.fills = [];
  // No clip: leadingTrim descenders hang outside the text box (see buildCell).
  cellFrame.clipsContent = false;
  cellFrame.setPluginData('emphasis', '');

  const t = figma.createText();
  t.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
  // body × 1.1, capped — deliberately NOT sizes.heading: the emphasis size
  // pushed the header row to two lines.
  var headerSize = Math.round(sizes.body * 1.1);
  if (headerSize > 24) headerSize = 24;
  if (headerSize < 14) headerSize = 14;
  t.fontSize = headerSize;
  t.characters = cell.value;
  t.textAutoResize = 'HEIGHT';
  // Cap-height trim for optical centering (see buildCell).
  try {
    t.leadingTrim = 'CAP_HEIGHT';
  } catch (_e) {
    /* older Figma API without leadingTrim */
  }
  t.textAlignHorizontal = rightAlign ? 'RIGHT' : 'LEFT';
  // Headers wrap rather than truncate: maxLines=1 + ellipsis chopped titles in
  // narrow 6-column tables, and the row hugs a two-line header fine.
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: textRGB }, 'color', textVar),
  ];

  cellFrame.appendChild(t);
  try {
    t.layoutSizingHorizontal = 'FILL';
  } catch (_e) {  }
  try {
    t.layoutSizingVertical = 'HUG';
  } catch (_e) {  }
  return cellFrame;
}

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
  // No clip: leadingTrim descenders hang outside the text box (see buildRow).
  rowFrame.clipsContent = false;
  rowFrame.itemSpacing = metrics.rowGap;
  // Vertical padding lives on the cells so they can FILL and reach the
  // row's bottom divider.
  rowFrame.paddingTop = 0;
  rowFrame.paddingBottom = 0;
  // Horizontal padding sits on the row so the bottom divider spans the full
  // container width.
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
    } catch (_e) {    }
    // FILL vertical so cell strokes span the full row height.
    try {
      cellFrame.layoutSizingVertical = 'FILL';
    } catch (_e) {    }
  }
  return rowFrame;
}
