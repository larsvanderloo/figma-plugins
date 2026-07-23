import { debugLog } from '../../../shared/debug';

// Library-subscribed styles can't be enumerated by name (only local ones can),
// so harvest textStyleIds off TEXT nodes across all pages into a session cache.
const textStyleByName: { [name: string]: string } = {};
let textStyleMapBuilt = false;

async function buildTextStyleMap(): Promise<void> {
  if (textStyleMapBuilt) return;
  const pages = figma.root.children.filter(function (p) {
    return p.type === 'PAGE';
  }) as PageNode[];
  // Parallel loadAsync — serialized page loads were ~5× slower.
  await Promise.all(
    pages.map(function (page) {
      return page.loadAsync().catch(function (e: unknown) {
        console.log('[text-style-map] page.loadAsync failed: ' + String(e));
      });
    }),
  );
  // Collect distinct ids first, then batch getStyleByIdAsync in parallel —
  // a sequential await per text node cost ~10ms per style on every plugin open.
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
