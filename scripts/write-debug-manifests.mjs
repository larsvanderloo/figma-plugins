import { watchFile } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const watchMode = process.argv.includes('--watch');

const manifests = [
  {
    source: 'manifest.debug.json',
    target: 'manifest-cache/debug/manifest.json',
  },
  {
    source: 'manifest.dev.json',
    target: 'manifest-cache/dev/manifest.json',
  },
];

function assertLocalManifestPath(manifestPath, field) {
  if (!manifestPath || typeof manifestPath !== 'string') {
    throw new Error(`Manifest field "${field}" must be a string`);
  }

  if (path.isAbsolute(manifestPath) || /^[a-z]+:/i.test(manifestPath)) {
    throw new Error(`Manifest field "${field}" must be a local relative path`);
  }

  if (manifestPath.split(/[\\/]/).includes('..')) {
    throw new Error(`Manifest field "${field}" must not point outside the generated manifest directory`);
  }
}

async function copyManifestAsset(targetDir, manifestPath, field) {
  assertLocalManifestPath(manifestPath, field);

  const sourcePath = path.resolve(rootDir, manifestPath);
  const targetPath = path.resolve(targetDir, manifestPath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  return sourcePath;
}

async function writeDebugManifests() {
  const watchedSources = new Set();

  for (const { source, target } of manifests) {
    const sourcePath = path.resolve(rootDir, source);
    const targetPath = path.resolve(rootDir, target);
    const targetDir = path.dirname(targetPath);
    const manifest = JSON.parse(await readFile(sourcePath, 'utf8'));

    assertLocalManifestPath(manifest.main, 'main');
    assertLocalManifestPath(manifest.ui, 'ui');

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);
    watchedSources.add(await copyManifestAsset(targetDir, manifest.main, 'main'));
    watchedSources.add(await copyManifestAsset(targetDir, manifest.ui, 'ui'));
    console.log(`[debug-manifest] wrote ${target}`);
  }

  return watchedSources;
}

const watchedSources = await writeDebugManifests();

if (watchMode) {
  let syncing = false;
  let needsSync = false;

  async function sync() {
    if (syncing) {
      needsSync = true;
      return;
    }

    syncing = true;
    try {
      await writeDebugManifests();
    } catch (error) {
      console.error('[debug-manifest] sync failed', error);
    } finally {
      syncing = false;
      if (needsSync) {
        needsSync = false;
        await sync();
      }
    }
  }

  for (const sourcePath of watchedSources) {
    watchFile(sourcePath, { interval: 500 }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
        return;
      }

      setTimeout(() => {
        void sync();
      }, 200);
    });
  }

  console.log('[debug-manifest] watching generated manifest assets');
  await new Promise(() => {});
}
