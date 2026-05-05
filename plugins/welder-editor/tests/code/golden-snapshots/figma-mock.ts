// tests/code/golden-snapshots/figma-mock.ts
//
// Call-recording mock-figma for golden-snapshot parity tests.
//
// Design:
//   - Every figma.* call that the TableWrap / JourneyWrap renderers make is
//     intercepted and recorded as a structured op event in an ordered log.
//   - The log is deterministic: op type + named fields (no internal symbols,
//     no random IDs). Node IDs are derived from creation order (stable).
//   - Variable binding (setBoundVariableForPaint) is recorded as a named op
//     rather than by variable identity, so v0.2.1 and current traces can be
//     compared structurally.
//   - The mock is self-contained: no figma.* globals leak into the test module.
//
// Op types recorded:
//   createFrame        — figma.createFrame()
//   createText         — figma.createText()
//   createRectangle    — figma.createRectangle()
//   createInstance     — comp.createInstance() (JourneyItem instances)
//   appendChild        — parent.appendChild(child)
//   setProperty        — any direct property assignment on a node
//   setBoundVariable   — figma.variables.setBoundVariableForPaint(...)
//   setPluginData      — node.setPluginData(key, value)
//   resize             — node.resize(w, h)
//   setPosition        — node.x = ... or node.y = ...
//   layoutSizing       — layoutSizingHorizontal / layoutSizingVertical
//
// Owner: plugin-tester (Sprint 4 task 4.7, TDEV-070)

// ---------------------------------------------------------------------------
// Op event types
// ---------------------------------------------------------------------------

export type FigmaMockOp =
  | { op: 'createFrame'; id: string; name?: string }
  | { op: 'createText'; id: string; name?: string }
  | { op: 'createRectangle'; id: string; name?: string }
  | { op: 'createInstance'; id: string; name?: string }
  | { op: 'appendChild'; parentId: string; childId: string }
  | { op: 'setProperty'; nodeId: string; key: string; value: unknown }
  | { op: 'setBoundVariable'; nodeId: string; key: string; variableName: string }
  | { op: 'setPluginData'; nodeId: string; key: string; value: string }
  | { op: 'resize'; nodeId: string; width: number; height: number }
  | { op: 'setPosition'; nodeId: string; axis: 'x' | 'y'; value: number }
  | { op: 'layoutSizing'; nodeId: string; axis: 'horizontal' | 'vertical'; value: string }
  | { op: 'remove'; nodeId: string }
  | { op: 'findOne'; nodeId: string; result: string | null };

// ---------------------------------------------------------------------------
// Internal node proxy
// ---------------------------------------------------------------------------

let _nodeCounter = 0;

function nextId(prefix: string): string {
  _nodeCounter += 1;
  return `${prefix}-${_nodeCounter}`;
}

