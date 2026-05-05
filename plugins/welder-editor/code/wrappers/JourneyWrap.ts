// wrappers/JourneyWrap.ts — JourneyWrap detector, extractor, and applier (1.11)
//
// Finds the JourneyWrap INSTANCE within a slide, scans the slot into a
// JourneyWrapModel, and applies a desired model back (diff-based PUT).
//
// Detection: name === 'JourneyWrap' (exact match).
//
// Slot detection: FRAME named 'WelderJourneyContent' (direct child of slot).
//
// Scan reads: JourneyItem INSTANCEs or legacy 'JourneyItem-N' FRAMEs within
// WelderJourneyContent. Column headers from 'WelderJourneyHeader' FRAME.
// Positions read from pluginData ('journey-start-pct', 'journey-end-pct').
//
// Apply: diff-based PUT — reuses existing WelderJourneyContent container and
// JourneyItem instances when available. Adds/removes items to match desired.
// Uses withAtomic (ADR-0004) for the rebuild.
//
// JourneyItem component bootstrap: scans currentPage for existing JourneyItem
// INSTANCE to get the component key. Falls back to JOURNEYITEM_KEY_FALLBACK
// (empty in v0.1.0 — requires at least one JourneyItem on the page at runtime).
//
// Wave 1 wrappers:
//   - withAtomic (mutate.ts): collapse multi-node render to one Cmd-Z step.
//   - loadAllFontsForNode (fonts.ts): used before label writes.
//   - trySwapViaInstanceProperty / swapComponentByName (icon-swap.ts): icon swap.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

import type { JourneyWrapModel, JourneyItemModel, JourneyColumnModel } from '@shared/messages';
import { findJourneyWrap, findJourneySlot } from '../slide-machine';
import { withAtomic, loadAllFontsForNode } from '@figma-plugins/figma-api';
import { trySwapViaInstanceProperty, swapComponentByName } from '../icon-swap';

// ---------------------------------------------------------------------------
// Constants (ported from widget-src/constants.ts)
// ---------------------------------------------------------------------------

const JOURNEY_WIDTH = 1600;
const JOURNEY_POS_MIN_PCT = 0;
const JOURNEY_POS_MAX_PCT = 95;
const JOURNEY_POS_MIN_SPAN = 5;
const JOURNEY_CONTAINER_PADDING = 24;
const JOURNEY_DEFAULT_COLUMN_COUNT = 6;
const JOURNEY_DEFAULT_COLUMN: JourneyColumnModel = { header: '', subheader: '' };
const JOURNEY_MAX_COLUMNS = 12;
const JOURNEY_HEADER_HEIGHT = 80;
const JOURNEY_HEADER_FONT_PX = 20;
const JOURNEY_SUBHEADER_FONT_PX = 14;
const JOURNEY_DIVIDER_WEIGHT = 1;
const PILL_HEIGHT = 90;
const PILL_GAP = 12;

// Hardcoded fallback key — update after first bootstrap run (T45.3).
const JOURNEYITEM_KEY_FALLBACK = '';

let cachedJourneyItemKey: string | null = null;
let cachedJourneyItemComp: ComponentNode | null = null;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Finds the JourneyWrap INSTANCE within a slide. */
export function findJourneyWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findJourneyWrap(slide);
}

/** Finds the SlotNode (FrameNode) within the JourneyWrap INSTANCE. */
export function findJourneySlotNode(slide: InstanceNode): FrameNode | null {
  return findJourneySlot(slide);
}

// ---------------------------------------------------------------------------
// Extraction (scan)
// ---------------------------------------------------------------------------

/**
 * Scans a JourneyWrap slot into a JourneyWrapModel.
 * Items are JourneyItem INSTANCEs or legacy 'JourneyItem-N' FRAMEs inside
 * WelderJourneyContent. Positions read from pluginData with fallback cascade.
 */
