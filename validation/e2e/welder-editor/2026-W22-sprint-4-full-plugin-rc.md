# E2E gauntlet — welder-editor Sprint 4 full-plugin RC (v0.1.0)

<!-- Owned by plugin-tester. Status: DOCS SHIPPED — manual run pending. -->
<!-- Resolves MON-2893996415 (TDEV-072). Sprint 2894068169. -->

> **Status: MANUAL RUN PENDING.**
> This document is the runbook and result-capture template for the v0.1.0 release candidate.
> The actual gauntlet must be run by the user on Figma desktop and web. When the run is
> complete and the pass/fail columns are filled in, post a `validation: pass` comment on
> the Sprint 4 close PR. The task stays at `In Progress` until the manual run is confirmed
> and the comment is posted.

---

## 1. Plugin under test

| Field | Value |
| --- | --- |
| **Plugin name** | Welder Editor |
| **Version** | v0.1.0-rc |
| **Commit SHA** | `c44379a` (Merge PR #48 — Sprint 4 retro; latest main as of 2026-05-05) |
| **Manifest path** | `/Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/manifest.json` |
| **Manifest schema** | `editorType: ["figma", "slides"]`, `documentAccess: "dynamic-page"`, `permissions: ["teamlibrary"]`, `networkAccess: { "allowedDomains": ["none"] }` |

### Release-blocking PRs validated inline

| PR | Title | Status |
| --- | --- | --- |
| #28 | hotfix: emit code.js as single-file IIFE (no import/export) | Merged on main |
| #33 | fix: inline UI bundle via vite-plugin-singlefile (syntax-error fix) | Merged on main |
| #34 | feat: wire Content tab in App.vue with CardList + CardEditor + TimelineEditor | Merged on main |
| #43 | feat: wire Graphs tab in App.vue with TableEditor + JourneyEditor (charts absent per ADR-0007) | Merged on main |
| #44 | fix(r10): revert TableWrap + JourneyWrap renderer drift to v0.2.1 parity | Merged on main |
| #46 | ci: wire TableEditor frame-trace perf gate (R1) as blocking CI check | Merged on main |

### Build artifacts (Sprint 4 final — PR #45, commit `875ff36`)

| Artifact | Measured gzip | Budget | % of budget | Status |
| --- | --- | --- | --- | --- |
| `dist/code.js` | 10.83 KB (11,094 bytes) | 60 KB | 18.1% | PASS |
| `dist/ui/index.html` | 68.23 KB (69,870 bytes) | 250 KB | 27.3% | PASS |

Source: `plugins/welder-editor/docs/perf/welder-editor.md` §"Sprint 4 measurement".
Both artifacts pass the hard budget and the stretch targets defined in ADR-0003.

### Structural verification (from PR #45 description)

- `dist/code.js` head: `var dt=Object.define` — confirmed IIFE; no ES-module regression.
- `dist/ui/index.html` single-file: zero external `<script src=...>` references (`grep -c '<script[^>]*src=' dist/ui/index.html` returns `0`).
- No stray `dist/messages.js` chunk.
- `vue-tsc --noEmit`: clean (zero errors) — PR #43.
- `eslint . && prettier --check .`: clean (zero warnings) — PR #43.
- `pnpm --filter @figma-plugins/welder-editor test`: 244 passing — Sprint 4 retro §1.

---

## 2. Pre-flight

Run these steps **before** opening any scenario. If any step fails, stop and file a P1 bug
on the Bugs Queue board (ID 5095865858, welder-editor folder, Monday workspace 6325546).

1. **Remove the previous plugin import** — in Figma desktop, open
   `Plugins → Development → Manage plugins in development` and remove any existing
   "Welder Editor" entry. If no entry exists, skip this step.

2. **Quit Figma desktop fully** — press `Cmd-Q`. Confirm Figma is not running in the Dock
   (right-click the Dock icon; choose Quit if it is still listed).

3. **Rebuild the plugin** — in Terminal, run:
   ```sh
   cd /Users/lars/Documents/GitHub/figma-plugins
   git checkout main
   git pull origin main
   pnpm --filter @figma-plugins/welder-editor build
   ```
   Confirm the build exits with code 0. Then verify both artifacts exist:
   ```sh
   ls -lh plugins/welder-editor/dist/code.js
   ls -lh plugins/welder-editor/dist/ui/index.html
   ```
   Both files must be present and non-zero. If either is absent, stop and file a P0 bug.

4. **Reopen Figma desktop** and sign in if prompted.

5. **Import the manifest** — navigate to `Plugins → Development → Import plugin from
   manifest…` and select:
   `/Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/manifest.json`

6. **Confirm the plugin appears** — under `Plugins → Development`, "Welder Editor" is listed.
   If it is absent, stop. Verify the manifest path and re-import.

7. **Open a Welder-template Figma design document.** The test document must contain at
   least one Figma page with the following INSTANCE nodes:
   - At least one slide: a frame named `Slide` (1920 × 1080) that is a component INSTANCE.
   - At least one slide with a `CopyWrap` child instance (for General tab / heading editing).
   - At least one slide with a `BadgeEditor` child instance (for badge editing).
   - At least one slide with an `ImageWrap` child instance (for image upload).
   - At least one slide with a `CardWrap` child containing ≥ 2 `Card` child instances.
   - At least one slide with a `TimelineWrap` child containing ≥ 2 `CopyWrap` children.
   - At least one slide with a `TableWrap` child (4 columns, ≥ 3 rows) with a column header
     row present.
   - At least one slide with a `JourneyWrap` child containing ≥ 3 journey items, at least
     one of which is a card-type item (has an icon) and at least one is a copy-type item.
   The "Templates-Welder" Figma file (`https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder`)
   is the canonical reference. Construct or verify the test document before starting any scenario.

8. **Open the dev console** — `Plugins → Development → Show/Hide Console`. Leave it open
   throughout all scenarios. Any red error or unhandled-rejection message in the console
   during a scenario is an automatic **Fail** for that scenario.

---

## 3. Editor-type matrix

Run the scenarios in section 4 across the following editor surfaces. The minimum coverage
requirement before `validation: pass` can be posted: all desktop columns complete, at least
one web column complete.

| Surface | Editor type | Coverage required |
| --- | --- | --- |
| Figma desktop (macOS arm64) | Design (`"figma"`) | **Full** — all 25 scenarios |
| Figma desktop (macOS arm64) | Slides (`"slides"`) | **Partial** — S-01 (cold start), S-02 (slide list), S-03 (General load), plus S-17a, S-17b, S-17c, S-17d, S-17e |
| Figma design web | Design (`"figma"`) | **Subset** — S-01, S-03, S-08 |

FigJam is excluded by
[ADR-0002](../../../docs/adr/0002-welder-editor-editortype-narrowing.md). Do not attempt
to test in FigJam.

### Editor-type matrix result table (fill in during run)

| Editor type | Cold start (S-01) | Slide list (S-02) | General load (S-03) | Content tab (S-08) | Graphs tab (S-16, S-18) | Overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Figma design — desktop | | | | | | |
| Figma slides — desktop | | | N/A for slides-native | N/A | N/A | |
| Figma design — web | | N/A | | | N/A (skip) | |

---

## 4. Scenarios

### How to use this table

Each row is a self-contained scenario. Execute the **Steps** in order. Compare the actual
result to **Expected**. Mark **Status** as `Pass`, `Fail`, or `N/A`. Record free text in
**Notes** (screenshot filename, error text, workaround found).

A scenario is `N/A` only when the required precondition cannot be met in the test document.
Absence of a required wrapper (e.g., no `TableWrap` slide) is never an excuse to skip — the
test document must be constructed with all required wrapper types before the gauntlet starts.

A red console error or unhandled rejection during any step is an automatic **Fail** for
that scenario, regardless of whether the visible UI appears correct.

---

### Cold start, slide picker, and General tab (S-01 through S-10)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-01 | **Plugin opens — no console error, no infinite loading** | 1. Confirm the Welder-template Figma design file is the active document. 2. Run `Plugins → Development → Welder Editor`. 3. Observe the plugin iframe and the dev console for 5 seconds. | Plugin iframe opens (520 × 760 px approximately). Dev console shows no red errors and no unhandled-rejection messages. SlidePicker is visible and either shows a list of slides or displays a loading state that resolves within 3 seconds. | | |
| S-02 | **SlidePicker lists all slides on the current page** | 1. Plugin is open from S-01. 2. Inspect the SlidePicker dropdown or list. | All INSTANCE nodes named `Slide` (1920 × 1080) on the current page appear in the list. The order of entries matches the visual top-to-bottom, left-to-right order of slides on the canvas. | | |
| S-03 | **Selecting a slide loads its General data** | 1. In SlidePicker, click on any slide that has a `CopyWrap` child. 2. Wait up to 500 ms for the panel to populate. | TabStrip appears with at least the "General" tab not greyed out. The General tab is active by default. TitleDescriptionEditor shows the slide's heading text in the heading input field. No console errors. | | |
| S-04 | **TitleDescriptionEditor heading edit persists to the canvas** | 1. Select a slide with a `CopyWrap`. 2. Click into the heading input field. 3. Select all text (`Cmd-A`) and type `Test heading 2026-W22`. 4. Press `Tab` to commit. 5. On the canvas, select the slide's `Heading` text node (inside the `CopyWrap`). | The `Heading` text node on the canvas reads `Test heading 2026-W22`. No console errors. | | |
| S-05 | **TitleDescriptionEditor paragraph edit persists to the canvas** | 1. Select a slide with a `CopyWrap`. 2. Click into the paragraph/description input field. 3. Select all and type `Test paragraph 2026-W22`. 4. Press `Tab` to commit. 5. On the canvas, select the slide's `Paragraph` text node inside the `CopyWrap`. | The `Paragraph` text node on the canvas reads `Test paragraph 2026-W22`. No console errors. | | |
| S-06 | **Badge label edit persists to the canvas** | 1. Select a slide that has a `BadgeEditor` instance visible. 2. In the General tab, locate the Badge panel. 3. Clear the label field and type `Q2 Launch`. 4. Press `Tab` to commit. 5. On the canvas, locate the Badge instance's label text node. | The label text node reads `Q2 Launch`. No console errors. | | |
| S-07 | **Badge icon swap via IconPicker persists** | 1. Select the same slide as S-06 (with a `BadgeEditor`). 2. In the Badge panel, click the icon picker control. 3. Select any icon that is visually different from the current badge icon (e.g., click the first icon in the picker list). 4. Close the picker. 5. On the canvas, inspect the Badge instance's icon child. | The icon child's component property is updated to the selected icon. The badge renders the new Lucide icon on the canvas. No console errors. | | |
| S-08 | **Image upload via ImageEditor persists to the canvas** | 1. Select a slide with an `ImageWrap` child. 2. In the General tab, locate the Image panel. 3. Click the upload / choose-file button in ImageEditor. 4. In the system file picker, select any JPEG or PNG file smaller than 4 MB. 5. Wait up to 500 ms for the upload to complete. 6. On the canvas, inspect the `ImageWrap` fill slot. | The `ImageWrap` slot shows the uploaded image as a fill. The preview thumbnail in the plugin matches what is visible on the canvas. No console errors. | | |
| S-09 | **General tab persisted state — re-open pre-selects last slide** | 1. Select any slide in SlidePicker and confirm it loads (General data visible). 2. Note the slide label that is selected. 3. Close the plugin by pressing `Esc` or clicking the close button. 4. Re-open: `Plugins → Development → Welder Editor`. 5. Observe SlidePicker on re-open. | On re-open, SlidePicker shows the same slide that was active before close, or — because v0.1.0 uses canvas-selection state rather than `clientStorage` — reflects the currently selected canvas frame. If the slide frame is still selected on canvas, SlidePicker pre-selects and auto-loads it without a manual click. No console errors on re-open. | | |
| S-10 | **Disabled state during async dispatch — no concurrent write corruption** | 1. Select a slide with a `CopyWrap`. 2. Type a new heading string (`Concurrent A`) and immediately, within the same second, click into the paragraph field and begin typing `Concurrent B`. 3. Observe the plugin's disabled or loading state while the first message is in-flight. | While the `apply-title-description` message is in-flight, inputs in the General tab are visually disabled and do not accept new input. The first committed value appears on the canvas when the in-flight operation resolves. No data corruption (canvas does not show both values mixed or a blank node). No console errors. | | |

---

### Content tab (S-11 through S-15)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-11 | **Content tab appears when slide has CardWrap** | 1. Select a slide that has a `CardWrap` child instance. 2. Wait up to 500 ms for the slide to load. 3. Observe the TabStrip. | The "Content" tab in the TabStrip is visible and not greyed out. Clicking the Content tab shows a "Cards" PropertyPanel containing a CardList. No console errors. | | |
| S-12 | **CardList renders all cards in the CardWrap** | 1. Select a slide with a `CardWrap` containing ≥ 2 `Card` children. 2. Click the Content tab. 3. Observe the CardList. | CardList shows one row per `Card` instance inside the `CardWrap`. The row count matches the number of `Card` children. Row labels or preview text correspond to each card's heading on the canvas. No console errors. | | |
| S-13 | **CardEditor heading edit + CardList preview updates** | 1. In CardList, click the first card row. 2. CardEditor appears below CardList. 3. In CardEditor, click into the heading input, select all (`Cmd-A`), and type `Feature A`. 4. Press `Tab` to commit. 5. Observe the CardList row and the canvas. | CardEditor shows the selected card's data. After the edit: the `Card`'s Heading text node on the canvas reads `Feature A`. The CardList row preview updates to reflect the new heading. No console errors. | | |
| S-14 | **Card icon swap via IconPicker persists** | 1. Select a card in CardList. 2. In CardEditor, click the icon picker control. 3. Select any icon that differs from the card's current icon. 4. Close the picker. 5. On the canvas, inspect the card's icon child component property. | The icon child's INSTANCE_SWAP component property is updated to the selected icon. The card renders the new Lucide icon on the canvas. No console errors. | | |
| S-15 | **TimelineEditor renders and heading edit persists** | 1. Select a slide with a `TimelineWrap` child. 2. Click the Content tab. 3. Confirm a "Timeline" PropertyPanel is visible with one row per `CopyWrap` child in the `TimelineWrap`. 4. Click into the heading input of the first timeline item. 5. Select all and type `Step 1 heading`. 6. Press `Tab`. 7. On the canvas, inspect the first `CopyWrap`'s Heading text node inside the `TimelineWrap`. | The "Timeline" PropertyPanel is visible with the correct item count. After the edit, the first `CopyWrap`'s Heading text node reads `Step 1 heading`. No console errors. | | |

---

### Graphs tab (S-16 through S-22)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-16 | **Graphs tab appears and TableEditor renders** | 1. Select a slide that has a `TableWrap` child. 2. Wait up to 500 ms for the slide to load. 3. Click the "Graphs" tab in the TabStrip. 4. Observe the rendered content. | The "Graphs" tab is visible and not greyed out. A "Table" PropertyPanel is visible and contains a TableEditor grid. The grid shows the correct number of columns and rows as present in the `TableWrap` on the canvas. No console errors. | | |
| S-17 | **TableEditor width toggle (sm / md / lg) persists** | 1. Select the slide with a `TableWrap`. 2. Open the Graphs tab. 3. In the Table panel, locate the width control (sm / md / lg selector). 4. Click `lg`. 5. On the canvas, inspect the `TableWrap` frame or its width property. 6. Click `sm`. 7. Inspect the canvas again. | Each width selection produces a corresponding visual change on the `TableWrap` on the canvas (width or column proportions update to match the selected size class). The plugin does not crash or show a console error. Switching between sm, md, and lg all produce distinct and correct canvas results. | | |
| S-18 | **TableEditor column header toggle persists** | 1. Select the slide with a `TableWrap` that has `hasColumnHeader: true` (a visible header row on canvas). 2. Open the Graphs tab. 3. In the Table panel, locate the column-header toggle and confirm it is currently on. 4. Click the toggle to turn it off. 5. On the canvas, confirm the header row disappears. 6. Click the toggle to turn it back on. 7. On the canvas, confirm the header row reappears. | The header row on canvas appears and disappears in sync with the toggle state. No console errors. The toggle state persists if the same slide is re-selected. | | |
| S-19 | **TableEditor body cell edit persists** | 1. Select the slide with a `TableWrap`. 2. Open the Graphs tab. 3. In the TableEditor, click into a body cell (not the header row). 4. Select all and type `Cell 2026-W22`. 5. Press `Tab` to move to the next cell. 6. On the canvas, inspect the text node corresponding to the edited cell. | The text node on the canvas reads `Cell 2026-W22`. No console errors. The next cell receives focus after `Tab`. | | |
| S-20 | **TableEditor CSV import — valid CSV reflects on canvas** | 1. Select the slide with a `TableWrap`. 2. Open the Graphs tab. 3. Locate the CSV import control in the Table panel. 4. Click the import button and provide a valid CSV string matching the table's column count (e.g., paste 3 rows × 4 columns with the correct column count for the test document's `TableWrap`). 5. Confirm import. 6. On the canvas, inspect the `TableWrap`'s text nodes. | The `TableWrap`'s cell text nodes on the canvas update to match the imported CSV values. The TableEditor grid in the plugin also reflects the new values. No console errors. No error toast is shown for a valid import. | | |
| S-21 | **TableEditor CSV import — invalid CSV shows error toast, no replaceContent** | 1. Select the slide with a `TableWrap`. 2. Open the Graphs tab. 3. Click the CSV import control. 4. Provide a malformed CSV string (e.g., inconsistent column counts across rows: `"A,B\nC"` when the table expects 4 columns). 5. Confirm import. 6. Observe the plugin UI and the canvas. | An error toast or error message is shown in the plugin UI. The `TableWrap` content on the canvas is unchanged (the invalid import does not replace any cell content). No console errors from unhandled exceptions (the error is caught and surfaced in the UI). | | |
| S-22 | **JourneyEditor renders and label edit persists** | 1. Select a slide that has a `JourneyWrap` child. 2. Open the Graphs tab. 3. Confirm a "Journey" PropertyPanel is visible with one row per journey item. 4. Click into the label field of the first journey item. 5. Select all and type `Journey step 1`. 6. Press `Tab` to commit. 7. On the canvas, inspect the first journey item's label text node. | The "Journey" PropertyPanel shows the correct item count. After the edit, the first journey item's label text node on the canvas reads `Journey step 1`. No console errors. | | |
| S-23 | **JourneyEditor icon swap persists** | 1. Select the slide with a `JourneyWrap`. 2. Open the Graphs tab. 3. In JourneyEditor, click the icon picker for any card-type journey item (one that has an icon slot). 4. Select a different icon from the picker. 5. Close the picker. 6. On the canvas, inspect the journey item's icon child. | The icon child's component property is updated to the selected icon. The journey item renders the new Lucide icon on the canvas. No console errors. | | |