function makeNodeProxy(id: string, type: string, log: FigmaMockOp[]): Record<string, unknown> {
  const props: Record<string, unknown> = {
    id,
    type,
    name: type,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    children: [] as Record<string, unknown>[],
    parent: null as Record<string, unknown> | null,
    fills: [],
    strokes: [],
    visible: true,
  };

  const tracked: Record<string, unknown> = {};

  // Settable props that produce setProperty ops (direct canvas-state).
  // layoutSizingHorizontal / layoutSizingVertical produce layoutSizing ops.
  // x / y produce setPosition ops.
  // resize() produces resize op.
  const directProps = new Set([
    'name',
    'layoutMode',
    'primaryAxisSizingMode',
    'counterAxisSizingMode',
    'primaryAxisAlignItems',
    'counterAxisAlignItems',
    'itemSpacing',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'cornerRadius',
    'clipsContent',
    'fills',
    'strokes',
    'strokeWeight',
    'strokeAlign',
    'strokeTopWeight',
    'strokeBottomWeight',
    'strokeLeftWeight',
    'strokeRightWeight',
    'fontName',
    'fontSize',
    'characters',
    'textAutoResize',
    'textAlignHorizontal',
    'textAlignVertical',
    'textTruncation',
    'maxLines',
    'counterAxisSizingMode',
    'opacity',
  ]);

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === '__isProxy') return true;
      if (prop === 'id') return id;
      if (prop === 'type') return type;

      // children array — returned as-is (mutable, child nodes are proxy objects)
      if (prop === 'children') return props.children;
      if (prop === 'parent') return props.parent;
      if (prop === 'fills') return props.fills;
      if (prop === 'strokes') return props.strokes;
      if (prop === 'width') return props.width;
      if (prop === 'height') return props.height;
      if (prop === 'x') return props.x;
      if (prop === 'y') return props.y;

      if (prop === 'appendChild') {
        return function (child: Record<string, unknown>) {
          const childId = child['id'] as string;
          (props.children as Record<string, unknown>[]).push(child);
          child['parent'] = proxy;
          log.push({ op: 'appendChild', parentId: id, childId });
        };
      }

      if (prop === 'resize') {
        return function (w: number, h: number) {
          props.width = w;
          props.height = h;
          log.push({ op: 'resize', nodeId: id, width: w, height: h });
        };
      }

      if (prop === 'setPluginData') {
        return function (key: string, value: string) {
          log.push({ op: 'setPluginData', nodeId: id, key, value });
        };
      }

      if (prop === 'getPluginData') {
        return function (_key: string) {
          return '';
        };
      }

      if (prop === 'remove') {
        return function () {
          log.push({ op: 'remove', nodeId: id });
        };
      }

      if (prop === 'findOne') {
        return function (pred: (n: unknown) => boolean) {
          // Search children recursively for the first match.
          function search(node: Record<string, unknown>): Record<string, unknown> | null {
            const children = node['children'] as Record<string, unknown>[] | undefined;
            if (!children) return null;
            for (const child of children) {
              if (pred(child)) {
                log.push({ op: 'findOne', nodeId: id, result: child['id'] as string });
                return child;
              }
              const found = search(child);
              if (found) return found;
            }
            return null;
          }
          const result = search(proxy);
          if (result === null) {
            log.push({ op: 'findOne', nodeId: id, result: null });
          }
          return result;
        };
      }

      if (prop === 'layoutSizingHorizontal') {
        return tracked['layoutSizingHorizontal'] ?? 'FIXED';
      }
      if (prop === 'layoutSizingVertical') {
        return tracked['layoutSizingVertical'] ?? 'FIXED';
      }
      if (prop === 'textTruncation') {
        return tracked['textTruncation'] ?? 'NONE';
      }
      if (prop === 'maxLines') {
        return tracked['maxLines'] ?? null;
      }
      if (prop === 'textAutoResize') {
        return tracked['textAutoResize'] ?? 'NONE';
      }
      if (prop === 'characters') {
        return tracked['characters'] ?? '';
      }

      return tracked[prop] ?? props[prop];
    },

    set(_target, prop: string, value: unknown) {
      if (prop === 'x') {
        props.x = value as number;
        log.push({ op: 'setPosition', nodeId: id, axis: 'x', value: value as number });
        return true;
      }
      if (prop === 'y') {
        props.y = value as number;
        log.push({ op: 'setPosition', nodeId: id, axis: 'y', value: value as number });
        return true;
      }
      if (prop === 'layoutSizingHorizontal') {
        tracked[prop] = value;
        log.push({ op: 'layoutSizing', nodeId: id, axis: 'horizontal', value: value as string });
        return true;
      }
      if (prop === 'layoutSizingVertical') {
        tracked[prop] = value;
        log.push({ op: 'layoutSizing', nodeId: id, axis: 'vertical', value: value as string });
        return true;
      }
      if (prop === 'fills') {
        props.fills = value;
        log.push({ op: 'setProperty', nodeId: id, key: 'fills', value });
        return true;
      }
      if (prop === 'strokes') {
        props.strokes = value;
        log.push({ op: 'setProperty', nodeId: id, key: 'strokes', value });
        return true;
      }
      if (directProps.has(prop)) {
        tracked[prop] = value;
        log.push({ op: 'setProperty', nodeId: id, key: prop, value });
        return true;
      }
      // Passthrough for other props.
      tracked[prop] = value;
      return true;
    },
  };

  const proxy = new Proxy({} as Record<string, unknown>, handler);
  return proxy;
}

