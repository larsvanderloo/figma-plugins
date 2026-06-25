# Slide Machine — detection & wrapper reference

What the plugin looks for in Figma and how it edits it: surfaces, wrapper
instances, slots, and the variables they bind to. Derived from
`src/sandbox/slide-machine.ts` + `src/sandbox/editors/**` as ground truth. When
code and this doc disagree, the code wins — fix the doc.

This is a structural map of *what is currently true*, not a history. It carries
no dates, commit references, or fix/status notes — the *why* and the *when* live
in git commit messages. A pre-commit guard (`npm run lint:doc`) enforces that:
it rejects time-bound tokens and checks that every wrapper-finder and variable
key named here still exists in the code.

---

## 1. What gets detected

The plugin's entry is `src/sandbox/main.ts` (bootstrap + handler-registry
dispatch + `figma.on` listeners). Reading/scanning happens in
`src/sandbox/scan/**`; finding wrapper instances happens in `slide-machine.ts`.

A **surface** is a fixed-size INSTANCE the plugin treats as editable. `isSlide()`
matches against `SURFACE_SIGNATURES` (`shared/constants.ts`) — two surfaces today:

| Surface | Name | Size |
|---|---|---|
| Slide | `Slide` | 1920 × 1080 |
| Whitepaper | `Whitepaper` | 1240 × 1754 |

Match is strict (exact name + exact dimensions) so accidentally-scaled instances
are filtered out. Adding a new format = one more entry in `SURFACE_SIGNATURES`,
no logic change.