export function scanJourneySlotNode(slot: FrameNode): JourneyWrapModel {
  const items: JourneyItemModel[] = [];

  // Items may be in WelderJourneyContent or directly in the slot.
  let rowParent: FrameNode = slot;
  for (let ci = 0; ci < slot.children.length; ci++) {
    const child = slot.children[ci]!;
    if (child.type === 'FRAME' && child.name === 'WelderJourneyContent') {
      rowParent = child as FrameNode;
      break;
    }
  }

  for (let i = 0; i < rowParent.children.length; i++) {
    const rowNode = rowParent.children[i]!;
    const isInstance = rowNode.type === 'INSTANCE' && rowNode.name === 'JourneyItem';
    const isLegacyFrame = rowNode.type === 'FRAME' && rowNode.name.indexOf('JourneyItem-') === 0;
    if (!isInstance && !isLegacyFrame) continue;

    const rowFrame = rowNode as InstanceNode | FrameNode;

    let icon = rowFrame.getPluginData('journey-icon');
    if (icon === '') icon = 'star';

    // startPct with fallback cascade.
    let startPct = 0;
    const startPctRaw = rowFrame.getPluginData('journey-start-pct');
    if (startPctRaw !== '') {
      const ps = parseFloat(startPctRaw);
      if (!isNaN(ps)) startPct = ps;
    } else {
      const startColRaw = rowFrame.getPluginData('journey-startCol');
      if (startColRaw !== '') {
        const sc = parseInt(startColRaw, 10);
        if (!isNaN(sc)) startPct = ((sc - 1) / 6) * 100;
      }
    }
    if (startPct < JOURNEY_POS_MIN_PCT) startPct = JOURNEY_POS_MIN_PCT;
    if (startPct > JOURNEY_POS_MAX_PCT) startPct = JOURNEY_POS_MAX_PCT;

    // endPct with fallback.
    let endPct = 0;
    const endPctRaw = rowFrame.getPluginData('journey-end-pct');
    if (endPctRaw !== '') {
      const pe = parseFloat(endPctRaw);
      if (!isNaN(pe)) endPct = pe;
    } else {
      endPct = startPct + 30;
    }
    const minEnd = startPct + JOURNEY_POS_MIN_SPAN;
    if (endPct < minEnd) endPct = minEnd;
    if (endPct > JOURNEY_POS_MAX_PCT) endPct = JOURNEY_POS_MAX_PCT;

    let label = '';
    const textNode = rowFrame.findOne(function (n: SceneNode) {
      return n.type === 'TEXT';
    });
    if (textNode !== null && textNode.type === 'TEXT') {
      label = (textNode as TextNode).characters;
    }

    items.push({
      itemNodeId: rowFrame.id,
      icon,
      label,
      startPct,
      endPct,
    });
  }

  return {
    slotId: slot.id,
    columns: scanJourneyHeaderColumns(slot),
    items,
  };
}

function scanJourneyHeaderColumns(slot: FrameNode): JourneyColumnModel[] {
  let headerFrame: FrameNode | null = null;
  for (let ci = 0; ci < slot.children.length; ci++) {
    const child = slot.children[ci]!;
    if (child.type === 'FRAME' && child.name === 'WelderJourneyHeader') {
      headerFrame = child as FrameNode;
      break;
    }
  }

  if (headerFrame === null) {
    const defaults: JourneyColumnModel[] = [];
    for (let di = 0; di < JOURNEY_DEFAULT_COLUMN_COUNT; di++) {
      defaults.push({
        header: JOURNEY_DEFAULT_COLUMN.header,
        subheader: JOURNEY_DEFAULT_COLUMN.subheader,
      });
    }
    return defaults;
  }

  const columns: JourneyColumnModel[] = [];
  for (let hci = 0; hci < headerFrame.children.length; hci++) {
    const cell = headerFrame.children[hci]!;
    if (cell.type !== 'FRAME') continue;
    if (cell.name.indexOf('JourneyHeaderCell-') !== 0) continue;

    const col: JourneyColumnModel = { header: '', subheader: '' };
    const cellFrame = cell as FrameNode;
    for (let ti = 0; ti < cellFrame.children.length; ti++) {
      const textNode = cellFrame.children[ti]!;
      if (textNode.type !== 'TEXT') continue;
      const tn = textNode as TextNode;
      if (tn.name === 'JourneyHeader-h') col.header = tn.characters;
      else if (tn.name === 'JourneyHeader-sub') col.subheader = tn.characters;
    }
    columns.push(col);
  }

  if (columns.length > JOURNEY_MAX_COLUMNS) return columns.slice(0, JOURNEY_MAX_COLUMNS);
  return columns;
}

