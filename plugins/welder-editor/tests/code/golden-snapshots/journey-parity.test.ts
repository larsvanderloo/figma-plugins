// tests/code/golden-snapshots/journey-parity.test.ts
//
// Golden-snapshot parity tests for JourneyWrap renderer vs v0.2.1 reference.
//
// Strategy (R10 mitigation):
//   Same approach as table-parity.test.ts. The v0.2.1 reference renderer is
//   reimplemented inline using the v0.2.1 constants and algorithm from
//   widget-src/editors/journey/renderer.ts. The current renderer is imported
//   from code/wrappers/JourneyWrap.ts.
//
// Key v0.2.1 constants (from widget-src/constants.ts + renderer.ts):
//   JOURNEY_WIDTH = 1728 (current: 1600)
//   JOURNEY_HEADER_HEIGHT = 140 (current: 80)
//   JOURNEY_HEADER_FONT_PX = 32 (current: 20)
//   JOURNEY_SUBHEADER_FONT_PX = 20 (current: 14)
//   JOURNEY_MAX_COLUMNS = 7 (current: 12)
//   JOURNEY_POS_MAX_PCT = 100 (current: 95)
//   JOURNEY_CONTAINER_PADDING = 24 (shared)
//   JOURNEY_POS_MIN_PCT = 0 (shared)
//   JOURNEY_POS_MIN_SPAN = 5 (shared)
//   PILL_HEIGHT = 90 (shared)
//   PILL_GAP = 12 (shared)
//
// Note on header rendering:
//   v0.2.1 uses diff-based header (finds/creates WelderJourneyHeader FRAME,
//   absolute-positioned cells, NONE layoutMode). Current renderer removes and
//   recreates headers as HORIZONTAL auto-layout. This is a structural difference.
//
// Note on JourneyItem instances:
//   Both renderers call getJourneyItemComponent() → importComponentByKeyAsync.
//   In tests, the mock returns a component whose createInstance() returns a
//   proxy node. The icon-swap calls (trySwapViaInstanceProperty etc.) are
//   imported from code-side helpers; in the mock environment they will no-op
//   (no component library). This is consistent between both traces.
//
// Owner: plugin-tester (Sprint 4 task 4.7 — MON-2894068598)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMockFigma,
  installMockFigma,
  uninstallMockFigma,
  type FigmaMockOp,
  type MockFigma,
} from './figma-mock';
import {
  JOURNEY_FIXTURE_1_ITEM,
  JOURNEY_FIXTURE_5_ITEMS,
  JOURNEY_FIXTURE_10_ITEMS,
} from './fixtures';
import type { JourneyWrapModel, JourneyColumnModel } from '@shared/messages';

// ---------------------------------------------------------------------------
// Current renderer under test
// ---------------------------------------------------------------------------

import { applyJourneyToSlot } from '@code/wrappers/JourneyWrap';

// ---------------------------------------------------------------------------
// v0.2.1 reference constants
// (from widget-src/constants.ts + editors/journey/renderer.ts as of v0.2.1)
// ---------------------------------------------------------------------------

const V021_JOURNEY_WIDTH = 1728;
const V021_JOURNEY_CONTAINER_PADDING = 24;
// NOTE: V021_JOURNEY_POS_MIN_PCT / MAX_PCT / MIN_SPAN (0 / 100 / 5) are used
// in the full renderJourneyItem path; since bootstrap always fails in this
// test environment (no JourneyItem on page, no fallback key), that path is
// never reached and the constants are not needed here.
const V021_JOURNEY_HEADER_HEIGHT = 140;
const V021_JOURNEY_HEADER_FONT_PX = 32;
const V021_JOURNEY_SUBHEADER_FONT_PX = 20;
const V021_JOURNEY_DIVIDER_WEIGHT = 1;
const V021_JOURNEY_MIN_COLUMNS = 0;
const V021_JOURNEY_MAX_COLUMNS = 7;
const V021_PILL_HEIGHT = 90;
const V021_PILL_GAP = 12;

