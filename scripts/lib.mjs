// Shared helpers for the scripts/ watchers. Extracted from
// write-app-version.mjs and write-debug-manifests.mjs, which previously
// each carried their own copy of the version-reader and the
// coalescing watch-sync pattern.

import { watchFile } from 'node:fs';
import { readFile } from 'node:fs/promises';

export async function readPackageVersion(packagePath) {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json must contain a non-empty version string');
  }
  return pkg.version;
}

/**
 * Wraps `run` in a coalescing runner: concurrent calls while a run is
 * in flight collapse into a single follow-up run, so rapid file events
 * never overlap writes. Errors are logged with `label`, never thrown.
 */
export function createSyncRunner(run, label) {
  let syncing = false;
  let needsSync = false;

  async function sync() {
    if (syncing) {
      needsSync = true;
      return;
    }

    syncing = true;
    try {
      await run();
    } catch (error) {
      console.error(`${label} sync failed`, error);
    } finally {
      syncing = false;
      if (needsSync) {
        needsSync = false;
        await sync();
      }
    }
  }

  return sync;
}

/**
 * watchFile each path (500ms poll) and invoke `onChange` after
 * `debounceMs` when mtime or size actually changed.
 */
export function watchPathsForChange(paths, debounceMs, onChange) {
  for (const watchedPath of paths) {
    watchFile(watchedPath, { interval: 500 }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
        return;
      }

      setTimeout(() => {
        void onChange();
      }, debounceMs);
    });
  }
}
