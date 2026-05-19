# Figma Plugin Debug Setup

This document describes the debug setup for the Welder Editor Figma plugin: what changed in the codebase, which runtime each tool can see, and how to run a debug session from VS Code while still using Figma Desktop for plugin runtime inspection.

## Goal

The plugin runs in two runtime contexts:

- `src/code.ts` runs in the Figma plugin sandbox. This is the only side that can call `figma.*` APIs and mutate the Figma document.
- `src/ui/` runs inside the plugin iframe. This is the Vue/Nuxt UI and has DOM/browser APIs, but no direct `figma.*` access.

The debug setup keeps that split intact:

- VS Code handles editing, build/watch tasks, type checks, and terminal log collection.
- Figma Desktop Developer Tools handle source breakpoints, `debugger;` statements, runtime stack traces, and direct inspection of `figma.*`.
- A local debug manifest and log server mirror routine plugin logs into VS Code so we do not have to manually paste every console line.

## Files Added

- `.vscode/tasks.json`
  - Adds `Figma: debug session`, `Figma: debug watch`, `Figma: build`, and `Figma: typecheck UI`.
  - `.gitignore` allows this one shared task file while keeping other local `.vscode/*` files ignored.

- `src/debug.ts`
  - Shared debug helper imported by both the sandbox and iframe code.
  - Exposes `debugLog(scope, event, data?)`, `debugMessage(direction, msg)`, and `isPluginDebugEnabled()`.
  - Debug output is controlled by the compile-time `__PLUGIN_DEBUG__` flag.
  - Logs to Figma's console and, when configured, POSTs a summarized event to the local collector.
  - The local collector endpoint is injected only in debug builds; production builds do not contain the localhost endpoint.
  - Payloads are summarized before logging so large values do not flood the console:
    - `Uint8Array` values log as byte counts.
    - Long strings log as `{ type: "string", chars, preview }`.
    - Arrays and objects are truncated to bounded sizes.
    - Circular objects are guarded.

- `scripts/debug-log-server.mjs`
  - Small local HTTP server for debug sessions.
  - Listens on `http://localhost:4789/log`.
  - Accepts Figma debug events with CORS enabled.
  - Prints compact lines to the terminal.
  - Writes full JSONL records to `.local/figma-debug.log`.
  - `npm run debug:logs` starts it with `--clear`, so each session starts with a fresh local log file.

- `scripts/write-debug-manifests.mjs`
  - Generates importable debug manifests in `manifest-cache/`.
  - Figma requires the imported file to be named exactly `manifest.json`, so the checked-in `manifest.debug.json` and `manifest.dev.json` files are source templates.
  - Copies `dist/code.js` and `dist/ui.html` into each generated manifest directory because Figma requires `main` and `ui` to be in the same directory as the manifest, or in one of its subdirectories.

- `manifest.debug.json`
  - Source template for the mutating Figma Desktop debug manifest.
  - Uses the same `dist/code.js` and `dist/ui.html` as production.
  - Keeps `editorType: ["figma", "slides"]`.
  - Adds localhost network access for the debug log collector:

    ```json
    {
      "allowedDomains": ["http://localhost:4789"],
      "reasoning": "Allows this development-only debug plugin to send runtime logs to a local collector."
    }
    ```

  - `npm run debug:manifests` writes the importable file to `manifest-cache/debug/manifest.json` and copies the bundle beside it.

- `manifest.dev.json`
  - Source template for the separate read-only Dev Mode manifest for Figma-for-VS-Code diagnostics.
  - Uses the same `dist/code.js` and `dist/ui.html` bundle.
  - Declares `editorType: ["dev"]` and `capabilities: ["inspect", "vscode"]`.
  - Allows localhost logging, but mutating bridge commands remain blocked.
  - `npm run debug:manifests` writes the importable file to `manifest-cache/dev/manifest.json` and copies the bundle beside it.

## Files Changed

- `package.json`
  - Added:
    - `build:version`: writes the iframe version badge module from `package.json`.
    - `version:assert`: verifies generated bundles contain the current package version and no stale `0.5.x` tag.
    - `debug:build`: runs the normal build with `PLUGIN_DEBUG=1` and injects the local log endpoint.
    - `debug:watch`: runs the normal watch pipeline with `PLUGIN_DEBUG=1`, injects the local log endpoint, and keeps generated manifest bundle copies synced.
    - `debug:manifests`: writes Figma-importable `manifest-cache/*/manifest.json` files from the debug templates and copies the current bundle.
    - `debug:logs`: starts the local log collector.
    - `debug:session`: runs `debug:logs` and `debug:watch` together.
    - `debug:stop`: stops repo-local debug/watch processes.
    - `debug:restart`: runs `debug:stop`, then starts `debug:session`.
  - Production scripts also run version sync/assertions so release builds cannot ship with a stale UI tag.

