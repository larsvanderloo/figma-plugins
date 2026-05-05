// packages/figma-api/src/manifest.ts
//
// Manifest parsing and validation helper.
//
// Owner: figma-api-engineer
// Monday task: 1.9 (part 2)
//
// ADR-0003 §A: hand-rolled type guards instead of Zod on the code side.
// Zod adds ~21 KB gzip; the manifest is validated once at startup and the
// shape is narrow.  Named `unknown` → discriminated-union guards give the
// same runtime safety at zero bundle cost.
//
// Validates: editorType, name, id, main, ui, documentAccess, networkAccess,
// permissions, relaunchButtons.

// ---------------------------------------------------------------------------
// Manifest type
// ---------------------------------------------------------------------------

export type FigmaEditorType = 'figma' | 'figjam' | 'slides' | 'dev' | 'buzz';

export type FigmaDocumentAccess = 'dynamic-page' | 'full';

export type FigmaNetworkAccess =
  | { allowedDomains: 'none' }
  | { allowedDomains: ReadonlyArray<string> };

export type FigmaPermission = 'currentuser' | 'teamlibrary';

export interface FigmaRelaunchButton {
  command: string;
  name: string;
  description?: string;
}

/**
 * Typed representation of a Figma plugin manifest.json.
 *
 * Only the fields relevant to welder-editor v0.1.0 are typed here.
 * Unknown top-level fields are not an error — Figma adds new manifest
 * fields in minor API updates; a strict unknown-field rejection would
 * break on new Figma versions.
 */
export interface FigmaPluginManifest {
  name: string;
  id: string;
  main: string;
  ui?: string;
  editorType: ReadonlyArray<FigmaEditorType>;
  documentAccess?: FigmaDocumentAccess;
  networkAccess?: FigmaNetworkAccess;
  permissions?: ReadonlyArray<FigmaPermission>;
  relaunchButtons?: ReadonlyArray<FigmaRelaunchButton>;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type ManifestParseErrorCode =
  | 'NOT_AN_OBJECT'
  | 'MISSING_NAME'
  | 'MISSING_ID'
  | 'MISSING_MAIN'
  | 'INVALID_EDITOR_TYPE'
  | 'INVALID_DOCUMENT_ACCESS'
  | 'INVALID_NETWORK_ACCESS'
  | 'INVALID_PERMISSIONS'
  | 'INVALID_RELAUNCH_BUTTONS';

export interface ManifestParseError {
  code: ManifestParseErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Result type (local only — not re-exported to avoid conflict with router.ts)
// ---------------------------------------------------------------------------

type ManifestResult<T, E> = { ok: true; data: T } | { ok: false; error: E };

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Narrows a value to a valid FigmaEditorType string. */
export function validateEditorType(value: unknown): value is FigmaEditorType {
  return (
    value === 'figma' ||
    value === 'figjam' ||
    value === 'slides' ||
    value === 'dev' ||
    value === 'buzz'
  );
}

function validateDocumentAccess(value: unknown): value is FigmaDocumentAccess {
  return value === 'dynamic-page' || value === 'full';
}

function validateNetworkAccess(value: unknown): value is FigmaNetworkAccess {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!('allowedDomains' in v)) return false;
  const ad = v['allowedDomains'];
  if (ad === 'none') return true;
  if (!Array.isArray(ad)) return false;
  for (const item of ad) {
    if (typeof item !== 'string') return false;
  }
  return true;
}

function validatePermissions(value: unknown): value is ReadonlyArray<FigmaPermission> {
  if (!Array.isArray(value)) return false;
  const valid = new Set<string>(['currentuser', 'teamlibrary']);
  for (const item of value) {
    if (typeof item !== 'string' || !valid.has(item)) return false;
  }
  return true;
}

function validateRelaunchButtons(value: unknown): value is ReadonlyArray<FigmaRelaunchButton> {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return false;
    const b = item as Record<string, unknown>;
    if (typeof b['command'] !== 'string') return false;
    if (typeof b['name'] !== 'string') return false;
    if ('description' in b && typeof b['description'] !== 'string') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// parseManifest
// ---------------------------------------------------------------------------

/**
 * Parses and validates a manifest.json value loaded via JSON.parse.
 *
 * Returns Result<FigmaPluginManifest, ManifestParseError>.
 *
 * Validation is structural — it checks required fields and their types but
 * does not enforce domain-specific constraints (e.g. that `main` points to
 * an existing file; that is a build-time concern).
 *
 * Per ADR-0003 §A: no Zod dependency.  Hand-rolled type guards throughout.
 */
export function parseManifest(
  json: unknown,
): ManifestResult<FigmaPluginManifest, ManifestParseError> {
  if (typeof json !== 'object' || json === null) {
    return {
      ok: false,
      error: { code: 'NOT_AN_OBJECT', message: 'Manifest must be a JSON object' },
    };
  }

  const obj = json as Record<string, unknown>;

  // Required: name
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) {
    return {
      ok: false,
      error: { code: 'MISSING_NAME', message: 'manifest.name must be a non-empty string' },
    };
  }

  // Required: id
  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) {
    return {
      ok: false,
      error: { code: 'MISSING_ID', message: 'manifest.id must be a non-empty string' },
    };
  }