// ---------------------------------------------------------------------------
// Mutation (apply-journey handler) — diff-based PUT
// ---------------------------------------------------------------------------

/**
 * Applies a JourneyWrapModel to the SlotNode.
 * Reuses existing WelderJourneyContent container and JourneyItem instances.
 * Uses withAtomic (ADR-0004) for the entire rebuild.
 *
 * @figma-direct: figma.createFrame, comp.createInstance — no wrapper covers
 * node creation. figma.loadFontAsync — no wrapper for specific named fonts.
 */
export async function applyJourneyToSlot(
  slot: FrameNode,
  desired: JourneyWrapModel,
): Promise<void> {
  // Load fonts before any text writes.
  // @figma-direct: figma.loadFontAsync — specific named font load.
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'SemiBold' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
  ]);

  await withAtomic('apply-journey', async function () {
    // Persist markers.
    slot.setPluginData('kind', 'welder-journeywrap');
    slot.setPluginData('v', '7');

    // Resize parent chain and slot.
    const slotParent = slot.parent;
    if (slotParent !== null && 'resize' in slotParent) {
      try {
        const p = slotParent as FrameNode | InstanceNode;
        p.resize(JOURNEY_WIDTH, p.height);
      } catch (_e) {
        // silent
      }
    }
    try {
      slot.resize(JOURNEY_WIDTH, slot.height);
    } catch (_e) {
      // silent
    }

    // Find or create WelderJourneyContent container.
    let container: FrameNode | null = null;
    for (let ci = 0; ci < slot.children.length; ci++) {
      const existingChild = slot.children[ci]!;
      if (existingChild.type === 'FRAME' && existingChild.name === 'WelderJourneyContent') {
        container = existingChild as FrameNode;
        break;
      }
    }
    // Remove other children (legacy / wrong type).
    for (let ci2 = slot.children.length - 1; ci2 >= 0; ci2--) {
      const ch = slot.children[ci2]!;
      if (ch !== container) {
        try {
          ch.remove();
        } catch (_e) {
          // silent
        }
      }
    }

    const hasHeader = desired.columns.length > 0;
    const headerOffset = hasHeader ? JOURNEY_HEADER_HEIGHT : 0;
    const containerH =
      headerOffset +
      JOURNEY_CONTAINER_PADDING * 2 +
      desired.items.length * PILL_HEIGHT +
      (desired.items.length > 1 ? (desired.items.length - 1) * PILL_GAP : 0);
    const safeContainerH =
      containerH > 0 ? containerH : headerOffset + PILL_HEIGHT + JOURNEY_CONTAINER_PADDING * 2;
    const pillYBase = JOURNEY_CONTAINER_PADDING + headerOffset;

    if (container === null) {
      // @figma-direct: figma.createFrame — node creation.
      container = figma.createFrame();
      container.name = 'WelderJourneyContent';
      container.layoutMode = 'NONE';
      container.fills = [];
      container.strokes = [];
      container.clipsContent = false;
    }
    try {
      container.resize(JOURNEY_WIDTH, safeContainerH);
    } catch (_e) {
      // silent
    }

    const contentWidth = JOURNEY_WIDTH - JOURNEY_CONTAINER_PADDING * 2;
    const safeContentWidth = contentWidth > 0 ? contentWidth : JOURNEY_WIDTH;

    // Render column headers.
    await applyJourneyHeader(container, desired.columns, safeContentWidth, safeContainerH);

    // Get or create JourneyItem component.
    const journeyItemComp = await getJourneyItemComponent();

    // Collect existing JourneyItem instances.
    const existingItems: InstanceNode[] = [];
    for (let ei = 0; ei < container.children.length; ei++) {
      const c = container.children[ei]!;
      if (c.type === 'INSTANCE' && c.name === 'JourneyItem') {
        existingItems.push(c as InstanceNode);
      }
    }

    if (journeyItemComp !== null) {
      // Update existing or create new items.
      for (let i = 0; i < desired.items.length; i++) {
        if (i < existingItems.length) {
          await updateJourneyItem(
            existingItems[i]!,
            desired.items[i]!,
            i,
            safeContentWidth,
            pillYBase,
          );
        } else {
          await renderJourneyItem(
            container,
            desired.items[i]!,
            i,
            safeContentWidth,
            journeyItemComp,
            pillYBase,
          );
        }
      }
      // Remove excess items.
      for (let rmI = existingItems.length - 1; rmI >= desired.items.length; rmI--) {
        try {
          existingItems[rmI]!.remove();
        } catch (_e) {
          // silent
        }
      }
    } else {
      // Bootstrap failed — render instructional fallback.
      await renderBootstrapError(slot);
    }

    // Enforce z-order: pills always on top.
    const pillsToFront: SceneNode[] = [];
    for (let pfi = 0; pfi < container.children.length; pfi++) {
      const pfch = container.children[pfi]!;
      if (pfch.type === 'INSTANCE' && pfch.name === 'JourneyItem') {
        pillsToFront.push(pfch);
      }
    }
    for (let pfm = 0; pfm < pillsToFront.length; pfm++) {
      container.appendChild(pillsToFront[pfm] as SceneNode);
    }

    if (container.parent !== slot) {
      slot.appendChild(container);
    }
  });
}

