// tests/code/persistence.test.ts
//
// Round-trip tests for persistence.ts: getPersistedState, setPersistedState,
// migrateLegacyState.
//
// All figma.* calls are stubbed inline. No shared fixture yet.
//
// Owner: figma-api-engineer

import { describe, it, expect, vi } from 'vitest';
import { getPersistedState, setPersistedState, migrateLegacyState } from '../../code/persistence';

// ---------------------------------------------------------------------------
// Mock SceneNode
// ---------------------------------------------------------------------------

function makeNode(initialData: Record<string, string> = {}): SceneNode {
  const store: Record<string, string> = { ...initialData };
  return {
    id: 'node-1',
    type: 'FRAME',
    getPluginData: vi.fn().mockImplementation(function (key: string) {
      return store[key] ?? '';
    }),
    setPluginData: vi.fn().mockImplementation(function (key: string, value: string) {
      store[key] = value;
    }),
    setRelaunchData: vi.fn(),
  } as unknown as SceneNode;
}

// Simple type guards.
function isString(u: unknown): u is string {
  return typeof u === 'string';
}

function isNumber(u: unknown): u is number {
  return typeof u === 'number';
}

// ---------------------------------------------------------------------------
// setPersistedState + getPersistedState round-trip
// ---------------------------------------------------------------------------

describe('persistence round-trip', function () {
  it('writes and reads a string value correctly', function () {
    const node = makeNode();
    setPersistedState(node, 'myKey', 'hello world');
    const result = getPersistedState<string>(node, 'myKey', isString);
    expect(result).toBe('hello world');
  });

  it('writes and reads a number value correctly', function () {
    const node = makeNode();
    setPersistedState(node, 'count', 42);
    const result = getPersistedState<number>(node, 'count', isNumber);
    expect(result).toBe(42);
  });

  it('writes and reads an object value correctly', function () {
    const node = makeNode();
    const payload = { width: 'md', hasHeader: true };
    setPersistedState(node, 'tableConfig', payload);
    const result = getPersistedState<typeof payload>(
      node,
      'tableConfig',
      function (u): u is typeof payload {
        return (
          typeof u === 'object' &&
          u !== null &&
          typeof (u as Record<string, unknown>).width === 'string'
        );
      },
    );
    expect(result).toEqual(payload);
  });

  it('calls setRelaunchData when writing', function () {
    const node = makeNode();
    setPersistedState(node, 'test', 'value');
    expect(
      (node as unknown as { setRelaunchData: ReturnType<typeof vi.fn> }).setRelaunchData,
    ).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPersistedState failure cases
// ---------------------------------------------------------------------------

describe('getPersistedState failure cases', function () {
  it('returns null when key is not set', function () {
    const node = makeNode();
    expect(getPersistedState(node, 'missing', isString)).toBe(null);
  });

  it('returns null for corrupt JSON', function () {
    const node = makeNode({ 'welder:corrupt': 'not-valid-json{{{' });
    expect(getPersistedState(node, 'corrupt', isString)).toBe(null);
  });

  it('returns null when type guard fails', function () {
    const node = makeNode();
    setPersistedState(node, 'numKey', 99);
    // Ask for string but stored number.
    const result = getPersistedState<string>(node, 'numKey', isString);
    expect(result).toBe(null);
  });

  it('returns null when stored JSON is not a VersionedState', function () {
    // Store a raw value without the _v wrapper.
    const node = makeNode({ 'welder:raw': JSON.stringify({ value: 'naked' }) });
    expect(getPersistedState(node, 'raw', isString)).toBe(null);
  });

  it('returns null when version does not match', function () {
    const node = makeNode({
      'welder:versioned': JSON.stringify({ _v: 99, data: 'hello' }),
    });
    expect(getPersistedState(node, 'versioned', isString)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// migrateLegacyState
// ---------------------------------------------------------------------------

describe('migrateLegacyState', function () {
  it('migrates data from oldKey to newKey', function () {
    const node = makeNode({
      'welder:old': JSON.stringify({ _v: 1, data: 'legacy-value' }),
    });
    migrateLegacyState<string>(node, 'old', 'new', function (raw): string | null {
      if (
        typeof raw === 'object' &&
        raw !== null &&
        typeof (raw as Record<string, unknown>).data === 'string'
      ) {
        return (raw as Record<string, unknown>).data as string;
      }
      return null;
    });
    const result = getPersistedState<string>(node, 'new', isString);
    expect(result).toBe('legacy-value');
  });

  it('is a no-op when oldKey does not exist', function () {
    const node = makeNode();
    migrateLegacyState(node, 'nonexistent', 'new', function () {
      return 'migrated';
    });
    // new key should not be set either.
    expect(getPersistedState(node, 'new', isString)).toBe(null);
  });

  it('does not write newKey when transform returns null', function () {
    const node = makeNode({ 'welder:broken': JSON.stringify({ _v: 1, data: 'x' }) });
    migrateLegacyState(node, 'broken', 'target', function () {
      return null;
    });
    expect(getPersistedState(node, 'target', isString)).toBe(null);
  });
});
