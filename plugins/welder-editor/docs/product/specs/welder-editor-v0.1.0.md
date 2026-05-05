# welder-editor — product spec v0.1.0

## 1. Status & version

- **Status:** `v0.1.0 — in development`
- **Last updated:** 2026-05-05
- **Author:** product-researcher (translated and adapted from `welder-slide-editor` v0.2.1 Dutch source spec)
- **Source spec being lifted from:** `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/spec.md` (v0.2.1 — read-only reference)
- **Plan of record:** `/Users/lars/.claude/plans/users-lars-documents-claude-figma-plugi-humble-lightning.md` (approved 2026-05-05)

This is the v0.1.0 product spec for the rebuild that lives in this monorepo at `plugins/welder-editor/`. It mirrors the structure of the source spec but tightens scope to what Sprint 0 confirmed and discards out-of-scope chart and accent-range work. Implementation specifics (api-spec brief, threading model, message-bus contract, ADRs) live in sibling documents and are owned by `figma-api-engineer` and `ui-engineer`.

> **Project-pm review:** the source spec used "v0.1.0" loosely — it described an aspirational v0.1.0 that ultimately shipped externally as v0.2.1 with table-Slot architecture and a working JourneyWrap renderer. This rebuild's v0.1.0 inherits the working v0.2.1 surface area (minus charts and accent ranges) rather than the original v0.1.0 scope.

---

## 2. Purpose & scope

(Translated and tightened from spec.md §1.)

`welder-editor` is a Figma plugin that centralizes editing of existing Welder-branded slides. The user picks a slide from the header dropdown and gets three tabs (**General** / **Content** / **Graphs**) with sub-panels for the edit surfaces that apply to that slide — sections that aren't present are hidden automatically.

**Job-to-be-done.** A copywriter or marketer who is not a Figma power-user wants to update text, swap icons, replace images, and tweak data in pre-designed Welder slides without touching layout, type-scale, or design tokens. The plugin makes that flow concrete: pick a slide, edit its content, see the canvas update.

### What it does

- Scans `figma.currentPage` for Welder slides via name-based detection (`INSTANCE` with `name === 'Slide'` and dimensions 1920×1080).
- Presents those slides in a header dropdown (`Slide N — <title>`) and zooms to the picked slide on the canvas.
- Detects per-slide which wrappers exist (CopyWrap / Badge / ImageWrap / CardWrap / TimelineWrap / TableWrap / JourneyWrap) and shows the matching sub-panels under the right tab.
- Writes mutations imperatively to canvas nodes and persists per-target `pluginData` plus a `setRelaunchData` entry for the relaunch button.

### What it is not

- **Not a slide-layout editor.** Slides are not created or rearranged here — those come from the Slide Machine library (published file ID `kAZqxj4nxpafYjB5FhfOru`).
- **Not a data source.** No external sync, no spreadsheet integration.
- **Not a layout creator.** CopyWrap, CardWrap, ImageWrap, TableWrap, JourneyWrap are never created by this plugin; only their content slots are mutated.

### Slide Machine library — file IDs

The slide content lives inside instances of the **Slide Machine** Figma library. Two file IDs are involved:

| Role | File ID | Notes |
|------|---------|-------|
| **Published library** (runtime detection target) | `kAZqxj4nxpafYjB5FhfOru` | This is the file user-facing slides reference. Wrapper-name matching runs against instances of components from this library. |
| **Work copy** (design reference) | `RgTXIrUpihBauydjMZbUGX` ([Templates-Welder](https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder?node-id=26-1797&m=dev)) | A work copy of the same library used for design iteration and review. Useful as a design reference during the rebuild but not the authority for runtime detection. |

> **Project-pm review:** the published library file ID was confirmed by user 2026-05-05. Tests must assert detection by component-name match (not file-ID), so detection stays library-revision-independent. Reconciling these two file IDs is also tracked in the api-spec brief (Sprint 0 deliverable 0.2).

### User flow (3 steps)

(Translated from spec.md §1.)

1. User runs the plugin via `Plugins → Welder Editor → Open slide editor`, or via an `Edit with Welder Editor` relaunch button on an existing target on the canvas.
2. The header dropdown shows slides on `figma.currentPage`. User picks one. Plugin zooms to that slide via `figma.viewport.scrollAndZoomIntoView([slide])`.
3. User navigates the three tabs (**General** / **Content** / **Graphs**). Each tab shows only the sub-sections matching wrappers that exist on that slide; absent sections are hidden. Edits flow back to main-thread debounced.

---

## 3. Non-goals (v0.1.0)

(Translated from spec.md §2 and extended with rebuild-specific deferrals from the approved plan.)

The plugin is **edit-only**. It never creates new content. Concretely, v0.1.0 will not:

