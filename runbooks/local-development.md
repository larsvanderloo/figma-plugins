# Local development

Owned by `project-pm` + `figma-api-engineer`. Day-to-day developer workflow inside this monorepo.

---

## 1. The dev loop

Most plugin work follows this loop:

1. **Pick a Monday item** from Backlog → Refined → Ready (per `runbooks/monday-workflow.md`).
2. **Branch**: `git switch -c <type>/MON-<id>-<slug>`.
3. **Build the plugin in dev mode**:
   ```bash
   pnpm --filter @figma-plugins/<slug> dev
   ```
   This starts a Vite dev build that watches `code/` and `ui/` and rebuilds on save.
4. **Load the plugin in Figma desktop**:
   - `Plugins → Development → Import plugin from manifest…`
   - Select `plugins/<slug>/manifest.json` (one-time per plugin install).
   - The plugin appears under `Plugins → Development → <Plugin Name>`.
5. **Iterate**: edit code, plugin reloads on save (manual close/re-open of the plugin in Figma — Figma doesn't auto-reload extensions).
6. **Test**:
   ```bash
   pnpm --filter @figma-plugins/<slug> typecheck   # vue-tsc
   pnpm --filter @figma-plugins/<slug> test        # vitest
   pnpm --filter @figma-plugins/<slug> lint        # eslint + prettier check
   ```
7. **Commit** with the canonical subject format (the `commit-msg` hook auto-injects the `[#MON-<id>]` if the branch slug carries the ID).
8. **Open PR** with `Resolves MON-<id>` in the body.

## 2. Workspace commands

Run across all workspace packages from the repo root:

| Command                  | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `pnpm install`           | Install dependencies for every package                                    |
| `pnpm -r typecheck`      | `vue-tsc --noEmit` across every package                                   |
| `pnpm -r test`           | `vitest run` across every package                                         |
| `pnpm -r lint`           | ESLint + Prettier check across every package                              |
| `pnpm -r build`          | `vite build` for every plugin                                             |
| `pnpm -r --parallel dev` | Start dev mode for every plugin in parallel (rare; usually filter to one) |

Filter to a single workspace:

```bash
pnpm --filter @figma-plugins/welder-editor <command>
pnpm --filter @figma-plugins/components <command>
pnpm --filter "@figma-plugins/sections-*" <command>
```

## 3. Repo conventions

- **Package names**: `@figma-plugins/<slug>` for plugins, `@figma-plugins/components`, `@figma-plugins/sections-<name>`, `@figma-plugins/figma-api` for shared.
- **Import paths**: workspace packages imported by name, never relative across workspace boundaries (e.g., `import { Button } from "@figma-plugins/components"`, not `../components/...`).
- **Per-plugin scripts**: every plugin's `package.json` defines `dev`, `build`, `typecheck`, `test`, `lint`. New plugins inherit these from `plugins/_template/package.json`.
- **TypeScript config**: every package extends `tsconfig.base.json`. Per-package `tsconfig.json` adds workspace-specific paths and includes.

## 4. Vite configuration

Every plugin has a `vite.config.ts` that defines two entries:

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        code: 'code/main.ts', // bundled into dist/code.js
        ui: 'ui/index.html', // bundled into dist/ui.html + assets
      },
      output: {
        format: 'iife', // Figma sandbox needs IIFE for `code` bundle
        entryFileNames: '[name].js',
      },
    },
  },
});
```

The `code` bundle is IIFE (Figma's sandbox doesn't support ES modules). The `ui` bundle is a standard Vite app and can use ES modules; it loads in the iframe.

`manifest.json` references `dist/code.js` and `dist/ui.html` after build. During `dev`, Vite serves the ui from a localhost URL and the manifest's `ui` field points there — Figma loads the iframe from the dev server for hot reload.

## 5. Debugging

**Plugin console**: `Plugins → Development → Show/Hide Console`. Logs from both `code/` and `ui/` show up here, prefixed.

**Iframe DevTools**: Right-click in the plugin UI → Inspect Element. Opens Chromium DevTools attached to the iframe. Full breakpoint debugging on the ui side.

**Code-side debugging**: harder — the sandbox doesn't expose DevTools. Use `console.log` and read the plugin console. Source maps work for column-accurate stack traces.

**Figma desktop logs**: `~/Library/Logs/Figma/` on macOS. Useful for plugin-loading failures that don't surface in the console.

## 6. Working across workspace packages

When a change touches a shared package (`components`, `sections`, `packages/figma-api`):

1. Make the change in the shared package.
2. Re-run `pnpm install` if you added/removed exports (pnpm handles workspace links automatically, but type info needs a re-resolve sometimes).
3. Re-run `pnpm --filter @figma-plugins/<plugin> dev` — Vite picks up workspace changes via pnpm's symlinks.
4. Test in Figma. The plugin re-imports the updated workspace package.
5. Run `pnpm -r typecheck` to verify the change doesn't break other plugins.

## 7. Common pitfalls

- **`localStorage` doesn't persist across plugin sessions.** It's the iframe's; use `figma.clientStorage` via the message bus instead.
- **`fetch` to a non-`allowedDomains` URL throws synchronously.** Add the domain to `manifest.json` `networkAccess.allowedDomains` first.
- **`figma.*` calls outside the `code/` bundle don't exist.** The iframe has no Figma API. Use the message bus.
- **`vue-tsc` is slow on cold cache.** First run takes 30–60 s; subsequent runs are < 5 s. Don't conflate with a hung build.
- **Vite dev server's HMR doesn't fully refresh the plugin.** Close + re-open the plugin in Figma after big changes (especially manifest changes — those need a manifest re-import).
- **Editor type matters.** A plugin marked for `["figma", "figjam", "slides"]` runs in all three; some `figma.*` calls behave differently. Test in each enabled editor type before opening a PR.
- **Persisted state surface confusion.** `clientStorage` is per-user, cross-file. `setPluginData` is per-node. `setSharedPluginData` is per-node, cross-plugin via namespace. Pick the right surface in `plugin.toml`'s storage section and document it in `shared/messages.ts`.

## 8. Performance during dev

The dev build is unminified and includes source maps — bigger than production by ~3×. Don't measure bundle size during dev; run the production build (`pnpm --filter @figma-plugins/<slug> build`) and the bundle analyzer.

The dev iframe is served from localhost, which has different caching behavior than production. CORS issues that work in dev may break in prod (and vice versa). When something works in dev but breaks in production, check `manifest.json` `networkAccess` first.

## 9. Switching between plugins

`pnpm install` is fast on cold cache (~ 30 s) and instant on warm. Switching plugins is `cd` + run; no per-plugin install dance.

If a plugin's `package.json` adds a new dep that isn't in another plugin, rerun `pnpm install` from the root to pull it in for everyone (or the workspace will warn on next plugin's first run).

## 10. Cleanup

Built artifacts go in `dist/` per plugin and are gitignored. To force-clean:

```bash
pnpm -r exec rm -rf dist
rm -rf node_modules .pnpm-store
pnpm install
```

(`node_modules` removal is rarely needed; pnpm's content-addressable store handles most issues.)