---

### Cross-tab, editor-type, and error path scenarios (S-24 through S-25 + additional)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-24 | **Cross-tab state — edits in General, Content, and Graphs all persist across tab switches** | 1. Select a slide that has a `CopyWrap`, a `CardWrap`, and a `TableWrap`. 2. In the General tab, type a new heading (e.g., `Cross-tab heading`) and press `Tab`. 3. Switch to the Content tab. 4. In CardList, click the first card and type a new heading (`Cross-tab card`) in CardEditor. Press `Tab`. 5. Switch to the Graphs tab. 6. Click a body cell in TableEditor and type `Cross-tab cell`. Press `Tab`. 7. Switch back to the General tab and confirm the heading still shows `Cross-tab heading`. 8. Switch to Content and confirm the card heading is still `Cross-tab card`. 9. Switch to Graphs and confirm the cell still shows `Cross-tab cell`. | After all edits: heading, card heading, and cell value are all present on the canvas. Switching tabs does not discard or overwrite any prior edit. No console errors at any step. | | |
| S-25 | **Switch slides — state correctly bound to each slide** | 1. Select Slide A and type a heading `Slide A heading` in the General tab. Press `Tab`. 2. In SlidePicker, click a different slide (Slide B). Wait for the panel to reload. 3. Confirm the General tab shows Slide B's heading (not `Slide A heading`). 4. Switch back to Slide A in SlidePicker. 5. Confirm the heading field shows `Slide A heading`. | Each slide's data is independently bound. Switching slides loads that slide's own state. No cross-contamination between slides. No console errors. | | |

