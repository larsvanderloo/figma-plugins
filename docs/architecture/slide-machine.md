# Welder Slide Machine — Architecture Reference

**Status:** Living document (derived from code as ground truth)
**Last updated:** 2026-06-11
**Current source files:** `src/sandbox/slide-machine.ts`, `src/shared/constants.ts`, `src/shared/types.ts`, `src/sandbox/editors/**`

> Note: this document still contains historical and queued JourneyWrap notes.
> For current repository placement rules, see
> [`current-structure.md`](./current-structure.md).
**Audience:** Engineers and designers joining the Welder team who need to modify the plugin or the Slide Machine template.

---

## 1. Hierarchy Diagram

The plugin understands the following Figma node tree. The arrows show how
`slide-machine.ts` walks from a page to individual wrapper instances.

```
PageNode (figma.currentPage)
│
├── [Figma Slides editor]
│   └── SLIDE (SlideNode)            — isSkippedSlide lives here
│       └── "Slide" INSTANCE         ← isSlide() match: type=INSTANCE,
│                                        name='Slide', w=1920, h=1080
│
└── [Figma Design editor — top-level canvas]
    └── "Slide" INSTANCE             ← same isSlide() match, no SlideNode parent
        │
        ├── CopyWrap  INSTANCE       ← findCopyWrap()   exact name
        │   ├── TEXT "Heading"
        │   ├── TEXT "Paragraph"
        │   └── Badge* INSTANCE      ← findBadge()      name.startsWith('Badge')
        │       ├── TEXT "Label"
        │       └── icon_wrapper FRAME
        │           └── <Lucide INSTANCE>
        │
        ├── ImageWrap  INSTANCE      ← findImageWrap()  exact name, not inside Card/CardWrap
        │   └── <fill-bearing child: name 'Image'|'Visual'|'ImageSlot', or first IMAGE fill>
        │
        ├── CardWrap  INSTANCE       ← findCardWrap()   exact name
        │   └── Card  INSTANCE (×N)  ← applyCard uses slide.findOne(id)
        │       ├── TEXT "Heading"
        │       ├── TEXT "Paragraph"
        │       ├── icon_wrapper FRAME → <Lucide INSTANCE>
        │       └── <fill-bearing child: name 'Visual'|'Image'|'ImageSlot', or first IMAGE fill>
        │
        ├── ChartWrap  INSTANCE      ← findChartWrap()  exact name
        │   └── WelderChartContent FRAME  ← plugin-generated; replaced on each render
        │
        ├── TableWrap  INSTANCE      ← findTableWrap()  see §4 for multi-variant matching
        │   └── SLOT                 ← findTableSlot()
        │       └── WelderTableContent FRAME  ← plugin-generated, FIXED size
        │           ├── [TableHeaderRow FRAME]  (optional, when hasColumnHeader=true)
        │           │   └── TableHeaderItem-cN FRAME (×cols)
        │           │       └── TEXT
        │           └── TableRow-N FRAME (×body_rows)
        │               └── TableItem-cN FRAME (×cols)
        │                   └── TEXT
        │
        ├── TimelineWrap  INSTANCE   ← findTimelineWrap()  name contains 'Timeline', not 'TimelineSlot'
        │   └── CopyWrap  INSTANCE (×N)  ← scan filters on name='CopyWrap'
        │       ├── TEXT "Heading"
        │       └── TEXT "Paragraph"
        │
        ├── TimelineSlotWrap  INSTANCE ← findTimelineSlotWrap() name='TimelineSlotWrap' or contains 'TimelineSlot'
        │   └── SLOT                  ← findTimelineSlot()
        │       └── WelderTimelineContent FRAME  ← plugin-generated
        │           └── TimelineRow FRAME (×N)
        │               ├── TimelineLeft  FRAME  (side='left')
        │               │   └── CopyWrap INSTANCE
        │               ├── TimelineStepper FRAME
        │               │   ├── StepperDot ELLIPSE
        │               │   └── StepperConnector LINE
        │               └── TimelineRight FRAME  (side='right')
        │                   └── CopyWrap INSTANCE
        │
        └── JourneyWrap  INSTANCE    ← findJourneyWrap()  exact name
            └── SLOT                 ← findJourneySlot()
                └── WelderJourneyContent FRAME  ← plugin-generated, layoutMode='NONE'
                    ├── WelderJourneyHeader FRAME  ← plugin-generated (T46)
                    │   ├── JourneyHeaderCell-N FRAME (×cols)
                    │   │   ├── TEXT "JourneyHeader-h"
                    │   │   └── TEXT "JourneyHeader-sub"
                    │   └── JourneyHDivider RECTANGLE
                    ├── JourneyVDivider-N RECTANGLE (×cols-1, absolute)
                    └── JourneyItem INSTANCE (×N, absolute positioned)
                        ├── <Lucide INSTANCE>  ← icon swap target
                        └── TEXT  ← label
```

The `center` side variant in TimelineSlotWrap uses a `TimelineCenter FRAME`
instead of `TimelineLeft`/`TimelineRight`, with the stepper column in a
vertical layout above the `CopyWrap`.

---

## 2. Component and Wrapper Catalogue

Every wrapper the plugin recognises, with its detection rule, what the plugin
reads during `scan*`, what it writes during `apply*`, and the relevant
functions.

### 2.1 CopyWrap

| Attribute | Value |
|---|---|
| Detection | `findCopyWrap()` — exact name `'CopyWrap'` |
| Scan function | Inline inside `slideSummary()` via `findSlideHeadingText()` for title; full scan done in `code.ts` `scanSlide` path |
| Apply function | `applyTitleDescription()` in `editors/general/title-description.ts` |
| Reads | `TEXT "Heading"` → `heading`; `TEXT "Paragraph"` → `paragraph` |
| Writes | `TEXT "Heading"` characters + `visible`; `TEXT "Paragraph"` characters + `visible` |
| Visible hide | Empty heading/paragraph sets `node.visible = false` (T39.4). Restores to `true` when non-empty is written back. |
| Font pattern | `setTextCharactersSafe()` — loads all fonts in the existing styled range before write (FIG-FONT-01) |
| Accent-var coupling | `headingDim` ranges are written by the separate `'update-accent'` message path via `setRangeFills` bound to `Text`/`Text Dimmer` variables (T30) |
| Message type | `'update-general'` with `section: 'titleDescription'`; `'update-accent'` for dim-range-only mutations |

### 2.2 Badge

| Attribute | Value |
|---|---|
| Detection | `findBadge()` — name starts with `'Badge'` (prefix match), AND `isEffectivelyVisible()` must return true for the instance and its ancestors up to the slide |
| Scan function | In `code.ts` `scanSlide` (reads `Label` text and resolves icon name) |
| Apply function | `applyBadge()` in `editors/general/badge.ts` |
| Reads | `TEXT "Label"` or first TEXT node for the label; icon instance name (normalized) for the icon key |
| Writes (label) | Primary: component `TEXT` property via `badge.setProperties()`; fallback: `TEXT "Label"` characters; last resort: first TEXT node |
| Writes (icon) | Three-strategy icon-swap (see §4); `applyIconSwap()` in `badge.ts` |
| Visibility guard | `findBadge()` returns `null` if any ancestor up to the slide is `visible === false`; `applyBadge()` silently skips in that case |
| Message type | `'update-general'` with `section: 'badge'` |

### 2.3 ImageWrap

