# ADR 0016 — Dev console bridge: Figma plugin console to terminal

**Status:** Accepted
**Date:** 2026-05-06
**Decision-makers:** figma-api-engineer
**Sprint:** Sprint 6.3 (MON-2895942168)
**References:** `tools/dev-console-bridge/server.mjs`, `plugins/welder-editor/code/dev-console.ts`, `plugins/welder-editor/manifest.dev.json`, `runbooks/local-development.md §11`

---

## Context

During local plugin development the only way to see `console.log/.warn/.error` output from the Figma plugin code sandbox is through `Plugins → Development → Show/Hide Console` inside Figma. This fragments developer attention between two windows and is slow to navigate. The goal is to stream plugin console output to the developer's terminal in real time, alongside `pnpm dev:code`.

### What was investigated (option 1 ruled out)

The obvious approach — tailing a log file — was the first thing to verify. The investigation found:

- `~/Library/Logs/Figma/` does **not** exist on macOS. The reference to it in `runbooks/local-development.md §5` predates our actual setup and refers to a path that Figma desktop does not write.
- The main Figma Electron process (verified via `lsof -p <PID> -d 1,2`) has both stdout (fd 1) and stderr (fd 2) routed to `/dev/null`. All console output from the Electron app and its renderer processes is discarded at the process level.
- The macOS Unified Log (`/usr/bin/log show --predicate "processID == <figma-pid>"`) only surfaces system-level XPC/AppKit/CoreSpotlight events — no plugin `console.*` output.

Option 1 (tail Figma desktop logs) is therefore **not viable**. There is no file to tail.

### The constraint surface

The Figma plugin runtime separates two execution contexts:

1. **Code sandbox** (`code/main.ts`, runs `figma.*`): `fetch()` is available but only to domains listed in `manifest.json` → `networkAccess.allowedDomains`. Calls to unlisted origins throw synchronously. No DOM, no WebSocket constructor.

2. **UI iframe** (`ui/index.html`, runs Vue): standard browser sandbox. Can `fetch`/`WebSocket` to `localhost` freely. BUT: modifying the UI to relay console messages crosses the `ui-engineer` domain boundary. The task brief explicitly marks this as a cross-domain halt.

### Options considered

| Option | Approach                                                | Verdict                                                      |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| 1      | Tail `~/Library/Logs/Figma/`                            | Dead — file does not exist; stdout/stderr → `/dev/null`      |
| 2      | Console interceptor in `code/` → `fetch` → Node sidecar | **Chosen** (see below)                                       |
| 3      | `figma.notify()` mirror                                 | No terminal output; Figma UI only; covers only short strings |
| 4      | Dev/prod manifest split                                 | Required as part of option 2; not standalone                 |
| 5      | UI WebSocket relay                                      | Requires `ui/` changes — cross-domain halt                   |

---

## Decision

**Option 2 + 4 hybrid**: a console interceptor lives purely in `code/dev-console.ts` and a tiny Node.js HTTP server sidecar lives in `tools/dev-console-bridge/server.mjs`.

### How it works

1. `installDevConsole()` in `code/dev-console.ts` wraps `console.log`, `console.warn`, `console.error`, and the `unhandledrejection` global event. Each wrapped call fire-and-forgets a JSON POST to `http://127.0.0.1:8765`.

2. `tools/dev-console-bridge/server.mjs` — a zero-dependency Node.js HTTP server — receives those POSTs and prints them to stdout with ANSI colour formatting (green LOG, yellow WARN, red ERROR/REJECTION, dimmed timestamp).

3. `manifest.dev.json` is a copy of `manifest.json` with `allowedDomains: ["http://localhost:8765"]` added. The developer swaps it into place before loading the plugin in Figma.

4. The call to `installDevConsole()` in `main.ts` is guarded by `if (import.meta.env.DEV)`. Vite replaces `import.meta.env.DEV` with the boolean literal `false` in production builds, so the entire block — and the import of `dev-console.ts` — is dead-code-eliminated. The production bundle carries zero bytes of this module.

### Dev workflow (three terminals)

```
Terminal A: pnpm --filter @figma-plugins/welder-editor dev:manifest
            pnpm --filter @figma-plugins/welder-editor dev:code

Terminal B: pnpm --filter @figma-plugins/welder-editor dev:logs

Terminal C: # Figma desktop — reload plugin, see logs stream into Terminal B
```

On wrap-up:

```
pnpm --filter @figma-plugins/welder-editor dev:manifest:restore
```

See `runbooks/local-development.md §11` for the full step-by-step.

---

## Consequences

### Positive

- Zero production impact. The `installDevConsole()` call and the `dev-console.ts` module are entirely removed from the production bundle by Vite's dead-code elimination.
- No UI changes needed. Purely code-side.
- No npm dependencies. The sidecar is a ~100-line vanilla Node.js ESM script.
- Captures all four streams: `console.log`, `console.warn`, `console.error`, and `unhandledrejection`.
- The Figma in-app console (Show/Hide Console) continues to work in parallel — we prepend to the originals, not replace.

### Negative / trade-offs

- **Two-step manifest swap.** The developer must run `dev:manifest` before importing the plugin in Figma, and `dev:manifest:restore` when done. Forgetting to restore leaves `manifest.json` pointing to localhost in the working tree; CI (`pnpm lint` + manifest validator in `tools/validate_manifest.py`) will catch this before a PR lands.
- **Requires `dev:code` to be in watch mode for `import.meta.env.DEV` to be `true`.** Running a production build (`pnpm build`) will not activate the bridge even if the dev manifest is in place — intentional.
- **Port collision.** If port 8765 is taken, the server exits with a clear error message. `DEV_CONSOLE_PORT` env var overrides the port (must also be updated in `manifest.dev.json`).
- **`allowedDomains` lint.** `tools/validate_manifest.py` (the CI manifest validator) must not reject `manifest.dev.json` — it does not; only `manifest.json` is validated in CI (the dev manifest is a dev artefact). The restored `manifest.json` retains `"allowedDomains": ["none"]`.

### Not a concern

The `manifest.dev.json` only allows `http://localhost:8765`. It does not allow any external domain. There is no way for the production manifest to accidentally pick up this entry — the swap is manual and the restore is explicit.

---

## Alternatives not taken

**WebSocket in the code sandbox**: the Figma sandbox has no `WebSocket` constructor. Only `fetch` is available (for `allowedDomains` origins). HTTP POST was chosen over a persistent WS because it requires no handshake and the server can be stateless.

**Proxy through the UI iframe**: technically possible and avoids the manifest change, but crosses the `ui-engineer` domain boundary (the ui-side WebSocket relay would require Vue state changes and message-bus plumbing that `ui-engineer` owns). The HTTP fetch approach stays entirely in `figma-api-engineer` territory.

**`figma.notify()` mirror**: notify() is limited to ~80 chars visible at a time, ephemeral (auto-dismisses), and doesn't reach the terminal. Suitable only as a last resort for one-off messages, not for streaming logs.