---

### Figma Slides editor-type (S-26 through S-30)

Run these only in Figma desktop with a **Slides presentation document** open (not a Design document).

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-26 | **Plugin opens in Figma Slides — no console error** | 1. Open a Figma Slides presentation document that contains Slide Machine instances. 2. Run `Plugins → Development → Welder Editor`. 3. Observe the plugin iframe and the dev console for 5 seconds. | Plugin iframe opens without crash. Dev console shows no red errors specific to the Slides editor context. SlidePicker is visible or shows an appropriate empty state if no Slide Machine instances are present on the current slide. Manifest `editorType: ["figma", "slides"]` permits this per [ADR-0002](../../../docs/adr/0002-welder-editor-editortype-narrowing.md). | | |
| S-27 | **SlidePicker lists slides in Figma Slides** | 1. Plugin is open from S-26 in a Slides document with Slide Machine instances. 2. Inspect the SlidePicker. | SlidePicker lists the Slide Machine instances. No console errors. | | |
| S-28 | **Selecting a slide loads General data in Figma Slides** | 1. In SlidePicker, click any slide that has a `CopyWrap` child. 2. Wait up to 500 ms. | General tab populates with the slide's heading. No console errors. | | |
| S-29 | **Heading edit persists to canvas in Figma Slides** | 1. Select a slide with a `CopyWrap` in the Slides document. 2. Click into the heading input, clear it, and type `Slides heading 2026-W22`. 3. Press `Tab`. 4. Inspect the heading text node on the slide canvas. | The heading text node reads `Slides heading 2026-W22`. No console errors. | | |
| S-30 | **Content tab appears in Figma Slides when slide has CardWrap** | 1. In the Slides presentation, select a slide with a `CardWrap`. 2. Observe the TabStrip. | The "Content" tab is visible and not greyed out. CardList renders the cards. No console errors. | | |