// ---------------------------------------------------------------------------
// Per-item render helpers
// ---------------------------------------------------------------------------

async function renderJourneyItem(
  container: FrameNode,
  item: JourneyItemModel,
  index: number,
  contentWidth: number,
  comp: ComponentNode,
  pillYBase: number,
): Promise<void> {
  const instance = comp.createInstance();
  instance.name = 'JourneyItem';
  container.appendChild(instance);

  positionItem(instance, item, index, contentWidth, pillYBase);

  if (item.icon.length > 0) {
    const nestedIcon = findNestedIconInstance(instance);
    if (nestedIcon !== null) {
      await trySwapViaInstanceProperty(nestedIcon, item.icon);
    }
  }

  const textNode = instance.findOne(function (n: SceneNode) {
    return n.type === 'TEXT';
  });
  if (textNode !== null && textNode.type === 'TEXT') {
    await loadAllFontsForNode(textNode as TextNode);
    (textNode as TextNode).characters = item.label;
    try {
      (textNode as TextNode).maxLines = 1;
    } catch (_e) {
      // silent
    }
    try {
      (textNode as TextNode).textTruncation = 'ENDING';
    } catch (_e) {
      // silent
    }
  }

  persistItemPluginData(instance, item);
}

async function updateJourneyItem(
  instance: InstanceNode,
  item: JourneyItemModel,
  index: number,
  contentWidth: number,
  pillYBase: number,
): Promise<void> {
  positionItem(instance, item, index, contentWidth, pillYBase);

  const prevIcon = instance.getPluginData('journey-icon');
  if (prevIcon !== item.icon && item.icon.length > 0) {
    const nestedIcon = findNestedIconInstance(instance);
    if (nestedIcon !== null) {
      await trySwapViaInstanceProperty(nestedIcon, item.icon);
      if (!(await swapComponentByName(nestedIcon, item.icon))) {
        await trySwapViaInstanceProperty(nestedIcon, item.icon);
      }
    }
  }

  const prevLabel = instance.getPluginData('journey-label');
  if (prevLabel !== item.label) {
    const textNode = instance.findOne(function (n: SceneNode) {
      return n.type === 'TEXT';
    });
    if (textNode !== null && textNode.type === 'TEXT') {
      await loadAllFontsForNode(textNode as TextNode);
      (textNode as TextNode).characters = item.label;
    }
  }

  persistItemPluginData(instance, item);
}