| Attribute | Value |
|---|---|
| Detection | `findImageWrap()` — exact name `'ImageWrap'`, AND not inside any ancestor named `'Card'` or `'CardWrap'` |
| Scan function | In `code.ts` `scanSlide` (reads current `ImagePaint.imageHash`) |
| Apply function | `applyImage()` in `editors/general/image.ts` |
| Image-slot finding | `findImageSlot()` — strategy 1: descendant named `'Image'`, `'Visual'`, or `'ImageSlot'` with `fills`; strategy 2: descendant with existing `IMAGE` fill; strategy 3: wrapper itself |
| Writes | Replaces all fills on the found slot with a fresh `ImagePaint` (`scaleMode: 'FILL'`); bytes from `figma.createImage()` |
| Card filter | Walk parent chain from the matched node back to `slide`; if any ancestor is `INSTANCE` named `'Card'` or `'CardWrap'`, return false. Prevents returning an image slot that belongs to a card |
| Message type | `'upload-image'` with `targetNodeId` pointing to the ImageWrap node |
| Removed | `applyCrop()` is removed (was @deprecated); replaced by canvas-crop on the UI side (T28c, ImageEditor.vue). `scaleMode` stays `'FILL'` for all current writes |

### 2.4 CardWrap / Card

| Attribute | Value |
|---|---|
| Detection | `findCardWrap()` — exact name `'CardWrap'` |
| Scan function | In `code.ts` `scanSlide` — iterates `CardWrap` children matching `INSTANCE` named `'Card'` |
| Apply function | `applyCard()` in `editors/content/card.ts`; `applyCardVisual()` for image fills |
| Card lookup | `slide.findOne(n => n.type === 'INSTANCE' && n.name === 'Card' && n.id === cardNodeId)` — wrapper-agnostic, finds cards inside CardWrap or TimelineWrap (T31.2) |
| Reads | `TEXT "Heading"`, `TEXT "Paragraph"` within the card; icon instance name; `IMAGE` fill hash on image slot |
| Writes (text) | `setTextCharactersSafe()` on `"Heading"` and `"Paragraph"` text nodes |
| Writes (icon) | `applyCardIconSwap()` — same three-strategy pattern as Badge (see §4) |
| Writes (visual) | `findImageSlot()` (strategy 1: `'Visual'`, `'Image'`, or `'ImageSlot'`; strategy 2: existing `IMAGE` fill); replaces fills |
| Message types | `'update-card'`, `'upload-image'` |
| ContentItems shape | `cards: CardItem[]`, each with `cardNodeId`, `heading`, `paragraph`, `icon: string | null`, `visualHash: string | null | undefined` |

### 2.5 ChartWrap

| Attribute | Value |
|---|---|
| Detection | `findChartWrap()` — exact name `'ChartWrap'` |
| Scan function | In `code.ts` `scanSlide` — reads `pluginData('chartData')` from the ChartWrap node |
| Apply function | `renderChart()` dispatcher in `editors/chart/renderer.ts`; `replaceChartContent()` handles insertion |
| Content replacement | Removes all children named `CHART_CONTENT_NAME = 'WelderChartContent'` from the wrap, then `appendChild(fresh)` |
| Implemented chart types | `'bar'` — full imperative renderer in `editors/chart/bar.ts` |
| Stub chart types | `'line'`, `'pie'`, `'donut'`, `'progressbar'`, `'radial'` — each produces a labelled placeholder frame with the stored data point count. Full implementations deferred post-v0.1.0 |
| Size presets (px) | `small: 555`, `medium: 848`, `large: 1141`, `fill: 1728` (from `CHART_SIZE_PX` in `editors/chart/types.ts`) |
| Fixed height | `678` px for all chart types (`CHART_HEIGHT_PX`) |
| Theme coupling | `THEMES['orange' | 'blue']` from `constants.ts`; resolved to `ThemeTokens` at render time, not via Figma variables |
| Fonts used | `'Instrument Sans' SemiBold` (title), `'Inter' Medium` (axis), `'Inter' Regular` (data labels) |
| Message type | `'update-graph'` with `data: ChartData` |

### 2.6 TableWrap (Slot-based, v0.2.0+)

| Attribute | Value |
|---|---|
| Detection | `findTableWrap()` — see §3 for the multi-variant match rules |
| Slot finding | `findTableSlot()` — `tableWrap.findOne(n => n.type === 'SLOT')` |
| Scan function | `scanTableSlot()` in `editors/table/renderer.ts` |
| Apply function | `applyTable()` in `editors/table/renderer.ts`; full-state PUT (clear + rebuild within the Slot) |
| Reads from pluginData | `width` (`'sm'|'md'|'lg'`), `hasColumnHeader` (`'1'`=true), `textSize` (`'sm'|'md'|'lg'`), `kind`, `v` |
| Writes to pluginData | `width`, `hasColumnHeader`, `textSize`, `kind='welder-tablewrap'`, `v='3'` |
| Width presets (px) | `sm: 800`, `md: 1200`, `lg: 1728` (from `TABLE_WIDTHS` in `constants.ts`) |
| Max rows | 15 (`TABLE_MAX_ROWS`) |
| Max cols per preset | `sm: 3`, `md: 4`, `lg: 6` (`TABLE_MAX_COLS`) |
| Font layout | Col 0: `'Instrument Sans' SemiBold` at `heading` size; cols 1+: `'Inter' Regular` at `body` size |
| Header row | `TableHeaderRow` FRAME with `TableHeaderItem-cN` cells; `Inter Medium` 18px, bottom 2px border |
| Body rows | `TableRow-N` FRAME with `TableItem-cN` cells; FILL vertical (equal height sharing); top-stroke 1px on rows 2+ |
| Font size formula | `getFontSizes(slotHeight, rowCount, textSize)` — formula-based, not a preset matrix (T39.1.1) |
| Theme coupling | Cell text fill bound to `Text` variable (key `aaeec2f93a38b8a2e3af696972c4313eff529bc7`); strokes bound to `Text Dimmer` variable (key `cd3f59ce0c953ee93c4a30b738a96683035b3d72`) via `loadAccentVars()` / `setBoundVariableForPaint()` |
| CSV import | `importCSV()` in `editors/table/csv.ts`; uses shared tokenizer in `src/shared/csv/`; truncates to `TABLE_MAX_ROWS` × `TABLE_MAX_COLS[width]` |
| Message types | `'update-table'` (full PUT), `'import-csv'` |

### 2.7 TimelineWrap (hand-built, legacy)

| Attribute | Value |
|---|---|
| Detection | `findTimelineWrap()` — name is exactly `'TimelineWrap'` OR contains `'Timeline'` but NOT `'TimelineSlot'` |
| Scan function | In `code.ts` `scanContent` — `timelineWrap.findAll(n => n.type === 'INSTANCE' && n.name === 'CopyWrap')` |
| Apply function | `applyTimelineItem()` in `code.ts` — per-item update of `Heading` and `Paragraph` text nodes within each CopyWrap child |
| Editable fields | `heading` and `paragraph` text only; no icon-swap, no visual |
| Routing | Goes to the **Content** tab (not Graphs), via `ContentItems.timelineItems` (T31) |
| Message type | `'update-timeline-item'` (debounced 200ms, per-item) |
| Coexistence | Coexists with TimelineSlotWrap; old slides remain on this path unchanged |

### 2.8 TimelineSlotWrap (slot-based, current)