- `vite.config.ts`
  - Reads `process.env.PLUGIN_DEBUG === "1"`.
  - Reads `process.env.PLUGIN_DEBUG_LOG_ENDPOINT` only in debug mode.
  - Injects these compile-time constants into the iframe bundle:
    - `__PLUGIN_DEBUG__`
    - `__PLUGIN_DEBUG_SOURCE__ = "ui"`
    - `__PLUGIN_DEBUG_LOG_ENDPOINT__`
  - Enables inline sourcemaps only when debug mode is on.

- `esbuild.config.mjs`
  - Reads `process.env.PLUGIN_DEBUG === "1"`.
  - Reads `process.env.PLUGIN_DEBUG_LOG_ENDPOINT` only in debug mode.
  - Injects these compile-time constants into the sandbox bundle:
    - `__PLUGIN_DEBUG__`
    - `__PLUGIN_DEBUG_SOURCE__ = "sandbox"`
    - `__PLUGIN_DEBUG_LOG_ENDPOINT__`
  - Enables inline sourcemaps only when debug mode is on.
  - Marks esbuild console output with `(debug)` in debug mode.

- `src/code.ts`
  - Imports the debug helpers.
  - Logs sandbox startup/runtime metadata:
    - `figma.editorType`
    - `figma.mode`
    - `figma.command`
    - whether `figma.vscode` exists
    - whether debug mode is enabled
  - Logs bridge traffic:
    - UI to plugin messages
    - plugin to UI messages
  - Logs Figma runtime events:
    - `selectionchange`
    - `currentpagechange`
    - page `nodechange`
    - plugin close
  - Logs slide emission and refresh points:
    - `emit-slide-loaded:start`
    - `emit-slide-loaded:posted`
    - `post-slide-content`
    - `post-slide-summary`
  - Sends runtime metadata in the `init` message.
  - Adds Dev Mode read-only gates:
    - allows `ui-ready`, `resize-ui`, `set-icon-recents`, `export-document`, and `close`
    - blocks document-mutating commands with a `target-updated` error
    - skips background icon backfills, icon cache priming, and visibility-normalizing writes in Dev Mode

- `src/types.ts`
  - Adds `PluginRuntimeInfo`.
  - Extends the `init` message with optional `runtime` metadata.

- `src/ui/composables/usePluginBridge.ts`
  - Logs UI-to-plugin bridge sends.
  - Logs plugin-to-UI bridge receives.

- `src/ui/stores/usePluginView.ts`
  - Stores the runtime metadata from the sandbox so UI code can inspect `runtime.editorType`, `runtime.vscode`, and `runtime.debug`.

- `src/ui/App.vue`
  - Reads `msg.runtime` from the `init` message and stores it in `usePluginView`.

- `src/ui/shims-vue.d.ts`
  - Declares the injected `__PLUGIN_DEBUG__` compile-time flag for iframe TypeScript.

- `README.md`
  - Adds the new debug commands.
  - Links to this detailed document.

## Debug Workflow: Figma Desktop With VS Code Logs

Use this for normal mutating Figma Design / Figma Slides debugging.

1. Start debug mode with the VS Code `Figma: debug session` task or `npm run debug:restart`. This is the normal ritual: it stops older repo-local debug/watch processes before starting the fresh watcher/log collector pair, so stale build settings and stale version tags do not keep rewriting `dist/`.

   Restarting the task keeps the generated `manifest-cache/*/dist/` copies in sync and ensures fresh bundles get explicit `sandbox` and `ui` source labels plus the local log endpoint.

2. Start the full debug session:

   ```bash
   npm run debug:session
   ```

   In VS Code, run the `Figma: debug session` task.

3. In Figma Desktop, import the debug manifest:

   ```text
   Plugins -> Development -> Import plugin from manifest -> manifest-cache/debug/manifest.json
   ```

   Figma requires the imported file to be named `manifest.json`, and it requires `main` and `ui` to point inside the manifest directory. Import the generated `manifest-cache/debug/manifest.json`, not the source template `manifest.debug.json`. The debug manifest includes a `networkAccess.reasoning` string because Figma requires it when localhost is listed in `allowedDomains`. The normal root `manifest.json` intentionally has `networkAccess.allowedDomains: ["none"]`, so it cannot POST logs to localhost.

4. Run the plugin from Figma:

   ```text
   Plugins -> Development -> Welder Editor Debug
   ```

5. Watch the VS Code terminal. Expected compact log examples:

   ```text
   [figma-debug-log] listening on http://localhost:4789/log
   [14:32:10.123][sandbox][sandbox] startup {"editorType":"figma","mode":"default","command":"open","vscode":false,"debug":true}
   [14:32:10.456][ui][bridge] ui->plugin ui-ready {"type":"ui-ready"}
   [14:32:10.789][sandbox][bridge] plugin->ui init {"type":"init","runtime":{"editorType":"figma","debug":true}}
   [14:32:11.000][sandbox][figma-event] selectionchange {"selection":1}
   ```

