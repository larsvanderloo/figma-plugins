// code/persistence.ts — pluginData + setRelaunchData round-trip (1.12)
//
// Typed wrappers for reading and writing pluginData on SceneNodes.
// All keys are namespaced with 'welder:' to avoid collisions with other plugins.
//
// API:
//   getPersistedState<T>(node, key, guard)      — read + validate, returns T | null.
//   setPersistedState<T>(node, key, value)       — write JSON + setRelaunchData.
//   migrateLegacyState(node, oldKey, newKey, fn) — forward-migration for schema changes.
//
// Schema versioning: every stored shape carries a `_v` field at the top level.
// On read, the hand-rolled type guard validates both the `_v` field and the
// payload shape. On schema mismatch the function returns null (never silently
// drops data — the caller may surface INVALID_INPUT or attempt migration).
//
// setRelaunchData: written whenever setPersistedState succeeds, with a standard
// "Open with Welder Editor" relaunch button text. This gives the user a quick
// shortcut to re-open the editor from any wrapped instance on canvas.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
// No migrations in v0.1.0 — migrateLegacyState is exported for future use.
//
// Owner: figma-api-engineer

// ---------------------------------------------------------------------------
// Versioned persisted state shape
// ---------------------------------------------------------------------------

/** Every value stored via setPersistedState is wrapped with a version marker. */
interface VersionedState<T> {
  _v: number;
  data: T;
}

const CURRENT_STATE_VERSION = 1;

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/** Checks that a value is a plain object (not null, not array). */
function isPlainObject(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null && !Array.isArray(u);
}