function positionItem(
  instance: InstanceNode,
  item: JourneyItemModel,
  index: number,
  contentWidth: number,
  pillYBase: number,
): void {
  let startPct = item.startPct;
  if (startPct < JOURNEY_POS_MIN_PCT) startPct = JOURNEY_POS_MIN_PCT;
  if (startPct > JOURNEY_POS_MAX_PCT) startPct = JOURNEY_POS_MAX_PCT;

  let endPct = item.endPct;
  const minEnd = startPct + JOURNEY_POS_MIN_SPAN;
  if (endPct < minEnd) endPct = minEnd;
  if (endPct > JOURNEY_POS_MAX_PCT) endPct = JOURNEY_POS_MAX_PCT;

  const pillX = JOURNEY_CONTAINER_PADDING + (startPct / 100) * contentWidth;
  const pillY = pillYBase + index * (PILL_HEIGHT + PILL_GAP);
  const pillW = ((endPct - startPct) / 100) * contentWidth;
  const safeW = pillW > 0 ? pillW : JOURNEY_POS_MIN_SPAN;

  instance.x = pillX;
  instance.y = pillY;
  try {
    instance.resize(safeW, PILL_HEIGHT);
  } catch (_e) {
    // silent — instance may be locked
  }
}

function persistItemPluginData(instance: InstanceNode, item: JourneyItemModel): void {
  instance.setPluginData('journey-icon', item.icon);
  instance.setPluginData('journey-label', item.label);
  instance.setPluginData('journey-start-pct', String(item.startPct));
  instance.setPluginData('journey-end-pct', String(item.endPct));
}

// ---------------------------------------------------------------------------
// Header render
// ---------------------------------------------------------------------------

async function applyJourneyHeader(
  container: FrameNode,
  columns: JourneyColumnModel[],
  contentWidth: number,
  containerH: number,
): Promise<void> {
  // Load fonts.
  // @figma-direct: figma.loadFontAsync.
  await figma.loadFontAsync({ family: 'Inter', style: 'SemiBold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  // Remove existing header frame and dividers.
  for (let i = container.children.length - 1; i >= 0; i--) {
    const ch = container.children[i]!;
    if (
      (ch.type === 'FRAME' && ch.name === 'WelderJourneyHeader') ||
      (ch.type === 'RECTANGLE' && ch.name === 'JourneyDivider')
    ) {
      try {
        ch.remove();
      } catch (_e) {
        // silent
      }
    }
  }

  if (columns.length === 0) return;

  // @figma-direct: figma.createFrame — header frame creation.
  const headerFrame = figma.createFrame();
  headerFrame.name = 'WelderJourneyHeader';
  headerFrame.layoutMode = 'HORIZONTAL';
  headerFrame.primaryAxisSizingMode = 'FIXED';
  headerFrame.counterAxisSizingMode = 'FIXED';
  headerFrame.fills = [];
  headerFrame.strokes = [];
  headerFrame.paddingLeft = JOURNEY_CONTAINER_PADDING;
  headerFrame.paddingRight = JOURNEY_CONTAINER_PADDING;
  headerFrame.x = 0;
  headerFrame.y = 0;
  try {
    headerFrame.resize(JOURNEY_WIDTH, JOURNEY_HEADER_HEIGHT);
  } catch (_e) {
    // silent
  }

  const colWidth = contentWidth / columns.length;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    // @figma-direct: figma.createFrame — cell creation.
    const cellFrame = figma.createFrame();
    cellFrame.name = 'JourneyHeaderCell-' + String(i);
    cellFrame.layoutMode = 'VERTICAL';
    cellFrame.primaryAxisAlignItems = 'CENTER';
    cellFrame.counterAxisAlignItems = 'CENTER';
    cellFrame.primaryAxisSizingMode = 'FIXED';
    cellFrame.counterAxisSizingMode = 'FIXED';
    cellFrame.fills = [];
    cellFrame.strokes = [];
    try {
      cellFrame.resize(colWidth, JOURNEY_HEADER_HEIGHT);
    } catch (_e) {
      // silent
    }

    const tHeader = figma.createText();
    tHeader.name = 'JourneyHeader-h';
    tHeader.fontName = { family: 'Inter', style: 'SemiBold' };
    tHeader.fontSize = JOURNEY_HEADER_FONT_PX;
    tHeader.characters = col.header;
    tHeader.textAlignHorizontal = 'CENTER';
    tHeader.textAutoResize = 'HEIGHT';
    cellFrame.appendChild(tHeader);
    try {
      tHeader.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      // silent
    }

    const tSub = figma.createText();
    tSub.name = 'JourneyHeader-sub';
    tSub.fontName = { family: 'Inter', style: 'Regular' };
    tSub.fontSize = JOURNEY_SUBHEADER_FONT_PX;
    tSub.characters = col.subheader;
    tSub.textAlignHorizontal = 'CENTER';
    tSub.textAutoResize = 'HEIGHT';
    cellFrame.appendChild(tSub);
    try {
      tSub.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      // silent
    }

    headerFrame.appendChild(cellFrame);
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

    // Divider lines between columns.
    if (i < columns.length - 1) {
      // @figma-direct: figma.createRectangle — no wrapper covers shape creation.
      const divider = figma.createRectangle();
      divider.name = 'JourneyDivider';
      divider.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 }, opacity: 0.4 }];
      divider.x = JOURNEY_CONTAINER_PADDING + (i + 1) * colWidth;
      divider.y = 0;
      try {
        divider.resize(JOURNEY_DIVIDER_WEIGHT, containerH);
      } catch (_e) {
        // silent
      }
      container.appendChild(divider);
    }
  }

  container.appendChild(headerFrame);
}