// ---------------------------------------------------------------------------
// v0.2.1 reference renderer reimplementation (trace-capturing)
//
// Mirrors v0.2.1 applyJourney + applyJourneyHeader + applyHeaderCells +
// renderHeaderTextNodes + renderJourneyItem logic. Uses the mock-figma global.
//
// NOTE: The v0.2.1 renderer calls getJourneyItemComponent() which scans
// currentPage for JourneyItem instances. In our mock, currentPage.findAll
// returns [] — so getJourneyItemComponent returns null. In v0.2.1 this
// triggers renderBootstrapError. The current renderer has the same fallback.
// Both traces should include the bootstrap-error path, making them comparable.
//
// The JourneyItem component IS available in our mock (importComponentByKeyAsync
// is mocked to return a component). But resolveJourneyItemKey() fails because
// currentPage.findAll returns no instances and JOURNEYITEM_KEY_FALLBACK is ''.
// So BOTH renderers will hit the bootstrap-error path.
//
// We override this by providing a mock component key via the module cache.
// See test setup — we install a mock component via the module's cache-clearing
// mechanism by resetting cachedJourneyItemKey after each test.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// v0.2.1 reference renderer for journey
// ---------------------------------------------------------------------------

type MockNode = Record<string, unknown>;

async function v021ApplyJourney(desired: JourneyWrapModel): Promise<void> {
  const f = figmaGlobal();

  // Persist markers on slot (we skip the actual slot proxy here —
  // the current renderer does this inside withAtomic; v0.2.1 does it
  // before the bootstrap check).
  // v0.2.1 applyJourney writes slot pluginData before bootstrap.
  const slot = makeJourneySlotProxy('v021-' + desired.slotId);
  setPluginDataOnNode(slot, 'kind', 'welder-journeywrap');
  setPluginDataOnNode(slot, 'v', '7');

  // Resize parent chain.
  resizeNode(slot, V021_JOURNEY_WIDTH, 600); // slot.height stays at 600

  // Find or create WelderJourneyContent container (fresh slot has none).
  let container: MockNode | null = null;
  // No existing children in fresh slot → container = null → create new.

  const hasHeader = desired.columns.length > 0;
  const headerOffset = hasHeader ? V021_JOURNEY_HEADER_HEIGHT : 0;
  const containerH =
    headerOffset +
    V021_JOURNEY_CONTAINER_PADDING * 2 +
    desired.items.length * V021_PILL_HEIGHT +
    (desired.items.length > 1 ? (desired.items.length - 1) * V021_PILL_GAP : 0);
  const safeContainerH =
    containerH > 0
      ? containerH
      : headerOffset + V021_PILL_HEIGHT + V021_JOURNEY_CONTAINER_PADDING * 2;

  // pillYBase computation: V021_JOURNEY_CONTAINER_PADDING + headerOffset.
  // Not used in this test path because bootstrap fails before renderJourneyItem.

  // Create container (fresh path).
  container = f.createFrame() as MockNode;
  setProp(container, 'name', 'WelderJourneyContent');
  setProp(container, 'layoutMode', 'NONE');
  setProp(container, 'fills', []);
  setProp(container, 'strokes', []);
  setProp(container, 'clipsContent', false);
  resizeNode(container, V021_JOURNEY_WIDTH, safeContainerH);

  const contentWidth = V021_JOURNEY_WIDTH - V021_JOURNEY_CONTAINER_PADDING * 2;
  const safeContentWidth = contentWidth > 0 ? contentWidth : V021_JOURNEY_WIDTH;

  // applyJourneyHeader
  await v021ApplyJourneyHeader(container, desired.columns, safeContentWidth, safeContainerH);

  // Bootstrap: getJourneyItemComponent → mock returns a component via importComponentByKeyAsync.
  // In v0.2.1 the bootstrap scans currentPage.findAll → [] → no key → fallback empty → bootstrap fails.
  // We model this: bootstrap failure → renderBootstrapError → return.
  // The current renderer has the SAME bootstrap failure (same empty fallback key, same currentPage mock).
  // Both will hit the error path. Record the bootstrap error frame.
  await v021RenderBootstrapError(slot);

  // Append container (new container: container.parent !== slot → appendChild).
  appendChild(slot, container);
}