---

### Error paths (S-31 through S-33)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-31 | **No slides on the current page — plugin shows empty state, does not crash** | 1. Open a blank Figma document or navigate to a page with no INSTANCE nodes named `Slide` (1920 × 1080). 2. Open the plugin: `Plugins → Development → Welder Editor`. 3. Observe the plugin UI and the dev console. | Plugin opens without crash. SlidePicker shows an empty list. An empty-state message is visible (e.g., "Pick a slide above to start editing" or equivalent). Dev console shows no unhandled rejections. If the code side posts an `error` message, the StatusMessage alert is visible with a human-readable message (no raw stack trace, no internal node IDs). | | |
| S-32 | **Slide has no CardWrap — Content tab absent or gracefully hidden** | 1. Select a slide that has only a `CopyWrap` (no `CardWrap`, no `TimelineWrap`). 2. Observe the TabStrip. | The Content tab is either absent from the TabStrip or is greyed out and non-interactive. The plugin does not crash. No console errors from the absent `CardWrap`. | | |
| S-33 | **Slide has no TableWrap or JourneyWrap — Graphs tab absent or gracefully hidden** | 1. Select a slide that has only a `CopyWrap` (no `TableWrap`, no `JourneyWrap`, no `ChartWrap`). 2. Click the Graphs tab if it is visible. 3. Observe the panel content. | The Graphs tab is either absent or shows an empty-state message explaining that no editable Graphs content was found on this slide. The plugin does not crash. No console errors. | | |

