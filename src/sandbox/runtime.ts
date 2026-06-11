// ============================================================
// sandbox/runtime.ts
//
// Runtime-omgevingsinfo voor de sandbox: in welk editor-type draait de
// plugin en met welke vlaggen. Dev Mode is read-only — mutators en
// backfills checken isDevModeRuntime() en skippen daar.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { PluginRuntimeInfo } from '../types';
import { isPluginDebugEnabled } from '../debug';

export function isDevModeRuntime(): boolean {
  return figma.editorType === 'dev';
}

export function getRuntimeInfo(): PluginRuntimeInfo {
  return {
    editorType: figma.editorType,
    mode: figma.mode,
    command: figma.command,
    vscode: figma.vscode !== undefined && figma.vscode !== null,
    debug: isPluginDebugEnabled(),
  };
}