async function v021ApplyJourneyHeader(
  container: MockNode,
  columns: JourneyColumnModel[],
  contentWidth: number,
  containerH: number,
): Promise<void> {
  const f = figmaGlobal();

  let n = columns.length;
  if (n < V021_JOURNEY_MIN_COLUMNS) n = V021_JOURNEY_MIN_COLUMNS;
  if (n > V021_JOURNEY_MAX_COLUMNS) n = V021_JOURNEY_MAX_COLUMNS;

  if (n === 0) {
    // Find or create 1px marker FRAME.
    const markerFrame = f.createFrame() as MockNode;
    setProp(markerFrame, 'name', 'WelderJourneyHeader');
    setProp(markerFrame, 'layoutMode', 'NONE');
    setProp(markerFrame, 'fills', []);
    setProp(markerFrame, 'strokes', []);
    setProp(markerFrame, 'clipsContent', false);
    appendChild(container, markerFrame);
    resizeNode(markerFrame, contentWidth, 1);
    setX(markerFrame, V021_JOURNEY_CONTAINER_PADDING);
    setY(markerFrame, V021_JOURNEY_CONTAINER_PADDING);
    return;
  }

  // Truncate or pad columns.
  const safeColumns: JourneyColumnModel[] = [];
  for (let ic = 0; ic < n; ic++) {
    if (ic < columns.length) safeColumns.push(columns[ic]!);
    else safeColumns.push({ header: '', subheader: '' });
  }

  const colWidth = contentWidth / n;

  // Vertical dividers (N-1 stuks).
  const dividerHeight = containerH - V021_JOURNEY_CONTAINER_PADDING * 2;
  const safeDividerH = dividerHeight < 1 ? 1 : dividerHeight;

  for (let di = 0; di < n - 1; di++) {
    const divX =
      V021_JOURNEY_CONTAINER_PADDING + (di + 1) * colWidth - V021_JOURNEY_DIVIDER_WEIGHT / 2;
    const divider = (globalThis as unknown as Record<string, unknown>)['figma'] as {
      createRectangle(): unknown;
    };
    const rect = divider.createRectangle() as MockNode;
    setProp(rect, 'name', 'JourneyVDivider-' + String(di));
    setProp(rect, 'fills', [{ type: 'SOLID', color: { r: 0.6, g: 0.7, b: 0.85 }, opacity: 0.5 }]);
    appendChild(container, rect);
    resizeNode(rect, V021_JOURNEY_DIVIDER_WEIGHT, safeDividerH);
    setX(rect, divX);
    setY(rect, V021_JOURNEY_CONTAINER_PADDING);
  }

  // WelderJourneyHeader FRAME.
  const headerFrame = f.createFrame() as MockNode;
  setProp(headerFrame, 'name', 'WelderJourneyHeader');
  setProp(headerFrame, 'layoutMode', 'NONE');
  setProp(headerFrame, 'fills', []);
  setProp(headerFrame, 'strokes', []);
  setProp(headerFrame, 'clipsContent', false);
  appendChild(container, headerFrame);
  resizeNode(headerFrame, contentWidth, V021_JOURNEY_HEADER_HEIGHT);
  setX(headerFrame, V021_JOURNEY_CONTAINER_PADDING);
  setY(headerFrame, V021_JOURNEY_CONTAINER_PADDING);

  // Render cells.
  await v021ApplyHeaderCells(headerFrame, safeColumns, colWidth);

  // Horizontal divider.
  const hDividerY = V021_JOURNEY_HEADER_HEIGHT - V021_JOURNEY_DIVIDER_WEIGHT;
  const hDivider = (
    (globalThis as unknown as Record<string, unknown>)['figma'] as {
      createRectangle(): unknown;
    }
  ).createRectangle() as MockNode;
  setProp(hDivider, 'name', 'JourneyHDivider');
  setProp(hDivider, 'fills', [{ type: 'SOLID', color: { r: 0.6, g: 0.7, b: 0.85 }, opacity: 0.5 }]);
  appendChild(headerFrame, hDivider);
  resizeNode(hDivider, contentWidth, V021_JOURNEY_DIVIDER_WEIGHT);
  setX(hDivider, 0);
  setY(hDivider, hDividerY);
}