  // Required: main
  if (typeof obj['main'] !== 'string' || obj['main'].length === 0) {
    return {
      ok: false,
      error: { code: 'MISSING_MAIN', message: 'manifest.main must be a non-empty string' },
    };
  }

  // Required: editorType (array of valid values)
  if (!Array.isArray(obj['editorType']) || obj['editorType'].length === 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_EDITOR_TYPE',
        message: 'manifest.editorType must be a non-empty array',
      },
    };
  }
  for (const et of obj['editorType']) {
    if (!validateEditorType(et)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_EDITOR_TYPE',
          message: `manifest.editorType contains invalid value: ${String(et)}`,
        },
      };
    }
  }

  // Optional: documentAccess
  if (obj['documentAccess'] !== undefined && !validateDocumentAccess(obj['documentAccess'])) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DOCUMENT_ACCESS',
        message: `manifest.documentAccess must be "dynamic-page" or "full"`,
      },
    };
  }

  // Optional: networkAccess
  if (obj['networkAccess'] !== undefined && !validateNetworkAccess(obj['networkAccess'])) {
    return {
      ok: false,
      error: {
        code: 'INVALID_NETWORK_ACCESS',
        message: 'manifest.networkAccess.allowedDomains must be "none" or an array of strings',
      },
    };
  }

  // Optional: permissions
  if (obj['permissions'] !== undefined && !validatePermissions(obj['permissions'])) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PERMISSIONS',
        message: 'manifest.permissions must be an array of "currentuser" | "teamlibrary"',
      },
    };
  }

  // Optional: relaunchButtons
  if (obj['relaunchButtons'] !== undefined && !validateRelaunchButtons(obj['relaunchButtons'])) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RELAUNCH_BUTTONS',
        message: 'manifest.relaunchButtons must be an array of { command, name, description? }',
      },
    };
  }

  const manifest: FigmaPluginManifest = {
    name: obj['name'] as string,
    id: obj['id'] as string,
    main: obj['main'] as string,
    editorType: obj['editorType'] as ReadonlyArray<FigmaEditorType>,
  };

  if (typeof obj['ui'] === 'string') manifest.ui = obj['ui'];

  if (obj['documentAccess'] !== undefined) {
    manifest.documentAccess = obj['documentAccess'] as FigmaDocumentAccess;
  }
  if (obj['networkAccess'] !== undefined) {
    manifest.networkAccess = obj['networkAccess'] as FigmaNetworkAccess;
  }
  if (obj['permissions'] !== undefined) {
    manifest.permissions = obj['permissions'] as ReadonlyArray<FigmaPermission>;
  }
  if (obj['relaunchButtons'] !== undefined) {
    manifest.relaunchButtons = obj['relaunchButtons'] as ReadonlyArray<FigmaRelaunchButton>;
  }

  return { ok: true, data: manifest };
}