// ---------------------------------------------------------------------------
// Bootstrap error fallback
// ---------------------------------------------------------------------------

async function renderBootstrapError(slot: FrameNode): Promise<void> {
  // @figma-direct: figma.loadFontAsync, figma.createFrame, figma.createText.
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const frame = figma.createFrame();
    frame.name = 'WelderJourneyError';
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.9, b: 0.8 } }];
    const t = figma.createText();
    t.fontName = { family: 'Inter', style: 'Regular' };
    t.fontSize = 14;
    t.characters =
      'JourneyWrap: place one JourneyItem component from the Welder library on this page, then re-apply.';
    t.textAutoResize = 'HEIGHT';
    frame.appendChild(t);
    slot.appendChild(frame);
  } catch (_e) {
    // silent — best-effort only
  }
}

// ---------------------------------------------------------------------------
// JourneyItem component bootstrap
// ---------------------------------------------------------------------------

async function resolveJourneyItemKey(): Promise<string | null> {
  if (cachedJourneyItemKey !== null && cachedJourneyItemKey.length > 0) {
    return cachedJourneyItemKey;
  }

  // @figma-direct: figma.currentPage.findAll — no wrapper for page-level scan.
  const allInstances = figma.currentPage.findAll(function (n: BaseNode) {
    return n.type === 'INSTANCE';
  });

  for (let i = 0; i < allInstances.length; i++) {
    const inst = allInstances[i] as InstanceNode;
    if (inst.name === 'JourneyItem' || inst.name.indexOf('JourneyItem') === 0) {
      let main: ComponentNode | null = null;
      try {
        main = await inst.getMainComponentAsync();
      } catch (_e) {
        continue;
      }
      if (main !== null) {
        cachedJourneyItemKey = main.key;
        return cachedJourneyItemKey;
      }
    }
  }

  if (JOURNEYITEM_KEY_FALLBACK.length > 0) {
    cachedJourneyItemKey = JOURNEYITEM_KEY_FALLBACK;
    return cachedJourneyItemKey;
  }

  console.error(
    '[journey-wrap] bootstrap FAILED: no JourneyItem instance found on current page. ' +
      'Place at least one JourneyItem from the Welder library on this page and re-apply.',
  );
  return null;
}

async function getJourneyItemComponent(): Promise<ComponentNode | null> {
  if (cachedJourneyItemComp !== null) return cachedJourneyItemComp;

  const key = await resolveJourneyItemKey();
  if (key === null) return null;

  let comp: ComponentNode | null = null;
  try {
    comp = await figma.importComponentByKeyAsync(key);
  } catch (_e) {
    cachedJourneyItemKey = null;
    return null;
  }

  cachedJourneyItemComp = comp;
  return comp;
}

// ---------------------------------------------------------------------------
// Nested icon helper
// ---------------------------------------------------------------------------

function findNestedIconInstance(item: InstanceNode): InstanceNode | null {
  if ('children' in item) {
    const children = (item as unknown as ChildrenMixin).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.type === 'INSTANCE') return child as InstanceNode;
    }
  }
  if ('findOne' in item) {
    const nested = item.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE';
    });
    if (nested !== null && nested.type === 'INSTANCE') return nested as InstanceNode;
  }
  return null;
}