| Attribute | Value |
|---|---|
| Detection | `findTimelineSlotWrap()` — name is exactly `'TimelineSlotWrap'` OR contains `'TimelineSlot'` |
| Slot finding | `findTimelineSlot()` |
| Scan function | `scanTimelineSlot()` in `editors/timeline/renderer.ts` |
| Apply function | `applyTimeline()` in `editors/timeline/renderer.ts`; full-state PUT |
| CopyWrap source | Imported via `figma.importComponentByKeyAsync(COPYWRAP_COMPONENT_KEY)` where `COPYWRAP_COMPONENT_KEY = '39da5367729a9a0cea03bc566928b3e8972cec0b'`; cached per session as `copyWrapImportPromise` |
| Rows structure | `WelderTimelineContent FRAME` (vertical, FILL×FILL) → `TimelineRow` FRAMEs → `TimelineLeft`/`TimelineRight`/`TimelineCenter` halves → `CopyWrap INSTANCE` |
| Side variants | `'left'`: CopyWrap in `TimelineLeft`, stepper in middle, empty `TimelineRight`; `'right'`: inverse; `'center'`: vertical layout, stepper above `TimelineCenter` |
| Stepper elements | `StepperDot ELLIPSE` (18px, fill bound to `Text` variable); `StepperConnector LINE` (90°, stroke bound to `Text Dimmer` variable); connector hidden on last row |
| Fallback mode | When `importCopyWrap()` returns `null` (library unreachable), drops plain `TEXT "Heading"` + `TEXT "Paragraph"` nodes instead of instances |
| Data per row | `copyWrapNodeId`, `heading`, `paragraph`, `side: 'left'|'right'|'center'` |
| Writes to pluginData | `kind='welder-timeline-slot'`, `v='1'` on the Slot |
| Message type | `'update-timeline'` (full PUT) |

### 2.9 JourneyWrap (slot-based)

| Attribute | Value |
|---|---|
| Detection | `findJourneyWrap()` — exact name `'JourneyWrap'` |
| Slot finding | `findJourneySlot()` |
| Scan function | `scanJourneySlot()` in `editors/journey/renderer.ts` |
| Apply function | `applyJourney()` in `editors/journey/renderer.ts`; diff-based update (T45.13) |
| JourneyItem source | Bootstrap strategy A+C: (1) cache; (2) `currentPage.findAll(INSTANCE)` looking for name starting with `'JourneyItem'`; (3) fallback: `getMainComponentAsync()` checking normalized name contains `'journeyitem'`; (4) hardcoded `JOURNEYITEM_KEY_FALLBACK` (currently empty — must be filled post-bootstrap-run, T45.3) |
| Pills layout | `WelderJourneyContent FRAME` (absolute, `layoutMode='NONE'`, `JOURNEY_WIDTH=1728 px`); pills are `JourneyItem INSTANCE` with absolute x/y |
| Pill sizing | `x = JOURNEY_CONTAINER_PADDING + (startPct/100) × contentWidth`; `y = pillYBase + i × (PILL_HEIGHT + PILL_GAP)`; `width = (endPct - startPct)/100 × contentWidth`; `PILL_HEIGHT=90`, `PILL_GAP=12` |
| Header section | `WelderJourneyHeader FRAME` inside container; `N` `JourneyHeaderCell-i FRAME`s each with `TEXT "JourneyHeader-h"` and `TEXT "JourneyHeader-sub"`; `JourneyHDivider RECTANGLE` at bottom of header |
| Vertical dividers | `JourneyVDivider-i RECTANGLE` (full container height minus padding, absolute) |
| Icon-swap | Same three-strategy pattern as Card/Badge (see §4), applied to the JourneyItem instance |
| Label write | `loadAllFontsForNode()` + `tn.characters = item.label`; only when characters differ |
| Writes to pluginData (per item) | `'journey-icon'`, `'journey-start-pct'`, `'journey-end-pct'` |
| Writes to pluginData (slot) | `kind='welder-journeywrap'`, `v='7'` |
| Theme coupling | Header text fills use a hardcoded `#2B7FFF` (blue). JourneyItem internal fills use library-variables. Vertical/horizontal dividers use `rgba(#99B3D9, 0.5)` solid (no variable binding). |
| Backward-compat scan | Reads `journey-start-pct` / `journey-end-pct` on items; falls back to `journey-min-width` (T45.3), then `journey-startCol` (T45.2, converts from 6-col grid to percentage) |
| Message type | `'update-journey'` (full PUT via diff) |
| Bootstrap error | When component not found: renders `JourneyBootstrapError FRAME` with instruction text |

---

## 3. Variant-Property Conventions

### 3.1 The Hash-Suffix Pattern

Figma generates component property keys as `"LogicalName#12345:0"`. The plugin
never hard-codes the full hashed key. Instead, `slide-machine.ts` provides two
helpers:

```
getPropertyKey(instance, logicalName)  →  string | null
setInstanceProperty(instance, logicalName, value)  →  boolean
```

`getPropertyKey` searches `instance.componentProperties` for a key that either
equals `logicalName` exactly (no-hash variant) or starts with `logicalName + '#'`.
It returns `null` when the property does not exist (detached instance, legacy
master, or unknown logical name).

### 3.2 TableWrap Name-Variant Matching

The Slide Machine publishes TableWrap as a component set with multiple variants.
On-canvas, the instance name reflects the variant value. `findTableWrap()` in
`slide-machine.ts` matches any of:

| Pattern | Example on-canvas instance name | Condition |
|---|---|---|
| Exact legacy name | `TableWrap` | `name === 'TableWrap'` |
| `Tabel=` prefix | `Tabel=Table Default`, `Tabel=small` | `name.startsWith('Tabel=')` AND no `'Timeline'` in name |
| `Table=` prefix | `Table=large` | `name.startsWith('Table=')` AND no `'Timeline'` in name |
| `Property 1=` prefix | `Property 1=Table Default` | `name.startsWith('Property 1=')` AND no `'Timeline'` AND no `'Chart'` in name |

The `Timeline` exclusion prevents matching `Tabel=Alt Timeline`; the `Chart`
exclusion for `Property 1=` prevents matching chart variants that share the
property name.

### 3.3 TimelineWrap Name-Variant Matching

`findTimelineWrap()` matches:

| Pattern | Condition |
|---|---|
| Exact legacy name | `name === 'TimelineWrap'` |
| Any name containing `'Timeline'` | `name.indexOf('Timeline') >= 0` |

And explicitly excludes any name containing `'TimelineSlot'` (those go to
`findTimelineSlotWrap()`). `findTimelineSlotWrap()` matches names that are
exactly `'TimelineSlotWrap'` or contain `'TimelineSlot'`.

### 3.4 Logical Property Names Used per Wrapper

Only the logical names the plugin currently reads or writes, as passed to
`getPropertyKey` / `setInstanceProperty`:

| Wrapper | Logical property name | Type | How used |
|---|---|---|---|
| Badge (via `applyBadge`) | First `TEXT`-type property (iterated) | `TEXT` | Label write via `setProperties`; falls back to text-node mutation |
| Card (via `applyCardIconSwap`) | First `INSTANCE_SWAP`-type property on owner | `INSTANCE_SWAP` | Icon swap (see §4) |
| Badge (via `applyIconSwap`) | First `INSTANCE_SWAP`-type property on owner | `INSTANCE_SWAP` | Icon swap (see §4) |
| JourneyItem (via `applyJourneyIconSwap`) | First `INSTANCE_SWAP`-type property on owner | `INSTANCE_SWAP` | Icon swap (see §4) |
| Any wrapper (generic) | `'Style'`, `'Type'`, etc. | variant | Used only when the plugin explicitly calls `setInstanceProperty`; no current editor drives these |

The plugin does not drive `'Style'` or `'Type'` variant properties today.
Those are present on many Slide Machine components but the plugin treats the
variant that is already on canvas as fixed. This is a coverage gap (see §9).

---

## 4. INSTANCE_SWAP and Icon Resolution

### 4.1 The Three-Strategy Pattern

Every wrapper that carries an icon (Badge, Card, JourneyItem) uses the same
three-strategy escalation, implemented identically in `editors/general/badge.ts`,
`editors/content/card.ts`, and `editors/journey/renderer.ts`.