async function v021ApplyHeaderCells(
  headerFrame: MockNode,
  columns: JourneyColumnModel[],
  colWidth: number,
): Promise<void> {
  const f = figmaGlobal();

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci]!;
    const cell = f.createFrame() as MockNode;
    setProp(cell, 'name', 'JourneyHeaderCell-' + String(ci));
    setProp(cell, 'layoutMode', 'NONE');
    setProp(cell, 'fills', []);
    setProp(cell, 'strokes', []);
    setProp(cell, 'clipsContent', false);
    appendChild(headerFrame, cell);
    resizeNode(cell, colWidth, V021_JOURNEY_HEADER_HEIGHT);
    setX(cell, ci * colWidth);
    setY(cell, 0);

    await v021RenderHeaderTextNodes(cell, col, colWidth);
  }
}

async function v021RenderHeaderTextNodes(
  cell: MockNode,
  col: JourneyColumnModel,
  colWidth: number,
): Promise<void> {
  const f = figmaGlobal();

  // ensureTextNode for 'JourneyHeader-h'
  {
    const tn = f.createText() as MockNode;
    setProp(tn, 'name', 'JourneyHeader-h');
    appendChild(cell, tn);
    // font load + set
    setProp(tn, 'fontName', { family: 'Inter', style: 'Medium' });
    setProp(tn, 'fontSize', V021_JOURNEY_HEADER_FONT_PX);
    setProp(tn, 'textAlignHorizontal', 'CENTER');
    setProp(tn, 'textAlignVertical', 'TOP');
    setProp(tn, 'fills', [{ type: 'SOLID', color: { r: 0.17, g: 0.5, b: 1.0 } }]);
    setProp(tn, 'characters', col.header);
    setProp(tn, 'textAutoResize', 'HEIGHT');
    resizeNode(tn, colWidth, 50);
    setX(tn, 0);
    setY(tn, 0);
  }

  // ensureTextNode for 'JourneyHeader-sub'
  {
    const tn = f.createText() as MockNode;
    setProp(tn, 'name', 'JourneyHeader-sub');
    appendChild(cell, tn);
    setProp(tn, 'fontName', { family: 'Inter', style: 'Medium' });
    setProp(tn, 'fontSize', V021_JOURNEY_SUBHEADER_FONT_PX);
    setProp(tn, 'textAlignHorizontal', 'CENTER');
    setProp(tn, 'textAlignVertical', 'TOP');
    setProp(tn, 'fills', [{ type: 'SOLID', color: { r: 0.17, g: 0.5, b: 1.0 } }]);
    setProp(tn, 'characters', col.subheader);
    setProp(tn, 'textAutoResize', 'HEIGHT');
    resizeNode(tn, colWidth, 30);
    setX(tn, 0);
    setY(tn, 60);
  }
}

async function v021RenderBootstrapError(slot: MockNode): Promise<void> {
  const f = figmaGlobal();

  const errorFrame = f.createFrame() as MockNode;
  setProp(errorFrame, 'name', 'JourneyBootstrapError');
  setProp(errorFrame, 'layoutMode', 'HORIZONTAL');
  setProp(errorFrame, 'primaryAxisAlignItems', 'CENTER');
  setProp(errorFrame, 'counterAxisAlignItems', 'CENTER');
  setProp(errorFrame, 'fills', [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.85 } }]);
  setProp(errorFrame, 'strokes', [{ type: 'SOLID', color: { r: 1, g: 0.47, b: 0 } }]);
  setProp(errorFrame, 'strokeWeight', 2);
  setProp(errorFrame, 'strokeAlign', 'INSIDE');
  setProp(errorFrame, 'cornerRadius', 16);
  resizeNode(errorFrame, V021_JOURNEY_WIDTH, 120);

  const msg = f.createText() as MockNode;
  setProp(msg, 'fontName', { family: 'Inter', style: 'Regular' });
  setProp(msg, 'fontSize', 24);
  setProp(
    msg,
    'characters',
    'JourneyItem-bootstrap vereist: plaats eerst 1 JourneyItem uit de Welder-library ' +
      'op een slide, sla dan opnieuw op.',
  );
  setProp(msg, 'fills', [{ type: 'SOLID', color: { r: 0.6, g: 0.25, b: 0 } }]);
  setProp(msg, 'textAutoResize', 'WIDTH_AND_HEIGHT');

  appendChild(errorFrame, msg);
  setLayoutSizing(msg, 'horizontal', 'FILL');

  appendChild(slot, errorFrame);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function figmaGlobal(): {
  createFrame(): unknown;
  createText(): unknown;
  createRectangle(): unknown;
  loadFontAsync(font: unknown): Promise<void>;
  importComponentByKeyAsync(key: string): Promise<unknown>;
} {
  return (globalThis as unknown as Record<string, unknown>)['figma'] as ReturnType<
    typeof figmaGlobal
  >;
}