---

### Reload and bundle scenarios (S-34 through S-35)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-34 | **Reload from manifest after rebuild picks up the new build** | 1. Plugin is open. 2. In Terminal, re-run: `pnpm --filter @figma-plugins/welder-editor build`. 3. In Figma: `Plugins → Development → Manage plugins in development` → click "Reload" next to Welder Editor. 4. Re-open the plugin: `Plugins → Development → Welder Editor`. | Plugin reloads without crash. The new build is picked up (confirm by checking a known behavior that changed; if no code change was made, verify SlidePicker populates on fresh open). No console errors during reload. | | |
| S-35 | **Bundle artifacts present at expected paths and sizes** | 1. In Terminal, run: `ls -lh /Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/dist/code.js /Users/lars/Documents/GitHub/figma-plugins/plugins/welder-editor/dist/ui/index.html`. 2. Run: `gzip -c dist/code.js \| wc -c` and `gzip -c dist/ui/index.html \| wc -c` from inside `plugins/welder-editor/`. | `dist/code.js` is present and its gzip size is ≤ 60,000 bytes (budget: 60 KB). `dist/ui/index.html` is present and its gzip size is ≤ 250,000 bytes (budget: 250 KB). Expected Sprint 4 actuals: ~11,094 bytes and ~69,870 bytes respectively. | | |