- Create slides — slides come from the Slide Machine library.
- Create layout — CopyWrap / CardWrap / ImageWrap / TableWrap / JourneyWrap are never created by this plugin.
- Add or remove cards — only existing cards inside a CardWrap are edited.
- Add or remove timeline items — only existing items inside a TimelineWrap are edited.
- Add or remove journey items — only existing pills inside a JourneyWrap are edited (rows can be added/removed but not the wrapper itself).
- Add or remove badges — only existing Badge instances are edited.
- Add or remove tables — only existing TableWrap instances are edited (rows and columns inside a TableWrap *can* be added/removed via the table editor; the wrapper itself cannot).
- Navigate slides cross-page — only `figma.currentPage` slides are listed. Switching pages in Figma triggers a re-scan; the plugin does not navigate the user.
- Manage its own undo/redo — the plugin relies entirely on Figma's native undo. (See ADR-0004.)
- Drag-reorder content within a slide.
- Provide component linking between slides.
- Provide real-time multi-user editing or conflict resolution.
- Migrate from any predecessor plugins.

**Rebuild-specific non-goals (additional to the source spec):**

- **Charts deferred to a follow-up epic on this plugin.** All chart-related surfaces (`ChartWrap` detection, `ChartData` types, chart-renderer, chart UI controls) are out of scope for v0.1.0. This is recorded in ADR-0007. `code/wrappers/ChartWrap.ts` is intentionally absent — no stub file, no detector. The chart epic will be picked up after v0.1.0 ships in a workable shape.
- **Accent ranges deferred to backlog.** The "dim-accent" word-chip UI on heading text (`Text Dimmer` library variable binding) is parked indefinitely. ADR-0008 records the deferral and pre-approves Route A (inline always-visible badges) when it is revisited. No scheduled sprint.
- **FigJam editor type.** The scaffold default `["figma", "figjam", "slides"]` is narrowed to `["figma", "slides"]` — FigJam cannot host Welder slides. Recorded in ADR-0002.

---

## 4. User flow

(Translated from spec.md §1, second half.)

The user-visible flow has three steps. Each is fast and reversible.

### Step 1 — Open the plugin

Two entry points:

- **Menu:** `Plugins → Development → Welder Editor → Open slide editor` (during dev) or `Plugins → Welder Editor → Open slide editor` (after Community publish).
- **Relaunch button:** `Edit with Welder Editor` on a wrapper that has been edited before. Clicking the button reopens the plugin focused on the slide containing that wrapper.

### Step 2 — Pick a slide

The plugin scans `figma.currentPage`, lists the matching slides (`Slide 1 — <title>`, `Slide 2 — <title>`, …) in the header dropdown, and zooms to the user's pick via `figma.viewport.scrollAndZoomIntoView`.

If the user changes the active page in Figma, the plugin receives `currentpagechange` and refreshes the slide list.

### Step 3 — Edit the slide

Three tabs with conditional sub-panels:

- **General** — slide-level singletons: title-and-description, badge, image.
- **Content** — list editors: cards (CardWrap) and timeline items (TimelineWrap).
- **Graphs** — wrapper-instance editors: tables (TableWrap) and journey-maps (JourneyWrap). Charts are out of scope — the Graphs tab does not show chart controls in v0.1.0.

Edits debounce (≈200–300 ms depending on surface) before flowing to the main thread. Every successful mutation writes `pluginData` and `setRelaunchData` on the target wrapper so a relaunch reopens the same slide.

> **Project-pm review:** the source spec's tab list was `[General, Content, Graphs]`; this rebuild keeps that. The original v0.1.0 §12 open question about a 4th "Tables" tab was resolved in the external build by routing tables under Graphs. This rebuild inherits that decision — tables and journey maps share the Graphs tab.

---

## 5. Data models

(Ported from spec.md §3, with chart-related types and accent-range types stripped per ADRs 0007 and 0008.)

All types live in `plugins/welder-editor/shared/messages.ts` (the contract) once `figma-api-engineer` writes the expanded message-bus contract in Sprint 0 (deliverable 0.11). The shapes below are the product-spec view; the engineering view is the discriminated-union message types in `shared/messages.ts`.

### 5.1 Slide overview

```ts
export interface SlideSummary {
  /** Figma node-id of the slide instance (stable within a session). */
  id: string;
  /** 1-based ordinal — sorted by findAll order on currentPage. */
  number: number;
  /** Display name, e.g. "Slide 3 — Customer Journey". */
  name: string;
  /**
   * Is this slide skipped during presentation?
   * `true`  → SlideNode.isSkippedSlide === true (skip mode on).
   * `false` → SlideNode.isSkippedSlide === false (normal slide).
   * `null`  → no SlideNode parent (Figma Design editor); skip not supported on that surface.
   */
  isSkipped: boolean | null;
}
```

### 5.2 PluginView — three-tab state

The UI has one top-level state that drives all three tabs. Sections are `null` when the underlying wrapper does not exist on the picked slide.

```ts
export type TabId = 'general' | 'content' | 'graphs';

export interface PluginView {
  slides: SlideSummary[];
  currentSlideId: string | null;
  activeTab: TabId;
  general: GeneralSections | null;   // null until a slide is selected
  content: ContentItems | null;
  graphs: GraphItems | null;
}
```

### 5.3 General tab — slide-level singletons