6. For the full browser-like console and breakpoints, also open Figma Developer Tools:

   ```text
   Plugins -> Development -> Open Console...
   ```

   On macOS, `Option+Cmd+I` also opens Developer Tools for the plugin context.

7. For stepping through source, enable:

   ```text
   Plugins -> Development -> Use Developer VM
   ```

   Then add temporary `debugger;` statements where needed and rerun the plugin.

## Debug Workflow: Figma For VS Code / Dev Mode

Use this only for read-only diagnostics.

1. Start the same debug session:

   ```bash
   npm run debug:session
   ```

2. Import/use:

   ```text
   manifest-cache/dev/manifest.json
   ```

3. The sandbox reports runtime metadata showing `editorType: "dev"` and whether `figma.vscode` is available.

4. Mutating bridge commands are intentionally blocked. The UI receives a `target-updated` error with a message like:

   ```text
   Read-only Dev Mode diagnostics: "update-general" is disabled. Use manifest.json in Figma Desktop for document edits.
   ```

## Why VS Code Cannot Directly Read Figma Console

Figma Desktop runs the plugin sandbox and iframe inside Figma's own runtime. VS Code does not automatically attach to that runtime, and Figma's official plugin debugging path is still Figma Developer Tools.

The new local collector solves the practical logging problem by sending structured debug logs from the plugin to `localhost`. That gives us terminal-visible logs for routine investigation. It does not replace Figma Developer Tools for breakpoints, stepping, or inspecting live `figma.*` objects.

## Important Build Gotcha

`dist/` is tracked in this repo so Figma can load the plugin from a fresh checkout.

When `npm run debug:session` or `npm run debug:watch` is running, it continuously rewrites `dist/code.js` and `dist/ui.html` in debug mode and syncs copies into `manifest-cache/*/dist/`. Debug output is much larger because inline sourcemaps are embedded.

Before committing or testing a production handoff:

1. Stop `npm run debug:session`, `npm run debug:watch`, or the VS Code debug task.
2. Run:

   ```bash
   npm run release:check
   ```

   This command refuses to run if watch/debug processes are active, type-checks both runtimes, performs a production build, and verifies that `dist/` does not contain sourcemaps or the localhost debug endpoint.

3. If you only need to assert an already-built bundle, run:

   ```bash
   npm run release:assert
   ```

Expected production shape:

- `hasSourceMap: false`
- `dist/ui.html` around 2.46 MB
- sandbox debug flag compiled to disabled

Expected debug shape:

- inline sourcemaps present
- `dist/ui.html` around 11 MB
- sandbox debug flag compiled to enabled
- the explicit debug endpoint is injected by `npm run debug:build` and `npm run debug:watch`

## Verification Commands

Run these after code changes:

```bash
npm run typecheck
node -e "for (const f of ['package.json','manifest.json','manifest.debug.json','manifest.dev.json','.vscode/tasks.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
npm run debug:manifests
npm run version:assert
node -e "for (const f of ['manifest-cache/debug/manifest.json','manifest-cache/dev/manifest.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('generated manifests ok')"
git diff --check
npm run debug:build
npm run release:check
```

`npm run release:check` is the release gate. It stops accidental debug releases by checking for active watchers, inline sourcemaps, the localhost debug endpoint, and release-manifest network access.

To test only the local collector:

```bash
npm run debug:logs
curl -s -X POST http://localhost:4789/log \
  -H 'content-type: application/json' \
  -d '{"ts":"2026-05-19T14:00:00.000Z","source":"test","scope":"bridge","event":"ping","data":{"ok":true}}'
tail -1 .local/figma-debug.log
```

## Troubleshooting

- No debug logs in the VS Code terminal:
  - Confirm `npm run debug:session` is running, not only `npm run debug:watch`.
  - Confirm Figma loaded `manifest-cache/debug/manifest.json`.
  - Confirm the plugin was rerun after the watcher rebuilt.
  - Check `curl http://localhost:4789/health`.

- Logs appear in Figma console but not VS Code:
  - Most likely Figma loaded `manifest.json`, or the active debug manifest does not list localhost under `networkAccess.allowedDomains`.
  - Re-import `manifest-cache/debug/manifest.json`.
  - Figma reads manifest network permissions at import time, so re-import after any manifest change.

- No breakpoints or no live `figma.*` inspection in VS Code:
  - That is expected. Use Figma Developer Tools and `Use Developer VM` for stepping.

- Production build still has sourcemaps:
  - Check whether `npm run debug:session` or `npm run debug:watch` is still running.
  - Stop it, then run `npm run build`.

- Dev Mode edits fail:
  - That is expected. `manifest.dev.json` is intentionally read-only.
  - Use `manifest-cache/debug/manifest.json` or `manifest.json` in Figma Desktop for document mutations.

- Logs are too large:
  - The shared logger summarizes large payloads, but high-frequency bridge traffic can still be noisy.
  - Filter terminal output by `[bridge]`, `[sandbox]`, `[ui]`, or `[figma-event]`.
  - Inspect `.local/figma-debug.log` for the full JSONL event records.
