/* eslint-disable no-console */
// dev-console.ts — code-side console bridge (DEV only)
//
// Wraps console.log / .warn / .error and unhandledrejection so that every
// plugin log line is also POST-ed to the dev-console-bridge server running
// on localhost:8765.  In production this module is a no-op (Vite tree-shakes
// the entire install() body because import.meta.env.DEV is replaced with
// `false` at build time).
//
// Design constraints:
//   - No DOM, no window, no localStorage — this runs in the Figma code sandbox.
//   - fetch() is available in the Figma sandbox only when the target origin is
//     listed under manifest.networkAccess.allowedDomains.  The dev manifest
//     (manifest.dev.json) adds "http://localhost:8765".  The prod manifest does
//     NOT include it.  Never call this in production.
//   - Fire-and-forget: the POST is never awaited.  A failed delivery (server
//     not running) is silently dropped so the plugin never hangs waiting for
//     a log line.
//   - The server endpoint is kept in a single constant here (BRIDGE_URL) so
//     it's easy to change port without hunting across files.
//
// Usage: imported once from code/main.ts, called as installDevConsole() at
// the top of main() before any other plugin code runs.
//
// ADR: ADR-0016 — dev-console-bridge (manifest dev/prod split).
//
// Owner: figma-api-engineer

const BRIDGE_URL = 'http://127.0.0.1:8765' as const;

/** Coerce an arbitrary console argument to a plain string for JSON transport. */
function argToString(a: unknown): string {
  if (a === null) return 'null';
  if (a === undefined) return 'undefined';
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? a.message;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/** Fire-and-forget POST to the bridge server. Never throws. */
function post(level: string, args: unknown[]): void {
  const body = JSON.stringify({
    level,
    args: args.map(argToString),
    ts: Date.now(),
  });
  // fetch is available in the Figma sandbox for allowedDomains URLs.
  // We use a plain try/catch because fetch() itself may throw synchronously
  // if called before the sandbox is fully initialised.
  try {
    // Intentionally not awaited — fire and forget.
    void fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(function () {
      // Server not running or network error — silently drop.
    });
  } catch {
    // Synchronous throw from fetch (e.g. sandbox not ready) — silently drop.
  }
}

/**
 * Install the dev console bridge.
 *
 * Must be called at the start of main() in code/main.ts, inside the
 * `if (import.meta.env.DEV)` guard.  Vite replaces import.meta.env.DEV with
 * a boolean literal at build time; the entire block is eliminated from the
 * production bundle by tree-shaking / dead-code elimination.
 *
 * After install(), the original console methods still run (we prepend, not
 * replace), so the Figma plugin console (Plugins → Development → Show/Hide
 * Console) continues to work alongside the terminal bridge.
 */
export function installDevConsole(): void {
  // Extra safety net: if somehow called outside DEV mode, do nothing.
  // Use MODE not DEV — Vite's import.meta.env.DEV is false in any `vite build`,
  // even with --mode development. MODE reflects the --mode flag explicitly.
  if (import.meta.env.MODE !== 'development') return;

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = function (...args: unknown[]): void {
    orig.log(...args);
    post('log', args);
  };

  console.warn = function (...args: unknown[]): void {
    orig.warn(...args);
    post('warn', args);
  };

  console.error = function (...args: unknown[]): void {
    orig.error(...args);
    post('error', args);
  };

  // Unhandled promise rejections in the code sandbox surface via the global
  // unhandledrejection event.  The Figma sandbox exposes this on the global
  // object (not window, which doesn't exist in the sandbox).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).addEventListener?.(
    'unhandledrejection',
    function (event: PromiseRejectionEvent) {
      post('rejection', [event.reason ?? '(no reason)']);
    },
  );
}
