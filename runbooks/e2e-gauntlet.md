# E2E gauntlet — manual end-to-end validation

Owned by `ui-engineer`. Run before any release tag and on any PR that touches the top-level user flow.

This is the manual analog of `auval` in audio-plugins — automated tests pass, but a human still has to load the plugin in the host and walk through it. The gauntlet runs in **Figma desktop on macOS arm64** as the canonical environment, then in **Figma web** as a second target. Each enabled editor type (design / FigJam / slides) is a separate run.

The result is documented as a checklist on the PR with a screenshot of each editor's success state.

---

## Prereqs

- Figma desktop installed and authenticated.
- The plugin built from the PR's commit: `pnpm --filter @figma-plugins/<slug> build`.
- The plugin's manifest reflects the editor types being tested.
- A canonical source file from `tools/demos/sources/` for each editor type.

## Loading the plugin

1. Open Figma desktop.
2. Open the canonical source file for the editor type (or any new file).
3. `Plugins → Development → Import plugin from manifest…`
4. Select `plugins/<slug>/manifest.json`.
5. Confirm the plugin appears under `Plugins → Development → <Plugin Name>`.

## The gauntlet, per editor type

Run each section below in **design**, then **FigJam**, then **Slides**, for each editor type the plugin's manifest enables. Skip sections for editor types not enabled.

### Section 1 — Cold start

- [ ] Plugin loads without errors in the dev console (`Plugins → Development → Show/Hide Console`).
- [ ] First paint occurs within 200 ms of opening.
- [ ] Initial state matches the plugin spec (selection-aware, document-aware, theme-aware).
- [ ] No layout shift after first paint.

**Screenshot**: cold-start UI.

### Section 2 — Top-level user flow

Walk through the primary flow described in `plugins/<slug>/docs/api-spec/<feature>.md`:

- [ ] Each step completes within its documented latency budget.
- [ ] No console errors or unhandled rejections.
- [ ] Progress / loading states are visible for any operation > 200 ms.
- [ ] Document mutations group under one Cmd-Z.
- [ ] Result matches the spec's expected output.

**Screenshot**: success state of the primary flow.

### Section 3 — Error path

Trigger one known error (wrong selection, missing font, network failure if applicable):

- [ ] Error is caught — plugin doesn't crash or hang.
- [ ] Error message is user-readable (no stack traces, no internal IDs).
- [ ] Recovery is clear — the user knows what to do next.
- [ ] Plugin returns to a usable state without a reload.

**Screenshot**: error-recovery UI.

### Section 4 — Undo / redo

- [ ] Cmd-Z restores pre-plugin state in one step (or in the documented number of steps if the plugin emits multiple commits intentionally).
- [ ] Cmd-Shift-Z re-applies cleanly.
- [ ] No console errors during undo / redo.
- [ ] Plugin internal state matches the document state after undo.

### Section 5 — Re-run

- [ ] Close the plugin (`Esc` or close button).
- [ ] Re-open the plugin from `Plugins → Development → <Plugin Name>`.
- [ ] State loads correctly: persisted client-storage settings preserved, current selection picked up.
- [ ] No console errors on re-run.

### Section 6 — Keyboard navigation

- [ ] Tab order matches visual flow.
- [ ] Every interactive element is reachable by keyboard.
- [ ] Focus styles always visible.
- [ ] No keyboard shortcuts inside the iframe shadow Figma's host shortcuts (Cmd-Z, Cmd-D, Cmd-A, etc.).
- [ ] `Esc` closes the plugin or, where appropriate, the topmost modal/popover.

### Section 7 — Theme

- [ ] Plugin renders correctly in Figma's light theme.
- [ ] Plugin renders correctly in Figma's dark theme (toggle via Figma's `Preferences → Theme`).
- [ ] Theme switch reflects in the plugin without re-open.

**Screenshots**: light + dark variants.

### Section 8 — Performance under load

For any plugin that traverses or mutates the document, run on a large source file (`large-product-app.fig` for design, `meeting-with-many-users.fig` for FigJam, `data-heavy-deck.fig` for slides):

- [ ] Top-level user flow completes without Figma's "this is taking a while" dialog.
- [ ] UI remains responsive during long operations.
- [ ] No console errors related to memory or timeouts.
- [ ] Final result is correct.

**Screenshot**: progress UI mid-operation.

## Web check

Once all desktop editor types pass, repeat **Section 1 — Cold start** and **Section 2 — Top-level user flow** in **Figma web** for one editor type (typically design):

- [ ] Plugin loads in web without errors.
- [ ] Primary flow completes correctly.
- [ ] No web-specific console errors (web tends to surface postMessage / iframe-policy issues that desktop doesn't).

If web differs from desktop in a material way, file an issue against `figma-api-engineer` to investigate before tagging.

## Documentation

On the PR description (or as a comment), paste:

```
## E2E Gauntlet — <commit-short>

| Editor type | Cold start | Flow | Error | Undo | Re-run | Kbd | Theme | Load | Status |
|---|---|---|---|---|---|---|---|---|---|
| Figma design (desktop) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| FigJam (desktop) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Slides (desktop) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Figma design (web) | ✅ | ✅ | — | — | — | — | — | — | PASS |

Screenshots attached: cold-start, success, error-recovery, light, dark, mid-load.
```

Then comment `validation: pass` on the PR. Without that comment, the tag does not get cut.

## When the gauntlet fails

A failure in any section is blocking. Route per `ui-engineer`'s failure-routing table in `.claude/agents/ui-engineer.md`:

- Cold-start failure → `figma-api-engineer` (init logic) + `figma-api-engineer` (manifest).
- Flow / error / undo failure → `figma-api-engineer` + `figma-api-engineer`.
- Keyboard / theme / a11y failure → `ui-engineer` (you fix or document the gap).
- Editor-type-specific failure → `figma-api-engineer`.
- Performance failure → `figma-api-engineer`.

Re-run the full gauntlet after the fix lands. Don't ship a release with a partially-failed gauntlet.