**Strategy 1 — INSTANCE_SWAP property on the component itself**
`trySwapViaInstanceProperty(instance, iconName)` in `editors/shared/icon-swap.ts`:
1. `instance.getMainComponentAsync()` → `main`.
2. Resolve `owner` = `main.parent` if it is a `COMPONENT_SET`, else try a fresh
   `importComponentByKeyAsync(main.key)` for the parent, else use `main` itself.
3. Iterate `owner.componentPropertyDefinitions` for the first `INSTANCE_SWAP` property.
4. Check the module-level `prefValueCache` (Map of normalized icon name → component key).
5. Cache miss: await the background `buildPrefValueCache(preferredValues)` promise,
   then check again.
6. Cache hit: `importComponentByKeyAsync(cachedKey)` → `instance.setProperties({ [propKey]: comp.id })`.

**Strategy 2 — INSTANCE_SWAP property on a nested icon child**
Find a nested icon INSTANCE (primaire pad: `badge.findChild(n => n.name === 'icon_wrapper')` → first INSTANCE child; fallback: first descendant INSTANCE whose normalized name matches `LUCIDE_SLUG_RE`). Run strategy 1 on that nested instance.

**Strategy 3 — `swapComponentByName` on the nested icon child**
`swapComponentByName()` in `editors/shared/icon-swap.ts`: look up the normalized
icon name in `prefValueCache`, `importComponentByKeyAsync(key)`, then
`instance.swapComponent(comp)`. This path works for badges/journey items whose
icon is a plain Lucide instance (no INSTANCE_SWAP property), where the cache was
already populated by a Card scan on the same session.

**Last resort (Badge only) — Text-node icon-font pattern**
If none of the above strategies succeed, `applyIconSwap` in `badge.ts` looks for
a `TEXT` node named `'Icon'` and writes the icon name as characters. This covers
an older icon-font-based Badge variant.

### 4.2 The prefValueCache

`prefValueCache` is a module-level `Map<string, string>` (normalized icon name →
component key). It is built once per session via `buildPrefValueCache()`, which
`Promise.all`-maps over all `COMPONENT`-type entries in the first `INSTANCE_SWAP`
property's `preferredValues` list, importing each component and storing its
normalized name.

`primeIconCache(instance)` is called after slide-load (when a Card instance is
available) to start the build in the background before the user interacts with
the icon picker.

### 4.3 Normalization and Aliases

`normalizeIconKey(raw)` applies: lowercase + trim, strip `'i-lucide-'` prefix,
strip path prefix (everything before and including the last `/`), strip leading
non-alphanumeric characters. Examples:
- `'i-lucide-arrow-down'` → `'arrow-down'`
- `'Icon/heart'` → `'heart'`
- `'Arrow Down'` → `'arrow down'` (spaces kept — but Lucide slugs use hyphens,
  so a name with spaces would not match a typical Lucide slug)

`LUCIDE_SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` validates that a normalized
name looks like a Lucide slug. It permits digit-only hyphen-segments (e.g.
`'bar-chart-3'`, `'arrow-down-0-1'`).

`expandLucideNameVariants(name)` in `lucide-aliases.ts` returns the name plus
any old aliases that map to it (and the canonical name for any alias). The alias
table has 216 entries across 206 parents (generated from `@iconify-json/lucide`).
This handles Welder libraries built against older Lucide versions that named
their components using deprecated aliases.

---

## 5. Theme and Accent-Vars

### 5.1 THEMES Palette (chart-renderer)

The `THEMES` constant in `constants.ts` provides two static `ThemeTokens` objects:

| Token | `orange` | `blue` |
|---|---|---|
| `background` | `#FFF4EA` | `#D5E5FF` |
| `foreground` | `#FF7700` | `#2B7FFF` |
| `accent` | `#FF9233` | `#609FFF` |
| `gridLine` | `#FFB665` | `#C7D6EE` |
| `mutedText` | `#FF7700` | `#2B7FFF` |
| `palette[0]` | `#FF7700` | `#2B7FFF` |
| `palette` length | 6 | 6 |

These are used exclusively by the **chart renderer** (`editors/chart/`). Bar
fills and axis label colors are hex-strings converted to `RGB` inline;
`ChartData.theme` (`'orange' | 'blue'`) drives the selection. This is
independent of the Figma variable system.

### 5.2 Library Variable Keys (table / timeline / accent)

The table, timeline, and heading-accent paths use two Figma library variables
from the "Templates Welder / Theme" collection:

| Logical name | Key (hardcoded in `accent-vars.ts`) |
|---|---|
| `Text` | `aaeec2f93a38b8a2e3af696972c4313eff529bc7` |
| `Text Dimmer` | `cd3f59ce0c953ee93c4a30b738a96683035b3d72` |

`loadAccentVars()` imports both via `figma.variables.importVariableByKeyAsync()`,
caches the promise for the session, and returns `{ text: Variable | null, dimmer: Variable | null }`.
Both can be `null` when the library is unreachable (free team, offline). In that
case:
- `applyTable()` skips the content rebuild entirely (logs a warning, still writes pluginData).
- Timeline renderer uses the `TEXT_DIMMER_RGB` fallback (`#ffc78f`, orange-mode value) as a static solid fill.

`resolveColor(variable, node, fallback)` calls `variable.resolveForConsumer(node)`
to obtain the variable's value under the node's current mode (preventing stale
cache colors when mode switches happen).

### 5.3 ThemeSection — Slide-Level Variable Mode Picker

`GeneralSections.theme: ThemeSection | null` lets the UI expose a per-slide
mode override. Sandbox-side (in `code.ts`), the plugin scans the file for a
variable collection named `'Theme'`, reads `slide.explicitVariableModes` to
see whether the slide has a pinned mode, and resolves the current mode
(explicit or inherited). On `'set-slide-theme'` message, it calls
`slide.setExplicitVariableModeForCollection(collectionId, modeId)` (or clears
with `null`).

### 5.4 Font Assumptions

`REQUIRED_FONTS` pre-loads three font combos at plugin init:

| Key | Family | Style |
|---|---|---|
| `title` | `Instrument Sans` | `SemiBold` |
| `heading` / `axisLabel` | `Inter` | `Medium` |
| `body` / `dataLabel` | `Inter` | `Regular` |

All text-node mutations go through `setTextCharactersSafe()` (which calls
`loadAllFontsForNode()` before writing), so mixed-font nodes are handled
correctly even if the node contains fonts outside this pre-loaded set.

---

## 6. Slot-Based Wrappers — Mutation Discipline

Slot-based wrappers are the core innovation of v0.2.0+. Three wrappers use this
pattern: `TableWrap`, `TimelineSlotWrap`, and `JourneyWrap`.

### 6.1 What a Slot Is

`SlotNode` is a Figma proposed-API node type exposed in library components.
Unlike a normal `InstanceNode` child, the content of a `SlotNode` is
mutable even when the `SlotNode` is inside an instance. The plugin calls
`slot.appendChild()`, `slot.remove()`, and `slot.resize()` freely. This is
what allows the plugin to own the full content tree inside those wrappers.

### 6.2 What Is Mutable vs. What Comes From the Master

| Layer | Owned by | Mutable by plugin |
|---|---|---|
| Wrapper INSTANCE (e.g. `TableWrap`) | Slide Machine library | No — variant, positioning, outer styling come from master |
| Slot FRAME | Slide Machine library | Slot is mutable: appendChild, remove, resize |
| Content FRAME (`WelderTableContent`, `WelderTimelineContent`, `WelderJourneyContent`) | Plugin | Yes — entirely plugin-generated |
| Row/cell/item FRAMEs | Plugin | Yes |
| Text nodes within plugin-generated frames | Plugin | Yes |
| JourneyItem INSTANCE (inside the slot) | Slide Machine library (imported) | Resize and reposition are allowed; text and icon properties mutated via API |

