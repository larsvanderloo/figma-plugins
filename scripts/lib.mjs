import { watchFile } from 'node:fs';
import { readFile } from 'node:fs/promises';

export async function readPackageVersion(packagePath) {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json must contain a non-empty version string');
  }
  return pkg.version;
}

// Calls arriving while a run is in flight coalesce into one follow-up run, so
// rapid file events never overlap writes. Errors are logged, never thrown.
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
