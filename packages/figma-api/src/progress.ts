// packages/figma-api/src/progress.ts
//
// Async-boundary primitives: timeout, progress iteration, cancellable tasks.
//
// Owner: figma-api-engineer
// Monday task: 1.7
//
// Risk R3 mitigation: "Silent fire-and-forget async (image fetch, icon cache
// prime, CSV import) → withTimeout/withProgress primitives."
//
// These utilities are pure TypeScript with no figma.* dependencies, so they
// are safe in both code/ and ui/ contexts and are independently testable in
// a standard vitest node environment.

// ---------------------------------------------------------------------------
// Named error classes
// ---------------------------------------------------------------------------

/**
 * Thrown by withTimeout when the promise does not resolve within `ms`.
 */
export class TimeoutError extends Error {
  readonly label: string;
  readonly ms: number;

  constructor(label: string, ms: number) {
    super(`[${label}] timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.ms = ms;
  }
}

/**
 * Thrown by createCancellableTask when cancel() is called before the task
 * resolves naturally.
 */
export class CancelledError extends Error {
  constructor(label?: string) {
    super(label !== undefined ? `Task cancelled: ${label}` : 'Task cancelled');
    this.name = 'CancelledError';
  }
}

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

/**
 * Race a promise against a deadline.  Rejects with TimeoutError if `promise`
 * does not settle within `ms` milliseconds.
 *
 * Primary use cases:
 *   - figma.getNodeByIdAsync on very large documents (> 10 k nodes)
 *   - figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync
 *   - Network fetches for image bytes or icon manifests
 *
 * The `label` appears in the error message for easier diagnostics.
 *
 * Note: the underlying promise is not cancelled when the timeout fires —
 * Promises are not cancellable in JavaScript.  The result is silently
 * discarded.  For truly cancellable work, use createCancellableTask.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// withProgress
// ---------------------------------------------------------------------------

/**
 * Iterates an AsyncIterable, emitting progress callbacks after each item.
 * Returns all collected items as an array.
 *
 * `onProgress(n, total)` is called after each item is collected.  When the
 * total is unknown (the iterable does not pre-declare its size), pass 0 and
 * the callback receives `n` with `total = 0`; callers can display an
 * indeterminate progress indicator.
 *
 * The callback is synchronous — keep it cheap (update a counter, post a
 * message to the ui).  Long async work inside onProgress will delay the
 * iteration.
 */
export async function withProgress<T>(
  asyncIterable: AsyncIterable<T>,
  onProgress: (n: number, total: number) => void,
  total = 0,
): Promise<T[]> {
  const results: T[] = [];
  for await (const item of asyncIterable) {
    results.push(item);
    onProgress(results.length, total);
  }
  return results;
}

// ---------------------------------------------------------------------------
// createCancellableTask
// ---------------------------------------------------------------------------

/**
 * Wraps an async function in an AbortController-backed cancellable task.
 *
 * The wrapped function receives an AbortSignal.  It is responsible for
 * checking signal.aborted at appropriate yield points and throwing
 * CancelledError (or any error) when the signal fires.  This function does
 * NOT automatically inject CancelledError into the wrapped function —
 * interruption is cooperative.
 *
 * `cancel()` calls AbortController.abort() and causes the promise to reject
 * with CancelledError if the inner fn has not already resolved.
 *
 * Usage:
 * ```ts
 * const task = createCancellableTask(async (signal) => {
 *   const result = await someOp();
 *   if (signal.aborted) throw new CancelledError();
 *   return result;
 * });
 * // Later:
 * task.cancel();
 * ```
 */
export function createCancellableTask<T>(fn: (signal: AbortSignal) => Promise<T>): {
  promise: Promise<T>;
  cancel: () => void;
} {
  const controller = new AbortController();
  let cancelReject: ((err: CancelledError) => void) | null = null;

  const cancelPromise = new Promise<never>((_resolve, reject) => {
    cancelReject = reject;
  });

  const racePromise = Promise.race([fn(controller.signal), cancelPromise]);

  function cancel(): void {
    controller.abort();
    if (cancelReject !== null) {
      cancelReject(new CancelledError());
    }
  }

  return { promise: racePromise, cancel };
}