---

### Deferred-feature exclusion checks (S-36 through S-37)

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-36 | **Charts excluded — no chart UI is reachable in the Graphs tab (ADR-0007)** | 1. Select any slide including one that has a `ChartWrap` instance (if available in the test document). 2. Open the Graphs tab. 3. Visually scan the entire Graphs tab UI for any chart-related controls, labels, or sections (bar chart editor, line chart, chart type selector, etc.). | No chart editing controls are visible anywhere in the Graphs tab. If the slide has a `ChartWrap` and no `TableWrap` or `JourneyWrap`, the Graphs tab shows an empty state (not a chart editor). No `findChartWrap`-related code executes (no console log or error referencing charts). Per ADR-0007, `ChartWrap` is intentionally absent from `slide-machine.ts` and `GraphItems` in `shared/messages.ts`. | | |
| S-37 | **Accent ranges excluded — no accent editing UI is reachable (ADR-0008)** | 1. Select any slide with a `CopyWrap`. 2. Open the General tab and inspect the TitleDescriptionEditor. 3. Look for any accent-range controls: per-word chip grid, "Accent" button, AccentRangePopover, or any word-level dimming toggle. | No accent-range editing controls are visible or reachable in the General tab. The heading input is a plain text field. `headingDim` data may be present in the message-bus payload but has no editing surface in the UI. Per ADR-0008, `AccentRangePopover.vue` is not ported and no `update-accent` message type exists in v0.1.0. | | |

---

### Performance — subjective sanity checks (S-38 through S-39)

