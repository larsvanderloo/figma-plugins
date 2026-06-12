import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createSyncRunner, readPackageVersion, watchPathsForChange } from './lib.mjs';

const rootDir = process.cwd();
const watchMode = process.argv.includes('--watch');
const copyRetries = watchMode ? 10 : 3;
const copyRetryDelayMs = 100;

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

function isJavaScriptAsset(relativePath) {
  return relativePath.endsWith('.js');
}

function assertBundleText(relativePath, text, version) {
  if (!text.includes(version)) {
    throw new Error(`${relativePath} does not contain package version ${version}`);
  }

  if (!isJavaScriptAsset(relativePath)) {
    return;
  }

  try {
    new vm.Script(text, { filename: relativePath });
  } catch (error) {
    throw new Error(`${relativePath} is not valid JavaScript: ${error.message}`);
  }
}

async function copyManifestAsset(targetDir, manifestPath, field, version) {
  assertLocalManifestPath(manifestPath, field);

  const sourcePath = path.resolve(rootDir, manifestPath);
  const targetPath = path.resolve(targetDir, manifestPath);
  const sourceRelativePath = path.relative(rootDir, sourcePath);
  const targetRelativePath = path.relative(rootDir, targetPath);

  await mkdir(path.dirname(targetPath), { recursive: true });

  let lastError;
  for (let attempt = 1; attempt <= copyRetries; attempt += 1) {
    const tempPath = `${targetPath}.${process.pid}.${attempt}.tmp`;

    try {
      const sourceText = await readFile(sourcePath, 'utf8');
      assertBundleText(sourceRelativePath, sourceText, version);

      await writeFile(tempPath, sourceText);
      const tempText = await readFile(tempPath, 'utf8');
      assertBundleText(targetRelativePath, tempText, version);
      await rename(tempPath, targetPath);

      return sourcePath;
    } catch (error) {
      lastError = error;
      await rm(tempPath, { force: true });

      if (attempt < copyRetries) {
        await delay(copyRetryDelayMs * attempt);
      }
    }
  }

  throw lastError;

}

async function writeDebugManifests() {
  const watchedSources = new Set();
  const version = await readPackageVersion(path.resolve(rootDir, 'package.json'));

  for (const { source, target } of manifests) {
    const sourcePath = path.resolve(rootDir, source);
    const targetPath = path.resolve(rootDir, target);
    const targetDir = path.dirname(targetPath);
    const manifest = JSON.parse(await readFile(sourcePath, 'utf8'));

    assertLocalManifestPath(manifest.main, 'main');
    assertLocalManifestPath(manifest.ui, 'ui');

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);
    watchedSources.add(await copyManifestAsset(targetDir, manifest.main, 'main', version));
    watchedSources.add(await copyManifestAsset(targetDir, manifest.ui, 'ui', version));
    console.log(`[debug-manifest] wrote ${target}`);
  }

  return watchedSources;
}

const watchedSources = await writeDebugManifests();

if (watchMode) {
  watchPathsForChange(
    [...watchedSources],
    200,
    createSyncRunner(writeDebugManifests, '[debug-manifest]'),
  );
  console.log('[debug-manifest] watching generated manifest assets');
  await new Promise(() => {});
}
