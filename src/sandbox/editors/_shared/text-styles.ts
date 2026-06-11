// ============================================================
// editors/_shared/text-styles.ts
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { debugLog } from '../../../shared/debug';

// Library-subscribed styles can't be enumerated by name — only local
// styles can. To resolve one we have to read its id off a TextNode that
// already references it. We walk every TEXT node on the current page,
// fetch each distinct textStyleId via getStyleByIdAsync, and cache the
// resulting name → id map per session. Subsequent lookups are O(1).
//
// Returns null when no node in the file uses a style matching `name`
// (exact match or `<path>/<name>` suffix to allow folder-grouped styles).
// ============================================================
const textStyleByName: { [name: string]: string } = {};
let textStyleMapBuilt = false;

async function buildTextStyleMap(): Promise<void> {
  if (textStyleMapBuilt) return;
  const pages = figma.root.children.filter(function (p) {
    return p.type === 'PAGE';
  }) as PageNode[];
  // Load every page in parallel rather than sequentially — 5 pages
  // serialized was ~5× the cost of a single loadAsync.
  await Promise.all(
    pages.map(function (page) {
      return page.loadAsync().catch(function (e: unknown) {
        console.log('[text-style-map] page.loadAsync failed: ' + String(e));
      });
    }),
  );
  // Collect every distinct textStyleId across all pages first, THEN
  // batch the getStyleByIdAsync fetches in parallel. Was a sequential
  // await per text node — N styles × ~10ms each on every plugin open.
  const distinctIds: string[] = [];
  const seenIds: { [id: string]: true } = {};
  for (let p = 0; p < pages.length; p++) {
    const textNodes = pages[p].findAll(function (n: SceneNode) {
      return n.type === 'TEXT';
    });
    for (let i = 0; i < textNodes.length; i++) {
      const id = (textNodes[i] as TextNode).textStyleId;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (seenIds[id]) continue;
      seenIds[id] = true;
      distinctIds.push(id);
    }
  }
  const styles = await Promise.all(
    distinctIds.map(function (id) {
      return figma.getStyleByIdAsync(id).catch(function () {
        return null;
      });
    }),
  );
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (style !== null && typeof style.name === 'string') {
      textStyleByName[style.name] = distinctIds[i];
    }
  }
  textStyleMapBuilt = true;
  const names = Object.keys(textStyleByName);
  debugLog('text-style-map', 'built', { entries: names.length, names: names });
}

export async function resolveTextStyleByName(name: string): Promise<string | null> {
  await buildTextStyleMap();
  if (textStyleByName[name] !== undefined) return textStyleByName[name];
  // Try suffix-match (folder-grouped style names).
  const suffix = '/' + name;
  const keys = Object.keys(textStyleByName);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.length >= suffix.length && key.lastIndexOf(suffix) === key.length - suffix.length) {
      return textStyleByName[key];
    }
  }
  return null;
}