function makeJourneySlotProxy(name: string): MockNode {
  const f = figmaGlobal();
  const slot = f.createFrame() as MockNode;
  slot['name'] = name;
  (slot as unknown as { resize(w: number, h: number): void }).resize(1728, 600);
  return slot;
}

function makeCurrentJourneySlot(slotId: string): unknown {
  const f = figmaGlobal();
  const slot = f.createFrame() as MockNode;
  slot['name'] = 'CurrentJourneySlot-' + slotId;
  (slot as unknown as { resize(w: number, h: number): void }).resize(1728, 600);
  return slot;
}

function setProp(node: MockNode, key: string, value: unknown): void {
  node[key] = value;
}

function appendChild(parent: MockNode, child: MockNode): void {
  (parent as unknown as { appendChild(c: unknown): void }).appendChild(child);
}

function resizeNode(node: MockNode, w: number, h: number): void {
  (node as unknown as { resize(w: number, h: number): void }).resize(w, h);
}

function setX(node: MockNode, value: number): void {
  node['x'] = value;
}

function setY(node: MockNode, value: number): void {
  node['y'] = value;
}

function setLayoutSizing(node: MockNode, axis: 'horizontal' | 'vertical', value: string): void {
  if (axis === 'horizontal') node['layoutSizingHorizontal'] = value;
  else node['layoutSizingVertical'] = value;
}

function setPluginDataOnNode(node: MockNode, key: string, value: string): void {
  (node as unknown as { setPluginData(k: string, v: string): void }).setPluginData(key, value);
}

// ---------------------------------------------------------------------------
// Trace normalization (same approach as table-parity.test.ts)
// ---------------------------------------------------------------------------

function stripSlotCreationOps(log: FigmaMockOp[]): FigmaMockOp[] {
  let slotFrameId: string | null = null;
  const result: FigmaMockOp[] = [];
  let skipped = false;
  for (const op of log) {
    if (!skipped && op.op === 'createFrame') {
      slotFrameId = op.id;
      skipped = true;
      continue;
    }
    if (slotFrameId && op.op === 'resize' && op.nodeId === slotFrameId) {
      slotFrameId = null;
      continue;
    }
    if (slotFrameId && op.op === 'setProperty' && op.nodeId === slotFrameId) {
      continue;
    }
    result.push(op);
  }
  return result;
}

function normalizeIds(log: FigmaMockOp[]): Array<{ op: string; [key: string]: unknown }> {
  const idMap = new Map<string, number>();
  let counter = 0;

  function normId(id: string | null): string | null {
    if (id === null) return null;
    if (!idMap.has(id)) idMap.set(id, ++counter);
    return `N${idMap.get(id)!}`;
  }

  return log.map((op) => {
    switch (op.op) {
      case 'createFrame':
      case 'createText':
      case 'createRectangle':
      case 'createInstance':
        return { ...op, id: normId(op.id) };
      case 'appendChild':
        return { ...op, parentId: normId(op.parentId), childId: normId(op.childId) };
      case 'setProperty':
      case 'setPluginData':
      case 'resize':
      case 'setPosition':
      case 'layoutSizing':
      case 'remove':
        return { ...op, nodeId: normId(op.nodeId) };
      case 'findOne':
        return { ...op, nodeId: normId(op.nodeId), result: normId(op.result) };
      case 'setBoundVariable':
        return { ...op, nodeId: normId(op.nodeId) };
      default:
        return op;
    }
  });
}

