# E2E gauntlet — welder-editor Sprint 3 Content tab

<!-- Owned by plugin-tester. Status: DOCS SHIPPED — manual run pending. -->
<!-- Resolves MON-2893994972 (TDEV-060). Sprint 2893968879. -->

> **Status: MANUAL RUN PENDING.**
> This document is the runbook and result-capture template. The actual gauntlet must be
> run by the user on Figma desktop. When the run is complete and the pass/fail column is
> filled in, post a `validation: pass` comment on the Sprint 3 close PR. The task stays
> at `Working on it` until the manual run is confirmed.

---

## 1. Plugin under test

| Field                     | Value                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plugin name**           | Welder Editor                                                                                                                                               |
| **Version**               | v0.1.0-sprint3-rc1 (pre-release; no tag yet)                                                                                                                |
| **Commit SHA**            | `352249c` (Merge PR #34 — feat: wire Content tab in App.vue)                                                                                                |
| **Manifest path**         | `/Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/manifest.json`                                                                            |
| **PR #33**                | fix: inline UI bundle via vite-plugin-singlefile (syntax-error fix)                                                                                         |
| **PR #34**                | feat: wire Content tab in App.vue with CardList + CardEditor + TimelineEditor                                                                               |
| **Build artifact**        | `dist/code.js` (10.57 KB gzip, 17.6% of 60 KB budget — PASS)                                                                                                |
| **Build artifact**        | `dist/ui/index.html` (48.49 KB gzip, 19.4% of 250 KB budget — PASS; single-file via vite-plugin-singlefile)                                                 |
| **Manifest schema**       | `editorType: ["figma", "slides"]`, `documentAccess: "dynamic-page"`, `permissions: ["teamlibrary"]`, `networkAccess: { "allowedDomains": ["none"] }` — PASS |
| **Single-file confirmed** | Yes — PR #33 inlines all JS + CSS into `dist/ui/index.html`; no external script references                                                                  |

Bundle measurements are from the hotfix measurement section of
[`plugins/welder-editor/docs/perf/welder-editor.md`](../../../plugins/welder-editor/docs/perf/welder-editor.md).

---

## 2. Pre-flight

Run these steps **before** opening any scenario. If any step fails, stop and file a P1
bug on the Bugs Queue board (5095865858).

1. **Remove the previous plugin import** — in Figma desktop, open `Plugins → Development
→ Manage plugins in development` and remove any existing "Welder Editor" entry.
2. **Quit Figma desktop fully** — `Cmd-Q`, confirm Figma is not running in the Dock.
3. **Rebuild the plugin** — in Terminal:
   ```sh
   cd /Users/lars/Documents/GitHub/figma-plugins
   pnpm --filter @figma-plugins/welder-editor build
   ```
   Confirm the terminal exits 0 and `dist/ui/index.html` and `dist/code.js` are present under
   `plugins/welder-editor/dist/`.
4. **Reopen Figma desktop** and sign in if prompted.
5. **Import the manifest** — `Plugins → Development → Import plugin from manifest…` →
   select `/Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/manifest.json`.
6. **Confirm plugin appears** — under `Plugins → Development`, "Welder Editor" is listed.
7. **Open a Welder-template Figma document** — a document containing at least one frame
   named `Slide` (1920 × 1080, INSTANCE) on the current page. This is required for the
   slide scanner to find slides. The "Templates-Welder" file
   (`https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder`) can be used
   as a reference. At minimum the test document must have:
   - At least one slide with a `CopyWrap` (for General tab testing).
   - At least one slide with a `CardWrap` (for Content tab / CardList + CardEditor).
   - At least one slide with a `TimelineWrap` (for Content tab / TimelineEditor).
   - At least one slide with a `BadgeEditor` instance (for badge editing).
8. **Open the dev console** — `Plugins → Development → Show/Hide Console`. Leave it open
   throughout all scenarios. Any red console error during a scenario is a fail.

---

## 3. Scenarios

### How to use this table

Each row is a self-contained scenario. Execute the **Steps** in order. Compare the actual
result to **Expected**. Mark **Status** as `Pass`, `Fail`, or `N/A`. Add free-text to
**Notes** (screenshot filename, error text, workaround found).

A scenario is `N/A` only when the required precondition (e.g., a TimelineWrap slide)
does not exist in the test document. Absence of a `CardWrap` slide never makes CardList
scenarios `N/A` — construct the test document with all required wrapper types before
starting the gauntlet.

---

| #    | Scenario                                                                                        | Steps                                                                                                                                                                                                                                                                                                                | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status | Notes |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| S-01 | **Plugin opens via Plugins menu — no console error**                                            | 1. Confirm a Welder-template Figma design file is open. 2. `Plugins → Development → Welder Editor`.                                                                                                                                                                                                                  | Plugin iframe opens at 520 × 760 px. Dev console is clean (no red errors, no unhandled rejections). SlidePicker is visible with a list of slide labels.                                                                                                                                                                                                                                                                                          |        |       |
| S-02 | **SlidePicker lists slides on current page**                                                    | 1. Plugin is open. 2. Inspect the SlidePicker dropdown / list.                                                                                                                                                                                                                                                       | All INSTANCE nodes named `Slide` (1920 × 1080) on the current page appear in the list. Labels match the slide order on the canvas.                                                                                                                                                                                                                                                                                                               |        |       |
| S-03 | **Selecting a slide loads General data**                                                        | 1. Click any slide in SlidePicker that has a `CopyWrap` instance. 2. Wait for the panel to populate (≤ 500 ms).                                                                                                                                                                                                      | TabStrip shows at least the "General" tab (not greyed out). General tab is active. TitleDescriptionEditor panel shows the slide's heading text in the heading input field.                                                                                                                                                                                                                                                                       |        |       |
| S-04 | **Heading edit via TitleDescriptionEditor persists to the slide**                               | 1. Select a slide with a `CopyWrap`. 2. Click into the heading input. 3. Clear existing text. 4. Type `Test heading 2026-W19`. 5. Press Tab or click outside the field to commit. 6. In the canvas, select the slide's Heading text node.                                                                            | The `Heading` text node on the canvas reads `Test heading 2026-W19`. No console errors.                                                                                                                                                                                                                                                                                                                                                          |        |       |
| S-05 | **Badge edit via BadgeEditor persists**                                                         | 1. Select a slide with a visible `Badge` instance. 2. The General tab shows a "Badge" panel. 3. Clear the label field and type `Q2 Launch`. 4. Press Tab to commit. 5. Inspect the Badge node's label text on the canvas.                                                                                            | The badge label text on the canvas reads `Q2 Launch`. No console errors.                                                                                                                                                                                                                                                                                                                                                                         |        |       |
| S-06 | **Image upload via ImageEditor persists**                                                       | 1. Select a slide with an `ImageWrap`. 2. The General tab shows an "Image" panel. 3. Click the upload / choose-file button inside ImageEditor. 4. Select any JPEG or PNG file (< 4 MB) from the local filesystem. 5. Wait for the upload to complete (≤ 500 ms). 6. Inspect the ImageWrap's fill slot on the canvas. | The ImageWrap slot shows the uploaded image as a fill. The preview in the plugin matches the canvas. No console errors.                                                                                                                                                                                                                                                                                                                          |        |       |
| S-07 | **Content tab appears when slide has CardWrap**                                                 | 1. Select a slide that has a `CardWrap` instance. 2. Wait for the slide to load (≤ 500 ms).                                                                                                                                                                                                                          | The TabStrip shows a "Content" tab (not greyed out / hidden). Clicking the Content tab shows the "Cards" PropertyPanel containing a CardList.                                                                                                                                                                                                                                                                                                    |        |       |
| S-08 | **CardList renders all cards**                                                                  | 1. Select a slide with a `CardWrap` containing ≥ 2 `Card` child instances. 2. Open the Content tab.                                                                                                                                                                                                                  | CardList shows one row per card. Row labels or preview text correspond to each card's heading characters on the canvas. The count of rows matches the count of `Card` instances in the `CardWrap`.                                                                                                                                                                                                                                               |        |       |
| S-09 | **CardEditor shows after selecting a card; heading edit persists and CardList preview updates** | 1. In CardList, click on the first card row. 2. CardEditor appears below CardList. 3. Clear the heading input and type `Feature A`. 4. Press Tab to commit. 5. Observe the CardList row and the canvas.                                                                                                              | CardEditor is visible with the selected card's data. After the edit: the `Card`'s Heading text node on the canvas reads `Feature A`. The CardList row preview text updates to reflect the new heading. No console errors.                                                                                                                                                                                                                        |        |       |
| S-10 | **Card icon swap via IconPicker persists**                                                      | 1. Select a card in CardList. 2. In CardEditor, click the icon picker control. 3. Select a different icon from the picker (e.g., click any icon that differs from the current one). 4. Close the picker. 5. Inspect the card's icon child on the canvas.                                                             | The icon child's INSTANCE_SWAP component property is updated to the selected icon. The icon renders on canvas as the new Lucide icon. No console errors.                                                                                                                                                                                                                                                                                         |        |       |
| S-11 | **Card visual upload persists**                                                                 | 1. Select a card in CardList whose `CardItem.visualHash` is not `undefined` (i.e., the card has a visual slot). 2. In CardEditor, locate the image upload control for the card visual. 3. Upload a JPEG or PNG (< 4 MB). 4. Inspect the card's visual slot on the canvas.                                            | The card's visual slot fill is replaced with the uploaded image. Plugin shows no console errors. (If `visualHash` is `undefined` for all cards in the test document, mark N/A and note in the Notes column.)                                                                                                                                                                                                                                     |        |       |
| S-12 | **Content tab shows TimelineWrap — TimelineEditor edits ordered items**                         | 1. Select a slide with a `TimelineWrap` instance. 2. Open the Content tab. 3. A "Timeline" PropertyPanel is visible. 4. Click into the heading input of the first timeline item. 5. Clear and type `Step 1 heading`. 6. Press Tab. 7. Check the canvas.                                                              | The "Timeline" PropertyPanel is visible with one row per `CopyWrap` child in the `TimelineWrap`. After the edit, the first `CopyWrap`'s Heading text node reads `Step 1 heading`. No console errors.                                                                                                                                                                                                                                             |        |       |
| S-13 | **TimelineEditor — paragraph edit for a copy-type item**                                        | 1. Select the slide with a `TimelineWrap`. 2. In TimelineEditor, click into the paragraph input of any item that has a non-empty paragraph field. 3. Clear and type `Step paragraph text`. 4. Press Tab. 5. Inspect the corresponding CopyWrap's Paragraph text node on the canvas.                                  | The Paragraph text node reads `Step paragraph text`. No console errors.                                                                                                                                                                                                                                                                                                                                                                          |        |       |
| S-14 | **Refresh / re-open plugin — persisted state restores last-selected slide**                     | 1. Select any slide and load it (wait for General data). 2. Note the selected slide label in SlidePicker. 3. Close the plugin (`Esc` or close button). 4. Re-open: `Plugins → Development → Welder Editor`. 5. Observe SlidePicker on re-open.                                                                       | SlidePicker pre-selects the same slide that was active before close. If the slide's data auto-loads, the General tab is populated without requiring a manual click. No console errors on re-open. (Note: `clientStorage` is not used in v0.1.0; the pre-selection relies on the canvas selection state at open time. If the slide frame is selected on canvas, it auto-loads. Mark Pass if SlidePicker correctly reflects the canvas selection.) |        |       |
| S-15 | **Disabled state during async dispatch — heading edit while another edit is in-flight**         | 1. Select a slide with a CopyWrap. 2. Make a heading edit (type `Concurrent A`) and immediately, within the same second, click into the paragraph field and type `Concurrent B`. 3. Observe the plugin's disabled/loading state.                                                                                     | While a `apply-title-description` message is in-flight, all inputs in the General tab are disabled (visually) and do not accept new input. The second edit either queues or is rejected. When the first edit resolves, inputs re-enable. No console errors. No data corruption on canvas (canvas shows the first committed value).                                                                                                               |        |       |
| S-16 | **Error path — bad input / simulated error — plugin shows error state, does not crash**         | 1. Open a document with NO slides on the current page (create a blank Figma document or navigate to a page with no INSTANCE nodes named `Slide` 1920 × 1080). 2. Open the plugin.                                                                                                                                    | Plugin opens without crash. SlidePicker shows an empty list (no slides). The empty-state message "Pick a slide above to start editing" or equivalent is visible. If the code side posts an `error` message, the StatusMessage alert is visible with a readable message (no stack trace, no internal node IDs). Dev console has no unhandled rejections.                                                                                          |        |       |
| S-17 | **Cross-editor type — plugin loads in Figma Slides**                                            | 1. Open a Figma Slides presentation document (one that contains Slide Machine instances on a slide). 2. In Figma Slides, open the plugin: `Plugins → Development → Welder Editor`. 3. Observe SlidePicker.                                                                                                           | Plugin opens without error in the Slides editor. SlidePicker lists slides. The manifest's `editorType: ["figma", "slides"]` means this should work per [`docs/adr/0002-welder-editor-editortype-narrowing.md`](../../../docs/adr/0002-welder-editor-editortype-narrowing.md). No console errors specific to the Slides editor context.                                                                                                           |        |       |
| S-18 | **Manage plugins → Reload from manifest after rebuild**                                         | 1. Plugin is open. 2. In Terminal (while plugin is open), re-run `pnpm --filter @figma-plugins/welder-editor build`. 3. In Figma: `Plugins → Development → Manage plugins in development` → click "Reload" next to Welder Editor.                                                                                    | Plugin reloads without a crash. The new build is picked up. SlidePicker populates again on a fresh plugin open. No console errors during reload.                                                                                                                                                                                                                                                                                                 |        |       |

---

## 4. Editor-type matrix

Run the 18 scenarios above across the following surfaces. Minimum coverage requirement before sign-off: all desktop columns complete, at least one web column complete.

| Surface                     | Editor type         | Required                                                                              |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Figma desktop (macOS arm64) | Design (`"figma"`)  | Yes — primary canonical environment                                                   |
| Figma desktop (macOS arm64) | Slides (`"slides"`) | Yes — S-17 covers this; also run S-01 through S-03 in Slides                          |
| Figma web                   | Design (`"figma"`)  | Yes — at minimum S-01 (cold start) + S-03 (General load) + S-07 (Content tab appears) |

FigJam is excluded by [ADR-0002](../../../docs/adr/0002-welder-editor-editortype-narrowing.md) — do not attempt to test in FigJam.

### Matrix result table (fill in during run)

| Editor type            | Cold start (S-01) | Slide list (S-02) | General load (S-03) |      Content tab (S-07, S-08)      | Error path (S-16) | Overall |
| ---------------------- | :---------------: | :---------------: | :-----------------: | :--------------------------------: | :---------------: | :-----: |
| Figma design — desktop |                   |                   |                     |                                    |                   |         |
| Figma slides — desktop |                   |                   |                     | N/A (slides may not have CardWrap) |                   |         |
| Figma design — web     |                   |                   |                     |                                    |    N/A (skip)     |         |

---

## 5. Result template

Fill in this table after completing all scenarios. A scenario is `Fail` only if the
expected result is not met AND there is no documented acceptable deviation. Screenshot
evidence is mandatory for every `Fail` row.

| #    | Scenario                                          | Status (Pass / Fail / N-A) | Notes / screenshot filename |
| ---- | ------------------------------------------------- | -------------------------- | --------------------------- |
| S-01 | Plugin opens via Plugins menu                     |                            |                             |
| S-02 | SlidePicker lists slides                          |                            |                             |
| S-03 | Selecting a slide loads General data              |                            |                             |
| S-04 | Heading edit persists                             |                            |                             |
| S-05 | Badge edit persists                               |                            |                             |
| S-06 | Image upload persists                             |                            |                             |
| S-07 | Content tab appears (CardWrap)                    |                            |                             |
| S-08 | CardList renders all cards                        |                            |                             |
| S-09 | CardEditor heading edit + CardList preview update |                            |                             |
| S-10 | Card icon swap via IconPicker persists            |                            |                             |
| S-11 | Card visual upload persists                       |                            |                             |
| S-12 | TimelineEditor heading edit persists              |                            |                             |
| S-13 | TimelineEditor paragraph edit persists            |                            |                             |
| S-14 | Re-open restores last-selected slide              |                            |                             |
| S-15 | Disabled state during async dispatch              |                            |                             |
| S-16 | Error path — no crash, readable error state       |                            |                             |
| S-17 | Cross-editor type — loads in Figma Slides         |                            |                             |
| S-18 | Reload from manifest after rebuild                |                            |                             |

### Screenshot checklist

Attach the following screenshots to the Sprint 3 close PR:

- [ ] S-01 — cold-start UI (SlidePicker visible, no errors in console), Figma design desktop
- [ ] S-03 — General tab populated (TitleDescriptionEditor showing slide heading)
- [ ] S-07 / S-08 — Content tab with CardList rendered
- [ ] S-09 — CardEditor open with heading field
- [ ] S-12 — TimelineEditor with at least one item visible
- [ ] S-16 — error / empty state (no slides on page)
- [ ] S-17 — plugin open in Figma Slides editor
- [ ] Light theme variant (any success state)
- [ ] Dark theme variant (any success state — toggle via `Figma → Preferences → Theme`)

---

## 6. What is deferred (out of scope for this gauntlet)

The following are **explicitly excluded** from this gauntlet run. Including them would
produce false fails because the features are intentionally absent in v0.1.0.

| Deferred feature                                    | ADR                                                                        | Reason                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ChartWrap / chart editor (Graphs tab)               | [ADR-0007](../../../docs/adr/0007-welder-editor-charts-deferred.md)        | Charts deferred to a follow-up epic; `findChartWrap` is absent from `slide-machine.ts` |
| Accent range editing (Text Dimmer word-by-word dim) | [ADR-0008](../../../docs/adr/0008-welder-editor-accent-ranges-deferred.md) | Reka focus-trap blocker; `headingDim` is read-only in v0.1.0                           |
| TableEditor / table editing (Graphs tab)            | Sprint 4 scope                                                             | Graphs tab shows placeholder "Graphs editing — coming in Sprint 4"                     |
| JourneyEditor / journey editing (Graphs tab)        | Sprint 4 scope                                                             | Same as above                                                                          |
| Slide creation / reorder / add-remove wrappers      | `docs/api-spec/welder-editor.md` §Non-goals                                | Out of v0.1.0 scope                                                                    |
| Cross-page slide navigation                         | `docs/api-spec/welder-editor.md` §Non-goals                                | `figma.currentPage` scope only                                                         |
| FigJam editor type                                  | [ADR-0002](../../../docs/adr/0002-welder-editor-editortype-narrowing.md)   | FigJam excluded; no Slide Machine instances in FigJam                                  |

---

## 7. Exit criteria

The Sprint 3 close PR receives `validation: pass` when ALL of the following are true:

1. **Pass rate ≥ 90%** — at most 1 of the 18 scenarios may fail (rounding: 18 × 0.10 = 1.8 → floor 1). Any scenario marked `Fail` that reduces the pass rate below 90% is a blocker.
2. **Zero Critical (P0) fails** — a P0 is any scenario whose failure indicates a crash, persisted-state corruption, or complete inability to use the primary flow. Examples: S-01 fails (plugin does not open), S-04 or S-09 fails with data loss on canvas, S-16 crashes instead of showing an error state.
3. **All High (P1) fails filed on the Bugs Queue** — any scenario marked `Fail` that is not a P0 must have a corresponding bug item on the Bugs Queue board (ID 5095865858 in the welder-editor folder) with severity P1, assigned Owner Agent, and a `Connected tasks` link to a Sprint task.
4. **Editor-type matrix complete** — Figma design (desktop), Figma Slides (desktop), and at least Figma design (web) rows in section 4 must be filled.
5. **Screenshot checklist complete** — all required screenshots in section 5 are attached to the Sprint 3 close PR.

When all five conditions are met, the user posts `validation: pass` on the Sprint 3 close PR. The plugin-tester countersigns. Only then does `release-engineer` proceed with tagging.

If any P0 scenario fails: file a hotfix bug (P0) immediately, assign to `figma-api-engineer` (code-side failures) or `ui-engineer` (UI failures), and halt the release. Do not tag until the hotfix lands and the full gauntlet is re-run.

---

## 8. References

- Canonical gauntlet runbook: [`runbooks/e2e-gauntlet.md`](../../../runbooks/e2e-gauntlet.md)
- API spec: [`plugins/welder-editor/docs/api-spec/welder-editor.md`](../../../plugins/welder-editor/docs/api-spec/welder-editor.md)
- Bundle perf doc: [`plugins/welder-editor/docs/perf/welder-editor.md`](../../../plugins/welder-editor/docs/perf/welder-editor.md)
- ADR-0002 (editorType): [`docs/adr/0002-welder-editor-editortype-narrowing.md`](../../../docs/adr/0002-welder-editor-editortype-narrowing.md)
- ADR-0007 (charts deferred): [`docs/adr/0007-welder-editor-charts-deferred.md`](../../../docs/adr/0007-welder-editor-charts-deferred.md)
- ADR-0008 (accent ranges deferred): [`docs/adr/0008-welder-editor-accent-ranges-deferred.md`](../../../docs/adr/0008-welder-editor-accent-ranges-deferred.md)
- Bugs Queue board: ID 5095865858 (welder-editor folder, Monday workspace 6325546)
- Monday task: MON-2893994972 (TDEV-060), Sprint 2893968879