The outer wrapper's variant properties (e.g. whether the table is `sm`/`md`/`lg`
in the Slide Machine library's own sense) are NOT driven by the plugin. The plugin
tracks its own `width` preference in `pluginData` on the Slot and resizes the
content accordingly.

### 6.3 Resize Discipline

All three slot-based wrappers attempt the same width-resize strategy after
inserting content:

1. `slotParent.resize(targetWidth, slotParent.height)` — resize the wrapper
   INSTANCE (TableWrap / TimelineSlotWrap / JourneyWrap) if it has `'resize' in parent`.
2. `slot.resize(targetWidth, slot.height)` — resize the Slot itself.
3. `container.resize(targetWidth, targetHeight)` — explicitly resize the content
   FRAME to the target dimensions (safety, because SlotNode children cannot use
   FILL sizing in autolayout).

All three calls are wrapped in `try/catch` with silent fallback, because auto-
layout-managed wrappers reject resize calls at runtime.

For **TableWrap**, slot height is used as the authoritative container height:
`container.resize(TABLE_WIDTHS[width], slot.height)`. Font sizes are derived
from `getFontSizes(slot.height, rowCount, textSize)`.

For **JourneyWrap**, container height is computed from pill count:
`headerOffset + JOURNEY_CONTAINER_PADDING * 2 + items.length * PILL_HEIGHT + gaps`.

### 6.4 Full-State PUT vs. Diff

| Wrapper | Strategy | Reason |
|---|---|---|
| TableWrap | Full-state PUT — clear all Slot children, rebuild | Simple; rows/cells are anonymous FRAMEs; diff by node-id would be fragile across reorders |
| TimelineSlotWrap | Full-state PUT — `slot.children.slice().forEach(c => c.remove())` | Same reasoning |
| JourneyWrap | Diff-based (T45.13) — match existing `JourneyItem INSTANCE`s by array index; update only changed fields | JourneyItem is a real library INSTANCE; full remove+recreate triggered expensive `importComponentByKeyAsync` per pill and was too slow for slider-drag interactions |

---

## 7. Detection Edge Cases

### 7.1 `isSkippedSlide`

In Figma Slides editor, each `"Slide" INSTANCE` sits inside a `SLIDE` (SlideNode)
parent. `slideSummary()` checks `slide.parent.type === 'SLIDE'` and reads
`parent.isSkippedSlide`. If there is no `SlideNode` parent (Figma Design), `isSkipped`
is returned as `null`. The UI hides the skip toggle in that case.

### 7.2 `findSlideAncestor` Pattern

The plugin does not have a standalone `findSlideAncestor` function, but the
parent-chain walk idiom appears in two places:

- `findImageWrap()`: walks `n.parent` up to `slide` checking for any `INSTANCE`
  ancestor named `'Card'` or `'CardWrap'`; returns false if found.
- `isEffectivelyVisible()`: walks `current.parent` up to 10 hops checking
  `node.visible === false` at each step. Used by `findBadge()` to exclude
  badges that are hidden via the CopyWrap "Show Badge" toggle.

### 7.3 ImageWrap-Inside-Card Filter

`findImageWrap()` only returns the slide-level ImageWrap — an ImageWrap that is
a descendant of any `INSTANCE` named `'Card'` or `'CardWrap'` is excluded.
This prevents the same image slot appearing in both the General tab (ImageWrap)
and the Content tab (card visual). The relevant check is the `while (cur !== null && cur !== slide)` loop in `slide-machine.ts`.

### 7.4 Hidden Heading Text-Nodes

`findSlideHeadingText()` scopes its search to `CopyWrap` before calling
`findOne(n => n.type === 'TEXT' && n.name === 'Heading')`. This prevents
picking up `"Heading"` text nodes in Card instances or hidden Badge variants,
which can contain literal placeholder text and would produce a spurious
`"Slide N — Vestibulum..."` display name.

### 7.5 JourneyItem Bootstrap Requirement

`applyJourney()` cannot function if no `JourneyItem` component has ever been
placed on the current page. When `resolveJourneyItemKey()` fails all three
strategies (name-match scan, mainComponent-name scan, hardcoded fallback
`JOURNEYITEM_KEY_FALLBACK` which is currently an empty string), the renderer
places a `JourneyBootstrapError` FRAME with an instruction message and returns.
The user must place one `JourneyItem` from the Welder library onto any slide on
the current page, then trigger the plugin again.

---

## 8. Gaps and Unverified Assumptions

Every entry below is a place where the code matches by name or assumes a
structure without a verified check against the actual Slide Machine master.
A rename or restructure in the template would silently break the plugin.

| # | What is assumed | Where in code | Risk |
|---|---|---|---|
| 8.1 | `CopyWrap` is exactly named `'CopyWrap'` in the master | `findCopyWrap()`, `slide-machine.ts` | Rename in master → plugin stops finding title/description |
| 8.2 | The text node for slide title is named `'Heading'` (not `'Title'` or `'H1'`) | `findSlideHeadingText()`, `slide-machine.ts`; `applyTitleDescription()` | Rename → dropdown shows "Slide N", heading edits silently do nothing |
| 8.3 | The text node for slide body is named `'Paragraph'` | `applyTitleDescription()` | Rename → paragraph edits silently do nothing |
| 8.4 | Badge instance names start with `'Badge'` (prefix match, not exact) | `findBadge()` | Adding other components prefixed `Badge` to the slide would give false positives |
| 8.5 | The Badge label is a component `TEXT` property (iterated) or a text node named `'Label'` (fallback) or the first text node | `applyBadge()` | Structural changes to Badge → label edits fail silently |
| 8.6 | The icon within a Badge is reached via `icon_wrapper FRAME` child → first INSTANCE child | `findNestedIconInstance()` in `badge.ts` | If the icon_wrapper frame is renamed or removed, strategy 2 falls back to the Lucide-slug scan |
| 8.7 | `ImageWrap` is exactly named `'ImageWrap'` | `findImageWrap()` | Rename → no image editor in General tab |
| 8.8 | ImageWrap's fill-bearing child is named `'Image'`, `'Visual'`, or `'ImageSlot'` (strategies 1 and 2) | `findImageSlot()` in `editors/_shared/node-finders.ts` | Different child name → strategy 3 (wrapper itself) may apply image fill to the wrong layer |
| 8.9 | `CardWrap` is exactly named `'CardWrap'` | `findCardWrap()` | Rename → no Content tab |
| 8.10 | Individual cards within CardWrap are INSTANCE nodes named exactly `'Card'` | `applyCard()`, `applyCardVisual()` | Rename → card edits silently fail |
| 8.11 | Card's image slot is named `'Visual'` or `'Image'` | `findImageSlot()` in `card.ts` | Different name → strategy 2 (existing IMAGE fill) used; could match the wrong node |
| 8.12 | `ChartWrap` is exactly named `'ChartWrap'` | `findChartWrap()` | Rename → no Graphs tab |
| 8.13 | `JourneyWrap` is exactly named `'JourneyWrap'` | `findJourneyWrap()` | Rename → no Journey editor |
| 8.14 | `JourneyItem` instances are named exactly `'JourneyItem'` or start with that prefix | `resolveJourneyItemKey()` pass 1; `scanJourneySlot()` | Renamed instance → bootstrap falls back to mainComponent-name scan; scan misses items |
| 8.15 | `COPYWRAP_COMPONENT_KEY = '39da5367729a9a0cea03bc566928b3e8972cec0b'` is stable | `editors/timeline/renderer.ts` | Library recreate → key becomes stale; timeline slot rebuild fails with import error |
| 8.16 | `JOURNEYITEM_KEY_FALLBACK` is currently empty | `editors/journey/renderer.ts` | If no JourneyItem is on the current page and the fallback is empty, journey editing is unavailable until the user manually places one |
| 8.17 | The `Text` and `Text Dimmer` variable keys are stable | `editors/_shared/accent-vars.ts` | Library variable rename/recreate → `importVariableByKeyAsync` fails; table styling silently falls back to no-render |
| 8.18 | The `CopyWrap` component within `TimelineWrap` has `'Heading'` and `'Paragraph'` text nodes | `editors/timeline/renderer.ts` `applyCopyWrapText()` | Rename → text writes to CopyWrap instances silently do nothing |
| 8.19 | `JourneyHeaderCell-{i}` naming convention is set by the plugin and read back by scan | `scanJourneyHeaderColumns()` | Cells manually renamed in Figma → scan skips them, header state reverts on next apply |
| 8.20 | Slide Machine file key `kAZqxj4nxpafYjB5FhfOru` | Documented in spec but not used in code directly; referenced for context | If the Welder template migrates to a new file, component keys change and all hardcoded keys become stale |