```ts
export interface TitleDescriptionSection {
  copyWrapId: string;
  heading: string;
  /** null when the CopyWrap has no Paragraph text-node. */
  paragraph: string | null;
}

export interface BadgeSection {
  badgeNodeId: string;
  label: string;
  /** Lucide-icon-key, see constants.BADGE_ICON_OPTIONS. */
  icon: string;
}

export interface ImageSection {
  imageWrapId: string;
  /** Figma ImagePaint hash; null when a placeholder fill is still in place. */
  imageHash: string | null;
  /** v0.2.0 crop support; remains undefined in v0.1.0. */
  cropTransform?: [[number, number, number], [number, number, number]];
}

export interface GeneralSections {
  titleDescription: TitleDescriptionSection | null;
  badge: BadgeSection | null;
  image: ImageSection | null;
}
```

> **Project-pm review:** the source spec's `TitleDescriptionSection` had a `headingDim: Array<[number, number]> | null` field for the dim-accent feature (T30 in the source). Per ADR-0008 (accent ranges deferred), this field is **removed** from v0.1.0. When the feature is revisited it returns under the Route A inline-badge approach.

Each sub-section renders only when its object is non-null.

### 5.4 Content tab — cards plus timeline items

```ts
export interface CardItem {
  cardNodeId: string;
  heading: string;
  paragraph: string;
  /**
   * Lucide-icon slug for the card's direct icon-INSTANCE child
   * (e.g. 'sparkles', 'snowflake').
   *
   * - `string` — icon instance present and visible; slug is the current pick.
   * - `null`   — icon instance absent or visible === false; the icon picker is
   *              hidden in the UI (matches the paragraph-hide pattern).
   */
  icon: string | null;
  /**
   * ImagePaint hash on the image slot; null when the card has an image slot
   * but it is empty. undefined when the card has no slot at all (the visual
   * editor does not appear in the UI in that case).
   */
  visualHash: string | null | undefined;
}

/**
 * One editable timeline item inside a TimelineWrap.
 * TimelineWrap children are CopyWrap instances (not Card instances); each
 * item has only Heading + Paragraph — no icon swap, no visual slot.
 * Decorative `Stepper Item` children are skipped by the scan.
 */
export interface TimelineItem {
  /** Node-id of the CopyWrap instance inside TimelineWrap. */
  copyWrapNodeId: string;
  heading: string;
  /** Always a string — empty when the Paragraph text-node is missing. */
  paragraph: string;
}

export interface ContentItems {
  cardWrapId: string;
  cards: CardItem[];
  /**
   * Timeline items. Empty when the slide has no TimelineWrap. Slides with
   * only TimelineWrap have an empty `cards` array and a non-empty
   * `timelineItems` array.
   */
  timelineItems: TimelineItem[];
}
```

> **Project-pm review:** the external build also placed `journeyModel: JourneyWrapModel | null` on `ContentItems` in the dev branch as a transitional measure. For this rebuild we keep `journeyModel` under `GraphItems` (see §5.5) to match the source spec's tab semantics — Graphs is where the JourneyEditor lives.

### 5.5 Graphs tab — tables and journey maps

The Graphs tab hosts wrapper-instance editors, currently for **tables** (TableWrap) and **journey maps** (JourneyWrap). Charts are deferred — `ChartWrap` is intentionally absent from `GraphInstance.type` in v0.1.0.

```ts
export interface GraphInstance {
  nodeId: string;
  type: 'table' | 'journey';
  /** Human-readable label, e.g. "Table 1" or "Journey 1". Built by main thread. */
  label: string;
  /**
   * Slot-based table model. Present when type === 'table'.
   * `null` when the TableWrap has no Slot or no rows yet.
   */
  tableModel?: TableWrapModel | null;
  /**
   * Slot-based journey-wrap model. Present when type === 'journey'.
   * `null` when the JourneyWrap has no Slot or no items yet.
   */
  journeyModel?: JourneyWrapModel | null;
}

export interface GraphItems {
  /**
   * All TableWrap and JourneyWrap instances on the slide (sorted by render
   * order). Length >= 1; when the slide has no graph wrappers the
   * `graphs` field on PluginView is `null` instead of an empty list.
   */
  instances: GraphInstance[];
  /** UI-state. Default: first instance. Mutation is client-side only. */
  selectedGraphId: string;
}
```

### 5.6 TableWrap model