// ---------------------------------------------------------------------------
// Mock figma.variables
// ---------------------------------------------------------------------------

function makeVariablesStub(_log: FigmaMockOp[], _paintHolder: Record<string, unknown>) {
  return {
    setBoundVariableForPaint(
      paint: { type: string; color: unknown },
      _field: string,
      variable: { name?: string; id?: string },
    ): unknown {
      const varName = variable.name ?? variable.id ?? 'unknown-var';
      // We don't have the nodeId at this call site; we just return a tagged paint.
      // The caller (buildCell etc.) assigns it to node.fills/strokes,
      // which triggers the setProperty op on the node. We embed the var-name
      // in the returned paint object so it appears in the setProperty log value.
      return { ...paint, __boundVar: varName };
    },
  };
}

// ---------------------------------------------------------------------------
// Stub Variable objects
// ---------------------------------------------------------------------------

export function makeVariable(name: string): Variable {
  return { name, id: `var-${name}`, key: `key-${name}` } as unknown as Variable;
}

// ---------------------------------------------------------------------------
// MockFigma — the public interface
// ---------------------------------------------------------------------------

export interface MockFigma {
  log: FigmaMockOp[];
  resetLog(): void;
  figmaGlobal: unknown;
}

export function createMockFigma(): MockFigma {
  const log: FigmaMockOp[] = [];
  const paintHolder: Record<string, unknown> = {};

  const figmaGlobal = {
    mixed: Symbol('figma.mixed'),

    createFrame(): Record<string, unknown> {
      const id = nextId('frame');
      log.push({ op: 'createFrame', id });
      return makeNodeProxy(id, 'FRAME', log);
    },

    createText(): Record<string, unknown> {
      const id = nextId('text');
      log.push({ op: 'createText', id });
      return makeNodeProxy(id, 'TEXT', log);
    },

    createRectangle(): Record<string, unknown> {
      const id = nextId('rect');
      log.push({ op: 'createRectangle', id });
      return makeNodeProxy(id, 'RECTANGLE', log);
    },

    loadFontAsync(_font: unknown): Promise<void> {
      return Promise.resolve();
    },

    variables: makeVariablesStub(log, paintHolder),

    commitUndo(): void {
      // no-op in test environment — withAtomic uses this to group undo steps
    },

    currentPage: {
      findAll: () => [],
    },

    importComponentByKeyAsync(_key: string): Promise<Record<string, unknown>> {
      // Return a mock component with createInstance.
      const compId = nextId('comp');
      const comp = {
        id: compId,
        name: 'JourneyItem',
        createInstance(): Record<string, unknown> {
          const instId = nextId('inst');
          log.push({ op: 'createInstance', id: instId, name: 'JourneyItem' });
          const inst = makeNodeProxy(instId, 'INSTANCE', log);
          // Give the instance a mock height for resize calculation.
          (inst as unknown as Record<string, unknown>)['height'] = 90;
          return inst;
        },
      };
      return Promise.resolve(comp);
    },
  };

  return {
    log,
    resetLog() {
      log.length = 0;
      _nodeCounter = 0;
    },
    figmaGlobal,
  };
}

// ---------------------------------------------------------------------------
// Install / uninstall helpers for test setup
// ---------------------------------------------------------------------------

export function installMockFigma(mock: MockFigma): void {
  (globalThis as unknown as Record<string, unknown>)['figma'] = mock.figmaGlobal;
}

export function uninstallMockFigma(): void {
  (globalThis as unknown as Record<string, unknown>)['figma'] = {
    mixed: Symbol('figma.mixed'),
  };
}