---

## 9. Coverage Matrix

Every wrapper against every property the plugin currently exposes. "Exposed" means the field appears in the `types.ts` model and the message bus; "not exposed" means the plugin does not surface it in the UI even if the Slide Machine master supports it.

| Wrapper | Property | Exposed | Message type | Notes |
|---|---|---|---|---|
| CopyWrap | `heading` text | Yes | `update-general / titleDescription` | |
| CopyWrap | `paragraph` text | Yes | `update-general / titleDescription` | null if no Paragraph node |
| CopyWrap | `headingDim` accent ranges | Yes | `update-accent` | null if library vars unreachable |
| Badge | `label` text | Yes | `update-general / badge` | |
| Badge | `icon` | Yes | `update-general / badge` | Lucide slug from ICON_OPTIONS |
| Badge | Variant (`Style`, `Type`, etc.) | No | — | Plugin does not drive Badge variants |
| ImageWrap | image bytes / hash | Yes | `upload-image` | Replaces fill |
| ImageWrap | crop transform | No (removed) | — | `applyCrop()` is removed; UI does pre-crop |
| ImageWrap | scaleMode | No | — | Always written as `'FILL'` |
| Card | `heading` text | Yes | `update-card` | |
| Card | `paragraph` text | Yes | `update-card` | |
| Card | `icon` | Yes | `update-card` | Lucide slug |
| Card | `visualHash` / image | Yes | `upload-image` | Only when card has image slot |
| Card | Variant (`Type`, `Style`, etc.) | No | — | Plugin does not switch card variants |
| ChartWrap | `chartType` | Yes | `update-graph` | `'bar'` fully rendered; others stub |
| ChartWrap | `title` | Yes | `update-graph` | |
| ChartWrap | `dataPoints` | Yes | `update-graph` | |
| ChartWrap | `theme` (`orange`/`blue`) | Yes | `update-graph` | THEMES palette, not Figma variables |
| ChartWrap | `size` preset | Yes | `update-graph` | `small/medium/large/fill` |
| ChartWrap | `showLegend` | Yes (in ChartData type) | `update-graph` | Not rendered in v0.1.0 bar renderer |
| ChartWrap | `benchmark` | Yes (in ChartData type) | `update-graph` | Not rendered in v0.1.0 bar renderer |
| ChartWrap | `showYAxis` | Yes (in ChartData type) | `update-graph` | Not rendered in v0.1.0 bar renderer |
| ChartWrap | `line`/`pie`/`donut`/`progressbar`/`radial` renders | No (stub) | — | Deferred post-v0.1.0 |
| TableWrap | Rows and cells (text) | Yes | `update-table`, `import-csv` | |
| TableWrap | `width` preset (`sm/md/lg`) | Yes | `update-table` | Drives resize + col count cap |
| TableWrap | `hasColumnHeader` | Yes | `update-table` | Header row with distinct styling |
| TableWrap | `textSize` (`sm/md/lg`) | Yes | `update-table` | Multiplier on font-size formula |
| TableWrap | Table variant (Slide Machine `Style`/`Type`) | No | — | Plugin does not switch table variants |
| TimelineWrap (legacy) | `heading` + `paragraph` per item | Yes | `update-timeline-item` | Per-keystroke, debounced 200ms |
| TimelineWrap (legacy) | `icon` | No | — | TimelineWrap items have no icon-swap |
| TimelineWrap (legacy) | Add/remove/reorder items | No | — | Read-only structure |
| TimelineSlotWrap | `heading` + `paragraph` per row | Yes | `update-timeline` | Full PUT |
| TimelineSlotWrap | `side` (`left/right/center`) | Yes | `update-timeline` | |
| TimelineSlotWrap | Add/remove/reorder rows | Yes | `update-timeline` | Full PUT; UI adds/removes rows |
| JourneyWrap | `icon` per pill | Yes | `update-journey` | |
| JourneyWrap | `label` per pill | Yes | `update-journey` | |
| JourneyWrap | `startPct`/`endPct` per pill | Yes | `update-journey` | Gantt-style slider |
| JourneyWrap | Add/remove/reorder pills | Yes | `update-journey` | Full diff-based PUT |
| JourneyWrap | Column `header` + `subheader` | Yes | `update-journey` | T46 |
| JourneyWrap | Add/remove columns (0–7) | Yes | `update-journey` | T46.8 allows 0 columns |
| JourneyWrap | Column divider color | No | — | Hardcoded `rgba(#99B3D9, 0.5)` |
| JourneyWrap | Header text color | No | — | Hardcoded `#2B7FFF` (blue); not theme-aware |
| Slide (all) | `isSkippedSlide` | Yes | `set-slide-skipped` | Figma Slides only; null in Design |
| Slide (all) | Theme variable mode | Yes | `set-slide-theme` | Shows picker only when collection exists |
| Slide (all) | Export (PDF/PNG) | Yes | `export-document` | Single slide or full presentation |

---

## 10. Open Questions for the Next Research Pass

These cannot be determined from code alone and require a Figma MCP query or
direct inspection of the Slide Machine library file (`kAZqxj4nxpafYjB5FhfOru`).

1. **ChartWrap variants**: Does the Slide Machine master expose a `Type` or `Style`
   property on `ChartWrap` that controls the chart type (bar/line/pie)? If so,
   the plugin could switch chart types by flipping a variant property instead of
   replacing `WelderChartContent`. This would also give access to Slide Machine's
   own chart styling.

2. **Badge variant properties**: What `Style`/`Type` or other component properties
   does the Badge master expose? The plugin only reads the first `TEXT` property
   for the label. Are there size variants, color variants, or shape variants the
   plugin currently ignores?

3. **Card variant `Type` property**: The `CardItem.icon: string | null` is `null`
   when the icon instance is not visible. Does that correspond to a `Type` variant
   on the Card master (`Type=Icon` vs. `Type=Image` vs. `Type=Text`)? If so, the
   plugin should be switching the variant rather than relying on `visible`.

4. **TableWrap variant `Style` property**: The Slide Machine seems to have multiple
   Table variants (`Table Default`, `small`, etc.). Does the master expose a `Style`
   property that the plugin could drive? Currently the plugin resizes the Slot content
   but does not switch the outer variant.

5. **TimelineWrap legacy structure**: What children does the Slide Machine's
   `TimelineWrap` master have? The plugin scans for `CopyWrap INSTANCE` children;
   it filters out `Stepper Item` children by not matching their name to `'CopyWrap'`.
   Are there other children types that might match unexpectedly?