function captureAndNormalize(log: FigmaMockOp[]): Array<{ op: string; [key: string]: unknown }> {
  return normalizeIds(stripSlotCreationOps(log));
}

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findTraceDiffs(
  reference: Array<{ op: string; [key: string]: unknown }>,
  current: Array<{ op: string; [key: string]: unknown }>,
): string[] {
  const diffs: string[] = [];
  const len = Math.max(reference.length, current.length);
  for (let i = 0; i < len; i++) {
    const r = reference[i];
    const c = current[i];
    if (r === undefined) {
      diffs.push(`[+${i}] current has extra op: ${JSON.stringify(c)}`);
    } else if (c === undefined) {
      diffs.push(`[-${i}] reference has op not in current: ${JSON.stringify(r)}`);
    } else if (JSON.stringify(r) !== JSON.stringify(c)) {
      diffs.push(`[~${i}] diff:`);
      diffs.push(`  ref: ${JSON.stringify(r)}`);
      diffs.push(`  cur: ${JSON.stringify(c)}`);
    }
    if (diffs.length > 30) {
      diffs.push('... (truncated at 30 diffs)');
      break;
    }
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('JourneyWrap golden-snapshot parity (R10)', () => {
  let mock: MockFigma;

  beforeEach(() => {
    mock = createMockFigma();
    installMockFigma(mock);
  });

  afterEach(() => {
    mock.resetLog();
    uninstallMockFigma();
  });

  // ─── JOURNEY-F1: 1 item, 2 columns ───────────────────────────────────────

  it('JOURNEY-F1: 1-item 2-column trace matches v0.2.1 reference', async () => {
    const fixture = JOURNEY_FIXTURE_1_ITEM;

    // v0.2.1 reference trace
    mock.resetLog();
    await v021ApplyJourney(fixture);
    const referenceTrace = captureAndNormalize(mock.log);

    // current renderer trace
    mock.resetLog();
    const slot = makeCurrentJourneySlot(fixture.slotId) as FrameNode;
    await applyJourneyToSlot(slot, fixture);
    const currentTrace = captureAndNormalize(mock.log);

    if (!deepEqual(currentTrace, referenceTrace)) {
      const diffs = findTraceDiffs(referenceTrace, currentTrace);
      console.error('\n[PARITY FAIL] JOURNEY-F1 drift detected:');
      console.error('  Reference ops:', referenceTrace.length);
      console.error('  Current ops:  ', currentTrace.length);
      diffs.forEach((d) => console.error(' ', d));
    }

    expect(currentTrace).toEqual(referenceTrace);
  });

  // ─── JOURNEY-F2: 5 items, 4 columns ──────────────────────────────────────

  it('JOURNEY-F2: 5-item 4-column trace matches v0.2.1 reference', async () => {
    const fixture = JOURNEY_FIXTURE_5_ITEMS;

    mock.resetLog();
    await v021ApplyJourney(fixture);
    const referenceTrace = captureAndNormalize(mock.log);

    mock.resetLog();
    const slot = makeCurrentJourneySlot(fixture.slotId) as FrameNode;
    await applyJourneyToSlot(slot, fixture);
    const currentTrace = captureAndNormalize(mock.log);

    if (!deepEqual(currentTrace, referenceTrace)) {
      const diffs = findTraceDiffs(referenceTrace, currentTrace);
      console.error('\n[PARITY FAIL] JOURNEY-F2 drift detected:');
      console.error('  Reference ops:', referenceTrace.length);
      console.error('  Current ops:  ', currentTrace.length);
      diffs.forEach((d) => console.error(' ', d));
    }

    expect(currentTrace).toEqual(referenceTrace);
  });

  // ─── JOURNEY-F3: 10 items, 6 columns ─────────────────────────────────────

  it('JOURNEY-F3: 10-item 6-column trace matches v0.2.1 reference', async () => {
    const fixture = JOURNEY_FIXTURE_10_ITEMS;

    mock.resetLog();
    await v021ApplyJourney(fixture);
    const referenceTrace = captureAndNormalize(mock.log);

    mock.resetLog();
    const slot = makeCurrentJourneySlot(fixture.slotId) as FrameNode;
    await applyJourneyToSlot(slot, fixture);
    const currentTrace = captureAndNormalize(mock.log);

    if (!deepEqual(currentTrace, referenceTrace)) {
      const diffs = findTraceDiffs(referenceTrace, currentTrace);
      console.error('\n[PARITY FAIL] JOURNEY-F3 drift detected:');
      console.error('  Reference ops:', referenceTrace.length);
      console.error('  Current ops:  ', currentTrace.length);
      diffs.forEach((d) => console.error(' ', d));
    }

    expect(currentTrace).toEqual(referenceTrace);
  });
});