/** Type guard for VersionedState<unknown>. */
function isVersionedState(u: unknown): u is VersionedState<unknown> {
  if (!isPlainObject(u)) return false;
  if (typeof u['_v'] !== 'number') return false;
  if (!Object.prototype.hasOwnProperty.call(u, 'data')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Namespaced key helper
// ---------------------------------------------------------------------------

/** Returns the namespaced pluginData key: 'welder:<key>'. */
function namespacedKey(key: string): string {
  return 'welder:' + key;
}

// ---------------------------------------------------------------------------
// Read — getPersistedState
// ---------------------------------------------------------------------------

/**
 * Reads pluginData from node, JSON-parses, version-validates, and narrows
 * the data field with the provided type guard.
 *
 * Returns T when all checks pass, null otherwise.
 * Null is returned (never throws) for:
 *   - Missing key (no pluginData set yet).
 *   - Corrupt JSON.
 *   - VersionedState version mismatch (caller may run migration).
 *   - Type guard rejection (data shape changed).
 *
 * @param node  — the SceneNode to read from.
 * @param key   — logical key (will be namespaced automatically).
 * @param guard — hand-rolled type guard for the payload type T.
 */
export function getPersistedState<T>(
  node: SceneNode,
  key: string,
  guard: (u: unknown) => u is T,
): T | null {
  const raw = node.getPluginData(namespacedKey(key));
  if (raw === '' || raw === null || raw === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    console.warn('[persistence] JSON.parse failed for key "' + key + '" on node ' + node.id);
    return null;
  }

  if (!isVersionedState(parsed)) {
    console.warn('[persistence] not a VersionedState for key "' + key + '" on node ' + node.id);
    return null;
  }

  // T34.4 migration hook: version mismatch → null for now (caller handles).
  if (parsed._v !== CURRENT_STATE_VERSION) {
    console.warn(
      '[persistence] version mismatch for key "' +
        key +
        '" on node ' +
        node.id +
        ': got _v=' +
        String(parsed._v) +
        ', expected ' +
        String(CURRENT_STATE_VERSION),
    );
    return null;
  }

  const data = parsed.data;
  if (!guard(data)) {
    console.warn('[persistence] type guard failed for key "' + key + '" on node ' + node.id);
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Write — setPersistedState
// ---------------------------------------------------------------------------

/**
 * Writes a versioned JSON blob to node.setPluginData and sets a relaunch button.
 *
 * @param node  — the SceneNode to write to.
 * @param key   — logical key (namespaced automatically).
 * @param value — the payload to persist.
 */
export function setPersistedState<T>(node: SceneNode, key: string, value: T): void {
  const versioned: VersionedState<T> = {
    _v: CURRENT_STATE_VERSION,
    data: value,
  };

  let serialised: string;
  try {
    serialised = JSON.stringify(versioned);
  } catch (_e) {
    console.warn('[persistence] JSON.stringify failed for key "' + key + '" on node ' + node.id);
    return;
  }

  node.setPluginData(namespacedKey(key), serialised);

  // Set relaunch data so the user can re-open the editor from this node on canvas.
  // setRelaunchData is not included in Figma's undo history (Figma API limitation).
  if ('setRelaunchData' in node) {
    try {
      (
        node as SceneNode & { setRelaunchData: (data: Record<string, string>) => void }
      ).setRelaunchData({ open: 'Open with Welder Editor' });
    } catch (_e) {
      // silent — setRelaunchData may fail in read-only context
    }
  }
}

// ---------------------------------------------------------------------------
// Migration — migrateLegacyState
// ---------------------------------------------------------------------------

/**
 * Forward-migration: reads from oldKey using a lenient raw-data reader,
 * transforms the value, and writes the result to newKey.
 * Removes oldKey after successful migration so the migration does not repeat.
 *
 * This function is a no-op if oldKey has no data.
 *
 * @param node      — the SceneNode to migrate.
 * @param oldKey    — legacy pluginData key (namespaced automatically).
 * @param newKey    — new pluginData key (namespaced automatically).
 * @param transform — function that converts the old raw data to the new T.
 */
export function migrateLegacyState<T>(
  node: SceneNode,
  oldKey: string,
  newKey: string,
  transform: (raw: unknown) => T | null,
): void {
  const raw = node.getPluginData(namespacedKey(oldKey));
  if (raw === '' || raw === null || raw === undefined) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    console.warn('[persistence] migrateLegacyState: JSON.parse failed for oldKey "' + oldKey + '"');
    return;
  }

  const transformed = transform(parsed);
  if (transformed === null) {
    console.warn(
      '[persistence] migrateLegacyState: transform returned null for oldKey "' + oldKey + '"',
    );
    return;
  }

  setPersistedState<T>(node, newKey, transformed);

  // Remove old key after successful migration.
  node.setPluginData(namespacedKey(oldKey), '');
  console.warn('[persistence] migrated "' + oldKey + '" → "' + newKey + '" on node ' + node.id);
}

// ---------------------------------------------------------------------------
// clientStorage wrappers (user-scoped, cross-file settings)
// ---------------------------------------------------------------------------

/**
 * Reads a value from figma.clientStorage by key.
 * Returns null when the key is not set or the value cannot be parsed.
 *
 * @figma-direct: figma.clientStorage.getAsync — no wrapper covers clientStorage.
 */
export async function getClientState<T>(
  key: string,
  guard: (u: unknown) => u is T,
): Promise<T | null> {
  let raw: unknown;
  try {
    // @figma-direct: figma.clientStorage.getAsync — no wrapper.
    raw = await figma.clientStorage.getAsync(namespacedKey(key));
  } catch (_e) {
    return null;
  }
  if (raw === undefined || raw === null) return null;
  if (!guard(raw)) return null;
  return raw;
}

/**
 * Writes a value to figma.clientStorage by key.
 *
 * @figma-direct: figma.clientStorage.setAsync — no wrapper covers clientStorage.
 */
export async function setClientState<T>(key: string, value: T): Promise<void> {
  try {
    // @figma-direct: figma.clientStorage.setAsync — no wrapper.
    await figma.clientStorage.setAsync(namespacedKey(key), value);
  } catch (_e) {
    console.warn('[persistence] setClientState failed for key "' + key + '"');
  }
}