6. **CopyWrap structure**: Does the CopyWrap master always have both `Heading` and
   `Paragraph` text nodes, or can the Paragraph be absent in some variants? The
   code guards against the absence (`paragraph: string | null`), but the
   specific variants that omit it are unknown.

7. **COPYWRAP_COMPONENT_KEY validity**: Is `'39da5367729a9a0cea03bc566928b3e8972cec0b'`
   still the current key for the CopyWrap component in the library file
   `kAZqxj4nxpafYjB5FhfOru`? This is the only hardcoded component key that is
   actually relied upon (JOURNEYITEM_KEY_FALLBACK is empty). It should be verified
   after any library update.

8. **JourneyItem component structure**: What INSTANCE_SWAP properties does the
   JourneyItem master expose? The plugin runs the same three-strategy icon-swap as
   Card/Badge. The expected structure (first INSTANCE child as the icon) is
   documented in a code comment (`node 305:6003`) but has not been re-verified
   after recent library changes.

9. **ImageWrap variants beyond a single slot**: Does any ImageWrap variant have
   multiple fill-bearing children (e.g. a background + foreground image)? The
   current `findImageSlot` returns the first matching node; if there are two
   image layers, the plugin always targets the same one regardless of user intent.

10. **Header text color in JourneyWrap**: The `renderHeaderTextNodes()` helper
    hardcodes `#2B7FFF` as the header text color (the blue theme foreground).
    Does the Slide Machine library expose this via a variable, and should the
    plugin use `Text` variable binding here instead to make it theme-aware?

11. **`isEffectivelyVisible` vs. component property**: The `findBadge()` function
    checks visibility by walking the parent chain. Some Slide Machine components
    use a boolean component property (e.g. `'Show Badge'`) to toggle sub-elements
    rather than directly setting `visible`. If the Badge toggle works via a
    component property instead of `visible`, `isEffectivelyVisible` would return
    true for a "hidden" badge and the plugin would show the Badge editor section
    when it should be hidden.

---

## 11. Phase 1 — Figma MCP Verification (2026-05-07)

Evidence pulled from the actual library file via the Figma MCP. This section
confirms or contradicts assumptions in §1–§10. Source of truth supersedes the
code-only inferences in earlier sections; treat this as the authoritative
record where they conflict.

### 11.0 Two-audience scope rule (read this first)

The welder-editor plugin has **two non-overlapping audiences**:

- **Designers** work directly in Figma against the Slide Machine masters.
  They pick variants (Card `Type` / `Style` / `Radius`, CardWrap layout `Type`,
  TypHeading `SIze`, etc.) — **anything that affects layout or visual style**.
- **Plugin users (non-Figma)** edit slides in Figma Slides and only have
  access to **content**: text, badge label/icon, images, card content, table
  data, chart data, journey items + columns. They cannot change variants or
  layouts.

This is a deliberate product split, not a coverage gap. When auditing the
plugin against the design system:

- Designer-only variants/layouts/sizes the plugin doesn't expose are **by
  design**, not bugs. They are not opportunities for new editor surfaces.
- The plugin **reads** designer-set component properties (e.g. `showBadge`)
  to decide what content editors to show. It does **not write** them.
- Real bugs are *mismatches* — the plugin shows an editor for content the
  designer has hidden, or vice versa.

### 11.1 File-key — dev-clone, not a drift

**Code** (`docs/product/specs/spec.md` §1) cites the canonical Slide Machine
library file key `kAZqxj4nxpafYjB5FhfOru`. The Phase-1 MCP query targeted
`RgTXIrUpihBauydjMZbUGX` because the developer is using a **personal copy of
the template** for plugin development. The two should be structurally
identical; the master keys (e.g. `COPYWRAP_COMPONENT_KEY`) cited in the
plugin code refer to the canonical library, not the dev clone.

**Action**: none. spec.md stays as-is. When verifying any hardcoded master
keys (e.g. §10 Q7 — `COPYWRAP_COMPONENT_KEY` validity), the verification must
be done against the canonical file `kAZqxj4nxpafYjB5FhfOru`, not the dev
clone — keys differ between copies.

### 11.2 CopyWrap exposes `showBadge` + `showParagraph` boolean properties

**The big one.** Querying the CopyWrap master (id `28:3079`) returned a
component with two boolean properties:

| Property         | Default | Effect when true                                       |
|------------------|---------|--------------------------------------------------------|
| `showBadge`      | `false` | Renders `Badge_wrap` → `Badge` (icon + Text_wrapper)   |
| `showParagraph`  | `true`  | Renders `TypParagraph` (the body-copy block)           |

The component is single-variant (no `Type` / `Style` axes), and the children
are: optional Badge_wrap, mandatory TypHeading instance (defaulting to
`SIze=H1`), optional TypParagraph instance.

**This confirms §10 Q11 and turns it into a real bug** (referenced from §8 as
"unverified assumption"):

- Plugin's `findBadge` matches any descendant `INSTANCE` whose `name` starts
  with `'Badge'`, then runs `isEffectivelyVisible(badge, slide)` which walks
  the parent chain checking `visible` flags.
- Slide Machine controls the badge by **toggling `showBadge` on the CopyWrap
  instance**. When `showBadge=false`, the underlying Badge sub-tree may still
  have `visible=true` on every node — Figma re-evaluates the variant render
  but does not necessarily update each child's `visible` flag.
- Result: the plugin's "is the badge shown?" check returns true even when
  Figma is rendering the slide without a badge, so the General-tab Badge
  editor surfaces, the user edits "fields that don't exist on screen," and
  changes silently apply to a hidden subtree.

**Same bug applies to Paragraph**: the plugin's `findCopyWrap` does not check
`showParagraph`. If the user disabled the paragraph in Figma, the plugin's
General-tab Title/Description editor will still expose the paragraph field.

**Fix sketch** (deferred — research only):

1. In `findBadge`, after locating the Badge candidate, walk up to the
   enclosing `CopyWrap` instance and read `componentProperties` for any key
   matching `showBadge` (with hash suffix). Return `null` if false.
2. In `scanCopyWrap` (or wherever paragraph presence is decided), do the same
   check for `showParagraph`. Treat `false` as paragraph-absent regardless of
   text-node presence.
3. In `applyBadge` / `applyTitleDescription`, if the writer wants to *show*
   a hidden badge/paragraph, flip the boolean property first via
   `setInstanceProperty(copyWrap, 'showBadge', true)` instead of touching
   `visible`.

### 11.3 Card master — full variant matrix found

The "Card" component is actually **a 16-variant component-set** with three
property axes (logical names quoted from the Figma master):

| Axis     | Values                                    |
|----------|-------------------------------------------|
| `Type`   | `Stack Icon`, `Image`, `User`, `Icon Side`|
| `Style`  | `Default`, `Outline`                      |
| `Radius` | `Full`, `Half`                            |

That gives 4 × 2 × 2 = 16 published variants. Sample IDs from the metadata:

- `32:5548` Type=Stack Icon, Style=Default, Radius=Full
- `40:12684` Type=Image, Style=Default, Radius=Full
- `200:5078` Type=User, Style=Default, Radius=Full
- `33:10567` Type=Icon Side, Style=Default, Radius=Full
- (… etc., 12 more)

**Plugin coverage** (per §11.0 two-audience rule):

- Variant *switching* (Type / Style / Radius) is **designer-only — by design**.
  Do not add a plugin editor for these axes.
- The plugin should still **read** `Type` to know which content fields are
  meaningful for a given Card. The current code uses `visible` on the icon-
  instance child as a proxy (`CardItem.icon: string | null`). That works in
  practice if Figma keeps the child's `visible` synced with the Type variant,
  but is fragile — a more robust scan reads `Type` directly via
  `getPropertyKey(card, 'Type')` and maps:
  - `Type=Stack Icon` / `Type=Icon Side` → icon picker visible
  - `Type=Image` → visual upload visible (instead of icon)
  - `Type=User` → user-avatar slot (today the plugin treats this like Image
    because both have a non-null `visualHash`)