In Figma Slides the surface INSTANCE sits inside a `SLIDE` (SlideNode) parent
(that's where `isSkippedSlide` lives); in Figma Design it's a top-level instance.

### Node tree

```
PageNode
└── [Slides editor] SLIDE  ·or·  [Design editor] (top level)
    └── Slide / Whitepaper  INSTANCE          ← isSlide()
        ├── CopyWrap   INSTANCE               ← findCopyWrap()
        │   ├── TEXT "Heading"
        │   ├── TypParagraph                  ← gated by showParagraph (see §2)
        │   └── Badge* INSTANCE               ← findBadge()  (gated by showBadge)
        ├── ImageWrap  INSTANCE               ← findImageWrap()  (not inside a Card)
        ├── CardWrap   INSTANCE (×N)          ← findAllCardWraps()
        │   └── Card   INSTANCE (×N)
        ├── ChartWrap  INSTANCE (×N)          ← findAllChartWraps()
        │   └── SLOT                          ← findChartSlot() → plugin-built content
        ├── TableWrap  INSTANCE (×N)          ← findAllTableWraps()
        │   └── SLOT                          ← findTableSlot() → plugin-built content
        └── TimelineWrap INSTANCE             ← findTimelineWrap()  (legacy, Content tab)
            └── CopyWrap INSTANCE (×N)
```

The exported finders are exactly: `findCopyWrap`, `findBadge`, `findImageWrap`,
`findCardWrap` / `findAllCardWraps`, `findChartWrap` / `findAllChartWraps` /
`findChartSlot`, `findTableWrap` / `findAllTableWraps` / `findTableSlot`,
`findTimelineWrap`, plus the surface helpers `findEnclosingSurface` /
`findEnclosingSurfaceName` and the generic `findEnclosingInstanceByName` /
`findSlotInWrap`.

> **Not present:** there is no `TimelineSlotWrap`, no `JourneyWrap` /
> `JourneyItem`, and no `editors/timeline/` or `editors/journey/` directory.
> Timeline support is the single legacy `TimelineWrap` below. (Old git history
> references a slot-Timeline and a Journey feature; neither exists in the code.)

---

## 2. Wrapper catalogue

Each wrapper: how it's detected, what's read, what's written, where the code is.

### CopyWrap — title / description / badge gating

- **Detect:** exact name `CopyWrap` (`findCopyWrap`).
- **Title:** `findSlideHeadingText` reads the `Heading` TEXT node, scoped to
  CopyWrap so it doesn't pick up Card/Badge headings.
- **Apply:** `applyTitleDescription` in `editors/general/title-description.ts`.
- **Badge / paragraph visibility — node `.visible` is the source of truth.** The
  scan reads the `Badge_wrap` FRAME's `.visible` flag for the badge, and the
  `TypParagraph` wrapper / Paragraph node's `.visible` for the paragraph. The
  editor toggles these on/off — badge and paragraph presence is an **editor
  content choice**, not designer-locked. The `Show Badge` / `Show Paragraph`
  BOOLEAN component properties on the CopyWrap master are read only as a **legacy
  fallback** (for CopyWraps that predate the wrap-based pattern); a `null` read
  falls through to the node-visibility read. The paragraph write path sets the
  `Show Paragraph` property when present, matching it by lowercased, hash-stripped
  name. Note: `readBooleanProperty` looks the property up by the logical names
  `showBadge` / `showParagraph`, which do not match the master's actual
  `Show Badge` / `Show Paragraph` names (see §7) — so on the current library that
  fallback read returns `null` and the node-visibility path is what runs.

### Badge — label + icon

- **Detect:** name **starts with** `Badge` (`findBadge`), then visibility gates:
  1. `isEffectivelyVisible` — parent-chain `visible` walk.
  2. `readBooleanProperty(copyWrap, 'showBadge') !== false` — legacy fallback for
     pre-wrap CopyWraps. On the current library this property read does not match
     (logical name vs `Show Badge`), so it is effectively a no-op and the
     `Badge_wrap.visible` read (above) governs.
- **Apply:** `applyBadge` in `editors/general/badge.ts`.
- **Label:** component TEXT property → `Label` TEXT node → first TEXT node.
- **Icon:** multi-strategy swap (see §3).

### ImageWrap

- **Detect:** exact name `ImageWrap`, **excluding** any instance inside a `Card`
  or `CardWrap` ancestor (so a card's image isn't surfaced twice).
- **Apply:** `applyImage` in `editors/general/image.ts`.
- **Slot finding:** `findImageSlot` (`editors/_shared/node-finders.ts`) — (1) a
  child named `Image`/`Visual`/`ImageSlot` with fills; (2) a child with an
  existing IMAGE fill; (3) `fallbackToSelf`.

### CardWrap / Card

- **Detect:** `findAllCardWraps` scans **every** CardWrap on the surface
  (whitepapers carry several). Cards are looked up wrapper-agnostically by id
  (`slide.findOne(... name==='Card' && id===cardNodeId)`).
- **Apply:** `applyCard` (`editors/content/card.ts`); also `card-size.ts`
  (NO_ICON/SM/LG sizing) and `instructor.ts` (InstructorCard variant).
- Reads `Heading`/`Paragraph` text, icon name, and the Card `Type` variant
  (Stack Icon / Image / User / Icon Side) to decide icon-vs-image editing.

### ChartWrap (slot-based)

- **Detect:** `findChartWrap` / `findAllChartWraps`; content lives in a `SLOT`
  (`findChartSlot`), fully plugin-generated and replaced each render.
- **Apply:** `renderChart` dispatcher in `editors/chart/renderer.ts`.
- **All six chart types are fully rendered** (no stubs): `donut`, `pie`, `bar`,
  `progress`, `line`, `matrix` (`CHART_TYPES` in `shared/chart-calculations.ts`;
  `buildDonut` handles both donut and pie via an `isDonut` flag).
- **Sizing is dynamic** from the Slot dimensions — no fixed size presets, no
  fixed height.
- **Theming** is library-variable-driven (`Text` + background variables, Figma
  theme modes), resolved at render time and blended per segment; default accent
  fallback `#ff7700`. The static `THEMES` orange/blue palette
  (`shared/constants.ts`) is the fallback token source.
- Per-category **delta badges** via the shared delta-badge engine
  (`editors/_shared/delta-badge-node.ts`).

### TableWrap (slot-based)

- **Detect:** `findTableWrap` / `findAllTableWraps`. In the library TableWrap is
  a plain COMPONENT (not a variant set) carrying a single `Slot` property, so its
  on-canvas instance is named `TableWrap` and the exact-name branch matches. The
  matcher also accepts the variant-name prefixes `Tabel=` / `Table=` /
  `Property 1=` (excluding names containing `Timeline` or `Chart`) — defensive
  cover for variant-named instances, which the current library does not produce.
  Content is in a `SLOT` (`findTableSlot`).
- **Apply:** `applyTable` in `editors/table/renderer.ts` — full-state PUT (clear
  + rebuild inside the Slot).
- **Limits:** `TABLE_MAX_ROWS = 15`, flat `TABLE_MAX_COLS = 6` (one column limit,
  not per-width tiers).
- **Width:** resolved from the actual **Slot width** at render time
  (`sizing.ts`), with surface fallbacks only for invalid slots
  (`TABLE_MAX_WIDTH_SLIDE = 1728`, `TABLE_MAX_WIDTH_WHITEPAPER = 1116`).
- **Font size:** `getFontSizes(slotHeight, rowCount)` — formula-based with
  row-count-tiered clamps; fully automatic, no size picker.
- **pluginData:** only `hasColumnHeader` is persisted/read; width comes from the
  Slot and font size from the formula, so neither is stored.
- **Layout machinery:** `column-autofit.ts` (content-weighted column widths),
  `measure.ts` (offscreen-TextNode width caching — Figma has no DOM measurement),
  `footer.ts` (per-column sum / currency / percent summaries), per-cell **delta
  badges**, and `computeTableLayoutMetrics` / `computeRowPadding` for
  density-responsive padding.
- **Theme binding:** cell text bound to the `Text` variable, strokes to
  `Text Dimmer` (keys in §5).

### TimelineWrap (legacy, Content tab)

- **Detect:** `findTimelineWrap` — name is exactly `TimelineWrap` or contains
  `Timeline` (case-sensitive). Children are `CopyWrap` instances.
- **Scan:** `scanContent` (`scan/content.ts`) populates `timelineItems[]`.
- **Apply:** `handleUpdateTimelineItem` (`handlers/content.ts`) — per-item
  `Heading`/`Paragraph` text updates, debounced. No icon, no add/remove.

---

## 3. Icon resolution (INSTANCE_SWAP)

Badge, Card, and other icon-bearing wrappers share the swap logic in
`editors/_shared/icon-swap.ts` (note the `_shared` underscore):

- **Multi-strategy escalation:** (1) INSTANCE_SWAP property on the component
  itself; (2) INSTANCE_SWAP on a nested icon child; (3) `swapComponentByName` on
  a plain Lucide child; (Badge last resort) an icon-font TEXT node named `Icon`.
- **`prefValueCache`** — module-level `Map<normalizedName, componentKey>`, built
  once per session from the INSTANCE_SWAP `preferredValues`, and **persisted
  across plugin opens via `clientStorage`** (`PREF_VALUE_STORAGE_KEY`,
  `startHydrateFromStorage`). `primeIconCache` warms it in the background after
  slide load.
- **Normalization:** `normalizeIconKey` (strip `i-lucide-`/path/lead noise,
  lowercase); `LUCIDE_SLUG_RE` validates a Lucide-slug shape;
  `expandLucideNameVariants` (`lucide-aliases.ts`, 216 aliases / 206 parents)
  maps deprecated Lucide names to canonical ones.

---

## 4. Theme, fonts, variables

- **Library variable keys** (hardcoded in `editors/_shared/accent-vars.ts`,
  "Templates Welder / Theme" collection) — load-bearing, keep exact:
  - `Text` → `aaeec2f93a38b8a2e3af696972c4313eff529bc7`
  - `Text Dimmer` → `cd3f59ce0c953ee93c4a30b738a96683035b3d72`
  - `loadAccentVars()` imports both (session-cached promise); both may be `null`
    on a free/offline team, in which case table rendering is skipped.
- **`THEMES`** (`shared/constants.ts`): static `orange` / `blue` token sets,
  used as chart fallback tokens.
- **Fonts:** `REQUIRED_FONTS` preloads `Inter Regular`, `Inter Medium`,
  `Instrument Sans SemiBold`. All text mutations go through a load-fonts-first
  helper (FIG-FONT-01) so mixed-font nodes don't silently truncate.

---

## 5. Two-audience model (why detection is read-only on variants)

A product principle, also stated in `CLAUDE.md`:

- **Designers** work in Figma — they own variants, layouts, sizing, visual
  styling (Card `Type`/`Style`/`Radius`, CardWrap layout, TypHeading `SIze`, …).
- **Plugin users** edit **content only** — text, badge label/icon and its
  on/off, images, card content, table/chart data. (Showing/hiding the badge and
  paragraph is an editor choice, toggled via node `.visible` — see §2.)

So the plugin **reads** designer-set component properties (e.g. Card `Type`) to
decide which editors to show, and **never writes** them. A "designer-only
variant the plugin doesn't expose" is by design,
not a missing feature. Real bugs are *mismatches* — surfacing an editor for
content the designer has hidden, or vice-versa.

---

## 6. Name-match fragility (the standing risk)

Detection is name-based, so a rename in the Slide Machine library silently breaks
the plugin. The brittle assumptions, all in `slide-machine.ts` finders:

| Assumed | Finder | If renamed in master |
|---|---|---|
| `CopyWrap` exact | `findCopyWrap` | no title/description editor |
| `Heading` / `Paragraph` TEXT names | title path | edits silently no-op |
| name starts with `Badge` | `findBadge` | other `Badge*` components → false positive |
| `ImageWrap` exact | `findImageWrap` | no image editor |
| `CardWrap` exact, `Card` exact | card path | no Content tab / card edits no-op |
| `ChartWrap` exact | `findChartWrap` | no Graphs tab |
| `TableWrap` / `Tabel=` / `Table=` / `Property 1=` | `findTableWrap` | no table editor |

Per the two-audience model, prefer a **Figma-side rename** over widening a
matcher when a mismatch is found.

---

## 7. Design-system shape (Slide Machine library)

The structural facts about the Slide Machine masters the plugin depends on. The
canonical library file key is `kAZqxj4nxpafYjB5FhfOru`; hardcoded master keys
must be resolved against that file (a dev clone has different keys).

**Component masters on the library page** (15): `Slide`, `CopyWrap`,
`TypHeading`, `TypParagraph`, `Badge`, `Card`, `BenchCard`, `CardWrap`,
`ImageWrap`, `TableWrap`, `ChartWrap`, `TimelineWrap`, `SlotWrap`, `StaticWrap`,
and a lone Lucide icon component.

- **Slide** is a COMPONENT_SET with a `_layout` variant axis (`Full`, `Stack`,
  `Column`, `Rev Column`, `Breakout`, `Rev Breakout`, `stack column`,
  `stack 3 col`) and four `Column N` INSTANCE_SWAP slots (default `SlotWrap`).
  The plugin detects a slide by size signature (§1), not by this set.
- **CopyWrap** exposes two BOOLEAN component properties — their exact names are
  **`Show Badge`** (default `false`) and **`Show Paragraph`** (default `true`),
  with a space and leading capitals. They toggle the badge sub-tree and the
  paragraph block. The plugin reads them to gate its editors (§2). *The exact
  property name matters: a logical-name lookup for `showBadge` does not match
  `Show Badge`.*
- **Card** is a 16-variant set: `Type` (Stack Icon / Icon Side / Image / User) ×
  `Style` (Default / Outline) × `Radius` (Full / Half). It also carries
  `Show Icon` and `TrailingSlot` BOOLEAN props and an `icon-slot` SLOT. The
  plugin reads `Type` to pick icon-vs-image editing; variant switching is
  designer-only.
- **BenchCard** is a separate benchmark-card COMPONENT_SET (`Type` = Stack Icon,
  `Style`, `Radius`) with `Percentage` TEXT plus `Show Percentage` /
  `Show ChartWrap` BOOLEAN props.
- **CardWrap** is a COMPONENT_SET with one `Type` layout axis carrying 21
  variants (`2 Column`, `3 Column`, `4 Grid`, `In/out`, `Flex`, `Single`,
  `12Grid`, …). The plugin does **not** key off the variant name;
  `findAllCardWraps` scans every CardWrap so cards aren't dropped when a designer
  picks a non-default layout.
- **TableWrap** and **ChartWrap** are plain COMPONENTs (not variant sets), each
  carrying a single `Slot` property — no style/size variants.
- **Badge** is a standalone COMPONENT_SET with a `Property 1` axis (`Default`,
  `Small`), `Icon Leading` / `Icon Trailing` BOOLEAN props, a `Label` TEXT prop,
  and an `icon-slot` SLOT. (It is also placed inside CopyWrap, gated by the
  `Show Badge` boolean above.)
- **ImageWrap** is a COMPONENT_SET with a single `Aspect` variant (`Auto`).
- **TypHeading** exposes a size property spelled `SIze` (capital I) with six
  values (`Display`, `H1`, `H2`, `H3`, `H4`, `H5`). The plugin reads it via the
  property-key helper and never writes it.
- **TimelineWrap** is a COMPONENT_SET with a `Cards` axis: `Timeline`,
  `Alt Timeline`, `In/out`, `Cards 2 col`, `Cards 1`, `Cards7`. `findTimelineWrap`
  matches any name containing `Timeline` (case-sensitive).
