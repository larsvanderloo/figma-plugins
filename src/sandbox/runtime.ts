// Dev Mode is read-only — mutators and backfills check isDevModeRuntime() and skip there.

import { PluginRuntimeInfo } from '../shared/types';
import { isPluginDebugEnabled } from '../shared/debug';

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