- Whether to act on this is a Phase-2 question — only worth the change if
  the `visible`-proxy is actually flaky in production. Otherwise leave it.

**Resolves §10 Q3** as "designer-locked, no plugin change required."

### 11.4 CardWrap layout variants (`Type=…` property)

A second component-set with logical property `Type` carries **17 layout
variants** (names quoted from the Figma master):

`2 Column`, `2 Column small`, `3 Column`, `4 Column`, `5 Column`,
`3 Row`, `4 row`, `2/3`, `3/1`, `4 Grid`, `5 Grid`, `6 Grid`, `8 Grid`,
`10grid`, `In/out`, `Type16`, plus a `Default` (id `7:31`) — though the
`Default` is shared with the `Property 1=` series in §3.4 and may be the
TableWrap default rather than a CardWrap one (worth a Phase-2 disambiguation).

**Plugin coverage** (per §11.0 two-audience rule):

- Layout switching is **designer-only — by design**. Not a plugin editor
  surface.
- However, `findCardWrap` currently matches by `name === 'CardWrap'` only and
  may **fail to detect** on-slide instances whose name is the variant label
  (`Type=4 Column`, `Type=2/3`, etc.) when Figma surfaces those names instead
  of the master's bare `'CardWrap'`. **Worth a Phase-2 spot-check on real
  slides**: if a designer-picked layout variant breaks the plugin's CardWrap
  detection, content editing for that slide silently disappears even though
  the visual output is fine.
- If the spot-check confirms the detection gap, widen the matcher analogous
  to the TableWrap multi-pattern in §3.2 — match `name.indexOf('Type=') === 0`
  with an exclusion list to avoid colliding with TableWrap and Card variants.

### 11.5 TableWrap variants — confirmed only 2

`Property 1=Default` (id `7:31`) and `Property 1=Small` (id `202:11548`).
Plugin's `findTableWrap` matches both via the `Property 1=` prefix. **No bug**
— this answers §10 Q4 negatively (no hidden Style variants on TableWrap).

### 11.6 Timeline variants — name mismatch likely silent bug

The library has a component-set with property `Cards`, variants:

- `Cards=Timeline` (id `40:10181`) — matches plugin (`indexOf('Timeline') >= 0`)
- `Cards=Alt Timeline` (id `40:10192`) — matches plugin
- `Cards=TimeLCards` (id `68:3144`) — **does NOT match** (case mismatch:
  `'TimeL'` ≠ `'Timeline'` because `indexOf('Timeline')` is case-sensitive
  and the variant name has a capital `L` in the middle of `TimeLCards`)
- `Cards=In/out` (id `70:9457`) — does not match (no `Timeline` substring)

**Two outcomes possible**:

1. The two unmatched variants (`TimeLCards`, `In/out`) are intentional
   alternative renderings the plugin doesn't yet support → they're an
   opportunity to widen the matcher.
2. The `TimeLCards` casing is a **typo in the master**. Renaming to
   `Cards=TimelineCards` would make it match the plugin's existing matcher
   without any plugin change.

Per the memory-noted preference ("Prefer Figma-side fixes over plugin-side
workarounds"), the typo path looks cleaner. Worth a one-line check with the
designer.

### 11.7 Heading sizes — TypHeading component-set

A component-set with property `SIze` (typo in the master: capital `I`,
lowercase elsewhere) exposes 6 heading sizes: `Display`, `H1`, `H2`, `H3`,
`H4`, `H5`. CopyWrap's default is `SIze=H1` (96px Instrument Sans SemiBold).

**Plugin coverage** (per §11.0 two-audience rule):

- Heading-size switching is **designer-only — by design**. Designers pick the
  appropriate `SIze` variant when building the slide; plugin users only edit
  the heading text.
- The `SIze` typo in the master is worth flagging to the designer for a
  cosmetic rename (no plugin code currently reads this property by name, so
  fixing the typo is risk-free), but not urgent.

**Resolves §10 Q13** as "designer-locked."

### 11.8 What's still missing — Phase 2 targets

The "01 The Slide Machine" canvas (id `26:1797`) we queried did **not**
contain masters for: ChartWrap, JourneyWrap, JourneyItem, or a top-level
Badge component-set. They are either:

- On a different page in this same file (likely — the file probably has
  multiple canvases), or
- Imported from a different team library that this file consumes.

**Next selections needed in Figma desktop** (one at a time, share the URL):

1. **ChartWrap master** — for §10 Q1 (variant Type/Style for chart types?).
2. **JourneyWrap master** — for §10 Q10 (header text-color variable binding?).
3. **JourneyItem master** — for §10 Q8 (icon-instance structure verification +
   component key for `JOURNEYITEM_KEY_FALLBACK`).
4. **Badge master** — for §10 Q2 (Style/Type variants beyond the label).
5. **ImageWrap master / Aspect=Auto** — for §10 Q9 (multiple fill-bearing
   children?). Note: the metadata showed `ImageWrap` as a `<frame>` not a
   `<symbol>`; it may be a template frame rather than a published component.

### 11.9 §10 — Question disposition

| #  | Question                                            | Status                                |
|----|-----------------------------------------------------|---------------------------------------|
| 1  | ChartWrap variants                                  | unanswered (Phase 2)                  |
| 2  | Badge variant properties                            | unanswered (Phase 2)                  |
| 3  | Card variant `Type`                                 | designer-locked §11.3 (read-only use) |
| 4  | TableWrap variant `Style`                           | **answered §11.5**                    |
| 5  | TimelineWrap legacy structure                       | partial — see §11.6                   |
| 6  | CopyWrap structure (Paragraph absence)              | **answered §11.2** (real bug)         |
| 7  | `COPYWRAP_COMPONENT_KEY` validity                   | unanswered (Phase 2)                  |
| 8  | JourneyItem component structure                     | unanswered (Phase 2)                  |
| 9  | ImageWrap variants beyond a single slot             | partial — see §11.8                   |
| 10 | Header text color in JourneyWrap                    | unanswered (Phase 2)                  |
| 11 | `isEffectivelyVisible` vs component property        | **answered §11.2** (real bug)         |
| 12 | CardWrap layout `Type=` detection gap (§11.4)       | **new** — Phase-2 spot-check needed   |
| 13 | TypHeading size picker                              | designer-locked §11.7                 |

### 11.10 Real bugs vs. by-design (post two-audience filter)

After applying §11.0, the Phase-1 evidence collapses to **two real fixes** and
**one Phase-2 verification** plus **two Figma-side fixes**:

**Plugin bugs (real)**

- **§11.2 — Read `showBadge` / `showParagraph`.** Plugin currently uses
  `isEffectivelyVisible` parent-walk; should read the boolean component
  property on the enclosing CopyWrap. Read-only — the plugin must not flip
  these. Fix sketch in §11.2.
- **§11.4 — CardWrap detection on `Type=…` instance names.** Spot-check on a
  real slide where the designer picked a non-default layout. If `findCardWrap`
  fails to detect, widen the matcher to include `Type=…` variants (similar to
  the TableWrap multi-pattern matcher).

**Figma-side fixes (designer)**

- **§11.6 — Rename `Cards=TimeLCards` → `Cards=TimelineCards`** (or similar
  canonical casing) so the plugin's existing `indexOf('Timeline')` matcher
  catches it. Cheaper than widening the matcher.

Everything else flagged as "the plugin doesn't expose X variant" is
designer-locked by the two-audience rule.