These are subjective checks. They are not gates but inform whether an objective measurement
is warranted. If a check fails subjectively, file a P2 bug and note it — the frame-trace
perf gate in CI (PR #46) is the objective gate.

| # | Scenario | Steps | Expected | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| S-38 | **TableEditor toggle feels snappy — no visible jank** | 1. Select the slide with a `TableWrap` (50 rows × 6 cols if available; otherwise whatever the test document provides). 2. Open the Graphs tab. 3. Collapse and expand the Table PropertyPanel collapsible 5 times in rapid succession. 4. Observe whether the UI stutters, lags, or takes perceptibly more than one screen frame (~16 ms) to respond to each click. | Each toggle responds immediately with no perceptible lag. No visible frame drop or stutter. (Objective gate: CI frame-trace perf gate in PR #46 enforces < 16 ms max per toggle. This is a sanity check only.) | | |
| S-39 | **JourneyEditor edit feels responsive** | 1. Select the slide with a `JourneyWrap`. 2. Open the Graphs tab. 3. Click into the label field of a journey item and type 10 characters rapidly. 4. Observe whether keystrokes keep pace with typing or are noticeably delayed. | Keystrokes appear in the input field with no perceptible lag. Canvas update (after `Tab` commit) completes within the `apply-journey` latency budget of ≤ 500 ms. | | |

---

## 5. Result template

Fill in this table after completing all scenarios. A scenario is `Fail` only if the expected
result is not met AND there is no documented acceptable deviation. Screenshot evidence is
mandatory for every `Fail` row and for every scenario in the screenshot checklist below.

| # | Scenario | Status (Pass / Fail / N-A) | Notes / screenshot filename |
| --- | --- | --- | --- |
| S-01 | Plugin opens — no console error, no infinite loading | | |
| S-02 | SlidePicker lists all slides | | |
| S-03 | Selecting a slide loads General data | | |
| S-04 | Heading edit persists to canvas | | |
| S-05 | Paragraph edit persists to canvas | | |
| S-06 | Badge label edit persists | | |
| S-07 | Badge icon swap persists | | |
| S-08 | Image upload persists | | |
| S-09 | General tab persisted state — re-open pre-selects last slide | | |
| S-10 | Disabled state during async dispatch | | |
| S-11 | Content tab appears (CardWrap present) | | |
| S-12 | CardList renders all cards | | |
| S-13 | CardEditor heading edit + CardList preview updates | | |
| S-14 | Card icon swap persists | | |
| S-15 | TimelineEditor renders and heading edit persists | | |
| S-16 | Graphs tab appears and TableEditor renders | | |
| S-17 | TableEditor width toggle (sm / md / lg) persists | | |
| S-18 | TableEditor column header toggle persists | | |
| S-19 | TableEditor body cell edit persists | | |
| S-20 | TableEditor CSV import — valid CSV reflects on canvas | | |
| S-21 | TableEditor CSV import — invalid CSV shows error toast, no replaceContent | | |
| S-22 | JourneyEditor renders and label edit persists | | |
| S-23 | JourneyEditor icon swap persists | | |
| S-24 | Cross-tab state — all edits persist across tab switches | | |
| S-25 | Switch slides — state correctly bound to each slide | | |
| S-26 | Plugin opens in Figma Slides — no console error | | |
| S-27 | SlidePicker lists slides in Figma Slides | | |
| S-28 | Selecting a slide loads General data in Figma Slides | | |
| S-29 | Heading edit persists to canvas in Figma Slides | | |
| S-30 | Content tab appears in Figma Slides (CardWrap) | | |
| S-31 | No slides on page — empty state, no crash | | |
| S-32 | Slide has no CardWrap — Content tab absent/hidden | | |
| S-33 | Slide has no TableWrap or JourneyWrap — Graphs tab absent/hidden | | |
| S-34 | Reload from manifest after rebuild | | |
| S-35 | Bundle artifacts present at expected paths and sizes | | |
| S-36 | Charts excluded — no chart UI reachable (ADR-0007) | | |
| S-37 | Accent ranges excluded — no accent UI reachable (ADR-0008) | | |
| S-38 | TableEditor toggle feels snappy (subjective sanity) | | |
| S-39 | JourneyEditor edit feels responsive (subjective sanity) | | |

### Screenshot checklist

Attach the following screenshots to the Sprint 4 close PR. All 11 are required before
`validation: pass` is posted:

- [ ] S-01 — cold-start UI (SlidePicker visible, console clean), Figma design desktop
- [ ] S-03 — General tab populated (TitleDescriptionEditor showing slide heading)
- [ ] S-11 / S-12 — Content tab with CardList rendered (cards visible)
- [ ] S-13 — CardEditor open with heading field (a card selected, CardEditor below CardList)
- [ ] S-15 — TimelineEditor with at least one item visible
- [ ] S-16 — Graphs tab with TableEditor rendered (grid visible)
- [ ] S-22 — JourneyEditor with items visible
- [ ] S-31 — empty state (no slides on page, empty SlidePicker, empty-state message visible)
- [ ] S-26 — plugin open in Figma Slides editor (SlidePicker visible in the Slides UI)
- [ ] Light theme variant (any success state — use system light theme)
- [ ] Dark theme variant (any success state — toggle via `Figma → Preferences → Theme`)

---

## 6. What is deferred (out of scope for this gauntlet)

The following are **explicitly excluded** from this v0.1.0 gauntlet. These features are
intentionally absent. Including them would produce false fails.

| Deferred feature | ADR / reference | Reason |
| --- | --- | --- |
| ChartWrap / chart editor (Graphs tab — bar, line, pie, donut, progressbar, radial) | [ADR-0007](../../../docs/adr/0007-welder-editor-charts-deferred.md) | Charts deferred to a follow-up epic; `findChartWrap` intentionally absent from `slide-machine.ts`; `GraphItems` in `shared/messages.ts` carries only `TableWrapModel` and `JourneyWrapModel` |
| Accent range editing (per-word heading dim via `AccentRangePopover`) | [ADR-0008](../../../docs/adr/0008-welder-editor-accent-ranges-deferred.md) | Reka focus-trap blocker (`<UPopover>` + `<UInput>` interference); `headingDim` is read-only in v0.1.0; no `update-accent` message type in `messages.ts` |
| Slide creation, reorder, or add/remove wrappers | `docs/api-spec/welder-editor.md` §Non-goals | Out of v0.1.0 scope |
| Cross-page slide navigation | `docs/api-spec/welder-editor.md` §Non-goals | `figma.currentPage` scope only |
| FigJam editor type | [ADR-0002](../../../docs/adr/0002-welder-editor-editortype-narrowing.md) | FigJam excluded; no Slide Machine instances in FigJam |

---

## 7. Exit criteria for v0.1.0 ship

The Sprint 4 close PR receives `validation: pass` from plugin-tester when **all** of the
following conditions are met:

1. **Pass rate ≥ 95% on desktop scenarios** — at most 1 of the 25 Figma design desktop
   scenarios (S-01 through S-25, S-31 through S-39, excluding Slides-only S-26 through S-30)
   may be marked `Fail`. Any result below 95% is a blocker.

2. **100% pass rate for cold-start scenarios** — S-01, S-02, and S-03 must all be `Pass`.
   A cold-start fail blocks the release immediately; no threshold applies.

3. **Zero P0 fails** — a P0 fail is any scenario whose failure indicates:
   - Plugin crash (S-01, S-26, S-31 crash instead of opening)
   - Data loss or persisted-state corruption (edits to canvas are silently dropped or overwrite wrong nodes)
   - Complete inability to use the primary flow (SlidePicker shows nothing on a valid document; General tab never populates)
   No P0 fail is waivable. A P0 automatically triggers the hotfix protocol: file a P0 bug
   on the Bugs Queue board (ID 5095865858), assign `figma-api-engineer` (code-side) or
   `ui-engineer` (ui-side), halt the release, and re-run the full gauntlet after the fix merges.

4. **All P1 fails filed on the Bugs Queue** — any `Fail` that is not a P0 must have a
   corresponding bug item on the Bugs Queue board (ID 5095865858) with:
   - Severity set to P1
   - Owner Agent assigned
   - A `Connected tasks` link to a Sprint task in the welder-editor Sprints board
   Filing is due within 24 hours of the gauntlet run completing.

5. **Editor-type matrix complete** — all three rows in the matrix table in section 3 must
   be fully filled in:
   - Figma design desktop: all 25 design-desktop scenarios complete.
   - Figma Slides desktop: S-26 through S-30 (plus S-01/S-02/S-03 re-run in Slides) complete.
   - Figma design web: S-01, S-03, and S-08 complete.

6. **Screenshot checklist complete** — all 11 screenshots listed in section 5 are attached
   to the Sprint 4 close PR before the `validation: pass` comment is posted.

When all six conditions are met, the user posts `validation: pass` on the Sprint 4 close PR.
Plugin-tester countersigns. Only then does `release-engineer` proceed with the v0.1.0 tag,
GitHub Release, and Figma Community submission pipeline.

---

## 8. References

- Canonical gauntlet runbook: [`runbooks/e2e-gauntlet.md`](../../../runbooks/e2e-gauntlet.md)
- Prior gauntlet (Sprint 3 Content tab): [`validation/e2e/welder-editor/2026-W19-sprint-3-content-tab.md`](2026-W19-sprint-3-content-tab.md)
- API spec: [`plugins/welder-editor/docs/api-spec/welder-editor.md`](../../../plugins/welder-editor/docs/api-spec/welder-editor.md)
- Bundle perf doc: [`plugins/welder-editor/docs/perf/welder-editor.md`](../../../plugins/welder-editor/docs/perf/welder-editor.md)
- ADR-0002 (editorType narrowing): [`docs/adr/0002-welder-editor-editortype-narrowing.md`](../../../docs/adr/0002-welder-editor-editortype-narrowing.md)
- ADR-0003 (bundle budget): [`docs/adr/0003-welder-editor-bundle-budget.md`](../../../docs/adr/0003-welder-editor-bundle-budget.md)
- ADR-0007 (charts deferred): [`docs/adr/0007-welder-editor-charts-deferred.md`](../../../docs/adr/0007-welder-editor-charts-deferred.md)
- ADR-0008 (accent ranges deferred): [`docs/adr/0008-welder-editor-accent-ranges-deferred.md`](../../../docs/adr/0008-welder-editor-accent-ranges-deferred.md)
- Sprint 4 retro: [`docs/sprint-retros/welder-editor-2026-W22-W24-sprint-4.md`](../../../docs/sprint-retros/welder-editor-2026-W22-W24-sprint-4.md)
- Bugs Queue board: ID 5095865858 (welder-editor folder, Monday workspace 6325546)
- Monday task: MON-2893996415 (TDEV-072), Sprint 2894068169
