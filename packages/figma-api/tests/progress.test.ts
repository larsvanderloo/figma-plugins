// packages/figma-api/tests/progress.test.ts
//
// Tests for progress.ts async primitives.
//
// No figma.* dependency — these utilities are pure TypeScript.

import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  withProgress,
  createCancellableTask,
  TimeoutError,
  CancelledError,
} from '../src/progress';

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('happy path: resolves with the inner promise value', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'test');
    expect(result).toBe(42);
  });

  it('error path: rejects with TimeoutError when deadline expires', async () => {
    vi.useFakeTimers();

    const never = new Promise<never>(() => undefined);
    const raced = withTimeout(never, 100, 'slow-op');

    vi.advanceTimersByTime(200);

    await expect(raced).rejects.toBeInstanceOf(TimeoutError);
    await expect(raced).rejects.toMatchObject({ label: 'slow-op', ms: 100 });

    vi.useRealTimers();
  });

  it('rejects with the inner error when the promise rejects before timeout', async () => {
    const inner = Promise.reject(new Error('network error'));
    await expect(withTimeout(inner, 5000, 'fetch')).rejects.toThrow('network error');
  });

  it('TimeoutError has correct name and message', () => {
    const err = new TimeoutError('my-op', 200);
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toContain('my-op');
    expect(err.message).toContain('200ms');
    expect(err.label).toBe('my-op');
    expect(err.ms).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// withProgress
// ---------------------------------------------------------------------------

describe('withProgress', () => {
  async function* makeAsyncGen<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
      yield item;
    }
  }

  it('happy path: collects all items and emits progress callbacks', async () => {
    const callbacks: Array<[number, number]> = [];
    const items = [1, 2, 3];

    const result = await withProgress(makeAsyncGen(items), (n, total) => {
      callbacks.push([n, total]);
    });

    expect(result).toEqual([1, 2, 3]);
    expect(callbacks).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it('emits total when provided', async () => {
    const callbacks: Array<[number, number]> = [];

    await withProgress(makeAsyncGen(['a', 'b']), (n, total) => callbacks.push([n, total]), 5);

    expect(callbacks).toEqual([
      [1, 5],
      [2, 5],
    ]);
  });

  it('returns empty array for empty iterable', async () => {
    const result = await withProgress(makeAsyncGen([]), vi.fn());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createCancellableTask
// ---------------------------------------------------------------------------

describe('createCancellableTask', () => {
  it('happy path: resolves when fn completes before cancel', async () => {
    const task = createCancellableTask(async (_signal) => 'done');
    const result = await task.promise;
    expect(result).toBe('done');
  });

  it('error path: rejects with CancelledError when cancelled', async () => {
    const task = createCancellableTask(
      (_signal) => new Promise<never>(() => undefined), // never resolves
    );

    task.cancel();
    await expect(task.promise).rejects.toBeInstanceOf(CancelledError);
  });

  it('signal.aborted is true after cancel()', async () => {
    let signalRef: AbortSignal | null = null;

    const task = createCancellableTask(async (signal) => {
      signalRef = signal;
      return new Promise<never>(() => undefined);
    });

    // Allow the fn to run and capture signalRef
    await Promise.resolve();

    task.cancel();

    // Consume the rejected promise so it is not an unhandled rejection.
    await task.promise.catch(() => undefined);

    if (signalRef !== null) {
      expect((signalRef as AbortSignal).aborted).toBe(true);
    }
  });

  it('CancelledError has correct name', () => {
    const err = new CancelledError('my-task');
    expect(err.name).toBe('CancelledError');
    expect(err.message).toContain('my-task');
  });
});
