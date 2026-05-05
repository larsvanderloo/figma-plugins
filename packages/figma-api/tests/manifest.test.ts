// packages/figma-api/tests/manifest.test.ts
//
// Tests for manifest.ts — hand-rolled parseManifest and validateEditorType.
//
// No figma.* dependency.

import { describe, it, expect } from 'vitest';
import { parseManifest, validateEditorType } from '../src/manifest';

// ---------------------------------------------------------------------------
// validateEditorType
// ---------------------------------------------------------------------------

describe('validateEditorType', () => {
  it.each(['figma', 'figjam', 'slides', 'dev', 'buzz'])('accepts valid editor type "%s"', (et) => {
    expect(validateEditorType(et)).toBe(true);
  });

  it.each([null, undefined, '', 'sketch', 123, {}])('rejects invalid value: %s', (val) => {
    expect(validateEditorType(val)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseManifest — happy paths
// ---------------------------------------------------------------------------

describe('parseManifest', () => {
  it('happy path: minimal valid manifest', () => {
    const result = parseManifest({
      name: 'Welder Editor',
      id: '1234567890',
      main: 'dist/code.js',
      editorType: ['figma', 'slides'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Welder Editor');
    expect(result.data.id).toBe('1234567890');
    expect(result.data.main).toBe('dist/code.js');
    expect(result.data.editorType).toEqual(['figma', 'slides']);
  });

  it('happy path: full manifest with all optional fields', () => {
    const result = parseManifest({
      name: 'Welder Editor',
      id: '9876543210',
      main: 'dist/code.js',
      ui: 'dist/ui.html',
      editorType: ['figma', 'slides'],
      documentAccess: 'dynamic-page',
      networkAccess: { allowedDomains: 'none' },
      permissions: ['teamlibrary'],
      relaunchButtons: [{ command: 'edit', name: 'Edit Slide', description: 'Open the editor' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.documentAccess).toBe('dynamic-page');
    expect(result.data.networkAccess).toEqual({ allowedDomains: 'none' });
    expect(result.data.permissions).toEqual(['teamlibrary']);
    expect(result.data.relaunchButtons).toHaveLength(1);
    expect(result.data.relaunchButtons?.[0]?.command).toBe('edit');
  });

  it('happy path: networkAccess with allowed domains array', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma'],
      networkAccess: { allowedDomains: ['api.example.com'] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.networkAccess).toEqual({ allowedDomains: ['api.example.com'] });
  });

  // ---------------------------------------------------------------------------
  // parseManifest — error paths
  // ---------------------------------------------------------------------------

  it('error: non-object input returns NOT_AN_OBJECT', () => {
    const result = parseManifest('not-an-object');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_AN_OBJECT');
  });

  it('error: null input returns NOT_AN_OBJECT', () => {
    const result = parseManifest(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_AN_OBJECT');
  });

  it('error: missing name returns MISSING_NAME', () => {
    const result = parseManifest({ id: '1', main: 'code.js', editorType: ['figma'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_NAME');
  });

  it('error: missing id returns MISSING_ID', () => {
    const result = parseManifest({
      name: 'Test',
      main: 'code.js',
      editorType: ['figma'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_ID');
  });

  it('error: missing main returns MISSING_MAIN', () => {
    const result = parseManifest({ name: 'Test', id: '1', editorType: ['figma'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_MAIN');
  });

  it('error: empty editorType array returns INVALID_EDITOR_TYPE', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_EDITOR_TYPE');
  });

  it('error: unknown editorType value returns INVALID_EDITOR_TYPE', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma', 'sketch'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_EDITOR_TYPE');
  });

  it('error: invalid documentAccess returns INVALID_DOCUMENT_ACCESS', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma'],
      documentAccess: 'all-pages',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_DOCUMENT_ACCESS');
  });

  it('error: invalid networkAccess returns INVALID_NETWORK_ACCESS', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma'],
      networkAccess: { allowedDomains: 42 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_NETWORK_ACCESS');
  });

  it('error: invalid permissions entry returns INVALID_PERMISSIONS', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma'],
      permissions: ['admin'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_PERMISSIONS');
  });

  it('error: invalid relaunchButtons entry returns INVALID_RELAUNCH_BUTTONS', () => {
    const result = parseManifest({
      name: 'Test',
      id: '1',
      main: 'code.js',
      editorType: ['figma'],
      relaunchButtons: [{ command: 123, name: 'Open' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_RELAUNCH_BUTTONS');
  });
});