(Ported from external build's slot-based table model, T34 architecture.)

```ts
export interface TableWrapModel {
  /** SlotNode id inside the TableWrap-INSTANCE. */
  slotId: string;
  /** Column-width preset. Drives slot resize. */
  width: 'sm' | 'md' | 'lg';
  /**
   * When true, row 0 is rendered as a header (HUG-vertical, centered text,
   * dimmer color, divider underneath). Body rows share the remaining
   * container height via FILL.
   */
  hasColumnHeader: boolean;
  /**
   * Text-size multiplier on the height-derived font formula.
   * sm = 0.75×, md = 1.0×, lg = 1.25×.
   */
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

export interface TableRowModel {
  /** FRAME-id of the existing row inside the slot; empty for new rows. */
  rowNodeId: string;
  cells: TableCellModel[];
}

export interface TableCellModel {
  /** FRAME-id of the existing cell inside the row; empty for new cells. */
  cellNodeId: string;
  value: string;
}
```

Constraints:

- `TABLE_MAX_ROWS = 15`.
- `TABLE_MAX_COLS = { sm: 3, md: 4, lg: 6 }`.
- The fill-derived font size matrix is keyed on `(slotHeight, rowCount, textSize)` and clamps within `TABLE_FONT_MIN`/`TABLE_FONT_MAX` (constants live in `code/editors/table/constants.ts`; the ratios match the v0.2.1 implementation).

### 5.7 JourneyWrap model

```ts
/**
 * One pill row inside a JourneyWrap.
 * `startPct` and `endPct` are percentages 0-100 of container inner-width.
 * Pill width = (endPct - startPct) / 100 × contentWidth (Gantt-style).
 */
export interface JourneyItemModel {
  /** Figma node-id; empty for new items from scan/UI. */
  itemNodeId: string;
  /** Lucide icon name from ICON_OPTIONS. */
  icon: string;
  /** Pill text. */
  label: string;
  /** Start position 0..(95 - JOURNEY_POS_MIN_SPAN). */
  startPct: number;
  /** End position; ≥ startPct + JOURNEY_POS_MIN_SPAN, ≤ 100. */
  endPct: number;
}

/**
 * One column header above the pills.
 * Two text fields, both optionally filled (empty strings allowed).
 */
export interface JourneyColumnModel {
  /** Top line — large, theme color, centered. e.g. "Awareness". */
  header: string;
  /** Middle line — small, theme color, centered. e.g. "Prospect". */
  subheader: string;
}

export interface JourneyWrapModel {
  /** Figma SlotNode id inside the JourneyWrap-INSTANCE. */
  slotId: string;
  /**
   * Column headers above the pills (4-7 columns, default 6).
   * Backward-compat: scan defaults to 6 empty columns when pluginData v < 7.
   */
  columns: JourneyColumnModel[];
  /** 0..JOURNEY_MAX_ITEMS pills. */
  items: JourneyItemModel[];
}
```

Constraints:

- `JOURNEY_MIN_COLUMNS = 4`, `JOURNEY_MAX_COLUMNS = 7`, `JOURNEY_DEFAULT_COLUMN_COUNT = 6`.
- `JOURNEY_POS_MIN_SPAN` (≈3 % depending on rendered pill min-width) prevents pills from collapsing visually.
- Plugin data version on the journey slot bumps to `v=7` once T46 column headers ship; backward compat handles `v=6` slides without column headers.

> **Project-pm review:** the source spec at v0.2.1 had completed T45 (JourneyWrap pills) and T46 (column headers). Both are in scope for the v0.1.0 rebuild — re-house the v0.2.1 renderer with tests, lift the UI under `sections/JourneyEditor/`. The v0.1.0 deliverable should not introduce new journey-map features; it should match v0.2.1 parity.

---

## 6. Wrapper inventory

(Ported from spec.md §4 — the wrapper-detection rules. ChartWrap marked out of scope per ADR-0007.)

A "slide" is detected on `figma.currentPage` as `INSTANCE` with `name === 'Slide'` and dimensions 1920×1080. Within each slide, the plugin scans for the wrappers below.

| Tab + section | Wrappers (name match) | Status (v0.1.0) |
|---|---|---|
| General → Title & Description | `CopyWrap` | In scope |
| General → Badge | `INSTANCE` whose name starts with `Badge` (e.g. `Badge`, `Badge/Placeholder`) | In scope |
| General → Image | `ImageWrap` | In scope |
| Content → Cards | `CardWrap` → `Card` children | In scope |
| Content → Timeline | `TimelineWrap`, `Tabel=Alt Timeline`, or any instance whose name contains `Timeline` (Slide Machine variant-syntax) | In scope |
| Graphs → Table | `TableWrap`, or instances whose name starts with `Tabel=` / `Table=` / `Property 1=` and does **not** contain `Timeline` | In scope (slot-based, T34 architecture) |
| Graphs → Journey | `JourneyWrap` | In scope (slot-based, T45+T46 architecture) |
| Graphs → Chart | `ChartWrap` | **Out of scope for v0.1.0 — see ADR-0007.** |

### Detection rules

(From spec.md §7.)

```text
isSlide(n)      = n.type === 'INSTANCE' && n.name === 'Slide'
                  && n.width === 1920 && n.height === 1080
findSlides()    = figma.currentPage.findAll(isSlide)
slideNumber(n)  = index in findSlides() result + 1
slideTitle(n)   = first descendant text-node with name === 'Heading' (fallback: n.name)
```

### Selectors per wrapper

(From spec.md §7.2, brought current with T31.1 broadening for variant syntax.)

```text
findCopyWrap(slide)     = first INSTANCE with name === 'CopyWrap' (top-level inside slide)
findBadge(slide)        = first INSTANCE with name.startsWith('Badge')
findImageWrap(slide)    = first INSTANCE with name === 'ImageWrap'
findCardWrap(slide)     = first INSTANCE with name === 'CardWrap'
findTableWrap(slide)    = first INSTANCE with name === 'TableWrap'
                          OR name starts with 'Tabel='/'Table='/'Property 1='
                              and does NOT contain 'Timeline'
findTimelineWrap(slide) = first INSTANCE with name === 'TimelineWrap'
                          OR name contains 'Timeline'
findJourneyWrap(slide)  = first INSTANCE with name === 'JourneyWrap'
                          OR name starts with the JourneyWrap variant prefix
```

> **Project-pm review:** the slot-based architectures for tables (T34) and journey maps (T45) detect a `SlotNode` *inside* the wrapper instance, not the wrapper itself. The wrapper-name match locates the host instance; the slot is then resolved via `wrapInstance.findOne(n => n.type === 'SLOT' && n.name === <slot-name>)`. Engineering details belong in the api-spec brief (Sprint 0 deliverable 0.2), not here.

> **ChartWrap is intentionally absent.** Per ADR-0007, `code/wrappers/ChartWrap.ts` does not exist in v0.1.0. There is no detector, no type, no message handler. The absence is documented in ADR-0007 and the api-spec brief.

### Variant naming and ES2017 compatibility

Slide Machine instances use the component-variant syntax for their `instance.name` on canvas (e.g. `Tabel=Alt Timeline`, `Tabel=Table Default`, `Property 1=Width-md`). Detection uses `indexOf` rather than `includes` / `startsWith` for ES2017 sandbox compatibility — the main-thread bundle targets ES2017.

### Component properties via `setProperties`

Slide Machine components carry variants via instance properties (e.g. `Type=Icon Side`, `Style=Default`). Property names in `componentPropertyDefinitions` follow the format `<propName>#<hash>` — hard-coding `'Style'` without the suffix does not work. The `figma-api-engineer` ports the existing `getPropertyKey(instance, logicalName)` helper into `packages/figma-api/src/instance-properties.ts` (Sprint 1, lifted from the external build).

---

## 7. Editor surfaces — the three tabs

(Ported from spec.md §5 through §7, with chart sub-sections omitted from Graphs and the dormant T10 image edit panel marked in-scope.)

### 7.1 General tab

Three sub-sections. Each renders only if the matching wrapper exists on the picked slide.

#### 7.1.1 Title & Description (CopyWrap)

- Heading text (UInput), Paragraph text (UTextarea, only rendered when the CopyWrap has a Paragraph text-node).
- Mutation path: `code/editors/general/title-description.ts` writes `text.characters` after `loadAllFontsForNode` for mixed-font safety (lifted from the external build's `_shared/fonts.ts` — T29 lesson; promoted to `packages/figma-api/src/fonts.ts`).
- Debounce: ≈200 ms.
- **Out of scope:** dim-accent word chips on the heading. Per ADR-0008, the Route A inline-badge UI is pre-approved when the feature is revisited.

#### 7.1.2 Badge

- Label (UInput) + icon picker (Lucide icons via `BADGE_ICON_OPTIONS`).
- Mutation path: `code/editors/general/badge.ts`. Label writes via `text.characters`; icon swaps via library-INSTANCE_SWAP property on the badge wrapper, walking the `componentPropertyDefinitions` for the swap key (T27 architecture from the external build).
- Falls back gracefully when the library is unreachable: silent skip with debug-log (consistent with the `FIG-GUARD-01` pattern).
- Debounce: ≈200 ms.

#### 7.1.3 Image

- File input → upload bytes via `figma.createImage` → `node.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }]` on the ImageWrap.
- **T10 image edit panel completion is in-scope for v0.1.0** (Sprint 2). The dormant edit panel in the external build's `GeneralPanel.vue` becomes the new `sections/ImageEditor/` with crop affordances. ADR-0006 (Sprint 2) decides cropper choice (cropperjs wrapped vs canvas-API replacement) on the basis of bundle-budget impact (ADR-0003).
- Async safety: image upload routes through `withTimeout` / `withProgress` primitives in `packages/figma-api/src/progress.ts` (Sprint 1) — no more silent fire-and-forget on slow uploads.

### 7.2 Content tab

Two sub-sections. Empty state when the slide has neither a CardWrap nor a TimelineWrap.

#### 7.2.1 Cards (CardWrap)

- One CardEditor per card. Per-card fields: heading (UInput), paragraph (UTextarea), icon picker (only when the card has a visible icon-instance child), visual upload (only when the card has an image-slot).
- No add-or-remove of cards (per non-goals).
- Mutation path: `code/editors/content/card.ts`. Per-card text via `text.characters` after `loadAllFontsForNode`. Icon swap via library-INSTANCE_SWAP on the parent card. Visual via `figma.createImage` + `setBoundVariableForPaint` if the slot is variable-bound.
- Debounce: ≈200 ms.

#### 7.2.2 Timeline (TimelineWrap)

- One TimelineItemEditor per timeline-item. Per-item fields: heading (UInput), paragraph (UTextarea).
- TimelineWrap is polymorphic — children can be `Card` instances *or* `CopyWrap` instances nested in intermediate `Frame` nodes. The scan extracts both via `slide.findAll(n => n.type === 'INSTANCE' && (n.name === 'Card' || n.name === 'CopyWrap'))` bounded to the wrapper subtree (T31.2 architecture).
- No icon-swap, no visual-slot for plain CopyWrap timeline items. Card-shaped timeline items reuse the card icon/visual pipeline.

### 7.3 Graphs tab

One instance-selector dropdown when the slide has multiple TableWrap / JourneyWrap instances. The selected instance's editor renders below.

#### 7.3.1 Table editor (TableWrap)

UI controls:

- **Width picker** — `sm` / `md` / `lg`. Drives slot width and the column cap (`TABLE_MAX_COLS[width]`).
- **Text-size picker** — `sm` / `md` / `lg`. Multiplier on the height-derived font formula.
- **Column header toggle** — when on, row 0 is rendered with header treatment.
- **Row +/− controls** — add/remove rows up to `TABLE_MAX_ROWS = 15`.
- **Column +/− controls** — add/remove columns per the width-keyed cap.
- **Cell grid** — UInput per cell, debounced.
- **CSV import** — collapsible panel, paste a CSV string, validated against current width's column cap and `TABLE_MAX_ROWS`. **CSV schema validation at the boundary is new in v0.1.0** (resolves the silent-empty-array gap from the external build).

Mutation path: `update-table` is a full-state PUT — the UI sends the complete desired `TableWrapModel`; the main thread clears the slot and rebuilds rows + cells from scratch. Allowed because TableWrap is a `SlotNode` and Slot children are mutable (T34 architecture).

**T42.21 perf fix is in-scope (Sprint 4).** The external build had a regression where toggling the table-editor open/close jankily exceeded 16 ms per frame. The two fixes from `.reviews/perf-investigation-2026-04-26.md` are applied:
- **Finding 1**: replace `bodyRows.slice()` with offset-based render so the array reference stays stable through Reka measurement.
- **Finding 3**: memoize `estimateRowTruncation` via a computed `truncationFlags`.

A frame-trace gate (`< 16 ms` toggle open/close) blocks merge in Sprint 4.

> **Project-pm review:** the existing v0.2.1 TableEditor uses Reka's `<CollapsibleContent>` which exposes the perf bug. ADR-0009 (deferred to Sprint 2) decides whether `sections/PropertyPanel/` ships its own collapsible primitive or uses Reka with the perf fixes.

#### 7.3.2 Journey editor (JourneyWrap)

UI controls:

- **Columns section** — N column-cards (4-7), each with header + subheader inputs, X to remove a column, "+ Add column" button (disabled at `JOURNEY_MAX_COLUMNS`).
- **Items section** — N pill-cards, each with icon picker, label input, and a USlider in range mode (two thumbs) for `startPct` / `endPct`. X to remove a pill, "+ Add pill" button.

Mutation path: `update-journey` is a full-state PUT. Main thread re-renders the slot via the lifted v0.2.1 renderer (1,223 LOC, re-housed in `code/editors/journey/`). Diff-based update for both columns and pills (T45.13 + T46.7) — only changed text content is rewritten; resize only when count or contentWidth changed.

**JourneyItem bootstrap key seeding is in-scope (Sprint 4).** The external build had `JOURNEYITEM_KEY_FALLBACK = ''` and auto-detected on first run. The rebuild seeds the constant from a known canvas instance during Sprint 4 kickoff so first-run latency is bounded.

#### 7.3.3 Charts (ChartWrap) — out of scope

The Graphs tab does not render any chart controls in v0.1.0. ADR-0007 records the deferral. Slides whose only graph wrapper is a `ChartWrap` are treated as having no graph wrappers — `graphs` is `null` for them and the Graphs tab is hidden.

> **Project-pm review:** the source spec covered chart-types `bar | line | pie | donut | progressbar | radial`. Of these, only `bar` shipped in production (per the approved plan's "what works today" inventory). The follow-up chart epic on this plugin restarts from the v0.2.1 bar-chart implementation; the rebuild treats charts as if the surface does not exist.

---

## 8. Quality bar (rebuild-specific)

This is what the rebuild adds vs the v0.2.1 external build. Each item has an owner agent and a Sprint when it lands.

| # | Quality | External build (v0.2.1) | Rebuild (v0.1.0) | Owner | Sprint |
|---|---|---|---|---|---|
| 1 | **Tests** | None | Comprehensive vitest + @testing-library/vue + axe + golden-snapshot parity tests for renderers | `plugin-tester` (harness), `figma-api-engineer` (renderer tests), `ui-engineer` (component tests) | 0 (harness), 1+ (suite) |
| 2 | **Accessibility** | None | axe-clean WCAG 2.1 AA gate on every reachable UI state; manual keyboard-nav per section | `ui-engineer`, `plugin-tester` | 0 (gate), 2+ (compliance) |
| 3 | **Bundle budget** | 3.2 MB total (ad hoc) | ADR-0003 revised numbers; per-layer reduction targets; named lazy-load boundaries (icon manifest on demand, journey renderer split) | `figma-api-engineer` (code-side), `ui-engineer` (ui-side) | 0 (ADR), measured per-sprint |
| 4 | **Async boundary discipline** | Silent fire-and-forget (image fetch, icon cache prime, CSV import) | `withTimeout` / `withProgress` primitives in `packages/figma-api/`; UI surfaces toast on failure | `figma-api-engineer` | 1 |
| 5 | **CSV import schema validation** | Silent empty-array on bad input | Validated at the boundary in the TableEditor; user-facing toast on bad input | `ui-engineer` | 4 |
| 6 | **Per-renderer golden-snapshot parity** | None — renderer changes were spot-checked manually | Byte-equivalent output to v0.2.1 on identical input fixtures, per Table and Journey renderer | `figma-api-engineer` (per-renderer tests), `plugin-tester` (harness) | 1 (harness), 4 (Journey + Table) |
| 7 | **Frame-trace perf gate (Table toggle)** | Regressed in v0.2.1 | < 16 ms toggle open/close blocks merge | `ui-engineer` (impl), `plugin-tester` (gate) | 4 |
| 8 | **Manifest narrowed** | `["figma", "slides"]` (ad hoc) | `["figma", "slides"]` per ADR-0002, with `documentAccess: "dynamic-page"` justified explicitly | `figma-api-engineer` | 0 |
| 9 | **Library variable strategy** | Ad hoc — duplicate canvas-token files alongside iframe tokens | ADR-0005: canvas tokens via Figma library variables (`setBoundVariableForPaint` after `Variable.resolveForConsumer(node)` per T28.2 lesson); iframe tokens via Nuxt UI v4 only | `figma-api-engineer` + `ui-engineer` | 0 |
| 10 | **Undo discipline** | Implicit Figma-native | Explicit ADR-0004 with helper API in `packages/figma-api/`; mutations grouped under single user-visible undo step | `figma-api-engineer` | 0 |
| 11 | **Cross-domain action protocol** | None | `CLAUDE.md` cross-domain action protocol applies — agent halts on out-of-scope mutation requests | `project-pm` | enforced from 0 |
| 12 | **Library-first sequencing** | Plugin-first (sections built ad hoc inside the plugin) | Sections shipped as standalone modules with props contract, vitest tests, axe-clean, Storybook before plugin assembles them | `ui-engineer` | 2+ |

### Validation gate per release PR (per `runbooks/e2e-gauntlet.md` and the approved plan)

`plugin-tester`'s `validation: pass` comment on the v0.1.0 release PR requires:

1. `vue-tsc --noEmit` zero errors across `plugins/welder-editor/`, `sections/`, `components/`, `packages/figma-api/`.
2. `vitest run` green; coverage threshold met per Sprint 0 harness decision.
3. `@testing-library/vue` component tests green for every section.
4. `axe-core` zero WCAG 2.1 AA violations on every reachable UI state.
5. Manual e2e gauntlet pass in design + slides on Figma desktop, plus one of those on Figma web.
6. Bundle-size budget per ADR-0003 met at minified-gzipped size for both code-side and ui-side.
7. Frame-trace perf gate met for TableEditor toggle (Quality #7).
8. Golden-snapshot parity tests pass: rebuilt Table + Journey renderers produce byte-equivalent output to v0.2.1 on identical input fixtures.
9. First usability test (Sprint 5) reports SUS or SEQ scores within thresholds defined by `plugin-tester` in the protocol.
10. `release-engineer` Figma Community submission pre-flight checklist complete.

---

## 9. Carry-forward backlog

(Items from the external build that are deferred from v0.1.0, per the approved plan's "what works today vs what's incomplete" inventory.)

The list is exhaustive — every item from the external build's status inventory is either resolved in v0.1.0 (in-scope) or named here (deferred or N/A).

| # | Item (external build) | Status in v0.1.0 | Notes |
|---|---|---|---|
| 1 | T10 — image editor UI panel (dormant in `GeneralPanel.vue`) | **Resolved in Sprint 2** (in-scope) | Becomes `sections/ImageEditor/`. ADR-0006 decides cropper choice. |
| 2 | T42.21 — table toggle jank (`bodyRows.slice()` Reka measurement) | **Resolved in Sprint 4** (in-scope) | Apply Finding 1 + Finding 3 from `.reviews/perf-investigation-2026-04-26.md`. Frame-trace gate < 16 ms. |
| 3 | JourneyItem bootstrap key (`JOURNEYITEM_KEY_FALLBACK = ''`) | **Resolved in Sprint 4** (in-scope) | Sprint 4 kickoff seeds the constant from a known canvas instance. |
| 4 | CSV non-numeric row handling (chart parser Phase 3 TODO) | **N/A** | Chart parser is out of scope; the CSV gap only affected charts. |
| 5 | Charts (T35) — `ChartWrap` detector + chart renderer + chart UI | **Deferred** | ADR-0007 records the deferral to a follow-up epic on this plugin. `code/wrappers/ChartWrap.ts` is intentionally absent. |
| 6 | Accent ranges (T28 / T30) — heading dim word-chips | **Deferred** | ADR-0008 records the deferral to backlog (no scheduled sprint). Route A (inline always-visible badges) pre-approved. |
| 7 | Silent fire-and-forget async (image fetch, icon cache prime, CSV import) | **Resolved in Sprint 1** (in-scope) | `withTimeout` / `withProgress` primitives in `packages/figma-api/`. UI surfaces toast on failure. |
| 8 | Migration from `welder-table` v0.2.0 / `chart-builder` v0.3.0 instances | **N/A** | Predecessor plugins are archived. No migration is offered. |
| 9 | Heading-only character truncation on mixed-font nodes (T29) | **Resolved at Sprint 1 onboarding** | The shared `loadAllFontsForNode` / `setTextCharactersSafe` helpers are lifted into `packages/figma-api/src/fonts.ts` (Sprint 1). |
| 10 | Real-time multi-user editing / conflict resolution | **N/A — out of non-goals scope** | Last-save-wins; no real-time sync planned. |
| 11 | Cross-page slide navigation | **N/A — out of non-goals scope** | Only `figma.currentPage`; user navigates between pages in Figma. |

> **Project-pm review:** items 1, 2, 3, 7, and 9 are the rebuild's "fix during port" set. Items 4, 5, 6, 8, 10, and 11 are explicit "out of scope" items per ADRs and non-goals.

---

## 10. References

- **Source spec being lifted from:** `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/spec.md` (v0.2.1, Dutch, read-only)
- **External-build task archive:** `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/.archive/` — historical context for "what works / what's incomplete"
- **Approved rebuild plan:** `/Users/lars/.claude/plans/users-lars-documents-claude-figma-plugi-humble-lightning.md` (2026-05-05)
- **Templates-Welder design reference:** [https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder?node-id=26-1797&m=dev](https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder?node-id=26-1797&m=dev) — work copy of the Slide Machine library, file key `RgTXIrUpihBauydjMZbUGX`, node `26:1797`
- **Slide Machine published library:** file ID `kAZqxj4nxpafYjB5FhfOru` (runtime detection target)
- **Figma Plugin API docs root:** [https://developers.figma.com/docs/plugins/](https://developers.figma.com/docs/plugins/) — every `figma.*` call, manifest field, and editor-type behavior in the api-spec brief and threading doc traces back here
- **Sibling Sprint 0 deliverables:**
  - `plugins/welder-editor/docs/api-spec/welder-editor.md` (Figma API surface) — owned by `figma-api-engineer`
  - `plugins/welder-editor/docs/threading/welder-editor.md` (threading + state model + latency budgets + error taxonomy) — owned by `figma-api-engineer`
  - `plugins/welder-editor/docs/perf/welder-editor.md` (perf budget, linked from ADR-0003) — owned by `figma-api-engineer` + `ui-engineer`
  - `plugins/welder-editor/shared/messages.ts` (expanded message-bus contract) — owned by `figma-api-engineer`
  - `docs/adr/0002-welder-editor-editortype-narrowing.md`
  - `docs/adr/0003-welder-editor-bundle-budget.md`
  - `docs/adr/0004-undo-discipline.md`
  - `docs/adr/0005-figma-library-variables.md`
  - `docs/adr/0007-welder-editor-charts-deferred.md`
  - `docs/adr/0008-welder-editor-accent-ranges-deferred.md`
- **Conventions:** `CLAUDE.md` (root), `runbooks/monday-workflow.md`, `runbooks/e2e-gauntlet.md`

---

> **Project-pm review (overall):** This v0.1.0 spec is intentionally narrower than the source spec.md it was translated from. The translated and dropped surfaces are:
>
> - **Translated and adapted:** §1 (purpose), §2 (non-goals), §3 (data models — minus chart and accent), §4 (manifest, summarized inline), §7 (slide and wrapper detection), §11 (known issues — folded into the carry-forward backlog), §12 (open questions — folded into Project-pm review notes inline).
> - **Dropped:** §3.5 (`GraphItems` chart type → replaced with table+journey), §3.6 (legacy `TableData` deprecated types — moved to a code-side migration concern), §5 (bridge messages — replaced by reference to the expanded contract in `shared/messages.ts`), §8 (file structure — engineering concern, lives in the api-spec brief), §9 (T1–T15 task list — replaced by the sprint plan in the approved plan), §13 (UI-polish task log — historical; not adapted here).
> - **Out of scope of this document:** message-bus shapes, error taxonomy, latency budgets, threading, file structure, ADR text, sprint mechanics. Those belong to sibling deliverables.
>
> Lars decides; this spec only enumerates the v0.1.0 surface. If a clarifying question arises during Sprint 0 reviews of sibling deliverables (api-spec, threading, ADRs), the answer either updates this spec (if it's a product decision) or stays in the sibling document (if it's an engineering decision).
