# welder-slide-editor — spec.md

> Historical backlog note: this file predates the current `src/` repository
> layout and still contains old `plugin-src/`, chart, and queued Journey
> references. Use `docs/architecture/current-structure.md` as the current
> source of truth for code placement and runtime boundaries.

**Status:** Uitgebracht (v0.2.1) — v0.2.2 in voorbereiding (T39 responsive table)
**Version:** 0.2.1
**Last updated:** 2026-04-25 (T39 backlog uitgeschreven — responsive table met fixed slot-height. T39.0 = architect-research pre-flight, T39.1 = renderer rewrite via matrix-fontSize, T39.2 = UI/types/constants cleanup. Vorige entry 2026-04-24: T34 research done — zie `.archive/T34-table-research-2026-04-24.md`; T34.0–T34.6 backlog voor v0.2.0 TableWrap in-place-rewrite refactor. T36/T37/T38 polish geshipped als v0.2.1. Charts blijft op T33-state tot T34 geverifieerd — T35 gereserveerd maar BLOCKED. Eerder: T32 Card icon-picker visibility-check, T31.2 TimelineWrap polymorphic scan, T31.1 bredere wrapper-naam-matching, T31 TimelineWrap routering Graphs → Content, T30 heading-accent word-chips, T29 font-loading fix `5e0af6d`, T28 accent-ranges reverted — zie `.archive/T28-accent-ranges-handoff-2026-04-24.md`. Polish-tasks T19-T24 geshipped en uit §13 verwijderd.)

> **Historische context:** deze plugin consolideert de editor-functionaliteit van twee voorgangers:
>
> - `welder-table` v0.2.0 (plugin) — imperatieve AutoLayout-tabel-renderer met Vue/Nuxt-UI editor-iframe
> - `chart-builder` v0.3.0 (widget) — declaratieve JSX-chart-widget met Vue/Nuxt-UI editor-iframe
>
> Beide blijven bewaard onder hun huidige git-tags (`v0.2.0-welder-table-plugin`, `chart-builder v0.3.0`) als rollback. De code wordt **als module** overgenomen in `plugins/welder-slide-editor/widget-src/editors/`. De standalone plugin/widget wordt bij v0.1.0-release van `welder-slide-editor` als _Gearchiveerd_ gemarkeerd in `PLUGINS.md`, maar niet uit de repo verwijderd.
>
> De chart-renderer wordt geport van **declaratieve widget-JSX** naar **imperatieve plugin-API** (zelfde transformatie als welder-table-v0.1.0 → v0.2.0). De tabel-renderer was al imperatief en wordt 1-op-1 overgenomen.

---

## 1. Doel & scope

`welder-slide-editor` is een overkoepelende Figma-**plugin** die de bewerking van bestaande Welder-slides centraliseert. Een gebruiker pickt een slide in de header-dropdown en krijgt vervolgens drie tabs (**General** / **Content** / **Graphs**) met daarbinnen telkens de edit-surfaces die op díe slide van toepassing zijn — secties die niet aanwezig zijn worden automatisch verborgen.

**Wat het DOET:**

- Scant de huidige pagina op Welder-slides (via naam-gebaseerde detectie: `INSTANCE` met `name === 'Slide'` en dimensie 1920×1080).
- Presenteert die slides in een header-dropdown (`Slide 1 — <titel>`), zoomt naar de gekozen slide op canvas.
- Detecteert per slide welke wrappers aanwezig zijn (CopyWrap / Badge / ImageWrap / CardWrap / ChartWrap / TableWrap) en toont de bijbehorende sub-panels binnen de juiste tab.
- Schrijft wijzigingen imperatief terug naar de canvas-nodes en slaat per target `pluginData` + `setRelaunchData` op.

**Wat het NIET is:**

- Geen slide-LAYOUT-editor: slides zélf worden niet gecreëerd of herschikt — die komen uit de Slide Machine library (file `kAZqxj4nxpafYjB5FhfOru`).
- Geen data-bron, geen sync met externe systemen, geen spreadsheet.

**User-flow (3 stappen):**

1. User runt de plugin via `Plugins → Welder Slide Editor → Open slide editor`, of via een `Bewerk met Slide Editor`-relaunch-knop op een bestaande target.
2. Header-dropdown toont de slides op `figma.currentPage` — user pickt er één. Plugin zoomt naar die slide (`figma.viewport.scrollAndZoomIntoView([slide])`).
3. User navigeert de drie tabs (**General** / **Content** / **Graphs**). Elke tab toont alleen de sub-secties die bij díe slide bestaan; afwezige secties zijn verborgen. Bewerkingen gaan debounced terug naar main-thread.

---

## 2. Niet-doelen (v0.1.0)

**De plugin is EDIT-only. Hij creëert nooit nieuwe content.** Concreet:

- **Geen slide-creatie** — slides komen uit Slide Machine library.
- **Geen layout-creatie** — CopyWrap / CardWrap / ImageWrap / ChartWrap / TableWrap worden niet door ons gemaakt.
- **Geen card-toevoegen of -verwijderen** — we bewerken alleen de cards die al in CardWrap staan.
- **Geen chart-toevoegen** — we bewerken alleen bestaande ChartWrap-instances.
- **Geen table-toevoegen** — we bewerken alleen bestaande TableWrap-instances.
- **Geen badge-toevoegen** — we bewerken alleen bestaande Badge-instances.
- Geen cross-page slide-navigatie — alleen slides op `figma.currentPage`. Navigeren naar een andere pagina vereist dat de gebruiker dat in Figma zelf doet; plugin hercomputet dan zijn slidelist.
- Geen eigen undo/redo-management — we leunen volledig op Figma's native undo.
- Geen drag-reorder van content binnen een slide.
- Geen component-linking tussen slides.
- Geen real-time multi-user editing of conflict-resolution.
- Geen migratie van bestaande `welder-table` v0.2.0 of `chart-builder` v0.3.0 instances — zie _Known issues_.

---

## 3. Data-modellen

### 3.1 Slide-overzicht

```ts
export interface SlideSummary {
  id: string; // node-id van de slide-frame
  number: number; // gesorteerd op canvas-positie of naam-prefix, 1-based
  name: string; // display-naam, bv. "Slide 3 — Customer Journey"
}
```

### 3.2 PluginView — 3-tab-state

De UI heeft één top-level state die alle drie de tabs voedt. Secties zijn `null` als de onderliggende wrapper niet op de slide bestaat.

```ts
export type TabId = 'general' | 'content' | 'graphs';

export interface PluginView {
  slides: SlideSummary[];
  currentSlideId: string | null;
  activeTab: TabId;
  general: GeneralSections | null; // null tot slide-selected
  content: ContentItems | null;
  graphs: GraphItems | null;
}
```

### 3.3 General-tab — slide-level singletons

```ts
export interface GeneralSections {
  titleDescription: {
    copyWrapId: string;
    heading: string;
    paragraph: string | null; // null als CopyWrap geen Paragraph heeft
  } | null;

  badge: {
    badgeNodeId: string;
    label: string;
    icon: string; // icon-key (Lucide-naam)
  } | null;

  image: {
    imageWrapId: string;
    imageHash: string | null; // Figma ImagePaint-hash; null als placeholder
    cropTransform?: Transform; // v0.2.0
  } | null;
}
```

Elke sub-sectie rendert alleen als het bijbehorende object niet-null is.

### 3.4 Content-tab — card-list

```ts
export interface ContentItems {
  cardWrapId: string;
  cards: Array<{
    cardNodeId: string;
    heading: string;
    paragraph: string;
    visualHash: string | null; // ImagePaint-hash op image-slot; null als de card geen image-slot heeft
  }>;
}
```

De CardItemEditor rendert per card; de `visualHash`-editor verschijnt alleen als de card een image-slot bevat.

### 3.5 Graphs-tab — chart-editor

```ts
export type GraphItems = {
  chartWrapId: string;
  data: ChartData; // hergebruikt uit chart-builder v0.3.0
} | null;
```

`ChartData` (chart-type, theme, title, series, labels, benchmarks, min/max) wordt 1-op-1 overgenomen uit chart-builder en verhuist naar `editors/chart/types.ts`.

### 3.6 Tables

TableWrap-editing is niet vastgelegd of hij onder de Graphs-tab hoort of een 4e tab "Tables" krijgt — zie §12 open questions. Data-model (`TableData`, `TABLE_DATA_VERSION = 2`) blijft hoe dan ook 1-op-1 geport uit welder-table v0.2.0.

---

## 4. API / Manifest

```json
{
  "name": "Welder Slide Editor",
  "id": "welder-slide-editor-1777000000000",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma", "slides"],
  "documentAccess": "dynamic-page",
  "permissions": [],
  "networkAccess": { "allowedDomains": ["none"] },
  "menu": [{ "name": "Open slide editor", "command": "open" }],
  "relaunchButtons": [{ "command": "open", "name": "Bewerk met Slide Editor" }]
}
```

- `editorType: ["figma", "slides"]` — werkt in zowel Figma Design als Figma Slides.
- `documentAccess: "dynamic-page"` — nodig om slides cross-page te kunnen scannen (v0.1.0 alleen currentPage, maar flag houdt de deur open).
- `networkAccess: { allowedDomains: ["none"] }` — alles lokaal; CSV-parse gebeurt in UI-iframe.
- `id` is een placeholder-string; builder genereert definitieve timestamp-id bij T1.

---

## 5. Bridge-messages (iframe ↔ main-thread)

Typed discriminated unions (zie `FIG-MSG-01`).

**UI → plugin:**

| `type`           | Payload                                                                                         | Beschrijving                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ui-ready`       | —                                                                                               | UI mounted, vraagt om init-data                                |
| `pick-slide`     | `{ slideId: string }`                                                                           | Main zoomt + post `slide-loaded` met alle drie de tab-payloads |
| `update-general` | `{ slideId: string; section: 'titleDescription'\|'badge'\|'image'; payload: unknown }`          | Debounced 200ms                                                |
| `update-card`    | `{ slideId: string; cardNodeId: string; payload: Partial<{ heading, paragraph, visualHash }> }` | Debounced 200ms                                                |
| `update-graph`   | `{ slideId: string; chartWrapId: string; data: ChartData }`                                     | Debounced 300ms                                                |
| `upload-image`   | `{ targetNodeId: string; bytes: Uint8Array }`                                                   | Voor GeneralSections.image én CardItem.visual                  |
| `close`          | —                                                                                               | `figma.closePlugin()`                                          |

**Plugin → UI:**

| `type`           | Payload                                                                                                            | Beschrijving                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `init`           | `{ slides: SlideSummary[]; initialSlideId: string \| null }`                                                       | Lijst van slides op currentPage           |
| `slide-loaded`   | `{ slideId: string; general: GeneralSections \| null; content: ContentItems \| null; graphs: GraphItems \| null }` | Volledige 3-tab-payload na `pick-slide`   |
| `target-updated` | `{ ok: boolean; targetId?: string; error?: string }`                                                               | ACK na update; UI toont save-indicator    |
| `page-changed`   | `{ slides: SlideSummary[] }`                                                                                       | `figma.on('currentpagechange')` → re-scan |

---

## 6. pluginData-conventies

Per wrapper-node schrijven we bij save:

| Key     | Waarde                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `kind`  | `'welder-copywrap'` \| `'welder-badge'` \| `'welder-imagewrap'` \| `'welder-card'` \| `'welder-chartwrap'` \| `'welder-tablewrap'` |
| `v`     | `'1'` voor nieuwe schema's; `'2'` voor welder-table (behoudt v0.2.0-compat)                                                        |
| `model` | `JSON.stringify(section-specific-data)` (max 100kB per entry)                                                                      |

Bij elke save ook:

```ts
targetNode.setRelaunchData({ open: 'Bewerk met Slide Editor' });
```

Bij relaunch leest main de `kind` + bijbehorende slide en opent de juiste tab direct.

---

## 7. Slide-detectie — naam-gebaseerd (deterministisch)

Slide Machine markeert slides en wrappers met **vaste node-namen**. Detectie is synchroon en deterministisch.

### 7.1 Slide-detectie op de pagina

```
isSlide(n)      = n.type === 'INSTANCE' && n.name === 'Slide'
                  && n.width === 1920 && n.height === 1080
findSlides()    = figma.currentPage.findAll(isSlide)
slideNumber(n)  = index in findSlides()-resultaat + 1
slideTitle(n)   = eerste descendant text-node met name === 'Heading' (fallback: n.name)
```

### 7.2 Wrapper-detectie binnen een slide

| Tab + sectie               | Wrapper-namen                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| General → TitleDescription | `CopyWrap` (Heading-textnode + optionele Paragraph-textnode)                                                        |
| General → Badge            | `INSTANCE` met `name.startsWith('Badge')` — eerste match binnen de slide                                            |
| General → Image            | `ImageWrap` (Aspect=Auto); eerste match op slide-level                                                              |
| Content → Cards            | `CardWrap` → children `Card` (Frame 6 = icon, Frame 7 = Heading+Paragraph, Slot hidden)                             |
| Graphs → Chart             | `ChartWrap` (800×600, children `Bar:<label>`, `DataLabel:*`, `AxisLabel:*`)                                         |
| (TBD) Tables               | `TableWrap` / `Tabel=Table Default` / `Tabel=small` — naam begint met `Tabel=` of `Table=` en bevat NIET `Timeline` |
| Content → Timeline         | `TimelineWrap` / `Tabel=Alt Timeline` — elke instance waarvan naam `Timeline` bevat (Slide Machine variant-syntax)  |

Selectors (v0.1.x, bijgewerkt T31.1 2026-04-24):

```
findCopyWrap(slide)     = first INSTANCE met name === 'CopyWrap' (top-level binnen slide)
findBadge(slide)        = first INSTANCE met name.startsWith('Badge')
findImageWrap(slide)    = first INSTANCE met name === 'ImageWrap'
findCardWrap(slide)     = first INSTANCE met name === 'CardWrap'
findChartWrap(slide)    = first INSTANCE met name === 'ChartWrap'
findTableWrap(slide)    = first INSTANCE met name === 'TableWrap'
                          OF name.indexOf('Tabel=') === 0 en name bevat NIET 'Timeline'
                          OF name.indexOf('Table=') === 0 en name bevat NIET 'Timeline'
findTimelineWrap(slide) = first INSTANCE met name === 'TimelineWrap'
                          OF name.indexOf('Timeline') >= 0
```

> **Variant-naming (T31.1 2026-04-24):** Slide Machine gebruikt component-variant-syntax als instance-naam op canvas (bv. `Tabel=Alt Timeline`, `Tabel=Table Default`). Dit is `instance.name`, niet de component-naam. Beide selectors zijn daarvoor bredened. ES2017-compat: `indexOf` i.p.v. `includes`/`startsWith`.

> **Badge-detectie:** Slide Machine's badge-instance heet waarschijnlijk `Badge` of `Badge/Placeholder`. Builder gebruikt `slide.findAll(n => n.type === 'INSTANCE' && n.name.startsWith('Badge'))` en neemt de eerste match. Exacte naam-conventie is nog niet bevestigd — zie §12.

Bounded traversal (`FIG-TRAVERSE-01`): `findAll` is O(n) over de subtree; slides zijn ≤1920×1080 met typisch <300 descendants, dus onbegrensd binnen één slide OK. Wel begrensd op paginaniveau: alleen `isSlide`-check op top-level-scan.

### 7.3 Component-properties muteren via `setProperties`

Slide Machine-componenten dragen varianten via instance-properties (bv. `Type=Icon Side`, `Style=Default`). Property-namen in `componentPropertyDefinitions` volgen het formaat `<propName>#<hash>` — hardcode op `'Style'` zonder suffix werkt niet. Helper:

```
defs  = instance.componentPropertyDefinitions
key   = lookup(defs, 'Style')      // scant prefix vóór '#'
instance.setProperties({ [key]: 'Outline' })
```

Helper `getPropertyKey(instance, logicalName)` + wrapper `setInstanceProperty(instance, logicalName, value)` wordt gedeeld door alle editors.

---

## 8. Architecture — file structure

```
plugins/welder-slide-editor/
  spec.md                                — dit document
  manifest.json                          — plugin-shape (zie §4)
  package.json                           — name: welder-slide-editor, version: 0.1.0
  tsconfig.json                          — target ES2017 (sandbox-compat)
  tsconfig.ui.json                       — UI-bundle (target ES2020, Vue)
  vite.config.ts                         — UI build
  esbuild.config.mjs                     — main-thread build, target es2017
  app.config.ts                          — Nuxt UI theme (orange primary)
  dist/                                  — gecommit (code.js, ui.html)
  plugin-src/
    code.ts                              — plugin-main: command-dispatch, slide-scan, 3-tab-payload-builder, message-loop
    types.ts                             — shared types (SlideSummary, PluginView, GeneralSections, ContentItems, GraphItems)
    constants.ts                         — THEMES, FONTS, BADGE_ICON_OPTIONS
    slide-machine.ts                     — naam-gebaseerde slide/wrapper-selectors + setProperties-helper
    editors/
      general/
        title-description.ts             — CopyWrap text-mutatie
        badge.ts                         — Badge text + icon-mutatie
        image.ts                         — ImageWrap fill-replace (v0.1.0) / crop (v0.2.0)
      content/
        card.ts                          — per-card mutatie: text + visual
      chart/                             — port van chart-builder v0.3.0
        renderer.ts                      — imperatief root (chart-type-dispatch)
        bar.ts
        line.ts
        pie.ts
        donut.ts                         — stub v0.1.0
        progressbar.ts                   — stub v0.1.0
        radial.ts                        — stub v0.1.0
        svg-helpers.ts
        types.ts                         — ChartData
      table/                             — port van welder-table v0.2.0 (v0.1.0 of v0.2.0 afhankelijk van open-q)
        renderer.ts
        badge.ts
        lucide-icons.ts
        types.ts                         — TableData (version=2)
    ui/
      App.vue                            — root: header (SlideSelector + logo) + Tabs + panel-slot
      main.ts                            — Vue bootstrap
      main.css                           — Nuxt UI + brand tokens
      assets/
        welder-logo.svg
      components/
        SlideSelector.vue                — USelect in header: slide-nummer + titel
        Tabs.vue                         — UTabs wrapper [General, Content, Graphs, (Tables?)]
        GeneralPanel.vue                 — 3 sub-sections, show-only-if-present
        TitleDescriptionEditor.vue       — UInput heading + UTextarea paragraph
        BadgeEditor.vue                  — UInput label + IconPicker
        ImageEditor.vue                  — file-input + (v0.2.0) crop-control
        ContentPanel.vue                 — v-for over cards
        CardItemEditor.vue               — per-card: heading + paragraph + (if slot) visual upload
        GraphsPanel.vue                  — mount-point voor ChartEditor (+ TableEditor TBD)
        ChartEditor.vue                  — port van chart-builder UI
        TableEditor.vue                  — port van welder-table UI (plaatsing TBD, zie §12)
      composables/
        usePluginBridge.ts               — parent.postMessage + window.onmessage, typed message-shapes
        usePluginView.ts                 — central store: slides, currentSlideId, activeTab, general/content/graphs
```

**Thread boundaries:**

- Main (`code.ts` + `editors/**` + `slide-machine.ts`): geen JSX, alleen Figma-API + imperatieve node-manipulatie.
- UI-iframe (`ui/*`): Vue 3 + Nuxt UI v4, geen Figma-API-calls, alleen state + postMessage.

**ES-target:**

- Main-thread bundle: **ES2017** via esbuild (memory `feedback_figma_runtime.md`).
- UI-bundle: ES2020 (moderne browsers binnen iframe).

---

## 9. Tasks — dependency-sorted (builder-ready)

Complexity-label: `[S]` ≤30k tokens, `[M]` 30-60k, `[L]` 60-80k. Elke taak ≤3 files, ≤200 LOC netto, één concept.

### Skeleton

**T1 — Scaffold plugin-structuur** `[M, ~180 LOC]`

- Files: `plugins/welder-slide-editor/{manifest.json, package.json, tsconfig.json, tsconfig.ui.json, vite.config.ts, esbuild.config.mjs, app.config.ts, ui/main.css}`
- Acties: `cp -r` van welder-table's build-config, rename naar `welder-slide-editor`, version `0.1.0`, nieuwe manifest-id. esbuild target naar `es2017`.
- Exit: `npm install && npm run build` produceert lege `dist/code.js` en `dist/ui.html`.

**T2 — `types.ts` + `constants.ts`** `[M, ~160 LOC]`

- Files: `plugin-src/types.ts`, `plugin-src/constants.ts`.
- Acties: definieer `SlideSummary`, `TabId`, `PluginView`, `GeneralSections`, `ContentItems`, `GraphItems`, bridge-message-unions (UI↔plugin). Placeholder `ChartData`/`TableData` als `unknown` tot T12/T14. Constants: `THEMES`, `FONTS`, `BADGE_ICON_OPTIONS` (Lucide-set, hergebruikt uit welder-table).
- Exit: `tsc --noEmit` clean.

**T3 — `slide-machine.ts` — selectors + setProperties-helper** `[S, ~100 LOC]`

- Files: `plugin-src/slide-machine.ts` (nieuw).
- Acties: exporteer pure synchrone selectors:
  - `isSlide(n)`, `findSlidesOnPage()`, `slideSummary(slide)`.
  - `findCopyWrap(slide)`, `findBadge(slide)`, `findImageWrap(slide)`, `findCardWrap(slide)`, `findChartWrap(slide)`, `findTableWrap(slide)` — elk retourneert `InstanceNode | null`.
  - `getPropertyKey(instance, logicalName): string | null` + `setInstanceProperty(instance, logicalName, value)`.
- Exit: dev-console smoke — pagina met 1 Slide-instance → `findSlidesOnPage()` geeft 1 entry; `findBadge(slide)` vindt de badge-instance.

**T4 — `code.ts` plugin-main skelet** `[M, ~200 LOC]`

- Files: `plugin-src/code.ts`.
- Acties: `figma.showUI(__html__, { width: 520, height: 760 })`. `loadFonts()` parallel (Inter Regular/Medium, Instrument Sans SemiBold). Command-dispatch op `figma.command === 'open'`. Message-loop: `ui-ready` → post `init`. `pick-slide` → scan die slide (general/content/graphs) en post `slide-loaded`. `update-*` tijdelijk no-op (ingevuld T8–T13). `figma.on('currentpagechange')` → `page-changed`.
- Exit: plugin opent UI; UI krijgt `init`; `pick-slide` zoomt + retourneert drie tab-payloads.

### UI-chassis

**T5 — `usePluginBridge.ts`** `[S, ~80 LOC]`

- Files: `ui/composables/usePluginBridge.ts`.
- Acties: typed `post(msg)` / `onMessage(handler)` API, met de message-shapes uit §5 (3-tab-payloads + update-flavors).
- Exit: `tsc --noEmit` clean.

**T6 — `App.vue` header + `Tabs.vue` + `SlideSelector.vue` + `usePluginView`** `[M, ~200 LOC]`

- Files: `ui/App.vue`, `ui/components/SlideSelector.vue`, `ui/components/Tabs.vue`, `ui/composables/usePluginView.ts`.
- Acties: header-layout (welder-logo + SlideSelector + close-knop, template uit chart-builder App.vue). `Tabs.vue` wrapt UTabs met 3 tabs (`general` / `content` / `graphs`) + slot per panel. `usePluginView`-store met `slides`, `currentSlideId`, `activeTab`, `general`, `content`, `graphs`. Empty-state wanneer geen slide gekozen of geen content.
- Exit: Vue dev-server rendert header + tabs met mock-data; tab-wisseling werkt; empty-state toont juiste copy.

### General-tab

**T7 — `GeneralPanel.vue` scaffold** `[S, ~100 LOC]`

- Files: `ui/components/GeneralPanel.vue`.
- Acties: drie `<section v-if="general?.xxx">` blokken (TitleDescription / Badge / Image) met placeholder-content. Show-only-if-present guards op de `general`-store-keys.
- Exit: panel toont 0–3 secties afhankelijk van mock-data.

**T8 — `TitleDescriptionEditor.vue` + mutatie-flow** `[M, ~180 LOC]`

- Files: `ui/components/TitleDescriptionEditor.vue`, `plugin-src/editors/general/title-description.ts`, `plugin-src/code.ts` (message-handler).
- Acties: UI met UInput voor `heading` + UTextarea voor `paragraph` (alleen als `paragraph !== null`). `update-general`-message met section `titleDescription`. Main muteert descendant text-nodes `Heading` / `Paragraph` in CopyWrap via `text.characters = newVal` na `loadFontAsync`.
- Exit: wijzig heading in UI → canvas-Heading-text updatet na ~200ms debounce.

**T9 — `BadgeEditor.vue` + mutatie** `[M, ~180 LOC]`

- Files: `ui/components/BadgeEditor.vue`, `plugin-src/editors/general/badge.ts`, `plugin-src/code.ts` (handler).
- Acties: UInput label + icon-picker (hergebruikt `BADGE_ICON_OPTIONS` + lucide-icons-set uit welder-table). Main muteert label-text-node + icon-child (text-swap of instance-swap, afhankelijk van Slide Machine-pattern — builder bepaalt bij run).
- Exit: label + icon wisselen op canvas na debounce.

**T10 — `ImageEditor.vue` + fill-replace** `[L, ~200 LOC]`

- Files: `ui/components/ImageEditor.vue`, `plugin-src/editors/general/image.ts`, `plugin-src/code.ts` (handler + `upload-image`-route).
- Acties: file-input → `ArrayBuffer` → `postMessage({ type: 'upload-image', targetNodeId, bytes })`. Main doet `figma.createImage(bytes)` → `node.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }]` op ImageWrap. **Crop is v0.2.0**.
- Exit: upload file → canvas-ImageWrap toont het geüploade beeld.

### Content-tab

**T11 — `ContentPanel.vue` + `CardItemEditor.vue` + mutatie** `[M, ~200 LOC]`

- Files: `ui/components/ContentPanel.vue`, `ui/components/CardItemEditor.vue`, `plugin-src/editors/content/card.ts`.
- Acties: `ContentPanel` v-for over `content.cards`, rendert `CardItemEditor` per card. Per-card-velden: heading (UInput), paragraph (UTextarea), visual-upload (alleen als `visualHash !== undefined` = slot aanwezig). Main muteert: text-nodes `Heading`+`Paragraph` binnen `Frame 7`; visual via `ImagePaint` op `Frame 6` (of image-slot).
- Exit: 2+ cards op slide → panel toont 2+ editors → wijziging → canvas updatet correcte card.

### Graphs-tab

**T12 — `GraphsPanel.vue` + `ChartEditor.vue` port** `[L, ~200 LOC]`

- Files: `ui/components/GraphsPanel.vue`, `ui/components/ChartEditor.vue`, `ui/composables/useChartStore.ts`. (+ kopieer `ChartTypeSelector.vue`, `DataEditor.vue`, `GeneralChartData.vue`, `ThemePicker.vue`, `TitleInput.vue`, `CsvImport.vue` uit chart-builder onveranderd naar `ui/components/chart/`.)
- Acties: `GraphsPanel` toont `ChartEditor` als `graphs !== null`, anders empty-state. `ChartEditor` wrapt de bekende chart-cards (Type / Algemeen / Data / Thema / Benchmarks). `useChartStore` gekoppeld aan `graphs.data`.
- Exit: chart-target openen → editor vol → chart-type-wissel post `update-graph`.

**T13 — Imperatieve chart-renderer (bar + line + pie)** `[L, ~200 LOC]`

- Files: `plugin-src/editors/chart/renderer.ts`, `plugin-src/editors/chart/bar.ts`, `plugin-src/editors/chart/types.ts`. (Line + pie in vervolgtask als budget krap wordt.)
- Acties: `renderChart(data: ChartData): FrameNode` dispatch op `data.type`. v0.1.0: bar + line + pie imperatief; donut/progressbar/radial = placeholder-frame + TODO. Main-handler voor `update-graph` vervangt ChartWrap-content (zelfde positie, `parent.insertChild(idx, fresh)`).
- Exit: bar-chart met 5 datapoints rendert correct; theme-kleuren kloppen; chart-type-switch werkt.
- _Splitsingsvoorstel bij overschrijding 80k: T13a = renderer + bar, T13b = line + pie._

### Tables (plaatsing afhankelijk van open-q §12)

**T14 — `TableEditor.vue` + table-renderer port + mutatie** `[M, ~200 LOC]`

- Files: `ui/components/TableEditor.vue` (+ kopieer `BadgeCellInput.vue`, `ColumnsEditor.vue`, `TableDataEditor.vue`, `TextSizePicker.vue` onveranderd), `plugin-src/editors/table/renderer.ts` (cp uit welder-table), `plugin-src/editors/table/types.ts`.
- Acties: afhankelijk van user-answer op §12 Q1: ofwel `TableEditor` mount onder Graphs-tab (naast ChartEditor), ofwel onder nieuwe `TablesPanel` met 4e tab "Tables" in `Tabs.vue`. Renderer 1-op-1 geport uit welder-table v0.2.0.
- Exit: table-target openen → editor vol → wijziging → table regenereert op zelfde positie.

### Release

**T15 — Deprecatie + PLUGINS.md + release-tag** `[S, docs]`

- Files: `PLUGINS.md`, `CHANGELOG.md`, `widgets/welder-table/README.md` (noot), `widgets/chart-builder/README.md` (noot).
- Acties: markeer welder-table en chart-builder als _Gearchiveerd_ in PLUGINS.md; voeg `welder-slide-editor v0.1.0` toe. README-notities in beide oude plugins. Annotated release-tag `v0.1.0-welder-slide-editor`.
- Exit: `git tag -l 'v0.1.0-welder-slide*'` toont de tag; PLUGINS.md klopt.

---

## 10. Verification

**Build:**

- `cd plugins/welder-slide-editor && npm install && npm run build` — clean, geen TS-errors, `dist/code.js` + `dist/ui.html` aanwezig.
- `npx tsc --noEmit` — clean (beide tsconfigs).

**Figma Desktop smoketest:**

1. Plugins → Development → Import manifest → kies `plugins/welder-slide-editor/manifest.json`.
2. Open een pagina met ten minste één Slide Machine-slide.
3. Run `Welder Slide Editor → Open slide editor`.
4. Header toont slidelist; pick slide → canvas zoomt erin; 3 tabs verschijnen.
5. **General-tab**: zichtbare secties matchen slide-content (alleen aanwezige wrappers). Edit heading → canvas updatet. Wissel badge-icon → canvas updatet. Upload image → ImageWrap toont nieuwe fill.
6. **Content-tab**: aantal CardItemEditors = aantal cards in CardWrap. Edit card-heading → correcte card updatet.
7. **Graphs-tab**: ChartEditor mount als ChartWrap bestaat. Wissel bar→line → chart regenereert.
8. Close → plugin-indicator verdwijnt.
9. Re-open via relaunch-knop `Bewerk met Slide Editor` op een wrapper → plugin opent met juiste slide + tab voorgeselecteerd.

**Cross-page:**

- Navigeer naar andere page → UI ontvangt `page-changed`, slidelist ververst.

---

## 11. Known issues / limitations (v0.1.0)

- **Image-crop is v0.2.0** — v0.1.0 levert alleen replace-fill via `figma.createImage`.
- **Lege General-panel is mogelijk** — als een slide geen CopyWrap, Badge én ImageWrap heeft, toont General-tab een empty-state.
- **Badge-naam-conventie is onzeker** — v0.1.0 valt terug op `name.startsWith('Badge')`. User moet mogelijk exact Slide Machine-patroon bevestigen (zie §12).
- **TableWrap/ChartWrap zijn library-instances** — v0.1.0 vervangt hun _content_ (descendant text-nodes en chart-children) in plaats van de wrapper-instance te rebuilden. Respecteert design-system layout/spacing.
- **CopyWrap / Card / Badge / ImageWrap worden in-place gemuteerd** — text-nodes via `.characters`, variant-props via `setProperties`, fills via `node.fills`. Geen node-rebuild, geen detach.
- **Geen migratie van bestaande welder-table v0.2.0 of chart-builder v0.3.0 instances.** welder-table v0.2.0 pluginData (`kind: 'welder-table'`, `v: '2'`) wordt gelezen. chart-builder v0.3.0 (widget) gebruikt `useSyncedState` en wordt niet gezien; users migreren handmatig.
- **Chart-renderer is imperatieve herimplementatie** — 1-op-1 visuele parity vereist iteratie; minor pixel-verschillen in v0.1.0 acceptabel.
- **Cross-page workflow buiten scope.**
- **Real-time sync** tussen plugin-instances niet afgedekt — laatste save wint.
- **Naam-conflicten** tussen table's en chart's `ThemePicker.vue`: in v0.1.0 gescheiden folders (`ui/components/table/` vs `ui/components/chart/`).
- **Icon-swap-architectuur-regressie (T26b/T26d → T27).** De T26-reeks probeerde twee SVG-native routes die beide falen in Figma Slides:
  - T26b (`createNodeFromSvg` + `parent.insertChild(idx, newFrame)`) ging onderuit op de Figma-constraint dat nodes binnen een INSTANCE niet via `insertChild`/`appendChild` vervangen mogen worden.
  - T26d (local sandbox-COMPONENT + `instance.swapComponent(localComp)`) werkt in Figma Design maar **niet in Figma Slides** — Slides ondersteunt geen local components: `figma.createComponent()` en `swapComponent(localComp)` throwen in de Slides-runtime. Omdat `manifest.editorType === ["figma","slides"]` is dit een harde blocker voor de primaire use-case van deze plugin.
  - **T27 herstelt de library-route.** Slide Machine publisht elk Lucide-icoon als een eigen library-component en wiret die als `preferredValues` in een exposed `INSTANCE_SWAP`-property op de wrapper (CopyWrap voor badge, Card-instance voor card). De caller zet `setProperties({ [swapKey]: comp.id })` op de wrapper; Figma walks down de exposed-prop-chain en vervangt de feitelijke icon-INSTANCE. Dit werkt in zowel Design als Slides omdat er nooit local components gecreëerd worden.
  - **Geen graceful-degrade.** Na T27 is er één code-pad voor beide icons (badge + card); geen SVG-fallback, geen `swapComponent`-fallback, geen text-node-fallback. Faalt de library-import → error loggen, return false, UI toont de fout niet (silent skip is consistent met FIG-GUARD-01).

---

## 12. Open questions

Beantwoorde vragen (Slide Machine-keys, text+image-model, card-model) blijven gesloten — zie §3 en §7.

Nieuw / open voor de user vóór T9 / T14:

1. **TableWrap onder Graphs-tab of eigen "Tables"-tab?** User-diagram zegt "See table/chart plugin" onder Graphs — ambigue. Voorstel: **4e tab "Tables" die alleen verschijnt als TableWrap aanwezig is** (idem voor Graphs: tab verschijnt alleen als ChartWrap aanwezig). Dit geeft de cleanest mental model (1 tab = 1 wrapper-type) en respecteert het edit-only-principe. Alternatief: Tables + Charts samen onder Graphs met sub-accordions.

2. **Exact Slide Machine-naam-patroon voor Badge.** Candidates: `Badge`, `Badge/Placeholder`, of instance-property `Type=Placeholder` op een parent-component? V0.1.0-fallback: `name.startsWith('Badge')`. User-bevestiging nodig vóór T9.

3. **Heeft het Slide Machine `Card`-component een icon-slot?** Slide Machine-file `kAZqxj4nxpafYjB5FhfOru`. Kandidaten voor de icon-layer binnen een Card: `Frame 6` (momenteel benoemd als icon-frame in §7.2, maar onduidelijk of daar een `<UIcon>`-achtige sub-instance hangt), of een aparte `Icon`-instance vergelijkbaar met Badge, of een variant-property op `Card` zelf (bv. `Icon=trending-up`). **Blokkeert T18** — vóór de builder kan starten moet de user bevestigen welk patroon Slide Machine hanteert, inclusief: (a) is de icon wel/niet optioneel per card, (b) welke icon-set (Lucide conform Badge), (c) naam of property-key voor de mutatie. Zonder bevestiging blijft T18 in _Blocked_ staan.

4. ~~**Badge — welke control verbergen bij `visible === false`?**~~ `[RESOLVED 2026-04-24]` Opgelost als onderdeel van de v0.1.x polish-sweep (T21 shipped + uit §13 verwijderd). Badge-sectie + sub-controls verbergen nu consistent bij `badge.visible === false`.

5. ~~**Tab-visibility — Graphs-tab hiden wanneer geen ChartWrap; geldt dat ook voor Content?**~~ `[RESOLVED 2026-04-24]` Opgelost als onderdeel van T22 (shipped + uit §13 verwijderd). Graphs-tab wordt conditioneel verborgen bij `view.graphs === null`; Content-tab blijft zichtbaar conform default-keuze.

6. ~~**Exacte Welder heading-type-scale voor card-titels.**~~ `[RESOLVED 2026-04-24]` Opgelost als onderdeel van T23 (shipped + uit §13 verwijderd). Card-headers matchen nu de design-system type-scale via centrale theme-config.

7. **Legacy icon-roundtrip na T26.** Slides die de plugin vóór T26 heeft bewerkt hebben hun card-/badge-icon opgeslagen als een Lucide-library-`INSTANCE` (detecteerbaar aan een Lucide-slug-naam op een INSTANCE-descendant). Na T26 schrijft de plugin icons als `FRAME` (createNodeFromSvg-resultaat) op dezelfde plek. Het Read-pad (`readCardIcon` / `readBadgeIcon`, code.ts:140-206, 3-strategy uit commit `727caed`) moet **beide** vormen herkennen: (a) de oude INSTANCE-child met Lucide-slug-naam, én (b) de nieuwe FRAME-child die uit `createNodeFromSvg` komt (naam conventie: `i-lucide-<slug>` of een vaste `icon`-naam met slug in `pluginData`).
   **Besluit voor T26b (knoop doorgehakt):** de nieuwe SVG-frame krijgt `name = 'i-lucide-' + slug` (matcht de UI-conventie). Read-paden breiden uit met een extra strategie D: `type === 'FRAME' && name.indexOf('i-lucide-') === 0 → normalizeIconKey(name)`. Strategy A/B/C blijven onveranderd voor legacy-leesbaarheid. Geen migratie, geen detach — oude slides werken nog, nieuwe slides gebruiken de FRAME-vorm.

---

## 13. v0.1.x — UI-polish

Drie losse, onafhankelijke polish-tasks op top van v0.1.0. Niet ingedeeld in dependency-sort; elk is een eigen `/build`-dispatch. Elke task ≤3 files, ≤200 LOC netto, één concept.

### T16 — Design-system compliance (cards + tabs) `[DONE — be7b360]` `[S, ~80 LOC]`

**Probleem.** In de huidige General-tab ogen de sectie-`<section>`-cards (Title & Description, Badge, Image) grijs op een grijze container-achtergrond, omdat zowel de buitenwrapper als de sub-secties `bg-elevated` gebruiken (zie `App.vue` regel 141 + `GeneralPanel.vue` regels 129/140/151 + `CardItemEditor.vue` regel 119). Het design system schrijft **witte content-cards op een lichte background** voor (project-tokens: Primary `#FF7700`, Background `#FFF4EA`, radius 8/16). Daarnaast zitten de tabs (General / Content / Graphs) nu _binnen_ dezelfde outer-card als de tab-content — ze horen **in een eigen losse card** bovenaan, los van de content-cards eronder.

**Files.**

- `plugins/welder-slide-editor/widget-src/ui/App.vue` — splitst de outer `<section>` op in **(a)** een aparte tab-card (bevat alleen `<Tabs>`-header) en **(b)** een body-slot waarin de panels vrij komen te leven. Kleuren-token van de outer body-background wordt de elevated-tint, de content-cards daarbinnen worden wit.
- `plugins/welder-slide-editor/widget-src/ui/components/GeneralPanel.vue` — wissel `bg-elevated` op de drie sub-sections naar de witte card-token (bv. `bg-default`), border weg of verfijnd conform Nuxt UI card-variant.
- `plugins/welder-slide-editor/widget-src/ui/components/CardItemEditor.vue` — zelfde token-swap als GeneralPanel voor de per-card wrapper.

**Acties.**

1. Gebruik bestaande Nuxt UI v4 card-variants of brand-bg-tokens (`bg-default` / `bg-elevated` / `bg-muted`) — **geen custom CSS uitvinden**, check eerst of een bestaande token volstaat.
2. Tabs krijgen hun eigen card-wrapper bovenaan, zelfde radius + shadow als content-cards eronder.
3. Body-container (de buitenste laag) mag de grijze achtergrond krijgen zodat witte content-cards contrasteren.
4. Geen wijzigingen aan `Tabs.vue` zelf — de tab-component is al klaar; alleen de _plaatsing_ in `App.vue` verschuift.
5. Geen wijzigingen aan brand-token-waarden (`#FF7700`, `#FFF4EA`) — alleen Tailwind/Nuxt-UI classnames in de templates.

**Exit.**

- General-tab toont drie **witte** sectie-cards op een lichtgrijze (of brand-tinted) container-background.
- Tabs-bar staat in een **eigen losse card** bovenaan, visueel afgescheiden van de content-cards eronder.
- `npm run build` clean, geen nieuwe TS-errors.
- Visuele check in Figma Desktop: kleuren matchen screenshots van de design-tokens uit `CLAUDE.md`.

---

### T17 — Icons renderen in plugin-iframe `[DONE — 2480a49]` `[S, ~60 LOC]`

**Probleem.** Recente commits (`f27bf2c`, `d424dfe`) voegden per-item icons toe aan `BadgeEditor.vue` (USelect-items met `i-lucide-*`) en `ChartTypeSelector.vue`. User rapporteert: **geen enkel icon** zichtbaar in de UI — niet alleen de dropdown-items, ook de trigger-previews (`<UIcon :name="...`) en `UButton :icon="..."`-instances. `@iconify-json/lucide` staat al in `devDependencies` en is geïnstalleerd, maar de iconen komen niet door in de runtime-bundle.

**Primaire hypothese (één benoemen, niet drie).** Nuxt UI v4 resolvet `i-lucide-*` iconen **at runtime via een HTTP-fetch naar de Iconify-API** wanneer ze niet lokaal gebundeld zijn. Het plugin-manifest staat op `networkAccess: { allowedDomains: ["none"] }` — dat blokkeert álle externe requests vanuit de iframe. Resultaat: elke icon-fetch faalt, alle `<UIcon>` rendert leeg.

Oplossingsrichting (builder kiest binnen scope): **lokaal bundelen via Nuxt UI's `ui.icons` config in `vite.config.ts`** (of `app.config.ts`) zodat de gebruikte Lucide-iconen compile-time in de bundle zitten en geen network nodig hebben. `@iconify-json/lucide` levert de benodigde JSON-collection offline. Als alternatief kan `iconify` worden geconfigureerd via het Nuxt UI v4 `icons`-veld met een expliciete collection-loader.

**Files.**

- `plugins/welder-slide-editor/vite.config.ts` — configureer Nuxt UI's `ui()`-plugin-opties zodat Lucide lokaal gebundeld is (bv. `ui({ icons: { provider: 'iconify', collections: { lucide: () => import('@iconify-json/lucide/icons.json') } } })` — exacte API per Nuxt UI v4 docs verifiëren bij implementatie).
- `plugins/welder-slide-editor/package.json` — promoveer `@iconify-json/lucide` van `devDependencies` naar `dependencies` als build-time-bundling dat vereist. Eventueel `@iconify/vue` toevoegen als Nuxt UI v4 dat als runtime-partner verwacht.
- `plugins/welder-slide-editor/widget-src/ui/main.ts` — _alleen_ aanraken als de bundling-strategie een expliciete registratie-call bij mount vereist; anders niet muteren.

**Acties.**

1. Bevestig via Nuxt UI v4 docs (in de builder-run) welke van de drie paden de plugin-iframe-context eist: (a) vite-plugin config, (b) `app.config.ts` icons-block, (c) runtime-registratie in `main.ts`. Eén pad kiezen.
2. Bundling-only: **geen** wijziging aan `manifest.json networkAccess` — de plugin blijft offline-compatible.
3. Smoketest-iconen: `i-lucide-x` (close-knop in header), `i-lucide-trending-up` (BadgeEditor-preview), `i-lucide-bar-chart-3` (ChartTypeSelector).
4. `npm run build` produceert `dist/ui.html` waarin de gebruikte Lucide-icon-bodies inline in de JS/CSS zitten (greppable door bv. `<svg>` of `path d=` in de bundle — geen `fetch`-call naar iconify.design).

**Exit.**

- Minimaal één icon rendert zichtbaar in de Figma-iframe (smoketest: BadgeEditor-dropdown toont `trending-up` links van de item-label, én de close-`X` in de header is zichtbaar).
- Geen netwerk-errors in de Figma Dev-console (tab Network binnen plugin-iframe blijft leeg of toont geen `api.iconify.design`-requests).
- `npm run build` clean, bundle-grootte-toename ≤ 40 kB gzip (sanity check: alleen gebruikte icons, geen volledige Lucide-set).

---

### T18 — Icon-picker in CardItemEditor `[BLOCKED — user-bevestiging vereist]`

**Status.** Blocked op §12 open-q 3 (Slide Machine `Card`-icon-slot). Niet naar `/build` dispatchen voordat de user bevestigt: (a) dat het `Card`-component überhaupt een icon-layer heeft, (b) welk naam/variant-patroon het volgt, (c) of de icon optioneel is per kaart. Zonder die drie antwoorden is er geen betrouwbare mutatie-target voor de main-thread.

**Voorgenomen scope (na unblock, indicatief — uiteindelijke scope afhankelijk van user-antwoord).** `[M, ~180 LOC]`

**Files (indicatief).**

- `plugins/welder-slide-editor/widget-src/types.ts` — breid `CardItem` uit met een `icon: string | null`-veld (of `icon?: string` als Slide Machine de icon per card optioneel maakt).
- `plugins/welder-slide-editor/widget-src/ui/components/CardItemEditor.vue` — voeg een `<USelect>`-icon-picker toe naar het patroon van `BadgeEditor.vue` (regels 109–124): `BADGE_ICON_OPTIONS` reuse, `i-lucide-*`-preview in de trigger, debounced emit. Icon-veld alleen renderen als de card een icon-slot heeft (net als de `hasVisualSlot`-gating op de image-upload).
- `plugins/welder-slide-editor/widget-src/editors/content/card.ts` — main-thread mutatie: schrijf de icon-keuze naar de juiste node-layer (exacte pad afhankelijk van user-bevestiging: text-swap op een hidden `IconName`-textnode, of `setInstanceProperty(card, 'Icon', value)`, of child-instance-swap).

**Acties (na unblock).**

1. Lees user-bevestiging uit §12 open-q 3 en vertaal naar één van de drie mutatie-paden hierboven — bouw vervolgens alleen dat pad.
2. Hergebruik `BADGE_ICON_OPTIONS` uit `constants.ts`; geen nieuwe icon-set introduceren.
3. Breid `ContentItems.cards[].icon` door in bridge-messages (`update-card`-payload accepteert nu ook `icon: string`).
4. Splitsingsvoorstel bij overschrijding: T18a = data-model + UI-picker (types.ts + CardItemEditor.vue + ContentPanel.vue); T18b = main-thread mutatie (editors/content/card.ts + code.ts-handler). Alleen toepassen als de totaalschatting >180 LOC of >3 files wordt.

**Exit (na unblock).**

- CardItemEditor toont een icon-picker onder Heading + Paragraph wanneer de card een icon-slot heeft.
- Icon-wijziging post `update-card` debounced → canvas-card updatet de icon-layer correct.
- Geen regressie in bestaande heading/paragraph/visual-mutaties.

---

### T29 — Silent character-truncation bij mixed-font text-nodes `[DONE 2026-04-24]`

> **P0 — dispatch as first.** Actief destructief bij elke edit op mixed-font text-nodes (zoals Welder-template-headings met emphasis-styling). Eerst dispatchen vóór alle andere open tasks in §13.
>
> **Numbering note.** User noemde deze task bij aanmaak "T25"; T25-slot is al in gebruik als `SUPERSEDED`-entry (badge icon-swap, zie onder), dus deze P0-entry kreeg de eerstvolgende vrije nummer T29.

**Symptoom.** User rapporteerde 2026-04-24: slide-heading op canvas toont `"Doel van"` terwijl plugin-UI + accent-popover `"Doel van vandaag"` tonen. De truncatie valt exact op pos 9 — precies waar een emphasis-font ("vandaag") begint. Character-count komt overeen met de positie waar een niet-geladen font in de styled-range zou binnenkomen.

**Root cause.** `setTextCharacters` bestaat als **broken duplicate** in drie editor-files:

- `plugin-src/editors/general/title-description.ts:51-64`
- `plugin-src/editors/general/badge.ts:95-106`
- `plugin-src/editors/content/card.ts:165-176`

Alle drie detecteren `node.fontName === figma.mixed` en laden vervolgens **alleen het font op char-index 0** via `getRangeFontName(0, 1)` — niet alle fonts die in de styled-range voorkomen. Daarna wordt `node.characters = value` aangeroepen. Figma's runtime truncate-t silent bij de positie waar een niet-geladen font in de bestaande range begint → alle characters vanaf dat punt verdwijnen uit de node.

**Evidence.**

- `loadAllFontsForNode` in `code.ts:215-233` is het CORRECTE patroon: loopt `getStyledTextSegments(['fontName'])` en laadt elk uniek font in de range. Deze helper is niet exported → editor-files konden hem niet importeren → drie broken duplicates.
- `applyAccentRanges` (`code.ts:243`) gebruikt `loadAllFontsForNode` correct → accent-fills werken wél op mixed-font nodes, terwijl plain text-edits de characters corrupten. Dat verklaart waarom T28 (accent-ranges) werkt maar een plain heading-edit de tekst stuk-maakt.
- `editors/chart/renderer.ts` + `editors/table/renderer.ts` zijn niet getroffen: die laden hardcoded álle fonts bij startup. Buiten T29-scope.

**Fix — refactor-route (user-approved option b).**

1. **Nieuw bestand `plugin-src/editors/_shared/fonts.ts`** — exporteert twee helpers:
   - `loadAllFontsForNode(node: TextNode): Promise<void>` — canonical: loopt `getStyledTextSegments(['fontName'])`, laadt elk uniek font.
   - `setTextCharactersSafe(node: TextNode, value: string): Promise<void>` — `await loadAllFontsForNode(node); node.characters = value;` (FIG-FONT-01).
2. **Replace lokale `setTextCharacters`-duplicates** in:
   - `editors/general/title-description.ts` — import + call-sites updaten.
   - `editors/general/badge.ts` — idem.
   - `editors/content/card.ts` — idem.
3. **`code.ts` hergebruik.** Bestaande `loadAllFontsForNode` in `code.ts:215-233` verhuizen naar de shared module en vanuit `code.ts` importeren (één canonical implementatie). Als dit circular-import-risico oplevert (shared module mag niet terug-importeren naar `code.ts`): laat de `code.ts`-lokale kopie bestaan maar laat `applyAccentRanges` de shared-import gebruiken. Builder beoordeelt tijdens de run.

**Files (5 totaal, ~60 LOC netto).**

- `plugins/welder-slide-editor/widget-src/editors/_shared/fonts.ts` — **NEW**.
- `plugins/welder-slide-editor/widget-src/editors/general/title-description.ts` — vervang lokale `setTextCharacters`.
- `plugins/welder-slide-editor/widget-src/editors/general/badge.ts` — vervang lokale `setTextCharacters`.
- `plugins/welder-slide-editor/widget-src/editors/content/card.ts` — vervang lokale `setTextCharacters`.
- `plugins/welder-slide-editor/widget-src/code.ts` — import `loadAllFontsForNode` uit shared module (óf laat lokaal + import alleen in `applyAccentRanges`, afhankelijk van circular-import-check).

**Acties.**

1. Schrijf `_shared/fonts.ts` met `loadAllFontsForNode` + `setTextCharactersSafe` (FIG-FONT-01 canonical-pattern).
2. Vervang in de drie editor-files de lokale `setTextCharacters` door import van `setTextCharactersSafe`. Verwijder de lokale `if (fontName === figma.mixed)`-branches die alleen char-0's font laden.
3. Verhuis of hergebruik `loadAllFontsForNode` in `code.ts` — kies de minst-invasieve route (architect-voorkeur: verhuizen + importeren zodat één canonical implementatie overblijft).
4. Chart/table-editors niet aanraken (niet getroffen, hardcoded font-load bij startup).

**Exit-criteria.**

- `grep -rn "setTextCharacters" plugin-src/editors/` retourneert alleen import-regels + 1 definitie in `_shared/fonts.ts`.
- Geen lokale `if (fontName === figma.mixed)`-branches meer in `editors/general/title-description.ts`, `editors/general/badge.ts`, `editors/content/card.ts` die alleen char-0's font laden.
- Mixed-font heading-edit (bv. template met "Doel van [emphasis]vandaag") behoudt alle characters na elke UI-edit — geen silent truncatie meer.
- `npm run build` clean, geen nieuwe TS-errors.
- Geen regressie in chart/table text-writes (buiten scope — worden niet aangeraakt).

**Follow-up backlog-entry (low-prio).** Chart- en table-renderers laden hardcoded fonts bij startup. Wenselijk (niet urgent) om deze editors ook op `setTextCharactersSafe` over te brengen voor consistency — zie `B4` hieronder (wordt toegevoegd bij volgende backlog-sweep als de refactor stabiel is gebleken).

---

### T25 — Badge icon-swap werkt niet `[SUPERSEDED — zie T26]`

> **Status (2026-04-24).** Gesubsumeerd door T26. Na 3 failed fixes op de library-INSTANCE_SWAP-route (commits `727caed` e.a.) is de conclusie dat de architectuur zelf het probleem is, niet een bug binnen die architectuur (per Phase 4.5 systematic-debugging rule). T26 laat de library volledig los en tekent icons als SVG-vectors via `figma.createNodeFromSvg`. Originele hypothese-lijst hieronder blijft staan als historische referentie voor T26a's trace-stap; de fix zelf landt in T26b.

**Originele probleem (historisch).**

**Probleem.** User (2026-04-23): de BadgeEditor-dropdown toont correct de icon-opties (T17 fixte icon-rendering, commits `f27bf2c` / `d424dfe` zetten per-item icons in de select-items). Maar het **kiezen** van een ander icon update de badge op de canvas niet — de badge-instance op de slide verandert visueel niet naar het nieuwe icon.

**Hypotheses (builder pickt één op basis van snelle trace).**

- **(a)** `BadgeEditor.vue` stuurt geen `icon`-veld mee in de `update-badge`-payload (of emit-path naar `usePluginBridge.post`).
- **(b)** `plugin-src/code.ts` main-handler voor `update-badge` leest het `icon`-veld niet, of negeert het als de waarde gelijk is aan de preview-state.
- **(c)** `editors/general/badge.ts` doet de icon-mutatie verkeerd: ofwel wordt de juiste Slide Machine variant-property-naam niet getroffen door `setInstanceProperty(badge, 'Icon', value)`, ofwel moet het een child-instance-swap zijn (niet een property-swap), ofwel is de propertynaam in Slide Machine iets anders dan `'Icon'` (bv. `'Type'` of een Lucide-key-reeks).

**Files.**

- `plugins/welder-slide-editor/widget-src/ui/components/BadgeEditor.vue` — verifieer dat de icon-keuze mee-emit in de `update-badge`-payload (naast label).
- `plugins/welder-slide-editor/widget-src/code.ts` — main-handler voor `update-badge`: bevestig dat `icon` gelezen en doorgegeven wordt naar `editors/general/badge.ts`.
- `plugins/welder-slide-editor/widget-src/editors/general/badge.ts` — de feitelijke mutatie: check via `getPropertyKey(badge, 'Icon')` / eventuele property-aliases, of schakel naar instance-swap als Slide Machine's Badge-component zijn icon via een sub-instance regelt (conform T9 notitie in §9).
- `plugins/welder-slide-editor/widget-src/types.ts` — _alleen als_ de `update-badge`-message-shape nog geen `icon`-veld heeft; voeg toe als string.

**Acties.**

1. Research eerst: log in `BadgeEditor.vue` welke payload wordt ge-emit; log in `code.ts` wat de main-handler ontvangt; check of `setInstanceProperty` een warning gooit over onbekende key.
2. Fix exact één van (a)/(b)/(c). Als de mutatie-laag ((c)) de bottleneck is en Slide Machine gebruikt instance-swap voor icons: volg hetzelfde patroon als eventueel al in Card-icon-logica (T18, blocked, maar de mutatie-strategie daar is vergelijkbaar) of het patroon dat T9 oorspronkelijk aflegde.
3. Bevestig met Figma Desktop smoketest: kies in BadgeEditor-dropdown een ander icon → badge-instance op canvas toont dat nieuwe icon binnen ~300ms (debounce).

**Exit.**

- Nieuw icon kiezen in BadgeEditor-dropdown → de badge-instance op de slide update visueel naar dat nieuwe icon.
- Label-edits blijven ongewijzigd werken.
- Geen regressie in andere General-tab-secties.
- `npm run build` clean.

---

### T26 — Icon-architectuur-pivot: SVG-native via `createNodeFromSvg` `[SPLIT — T26a / T26b / T26c / T26d]` `[SUPERSEDED door T27 — zie §11 regressie-notitie]`

> **Status (2026-04-24).** T26a + T26c blijven geldig (UI-bridge-payload + Read-pad strategie D + `icon-normalize.ts` extractie — die blijven overeind staan ook na T27). T26b en T26d zijn architectureel gesuperseded: zowel `insertChild` in een INSTANCE-parent (T26b) als `figma.createComponent` + `instance.swapComponent(localComp)` (T26d) werken niet betrouwbaar in Figma Slides. T27 herstelt de oorspronkelijke library-INSTANCE_SWAP-route via de exposed wrapper-properties.

**Probleem.** De huidige icon-swap (library-gebaseerd: `importComponentByKeyAsync` + `setProperties` / `swapComponent` via Slide Machine's INSTANCE_SWAP preferredValues) werkt niet betrouwbaar. Card-path: `icons-ready` vuurt nooit → IconPicker blijft disabled. Badge-path: UI stuurt correct, main ontvangt correct, `swapComponent`-aanroep lijkt OK, maar canvas toont geen swap. Drie gerichte fixes (waaronder `727caed`, icon-cache hardcoded-seed, teamlibrary-permissie) hebben de situatie niet opgelost. Per systematic-debugging Phase 4.5 is dit een **architectuur-probleem**, geen bug binnen de bestaande architectuur.

Root-oorzaken die de library-route fragile maken (niet in volgorde):

- Remote-component-resolution via `figma.importComponentByKeyAsync` vereist dat de Lucide-library gepubliceerd en geactiveerd is in elke file waarin de plugin draait.
- `preferredValues` zijn per variant-set gedefinieerd maar worden in dynamic-page mode soms leeg geleverd; `main.parent` is regelmatig `null` (al gemitigeerd met fresh-import-fallback, maar niet 100%).
- `primeIconCache` moet O(N_preferredValues) imports doen voordat de eerste swap werkt — elk van die N importeerkansen kan falen of traag zijn; één stille fail houdt `icons-ready` tegen.
- Badge- vs card-code-paden zijn subtiel verschillend (INSTANCE_SWAP op parent vs `swapComponent` op nested child), wat 2× het risico-oppervlak geeft.

**Pivot (user-approved 2026-04-24).** Bypass de Figma-library volledig. Teken icons als SVG-vectors via `figma.createNodeFromSvg(svgString)`. De main-thread ontvangt `iconName` + SVG-body-string uit de UI (Iconify JSON-collection staat al in `@iconify/vue`'s `addCollection`, zie `ui/main.ts`), bouwt een `<svg>`-string met de goede viewBox/stroke-attrs, roept `createNodeFromSvg` aan, en replacet het bestaande icon-child (INSTANCE of FRAME) in-place. Deze route is al bewezen werkend in `editors/table/badge.ts` + `editors/table/lucide-icons.ts` (welder-table v0.2.0, 1-op-1 port).

**Open vragen, beantwoord (knopen doorgehakt).**

1. **Welke @iconify-json import-vorm werkt in Vite single-file bundle?**
   → **UI bundelt de volledige JSON-collection** via `@iconify-json/lucide/icons.json` (al in `addCollection` in `ui/main.ts`, ~549KB raw / <100KB gzip, acceptabel — de UI-bundle heeft al Nuxt UI + Vue en is netto ≤1MB). Geen subset, geen lazy-per-icon-fetch: we hebben de `body`-strings synchroon nodig bij de klik.
   → **Main bundelt géén Iconify JSON.** Main is pure receiver: neemt de SVG-body-string uit het bridge-bericht zoals-is en bouwt er een `<svg>`-root omheen. Dat houdt `dist/code.js` compact (belangrijk voor ES2017-sandbox-laadtijd) en vermijdt twee kopieën van dezelfde JSON.

2. **SVG-payload of iconName-only in bridge-message?**
   → **SVG-body-string via het bridge-bericht.** UI heeft de Iconify-collection dus UI weet de body. Main hoeft dan geen @iconify-json te bundelen. `~200-500 bytes` per payload — ruim onder de structured-clone limiet (<1MB). Bridge-message krijgt een extra veld `iconSvg: string` naast het bestaande `icon: string`. Naam blijft mee (voor debugging + `name`-zetting op de nieuwe frame).

3. **`createNodeFromSvg` — returnt FRAME of ander node-type?**
   → **Returnt altijd een `FrameNode`** met VECTOR-children voor paths. Dit is de gedocumenteerde Figma-API-shape en werkt in dynamic-page mode (welder-table draait al met deze aanroep productief). Ons replacement-pad behandelt de return zodanig: we zetten `width` = `height` = 16 via `resize(16,16)` (defensief — SVG-viewBox bepaalt default-size maar niet altijd consistent; zie punt 5).

4. **Color / stroke-bind — hoe neemt de nieuwe frame de kleur van de oude node over?**
   → **Twee-staps strategie.**
   (a) Build-time: de UI levert de SVG-body met `stroke="currentColor"` uit de raw Iconify-data. Main vervangt `currentColor` door een concrete hex vóór `createNodeFromSvg` (identiek aan `editors/table/badge.ts:34-46`). De hex komt uit een nieuwe helper `readIconColorHex(oldIconNode)` die:
   (i) als de oude INSTANCE/VECTOR een `strokes`-array met SOLID-paint heeft → neem die hex;
   (ii) anders als er een bound-variable op strokes zit → lees de variable-waarde voor de huidige mode en zet die als solid;
   (iii) anders fallback op `theme.foreground` uit `constants.THEMES['orange'].foreground` (de default Welder brand-primary `#FF7700`).
   (b) Runtime-nazorg: na `createNodeFromSvg` lopen we `findAll(n => 'strokes' in n)` en zetten explicit `[{ type: 'SOLID', color }]` (zelfde defensieve patch als `editors/table/badge.ts:52-56`). Geen variable-binding in v1 — dat zou een migratie-vraag zijn die we in v0.2.x kunnen aanvliegen.

5. **Size — explicit resize of auto-layout?**
   → **Expliciet `resize(w, h)` in main.** De oude icon-child heeft een bekende size (meestal 16×16 voor badge, 24×24 of 32×32 voor card). We lezen de `width`/`height` van de oude node vóór we hem weggooien en passen exact dezelfde dimensies toe op de nieuwe FRAME. Auto-layout-context (parent `icon_wrapper` is `primaryAxisSizingMode=AUTO` in Slide Machine) regelt vervolgens de rest. Geen resize → nieuwe FRAME zou 24×24 default zijn (viewBox) en daarmee badge-icons ~50% te groot.

6. **Wat te doen met `primeIconCache`, `icons-ready`, `prefValueCache`?**
   → **Volledig wegsnijden.** De UI hoeft niet meer te wachten op een cache-build — de Iconify JSON is build-time beschikbaar. `IconPicker.vue` verwijdert `iconsReady`-ref + bridge-listener + `:disabled="!iconsReady"`-guard; de picker is vanaf mount enabled. Bridge-type `'icons-ready'` vervalt uit `types.ts`. `editors/shared/icon-swap.ts` wordt in zijn geheel gedelete (384 regels). `primeIconCache`-call in `code.ts:708-732` wordt vervangen door: géén background-prime nodig.

7. **Card vs badge — unified of gesplitst?**
   → **Unified.** De nieuwe mutator `applyIconAsSvg(iconOwner, iconSlug, svgBody)` werkt identiek voor beide, omdat we niet langer met component-properties (Card: `INSTANCE_SWAP` op parent) vs swapComponent (Badge: nested INSTANCE) werken maar met een generieke replace-child-pattern. Zowel `badge.ts:applyIconSwap` als `card.ts:applyCardIconSwap` verliezen hun 3-strategy-ladder en worden thin wrappers die de shared-helper aanroepen met een `findIconTargetChild(scope)` resolver. Locator-heuristiek blijft: (a) directe child met Lucide-slug-naam, (b) `icon_wrapper`-child → eerste INSTANCE/FRAME, (c) `findOne` descendant met Lucide-slug-naam.

8. **Legacy slides — round-trip OK?**
   → **Ja, mits Read-pad wordt uitgebreid.** Zie §12 Q7: de bestaande `readBadgeIcon` / `readCardIcon` (code.ts:140-206) kennen drie strategieën die allen een INSTANCE met Lucide-slug-naam verwachten. Na T26b zijn nieuwe icons een FRAME met naam `i-lucide-<slug>`. We voegen een strategie D toe: `type === 'FRAME' && name.indexOf('i-lucide-') === 0 → normalizeIconKey(name)`. Oude slides blijven leesbaar, nieuwe slides zijn leesbaar, geen migratie nodig.

9. **Iconify-pipeline consistentie UI.**
   → **Blijft ongewijzigd.** UI gebruikt al `@iconify/vue` + `addCollection(lucideIcons)` (zie `ui/main.ts:14-20`). Nuxt UI's `<UIcon>` resolvet `i-lucide-*`-namen lokaal via die collection. Voor T26a leest `IconPicker.vue` / `BadgeEditor.vue` de `body`-string op klik-tijd uit de Iconify-collection (via `getIcon` of directe JSON-lookup) en stuurt die mee in de bridge-payload. Geen dubbele data-source; UI blijft cross-consistent.

---

**T26a — UI: Iconify body-lookup + bridge-payload uitbreiden** `[S, ~120 LOC, 3 files]`

- **Doel.** IconPicker post voortaan zowel `iconName` als `iconSvg` (body-string) in de update-messages. Verwijder de `icons-ready`-gating.
- **Files.**
  1. `plugins/welder-slide-editor/widget-src/ui/components/IconPicker.vue` — verwijder `iconsReady`-ref + bridge-listener + `:disabled="!iconsReady"` + loader-spinner-branch. Component is altijd enabled vanaf mount.
  2. `plugins/welder-slide-editor/widget-src/ui/composables/usePluginBridge.ts` (of wherever de icon-body-lookup wordt ingeleid; builder kiest de meest ergonomische plek) — kleine helper `lookupIconBody(slug: string): string | null` die de Iconify-JSON bevraagt (`import lucideIcons from '@iconify-json/lucide/icons.json'` + `lucideIcons.icons[slug]?.body`). Geen optional chaining in ES2017-main maar dit bestand is UI (ES2020 OK). Lever `null` als slug onbekend.
  3. `plugins/welder-slide-editor/widget-src/ui/components/BadgeEditor.vue` + `plugins/welder-slide-editor/widget-src/ui/components/CardItemEditor.vue` — in de `onIconChange`-handler: na `lookupIconBody(slug)` pas `iconSvg` toe op de bridge-payload (beide roepen `update-general` / `update-card` aan; beiden krijgen `{ icon, iconSvg }` in de payload).
  4. `plugins/welder-slide-editor/widget-src/types.ts` — breid `UIToPluginMessage`-leden `update-general` (section `badge`) en `update-card` uit met een optioneel `iconSvg: string`-veld naast de bestaande `icon: string`. **Removal:** verwijder ook het `PluginToUIMessage`-lid `{ type: 'icons-ready' }`.

  > **Budget-check.** Dat zijn 4 bestanden — grensgeval boven de ≤3-files-regel. Kies één: óf de bridge-helper plaatsen binnen `BadgeEditor.vue` (lokaal, dan 3 files in deze subtask en composables ongemoeid), óf de `types.ts`-wijziging delegeren naar T26b (main ontvangt dan de extra veldkeer via cast tot T26c de types definitief opruimt). **Voorkeur builder:** optie 1 (helper intern houden in beide editors via een kleine shared util in dezelfde folder, of 1:1 inline). Als dat te ugly wordt, split in T26a1 (types + bridge-message-shapes) en T26a2 (UI-components). Maar eerst proberen in één run.

- **Exit.**
  - IconPicker is vanaf mount enabled, geen wacht-spinner.
  - Klik op een icon in IconPicker → dev-console log in UI-iframe toont `{ icon: 'arrow-up', iconSvg: '<path ...>' }` in het uitgaande bericht.
  - `npm run build` clean.
  - Geen regressie in de visuele icon-rendering binnen de IconPicker-popover (de `<UIcon name="i-lucide-x">`-render-pipeline blijft ongewijzigd).

- **Commit-message template.**
  ```
  refactor(welder-slide-editor): UI posts iconSvg body-string to main
  ```

---

**T26b — Main: `createNodeFromSvg` + generieke replace-icon-child** `[M, ~180 LOC, 3 files]` `[DEPRECATED — zie §11 regressie-notitie + T27]`

- **Doel.** Vervang de library-gebaseerde icon-swap door een SVG-native replace-child. Unify card/badge in één shared helper.
- **Files.**
  1. `plugins/welder-slide-editor/widget-src/editors/shared/icon-svg.ts` (nieuw) — exporteert:
     - `findIconTargetChild(scope: InstanceNode | FrameNode): SceneNode | null` — locator-heuristiek (directe Lucide-slug child → `icon_wrapper`-child → findOne descendant met Lucide-slug-naam → findOne descendant met naam `i-lucide-*` op FRAME).
     - `readIconColorHex(node: SceneNode): string` — leest stroke-hex van de oude node (met variable-bound-fallback en brand-primary default).
     - `applyIconAsSvg(target: SceneNode, iconSlug: string, svgBody: string): void` — bouwt `<svg viewBox="0 0 24 24" fill="none" stroke="<hex>" ...>{body-with-currentColor-replaced}</svg>`, roept `figma.createNodeFromSvg(svg)` aan, zet `name = 'i-lucide-' + iconSlug`, `resize(oldW, oldH)`, patch alle descendant `strokes`, vervolgens `parent.insertChild(idx, newFrame)` op de `target.parent.children.indexOf(target)`-positie en `target.remove()`.
  2. `plugins/welder-slide-editor/widget-src/editors/general/badge.ts` — vervang `applyIconSwap` met een aanroep naar `applyIconAsSvg` via `findIconTargetChild(badge)`. Strategie 3 (Text-node icon-font) blijft als absolute laatste fallback. `import` van `trySwapViaInstanceProperty` + `swapComponentByName` wordt verwijderd.
  3. `plugins/welder-slide-editor/widget-src/editors/content/card.ts` — vervang `applyCardIconSwap` + `findNestedIconInstance` met aanroep naar `applyIconAsSvg` via `findIconTargetChild(card)`. Verwijder de `trySwapViaInstanceProperty` / `swapComponentByName`-imports.
  - **Niet aanraken in T26b:** `code.ts` krijgt de nieuwe `iconSvg`-veld-reads via een minimale cast in de `update-*`-handlers. De formele type-update zit al in T26a. Als de builder merkt dat een extra `code.ts`-touch strikt nodig is voor compile-time, telt die mee als 4e file → dan splitten in T26b1 (shared + badge) / T26b2 (card + code.ts).

- **Exit.**
  - Klik een nieuw badge-icon in de UI → badge op canvas update **binnen ≤400ms** (debounce 200ms + replace-time).
  - Klik een nieuw card-icon → card op canvas update idem.
  - Oude icon-child (INSTANCE of FRAME) is verdwenen; nieuw FRAME-child met naam `i-lucide-<slug>` staat op exact dezelfde index onder dezelfde parent.
  - Stroke-kleur van het nieuwe icoon matcht de oude (brand-primary default).
  - Size is identiek aan de oude (16×16 voor badge, 24×24 of 32×32 voor card zoals gedetecteerd).
  - `npm run build` clean, geen TS-errors, `dist/code.js` laadt in Figma Desktop zonder runtime-exceptie.
  - Smoketest in Figma Desktop: 2 slides, 1× badge + 1× card → pick 3 verschillende icons na elkaar; alle drie updaten op canvas.

- **Commit-message template.**
  ```
  feat(welder-slide-editor): SVG-native icon swap via createNodeFromSvg
  ```

---

**T26c — Cleanup: verwijder library-icon-swap + Read-pad strategie D** `[S, ~80 LOC net delete, 3 files]`

- **Doel.** Verwijder alle dood weefsel van de oude architectuur en maak het Read-pad forward-compatible voor de nieuwe FRAME-shape.
- **Files.**
  1. `plugins/welder-slide-editor/widget-src/editors/shared/icon-swap.ts` — **VERWIJDEREN** (384 regels). Geen callers meer na T26b.
  2. `plugins/welder-slide-editor/widget-src/code.ts` — verwijder:
     - De `primeIconCache`-IIFE (regels 708-732): ~25 LOC weg; vervang door niets (geen `icons-ready`-post meer; UI wacht nergens op).
     - Alle verwijzingen naar `primeIconCache` in top-imports (regel 44).
     - De comment-blokken die verwijzen naar de oude architectuur (regels 1092-1094).
       Uitbreiden:
     - `readBadgeIcon` (regels 140-152) en `readCardIcon` (regels 164-206): voeg **strategie D** toe — `type === 'FRAME' && name.indexOf('i-lucide-') === 0 → return normalizeIconKey(name)`. Plaats strategie D tussen B en C (na `icon_wrapper`-check, vóór findOne-fallback) zodat nieuwe icons sneller geresolved worden.
     - **Belangrijk:** `normalizeIconKey` en `LUCIDE_SLUG_RE` blijven nodig voor de Read-paden → verplaats die twee exports van `icon-swap.ts` naar een nieuw bestand `editors/shared/icon-normalize.ts` (pure utility, <30 LOC). De imports in `code.ts` + `badge.ts` + `card.ts` worden bijgewerkt.
  3. `plugins/welder-slide-editor/widget-src/ui/main.ts` — verwijder `devPost({ type: 'icons-ready' }, 900)` (regel 61) — dev-mock handshake hoeft dit niet meer te vuren.
  - **Niet aanraken:** `IconPicker.vue` + `BadgeEditor.vue` + `CardItemEditor.vue` — al schoongemaakt in T26a.

  > **Budget-check.** Drie files in scope (icon-swap.ts delete telt als 1), plus een nieuw micro-bestand `icon-normalize.ts`. Dat is 4 bestanden. Als builder het split wil: T26c1 (delete + new util) / T26c2 (code.ts readers + main.ts dev-mock). Eerst proberen als één run — het is bulk-delete + search-replace op 3 imports.

- **Exit.**
  - `grep -r "icon-swap"` vindt geen matches in `plugin-src/` behalve historische commits.
  - `grep -r "icons-ready"` vindt geen matches.
  - `grep -r "primeIconCache"` vindt geen matches.
  - `grep -r "prefValueCache"` vindt geen matches.
  - Slide waarvan alle icons vóór T26 zijn gezet (INSTANCE-children met Lucide-slug-naam): plugin opent → UI toont correcte icon in IconPicker-preview (Read-pad strategieën A/B/C functioneren nog).
  - Slide waarvan icons ná T26 zijn gezet (FRAME-children met `i-lucide-*`-naam): plugin opent → UI toont correcte icon (Read-pad strategie D functioneert).
  - `npm run build` clean; bundle-grootte `dist/code.js` kleiner dan vóór T26 (icon-swap.ts en primeIconCache weg).

- **Commit-message template.**
  ```
  chore(welder-slide-editor): remove library icon-swap + icons-ready plumbing
  ```

---

### T28 — Accent-ranges in heading/paragraph via Text Dimmer variable `[REVERTED 2026-04-24 — 20+ iteraties, feature parked pending fresh approach]`

> **Reverted 2026-04-24.** Feature implementatie bleek fragiel: render-cache-issues (T28.1/T28.2 fallback-RGB + visible-toggle workarounds), vervolgens UX-blocker (`<UPopover>` uit Reka UI maakt `UInput` unresponsive zodra trigger nabij label gemount wordt — zie commits `e240850`, `84a3e9c`, `678f1ab`, `05b4ec3`). Gebrek aan stabiele end-state → feature geparkeerd. Zie HANDOFF.md voor gewenst gedrag + gepoogde routes.

> **Nummering.** T27 blijft gereserveerd voor de icon-regressie-fix die §11 aankondigt (library-INSTANCE_SWAP-herstel). Deze accent-task krijgt T28 om niet te botsen.

**Probleem.** Welder-slides gebruiken een "dim-accent"-patroon: een deel van een heading of paragraph wordt gerenderd in een lichtere kleur (Variable `Text Dimmer`, `#ffc78f` in de orange-mode) terwijl de rest in de default-kleur staat (Variable `Text`, `#fff4ea`). Zie live-voorbeeld op test-file slide 2, heading `I11:5959;29:10713;28:5241;36:2563` — range `[19,41]` ("sit amet quam vehicula") is dim. De huidige plugin heeft geen UX om dit patroon te bewerken, en de bestaande `.characters = newText`-write in `update-general` slaat de range-styling plat zodra de user de textarea aanraakt. De user wil het patroon **in-plugin** kunnen bewerken, zodat copywriters zonder Figma-text-skills een accent kunnen toevoegen/verschuiven.

**Research (voorafgaand bevestigd, geen extra discovery nodig).**

- Library-variables zijn bereikbaar via `figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()`; collection "Templates Welder / Theme" (key `ad7625ab79ee53bd85ec21632e287536ae94d544`) is zichtbaar in deze file-scope.
- Variable-keys:
  - `Text` → `aaeec2f93a38b8a2e3af696972c4313eff529bc7`
  - `Text Dimmer` → `cd3f59ce0c953ee93c4a30b738a96683035b3d72`
- Plugin-API-contract werkt:
  ```ts
  const v = await figma.variables.importVariableByKeyAsync(TEXT_DIMMER_KEY);
  const fill = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 1, g: 0.78, b: 0.56 } },
    'color',
    v,
  );
  textNode.setRangeFills(start, end, [fill]);
  ```
- Op slide 2 is de bestaande accent-styling **niet** bound aan een Variable (raw hex op de range). De plugin moet dus twee Read-gevallen aankunnen: (a) raw-hex accent → bij eerste `update-accent` migreren naar Variable-binding, (b) reeds Variable-bound → respecteren.

**Scope & beslissingen (user-approved, knopen doorgehakt).**

| Vraag                                                              | Besluit                                                                                                                                                                                                                                                      | Reden                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Welke velden ondersteunen accent?                                  | **Heading + paragraph** binnen `GeneralSections.titleDescription`. **Niet** Badge-label (single-word, weinig waardevol) en **niet** Card heading/paragraph (v0.1.x-scope; later als T28b te overwegen).                                                      | User-advies; houdt scope binnen 3 files.                                                               |
| Cache van geïmporteerde Variables op main-thread?                  | **Module-level cache**, nooit ge-invalideerd (library-keys zijn stabiel). Lazy populated bij eerste `update-accent`.                                                                                                                                         | Spaart round-trips; `importVariableByKeyAsync` is niet goedkoop.                                       |
| Raw-hex → Variable-binding migratie?                               | **Ja, direct bij eerste `update-accent`** op een slide met bestaande raw-hex accent. Uniforme semantiek vanaf het moment dat de plugin het veld aanraakt.                                                                                                    | Voorkomt dat we twee styling-vormen permanent in het model houden.                                     |
| Library niet bereikbaar (enterprise-team zonder Templates Welder)? | **Silent-fail in de scan**: als `importVariableByKeyAsync` voor beide keys faalt, lever `dimRanges: null` i.p.v. `[]`. UI verbergt de "Accent bewerken"-knop wanneer `dimRanges === null`. Console-log voor debugging.                                       | Geen error-state voor een use-case die niet door deze team-omgeving wordt gedekt; matcht FIG-GUARD-01. |
| Accent-toggle en tekst-edit één round-trip of separaat?            | **Separaat.** `update-accent` muteert geen characters. Tekst-edit in de textarea flushet lokaal de ranges naar `[]` (UI-state), zodat de volgende `update-general` de text platslaat zonder Variable-binding en de Accent-popover met een fresh state opent. | Simpelste mentale model; geen fragile range-remapping bij character-edits.                             |

**Data-model (uitbreiding `types.ts`).**

```ts
// additive: optionele velden op titleDescription-subtree
export interface TitleDescriptionState {
  copyWrapId: string;
  heading: string;
  paragraph: string | null;
  // NEW — null als library niet bereikbaar is (silent-fail), [] als geen accent-ranges
  headingDim: Array<[number, number]> | null;
  paragraphDim: Array<[number, number]> | null;
}
```

`GeneralSections.titleDescription` wordt hiernaar getyped (rename of inline, builder kiest). De bestaande message-shapes `update-general { section: 'titleDescription', payload }` blijven werken voor character-edits; voor accent-edits komt er een **nieuw** message-type (zie onder).

**Bridge-messages (uitbreiding §5).**

UI → plugin, nieuw lid:

| `type`          | Payload                                                                                    | Beschrijving                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `update-accent` | `{ slideId: string; field: 'heading' \| 'paragraph'; dimRanges: Array<[number, number]> }` | Muteert alleen fills via `setRangeFills`; characters blijven ongemoeid. Geen debounce (de toggle-UX is al click-discreet, geen keystroke-burst). |

Plugin → UI: `slide-loaded` blijft hetzelfde; de `headingDim` / `paragraphDim`-velden zitten binnen de bestaande `general`-payload.

**Files (3, ≤200 LOC netto).**

1. **`plugins/welder-slide-editor/widget-src/code.ts`** (net +~80 LOC)
   - **Scan-uitbreiding.** In de CopyWrap-scanner: per heading/paragraph-text-node `getStyledTextSegments(['fills','boundVariables'])` lezen. Emit `dimRanges` wanneer een segment een fill heeft die (a) bound is aan `Text Dimmer` óf (b) raw SOLID met hex ≈ `#ffc78f` (tolerance ~0.01 per channel op `color.r/g/b`). Merge aaneengesloten segmenten met dezelfde `isDimmed`-flag tot één `[start,end]`-range. Lever `headingDim: null` / `paragraphDim: null` als de Variable-import faalt (silent-fail), anders `[]` / gevulde array.
   - **Module-level Variable-cache.** Eén-malig lazy-populated object `{ text?: Variable; dimmer?: Variable }` aan de top van `code.ts` (of in een nieuwe `editors/general/accent.ts` helper — zie file 3). Eerste call importeert beide keys parallel; volgende calls hergebruiken.
   - **Handler `update-accent`.** Locate slide → heading-/paragraph-text-node via bestaande `findCopyWrap`-helper. `await figma.loadFontAsync(node.fontName as FontName)`. Bouw twee bound-fills via `figma.variables.setBoundVariableForPaint`. Loop: voor elke dim-range `setRangeFills(start, end, [dimmerFill])`. Complement-ranges (gaten + start/eind-tails) krijgen `[textFill]`. Dit migreert automatisch raw-hex naar Variable-binding omdat we over de hele string schrijven.
   - Verifieer dat `update-general`'s `.characters = newText`-schrijf niet gevolgd wordt door een accent-flush in dezelfde tick; de UI is verantwoordelijk voor het resetten van de ranges wanneer de user tekst muteert (geen main-side re-read nodig).

2. **`plugins/welder-slide-editor/widget-src/ui/components/AccentRangePopover.vue`** (nieuw, ~70 LOC)
   - Props: `text: string`, `dimRanges: Array<[number, number]>`.
   - Emit: `update:dimRanges` met een nieuwe ranges-array.
   - Render: `UPopover` met trigger `UButton` (ghost, icon `i-lucide-highlighter`, label "Accent bewerken"). Popover-body: `<div class="flex flex-wrap gap-1">` met per-woord toggleable `UBadge` (of `UButton` size xs, ghost/solid-variants voor neutral/accented). Helper-caption `<p class="text-xs text-muted">Klik op woorden om ze te accentueren.</p>`.
   - **Tokenisatie.** Split de text op whitespace met een runner die per token `{ start, end, text, isSpace }` bewaart. Render alleen non-space tokens als chips. Toggle-logica: bij klik op een woord-chip, bepaal `isDimmed` via overlap met `dimRanges`; toggle voegt het token-range toe of verwijdert overlap. Daarna merge aaneengesloten ranges tot canonical form `[[s1,e1],[s2,e2],...]` met `e_i < s_{i+1}`.
   - Post geen bridge-message zelf — emit alleen omhoog; de parent (TitleDescriptionEditor) doet de `usePluginBridge.post({ type: 'update-accent', ... })`.

3. **`plugins/welder-slide-editor/widget-src/ui/components/TitleDescriptionEditor.vue`** (edit, ~+30 LOC netto)
   - Mount `AccentRangePopover` direct onder de heading-`UTextarea`. Conditioneel tonen alleen wanneer `props.headingDim !== null` (library-fallback-guard). Idem voor paragraph-textarea met `paragraphDim`.
   - Bij textarea `input`-event: flush de lokale `headingDim` / `paragraphDim`-ref naar `[]` zodra `value.length !== lastScannedLength` (kortste heuristiek; geen poging tot remap). Commit-message-author: **dit is de enige sync-punt tussen characters en ranges — niet-triviaal, dus expliciet in aparte computed/watcher zetten en inline-commentaar plaatsen.**
   - Bij `AccentRangePopover.update:dimRanges`-emit: direct `bridge.post({ type: 'update-accent', slideId, field: 'heading'|'paragraph', dimRanges })`.

> **Budget-check.** 3 files + 1 nieuwe Vue-component. Netto ~180 LOC (scan +80, popover +70, editor +30). Binnen de ≤200 LOC / ≤3 files-grens — de nieuwe `AccentRangePopover.vue` telt als één van de drie. Als builder een shared `tokenize-words.ts`-util wil extraheren: telt als 4e file → dan splitten in T28a (scan + types + bridge) / T28b (UI-popover + editor-mount). **Default:** tokenisatie inline in `AccentRangePopover.vue` houden — het is ~15 LOC en heeft geen andere consumer.

**Acties (ordered).**

1. **Types.** Breid `GeneralSections.titleDescription` uit met `headingDim` + `paragraphDim` (`Array<[number,number]> | null`). Voeg `update-accent`-lid toe aan `UIToPluginMessage`.
2. **Scan.** Implementeer `getStyledTextSegments`-lezing in `code.ts`'s CopyWrap-scanner. Silent-fail bij Variable-import-fout: lever `null` voor beide dim-velden.
3. **Accent-helper.** Maak een kleine helper-module (in `code.ts` top of in `editors/general/accent.ts` — builder kiest; ik reken hem niet apart als 4e file omdat `editors/general/badge.ts` al naar pattern is) met `loadVariables()` (cached) en `applyAccent(textNode, dimRanges)` die characters ongemoeid laat en `setRangeFills` doet met zowel dimmer- als text-fill over de volle string.
4. **Handler.** Wire `update-accent` → `applyAccent` met `loadFontAsync`-preflight.
5. **UI — Popover.** Implementeer `AccentRangePopover.vue` (tokenize + chip-toggle + emit).
6. **UI — Editor-integratie.** Mount popover onder heading/paragraph-textarea in `TitleDescriptionEditor.vue`; guard op `dimRanges !== null`; flush bij character-edit; emit → bridge-post.
7. **Smoketest** in Figma Desktop op de test-file, slide 2:
   - Plugin opent → Accent-knop verschijnt onder heading.
   - Klik Accent-knop → popover toont woorden; "sit amet quam vehicula" is al gemarkeerd.
   - Toggle een ander woord → canvas update binnen ≤500ms; nieuwe segment gebruikt `Text Dimmer`-variable (verifieer via inspecteer-mode van Figma: fill heeft variable-binding, niet raw hex).
   - Switch naar andere slide en terug → accent-state persist (werkt via Figma's eigen range-fills, niet via pluginData).

**Edge-cases.**

- **Lege text.** `heading === ''` → popover rendert geen chips; "Accent bewerken"-knop kan ghost-disabled of zelfs hidden zijn (UX-keuze builder).
- **Single-word.** Werkt; toggle schakelt de hele string.
- **Range-overlap bij character-edit.** Volledig voorkomen door UI-flush naar `[]` bij `length`-mismatch; main-thread krijgt altijd valid non-overlapping ranges binnen `[0, text.length]`.
- **Paragraph `null`.** Bestaande guard (paragraph hidden wanneer onzichtbaar, T19) werkt door; accent-knop voor paragraph rendert dan uiteraard ook niet.
- **Font met multiple fontNames** (mixed-font text-node): `loadFontAsync` voor `node.fontName as FontName` werkt bij uniform font; bij mixed fonts eerst `node.getRangeFontName(0, node.characters.length)` itereren en alle unieke fonts loaden vóór de write. **Aanname v1:** Welder heading/paragraph gebruiken één font — als builder dit tegenkomt, log + fall back op de eerste fontName (schrijven slaagt dan alsnog voor de ranges die die font gebruiken, rest blijft unstyled voor nu).
- **Library-import race.** Eerste `update-accent` kan parallel lopen met scan-import. Module-cache moet idempotent zijn (Promise-cache, niet value-cache): `let varsPromise: Promise<{ text, dimmer }> | null = null;` + `async function getVars() { return varsPromise ??= importBoth(); }`. **Let op ES2017-target** (zie `feedback_figma_runtime.md` in MEMORY): géén `??=` in main-thread — schrijf als `if (!varsPromise) varsPromise = importBoth(); return varsPromise;`.

**Exit criteria.**

- Toggle van een woord in de popover zorgt dat dat woord in Figma binnen **≤500ms** rendert in `Text Dimmer`-kleur (bound variable, niet raw hex).
- Accent persisteert over slide-switch (leveren via scan, niet via lokale UI-state).
- Slide met bestaande raw-hex accent: eerste `update-accent` migreert naar Variable-binding; visueel identiek, inspect toont variable-bound fill op de dim-range.
- Slide met reeds Variable-bound accent: scan leest dim-ranges correct; UI toont pre-marked chips; toggle werkt idempotent.
- Character-edit in textarea flushet dim-ranges lokaal naar `[]`; na de edit is de heading/paragraph unstyled en toont de popover geen pre-marked chips (fresh start).
- Library-variables onbereikbaar: "Accent bewerken"-knop verschijnt niet; geen console-error, wel een debug-log.
- Geen regressie in heading/paragraph character-editing (bestaande `update-general`-flow).
- `npm run build` clean; geen TS-errors; `dist/code.js` target blijft ES2017-compat (geen optional-chaining / nullish-coalescing in main).

**Commit-message template.**

```
feat(welder-slide-editor): accent-ranges via Text Dimmer variable in heading/paragraph
```

---

### T30 — Heading-accent via inline word-chips `[DONE 2026-04-24]` `[M, ~160 LOC, 3 files]`

> **Herstart van T28.** T28 werd 2026-04-24 gereverteerd na een UX-blocker: `<UPopover>` + `<UInput>` in dezelfde scope maken het input-veld unresponsief (bewezen via diagnostic-strip, commit `05b4ec3`). T30 herneemt dezelfde feature-scope (heading-only) via een fundamenteel nieuwe UI-architectuur die de popover-component volledig vermijdt: **inline always-visible word-chips** direct onder de Koptekst-input. Zie research-rapport `.archive/T30-accent-heading-research-2026-04-24.md` (route A′, §3).
>
> **Relatie tot T28.2 write-path.** De bewezen main-thread-code uit T28.2 (`loadAccentVars` + `readDimRanges` + `applyAccentRanges` + `resolveForConsumer` fallback-pre-resolve + visible-toggle render-cache-flush) wordt **gerestoreerd**, maar geheel gestript van alle paragraph-branches. Dit is een nieuwe schone commit — **geen** `git revert fe3d331` (dat zou paragraph-code meenemen). Voor reconstructie van wat T28-revert weghaalde: zie `git show fe3d331 -- plugin-src/code.ts`.

**Probleem.** Welder-slides gebruiken een dim-accent-patroon: een deel van een heading wordt gerenderd in de `Text Dimmer`-library-variable (`#ffc78f` in orange-mode), de rest in de `Text`-library-variable (`#fff4ea`). Netto-effect: niet-gedimde woorden springen visueel naar voren als accent. De huidige plugin heeft geen UX om dit per woord te bewerken; elke character-edit in de textarea slaat de range-styling bovendien plat. User wil copywriters zonder Figma-text-skills het accent in-plugin kunnen verschuiven.

**Scope — user-beslissingen, knopen doorgehakt.**

| Research open-q                               | User-besluit                                            | Consequentie                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Paragraph-accent later als T30.1?             | **Nooit.** Permanent out-of-scope.                      | Niet als T30.1, niet als follow-up, niet als backlog. Alle paragraph-branches uit het gerestoreerde T28.2-write-path worden gestript. |
| Chip-primitive — `<UButton>` vs `<UBadge>`?   | **`<UButton size="xs">`** met `aria-pressed` semantics. | Correcte toggle-semantiek voor screen-readers + native keyboard (space/enter).                                                        |
| Wrap-gedrag bij lange headings (>15 woorden)? | **`flex-wrap`** — meerdere regels acceptabel.           | Geen horizontale scroll, geen `<UScrollArea>`.                                                                                        |

**Niet-scope (expliciet).**

- Paragraph-accent.
- `<UPopover>` als UI-component (bewezen incompatibel — zie T28.3 handoff).
- Trigger-knop of expand-toggle — chips zijn altijd zichtbaar zodra `headingDim !== null`.
- Canvas-native woordselectie via `selectedTextRange` (route B uit research — interessant voor v2, niet v1).
- Nieuwe Vue-component (tokeniser + chips inline in `TitleDescriptionEditor.vue`).

**Data-model (uitbreiding `types.ts`).**

```ts
// additive: optioneel veld op titleDescription-subtree (heading-only, paragraph OMITTED)
export interface TitleDescriptionSection {
  copyWrapId: string;
  heading: string;
  paragraph: string | null;
  // NEW — null als library onbereikbaar (silent-fail), [] als geen accent-ranges
  headingDim: Array<[number, number]> | null;
}
```

Geen `paragraphDim`. Scan-output in `code.ts` levert `headingDim`; paragraph-scanning gebeurt niet.

**Bridge-message (uitbreiding `UIToPluginMessage`).**

| `type`          | Payload                                                   | Beschrijving                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update-accent` | `{ slideId: string; dimRanges: Array<[number, number]> }` | Heading-only. Muteert alleen fills via `setRangeFills`; characters blijven ongemoeid. Geen `field`-discriminator nodig (er is maar één veld). Debounce ~200ms in UI is acceptabel maar niet strikt nodig — klik-events zijn al discreet. |

**Files (3, ≤200 LOC totaal, ~160 LOC netto).**

1. **`plugins/welder-slide-editor/widget-src/types.ts`** (~+15 LOC)
   - Breid `TitleDescriptionSection` uit met `headingDim: Array<[number, number]> | null`.
   - Voeg `{ type: 'update-accent'; slideId: string; dimRanges: Array<[number, number]> }` toe aan `UIToPluginMessage`-union.
   - **Geen** `paragraphDim`. **Geen** `field: 'heading' | 'paragraph'`-discriminator — de message is permanent heading-only.

2. **`plugins/welder-slide-editor/widget-src/code.ts`** (~+85 LOC)
   - **Restore uit gereverteerde T28.2-code** (reconstrueerbaar via `git show fe3d331 -- plugin-src/code.ts`):
     - Constants `TEXT_KEY`, `TEXT_DIMMER_KEY`, `TEXT_DIMMER_RGB`, `DIMMER_HEX_TOLERANCE`.
     - Helper `loadAccentVars()` — module-level Promise-cache: `let varsPromise: Promise<{ text, dimmer }> | null = null; if (!varsPromise) varsPromise = importBoth(); return varsPromise;` (ES2017-compat: geen `??=`).
     - Helper `readDimRanges(textNode)` — `getStyledTextSegments(['fills','boundVariables'])`, detecteer Text-Dimmer-binding OR raw `#ffc78f` binnen tolerance, merge aaneengesloten segmenten tot canonical ranges.
     - Helper `applyAccentRanges(textNode, dimRanges)` — T28.2 pattern:
       (a) `await loadAllFontsForNode(node)` (bestaande shared-import uit `_shared/fonts.ts` — T29 lesson, NIET `node.fontName as FontName`);
       (b) `Variable.resolveForConsumer(textNode)` voor pre-resolve van fallback-RGB;
       (c) Bouw bound-fills via `figma.variables.setBoundVariableForPaint` met pre-resolved fallback;
       (d) Eerst `setRangeFills(0, len, [textFill])` over hele string, daarna per dim-range `setRangeFills(s, e, [dimmerFill])`;
       (e) Render-cache-flush via `node.visible = !prev; node.visible = prev;`.
   - **Scan-uitbreiding** in de CopyWrap-scanner: heading-text-node → `readDimRanges()` → include als `headingDim` in `general`-payload. Silent-fail: als `loadAccentVars` faalt, emit `headingDim: null`. **Geen paragraph-branch.**
   - **Handler `update-accent`**: locate slide → heading-text-node via bestaande `findCopyWrap`-helper → `applyAccentRanges(headingNode, dimRanges)`. Geen `field`-switch, geen paragraph-pad.
   - **Strip alle paragraph-branches** bij reconstructie. Zie `git show fe3d331 -- plugin-src/code.ts` — de oude code had paragraph-paden in `readDimRanges`-caller, scan-emit, en `update-accent`-handler; al die moeten NIET terug.

3. **`plugins/welder-slide-editor/widget-src/ui/components/TitleDescriptionEditor.vue`** (~+60 LOC)
   - Onder de bestaande `<UFormField label="Koptekst">` een nieuw blokje renderen met label **"Accent"**, conditioneel op `v-if="modelValue.headingDim !== null"` (library-fallback-guard).
   - Helper-caption `<p class="text-xs text-muted">Klik op woorden om ze te accentueren.</p>`.
   - **Tokenisatie inline.** `heading.split(/(\s+)/)` → tokens met `{ start, end, text, isSpace }`. Whitespace-tokens als niet-klikbare inline-spans (spacing behoud); word-tokens als `<UButton size="xs" :variant="isDim ? 'solid' : 'subtle'" :aria-pressed="isDim">`.
   - **Lokale state.** `dimWords = ref<Set<number>>(new Set())` — indices van word-tokens (niet char-offsets).
   - **Hydratie.** Op mount + bij prop-change: char→word-index-mapper leest `props.modelValue.headingDim` (char-ranges) en vult `dimWords` met overlappende word-indices.
   - **Toggle-handler.** Klik chip → `dimWords.toggle(wordIndex)` → word→char-range-mapper bouwt canonical ranges `Array<[s,e]>` (merge aaneengesloten, `e_i < s_{i+1}`) → emit debounced (~200ms) `update:headingDim` naar parent → parent post `bridge.post({ type: 'update-accent', slideId, dimRanges })`.
   - **Text-edit invalidation (DIM-FLUSH).** Watcher op `localHeading.length`: zodra length muteert t.o.v. `lastScannedLength` → `dimWords.clear()` + emit lege ranges. Rationale: char-indices zijn niet geldig na character-edit; simpelste heuristiek. Identiek aan T28-spec-aanname.
   - **Container.** `<div class="flex flex-wrap gap-1">` — `flex-wrap` bevestigt user-beslissing (lange headings >15 woorden wrappen acceptabel over meerdere regels).
   - **Layout.** Chip-blok staat **onder** de Koptekst-`<UFormField>`, niet in de `#label`- of `#hint`-slot van `<UFormField>` (dat was T28.3's fatal pattern — popover-focus-trap). Gewone sibling-markup.

> **Budget-check.** 3 files, ~160 LOC (types +15, code +85, editor +60). Binnen ≤200 LOC / ≤3 files-grens. Geen nieuwe Vue-component, geen nieuwe composable. Als builder merkt dat ≥200 LOC realistisch wordt: splits in T30a (`types.ts` + `code.ts` restore) en T30b (`TitleDescriptionEditor.vue` UI-chips). Default blijft één task.

**Acties (ordered).**

1. **Types.** Breid `TitleDescriptionSection` uit met `headingDim`. Voeg `update-accent` (heading-only payload-shape) toe aan `UIToPluginMessage`.
2. **Main-restore.** Herstel in `code.ts` de T28.2 helpers (`TEXT_KEY`/`TEXT_DIMMER_KEY` constants, `loadAccentVars` Promise-cache, `readDimRanges`, `applyAccentRanges` met `resolveForConsumer` + visible-toggle + `loadAllFontsForNode`-preflight). Reconstrueer uit `git show fe3d331 -- plugin-src/code.ts`. **Strip alle paragraph-branches** (scan-emit, caller, handler).
3. **Scan-wire.** CopyWrap-scanner roept `readDimRanges(headingNode)` aan. Silent-fail: `headingDim: null` als `loadAccentVars()` faalt.
4. **Handler-wire.** `update-accent`-handler: locate heading → `applyAccentRanges(node, dimRanges)`. Geen paragraph-pad.
5. **UI — tokeniser + mappers.** Inline in `TitleDescriptionEditor.vue`: `heading.split(/(\s+)/)` tokeniser, char→word-index-mapper (mount/hydrate), word→char-range-builder (emit) met canonical merge.
6. **UI — chips.** `<UButton size="xs">`-grid in `flex flex-wrap gap-1`, `aria-pressed` semantics, `subtle`/`solid`-variant-swap op click.
7. **UI — flush-watcher.** Watcher op `localHeading.length` clear-t `dimWords` bij length-mismatch + emit lege ranges.
8. **UI — library-guard.** Conditioneel render `v-if="modelValue.headingDim !== null"`.
9. **Smoketest** in Figma Desktop op test-file slide 2:
   - Plugin opent → heading met word-chips zichtbaar onder de Koptekst-input.
   - Klik op een chip → woord dimt op canvas binnen ≤300ms (debounce 200ms + main-write).
   - Type in Koptekst-input → input blijft responsief (geen Reka-bug-regressie); bij length-change flushen de chips naar non-dimmed.
   - Switch naar andere slide en terug → accent-state persist (via Figma range-fills, niet via pluginData).

**Edge-cases.**

- **Lege heading.** `heading === ''` → geen chips rendert; accent-blok is leeg maar zichtbaar (met alleen helper-caption).
- **Single-word heading.** Eén chip, toggle schakelt de hele string tussen dim/normal.
- **Mixed-font heading** (Welder-template `"Doel van [emphasis]vandaag"`). `applyAccentRanges` gebruikt `loadAllFontsForNode` (T29 shared module) → alle fonts geladen vóór `setRangeFills`. Geen silent truncation.
- **Library onbereikbaar.** `loadAccentVars()` faalt → scan emit `headingDim: null` → `v-if` hide-t het hele accent-blok. Geen console-error (wel debug-log).
- **Character-edit zonder length-change** (bv. hoofdletter toggle). Length blijft gelijk → `dimWords` blijft valid → ranges blijven werken. Acceptabel.
- **Race tussen initial-scan en snelle eerste klik.** Module-level Promise-cache idempotent (ES2017-compat: `if (!varsPromise) varsPromise = importBoth(); return varsPromise;`). Geen `??=`.
- **Raw-hex bestaande accents.** `readDimRanges` detecteert zowel binding-ID als raw-hex `#ffc78f`. Eerste `update-accent` migreert automatisch naar Variable-binding (`applyAccentRanges` schrijft over de hele string met bound fills).

**Exit-criteria.**

- Slide-heading met word-chips zichtbaar in General-tab zodra library-variables beschikbaar zijn.
- Klik op chip → woord dimt op canvas binnen ≤300ms (debounced emit + main-write).
- Heading-text-edit via Koptekst-input werkt ongestoord — **geen Reka-bug-regressie** (dit was exact waar T28 op faalde; chip-UI gebruikt géén `<UPopover>`).
- Heading length-change flusht dim-state lokaal naar `[]` + emit naar main (char-indices niet geldig na rename).
- Geen regressie in bestaande Koptekst-save-flow (`update-general`-message blijft werken; `update-accent` is een separaat bericht).
- Library onbereikbaar → accent-blok verborgen; geen console-error.
- `npm run build` clean; geen TS-errors; `dist/code.js` blijft ES2017-compat (geen optional-chaining, nullish-coalescing, of `??=` in main).

**Niet-doen (expliciet).**

- **Geen** `git revert fe3d331`. Restore via nieuwe schone commits.
- **Geen** paragraph-branches terug (in `readDimRanges`-caller, scan-emit, of `update-accent`-handler).
- **Geen** `<UPopover>`, trigger-knop, of expand-toggle in `TitleDescriptionEditor.vue`.
- **Geen** nieuwe Vue-component (tokeniser + chips inline in `TitleDescriptionEditor.vue`).
- **Geen** `paragraphDim` in types of scan-output.

**Commit-message template.**

```
feat(welder-slide-editor): T30 heading-accent via inline word-chips
```

---

### T31 — TimelineWrap routering: Graphs → Content `[DONE 2026-04-24]`

> **Gekozen route: A — reuse `CardItemEditor.vue` + card-scan-logic.** Motivatie: Slide Machine volgt consistente naming-conventies (Heading + Paragraph text-nodes) over zijn item-componenten; de goedkoopste aanname is dat TimelineWrap-children hetzelfde Heading/Paragraph-patroon delen als CardWrap-children. Één scan-pad, één editor-component, één mutatie-handler. **Bij implementatie verifieert de builder via live-slide-scan dat de items daadwerkelijk terugkomen; als de structuur toch afwijkt (`Frame 6`/`Frame 7`-naming mist, of ordering/date-velden blijken kritiek) → stop, rapporteer in `.archive/T31-findings-<date>.md`, en split naar T31.1 per Route B/C hieronder.** Geen speculatieve extra-velden (date, connector, ordering-metadata) in v1 — die komen pas terug als B/C nodig blijkt.
>
> **Niet-scope (expliciet).** Zie §2 niet-doelen: geen timeline-item toevoegen/verwijderen, geen reorder via plugin. Alleen edit van heading/paragraph (+ visual of icon indien slot aanwezig) op bestaande items.

**Probleem.** `findTableWrap` in `plugin-src/slide-machine.ts:205-213` matcht `name ∈ {'TableWrap', 'TimelineWrap'}` → een slide met alleen een TimelineWrap wordt als table-instance aan `scanGraphs` aangeboden, waarna TableEditor probeert te renderen terwijl er geen `TableData`-pluginData op de node staat. User-intent: **TimelineWrap moet zich gedragen als CardWrap** — een TimelineWrap is een container met per-item editors (heading + paragraph per timeline-item), niet een tabel. Het hoort dus thuis op de Content-tab, niet op de Graphs-en-tabellen-tab.

**Route-overwegingen (architect, knopen doorgehakt).**

| Route                        | Aanpak                                                                                                                                                                                     | LOC-impact                                                         | Risico                                                                                                                                                            | Besluit                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A (default)**              | Reuse `CardItemEditor.vue` + `scanContent`; voeg unified `findContentWrap` toe; strip TimelineWrap uit `findTableWrap`; scan beide wrappers in `scanContent` en mergen in `content.cards`. | ≤60 LOC over 3 files                                               | Aanname dat TimelineWrap-children dezelfde Heading/Paragraph-text-node-namen dragen als CardWrap-children. Als die assumptie breekt → builder splitst naar T31.1. | **GEKOZEN** — laagste LOC-impact, hergebruikt bestaande UI + mutatie-pipeline, respecteert edit-only-principe.                                                                                   |
| B (research-first split)     | T31.1 research-task (builder inspecteert live slide met TimelineWrap, logt children-structuur, rapporteert), T31.2 implementatie op basis van de bevindingen.                              | Overhead van 2 dispatches i.p.v. 1; netto LOC vergelijkbaar met A. | Geen verkeerde aannames. Nadeel: extra overhead voor wat waarschijnlijk een 1-op-1 mapping is.                                                                    | Niet nu. **Valt automatisch terug op B wanneer de Route-A-scan-exit-criterium (≥1 item terug) faalt — builder rapporteert dan in `.archive/T31-findings-<date>.md` en wacht op T31.1-dispatch.** |
| C (eigen TimelineItemEditor) | Aparte `TimelineItemEditor.vue` met `content.timelineItems: TimelineItem[]` en eigen shape (date / connector / ordering-velden).                                                           | Groter (~150+ LOC, 5+ files).                                      | Vereist concreet bewijs dat timeline een andere data-shape heeft dan card.                                                                                        | Alleen toepasbaar nadat Route A of B aantoont dat timeline-items _werkelijk_ extra velden dragen die copywriter-editable moeten zijn. Niet nu.                                                   |

**Scan + merge-strategie (Route A).**

Items uit zowel CardWrap als TimelineWrap worden geprepareerd tot `CardItem[]`-shape en in één `content.cards`-array gemerged. Dit werkt omdat:

- `CardItem` (zie `types.ts:214-230`) heeft vier velden: `cardNodeId`, `heading`, `paragraph`, `icon`, `visualHash`. Alle vier zijn neutraal genoeg om op TimelineWrap-children te matchen.
- `CardItemEditor.vue` rendert puur op `CardItem`-shape; zolang de props kloppen blijft de UI identiek. Geen titel-override in v1 ("Kaart" vs "Timeline-item") — UX-polish-task voor later als de user dit opmerkt.
- `applyCard` in `editors/content/card.ts` lokaliseert de target via `cardNodeId` en schrijft naar `Heading`/`Paragraph` text-node-namen. Dat werkt identiek op TimelineWrap-children mits die dezelfde naam-conventie dragen.

**Volgorde in `content.cards`**: CardWrap-items eerst, TimelineWrap-items daarna. Reden: een slide heeft zelden beide tegelijk; bij de zeldzame overlap behoudt de user mental-model van "Cards boven, Timeline eronder" (source-order binnen het document). De UI toont ze dan als één geünificeerde lijst met een lege header — geen extra sectie-scheiding in v1.

**Files (3, ≤60 LOC netto).**

1. **`plugins/welder-slide-editor/widget-src/slide-machine.ts`** (~+15 LOC)
   - **Strip** TimelineWrap uit `findTableWrap` (regels 209-213): alleen `n.name === 'TableWrap'` laten, `'TimelineWrap'` weghalen. Comment `// TableWrap: INSTANCE met name 'TableWrap' of 'TimelineWrap'` updaten naar exact `TableWrap`.
   - **Voeg** `findTimelineWrap(slide: InstanceNode): InstanceNode | null` toe, identiek aan `findCardWrap` maar match op `'TimelineWrap'`. Exporteer.
   - **Niet** een unified `findContentWrap(slide, names: string[])` toevoegen — 2 separate selectors is duidelijker en spec-§7.2-consistent (elke wrapper krijgt zijn eigen helper).

2. **`plugins/welder-slide-editor/widget-src/code.ts`** (~+20 LOC)
   - **Import** `findTimelineWrap` uit `slide-machine.ts` (top-imports regel 25-32).
   - **`scanContent` uitbreiden** (regels 563-586): na het `cardWrap`-loop extra block voor `timelineWrap = findTimelineWrap(slide)` → zelfde children-loop pattern als CardWrap (types `INSTANCE`|`FRAME`, `readTextByName(child, 'Heading')`, `readTextByName(child, 'Paragraph')`, `readCardIcon(child)`, `readCardVisualHash(child)`) → append aan `cards`-array.
   - **Early-return-aanpassing:** `if (cardWrap === null && timelineWrap === null) return null;` i.p.v. de huidige `if (cardWrap === null) return null;` — zodat slides zonder CardWrap maar mét TimelineWrap toch een `ContentItems` krijgen.
   - **`cardWrapId`-veld:** huidige `ContentItems`-shape heeft één `cardWrapId` (string). Bij slide-met-alleen-TimelineWrap bestaat er geen CardWrap; zet het op de TimelineWrap-id als fallback. Geen types.ts-wijziging nodig (het veld is niet semantisch strict aan "CardWrap"-id gebonden; bridge-consumers gebruiken het alleen voor relaunch-persistentie). Voeg een inline-comment toe die dit uitlegt.
   - **`applyCard`-path** blijft ongewijzigd: TimelineWrap-items worden gelokaliseerd via `cardNodeId` (findOne op slide/document), dezelfde pipeline als CardWrap-items.

3. **`plugins/welder-slide-editor/widget-src/editors/content/card.ts`** (~+5 LOC)
   - **Geen nieuwe handler** `applyTimelineItem` — de naam-heuristiek (`Heading`/`Paragraph` text-node-namen) werkt identiek op TimelineWrap-children mits Slide Machine consistent is. Bestaande `applyCard` + `applyCardVisual`-handlers hergebruiken.
   - **Alleen aanpassen als de builder tijdens verificatie ontdekt dat TimelineWrap-children _andere_ text-node-namen dragen** (bv. `Title` i.p.v. `Heading`). In dat geval: document in findings-rapport + stop + split naar T31.1. Geen on-the-fly naam-translation-layer toevoegen.

**Geen wijzigingen aan:**

- `plugin-src/ui/components/CardItemEditor.vue` (blijft identiek — rendert op `CardItem`-shape ongeacht herkomst)
- `plugin-src/ui/components/ContentPanel.vue` (blijft identiek — v-for over `content.cards`)
- `plugin-src/ui/components/GraphsPanel.vue` (wordt zelfs minder breed: geen TimelineWrap-hits meer)
- `plugin-src/ui/components/TableEditor.vue` (ongewijzigd)
- `plugin-src/types.ts` (`CardItem`- en `ContentItems`-shapes zijn reeds compatibel)
- `plugin-src/editors/table/**` (ongewijzigd)
- `bridge-messages` — `update-card` blijft de enige mutatie-route voor beide wrapper-types

**Acties (ordered).**

1. **Strip + add selector** — in `slide-machine.ts`: verwijder `|| n.name === 'TimelineWrap'` uit `findTableWrap`; voeg `findTimelineWrap` toe onder `findCardWrap`. Update relevante comments.
2. **Import + scan** — in `code.ts`: importeer `findTimelineWrap`; breid `scanContent` uit met het tweede wrapper-loop; pas early-return en `cardWrapId`-fallback aan.
3. **Smoketest Route-A-assumptie (CRITICAL).** Figma Desktop op een slide die **alleen** een TimelineWrap bevat:
   - Plugin opent → Content-tab toont ≥1 editor-sectie. Graphs-tab blijft leeg of wordt verborgen (T22-gedrag).
   - `readTextByName(child, 'Heading')` en `readTextByName(child, 'Paragraph')` leveren gevulde strings.
   - **Als dit faalt** (zero items, of lege strings voor Heading/Paragraph): **stop implementatie**, schrijf findings naar `.archive/T31-findings-<datum>.md` (log children-namen, text-node-namen, `type`-veld per descendant), rapporteer en wacht op T31.1-dispatch (Route B).
4. **Regressie-check.** Slide met CardWrap (alleen) → Content-tab werkt als voorheen. Slide met TableWrap (alleen) → Graphs-en-tabellen-tab toont TableEditor als voorheen. Slide met ChartWrap (alleen) → idem. Slide met zowel CardWrap als TimelineWrap (zeldzaam) → Content-tab toont beide in één lijst, CardWrap-items eerst.

**Exit-criteria.**

- Slide met alleen TimelineWrap: Content-tab toont per-item-editors (heading + paragraph per timeline-item). Graphs-tab toont geen orphaned TableEditor meer.
- Slide met CardWrap: Content-tab blijft identiek werken (regressie-vrij).
- Slide met alleen TableWrap: Graphs-en-tabellen-tab toont TableEditor ongewijzigd.
- Edit van een timeline-item heading in de UI → canvas-Heading-text-node update binnen debounce-window (~200ms) identiek aan card-edit.
- `npm run build` clean, geen TS-errors, `dist/code.js` blijft ES2017-compat.
- `grep -rn "TimelineWrap" plugin-src/` toont de nieuwe selector + scan-call; géén matches meer in `findTableWrap`.

**Failure-mode → T31.1 (Route B, contingency-split).**

Wordt alleen actief wanneer T31-smoketest (actie 3) aantoont dat TimelineWrap-children _niet_ Heading/Paragraph-named zijn of een fundamenteel andere shape hebben. In dat geval:

- **Deliverable T31.1:** `.archive/T31-findings-<datum>.md` met:
  - Children-lijst van TimelineWrap (naam + type per child).
  - Text-node-namen binnen één representatieve child (getroffen: `Title`? `Headline`? Iets anders?).
  - Aanwezigheid van eventuele date-/connector-velden.
  - Foto's of Figma-node-dump van één TimelineWrap-instance.
- **Scope T31.2** (implementatie op basis van findings): builder kiest op basis van findings óf een dunne naam-translation-layer in `scanContent` (Route A-variant) óf een volledig aparte `TimelineItemEditor.vue`/`content.timelineItems`-sub-sectie (Route C). Nieuwe spec-entry T31.2 wordt door architect opgesteld pas na review van T31.1 findings.

**Niet-doen (expliciet).**

- **Geen** nieuwe `TimelineItem`-type in `types.ts` in v1. `CardItem`-shape is hergebruikt.
- **Geen** TimelineWrap-specifieke mutatie-handler (`applyTimelineItem`) — `applyCard` is generiek op `cardNodeId`.
- **Geen** UX-onderscheid tussen Card- en Timeline-items in de Content-tab-lijst (geen sectie-headers, geen icon-swap). Die optie blijft open voor een toekomstige polish-task _alleen nadat_ de user aangeeft dat het lijst-design onduidelijk is.
- **Geen** aannames over ordering, date-velden, of connector-lijnen — laat dat over aan T31.1 als die nodig is.
- **Geen** wijziging aan `findTableWrap` anders dan het TimelineWrap-strippen (geen pluginData-shape-checks, geen extra predicates).

**Commit-message template.**

```
fix(welder-slide-editor): T31 — TimelineWrap routering Graphs → Content
```

---

### T31.1 — Bredere wrapper-naam-matching voor Slide Machine variant-syntax `[DONE 2026-04-24]`

**Aanleiding.** Gebruikerstest op slide met variant `Tabel=Alt Timeline` toonde "No cards on this slide." — plugin UI vond geen timeline-items. Oorzaak: `findTimelineWrap` matchte exact op de string `'TimelineWrap'`, maar de werkelijke `instance.name` op canvas is de variant-naam `'Tabel=Alt Timeline'` (Slide Machine gebruikt component-variant-syntax als instance-naam). Analoog risico bij `findTableWrap`.

**Fix (1 file, ~20 LOC).** `plugin-src/slide-machine.ts`:

- `findTimelineWrap`: matcht nu elke instance met `'Timeline'` in de naam (incl. legacy `'TimelineWrap'` en `'Tabel=Alt Timeline'`).
- `findTableWrap`: matcht legacy `'TableWrap'` plus instances waarvan naam begint met `'Tabel='` of `'Table='` zonder `'Timeline'` erin.
- ES2017-compat: `indexOf` i.p.v. `includes`/`startsWith`.

**Exit-criteria.**

1. Slide met `Tabel=Alt Timeline`-instance: Content-tab toont N timeline-item-editors.
2. Slide met `Tabel=Table Default`- of `Tabel=small`-instance: Graphs-tab toont TableEditor ongewijzigd.
3. Legacy `TimelineWrap`- en `TableWrap`-namen blijven werken (regressie-vrij).
4. `npm run build` clean.

**Commit-message template.**

```
fix(welder-slide-editor): T31.1 — broader wrapper-name-match voor TimelineWrap/TableWrap variants
```

---

### T31.2 — TimelineWrap polymorphic scan (Cards + genestede CopyWraps) `[DONE 2026-04-24]`

**Aanleiding.** Productie-slide toonde "No cards on this slide." ondanks T31 + T31.1. Layers-panel
wees uit dat TimelineWrap in productie polymorphic is:

- directe `Card`-instances (met icon + Heading + Paragraph — zelfde shape als CardWrap's Cards)
- genestede `CopyWrap`-instances binnen tussenliggende `Frame`-nodes (niet als directe children)

De scan in T31/T31.1 liep alleen `wrap.children` (directe children) en filterde op
`type === 'INSTANCE' && name === 'CopyWrap'` — Cards en genestede CopyWraps werden allebei gemist.

**Fix (3 files, ~80 LOC delta).**

1. `plugin-src/code.ts` — `scanTimelineItems` vervangen door twee helpers:
   - `extractCards(scope)`: `scope.findAll(n => n.type === 'INSTANCE' && n.name === 'Card')` — bounded tot wrapper-subtree (FIG-TRAVERSE-01). Cards gaan naar `content.cards` zodat icon-picker en visual-upload werken.
   - `extractCopyWrapItems(scope)`: `scope.findAll(n => n.type === 'INSTANCE' && n.name === 'CopyWrap')` — bounded tot wrapper-subtree. CopyWraps gaan naar `content.timelineItems`.
   - `scanContent` refactored: CardWrap gebruikt `extractCards`; TimelineWrap gebruikt beide helpers (polymorphic).
   - `update-timeline-item` handler: gebruikt nu `slide.findOne(n.id === copyWrapNodeId)` i.p.v. wrapper-scoped loop — vindt ook genestede CopyWraps.

2. `plugin-src/editors/content/card.ts` — `applyCard` en `applyCardVisual`:
   - Beide gebruiken nu `slide.findOne(n.type === 'INSTANCE' && n.name === 'Card' && n.id === id)` i.p.v. `findCardWrap + findCardById` — wrapper-agnostisch, vindt Cards in CardWrap én TimelineWrap.
   - `findCardById` helper verwijderd (obsoleet).

3. `.archive/T31-timelinewrap-structure-2026-04-24.md` — T31.2 correction-sectie toegevoegd.

**Exit-criteria.**

1. Slide met TimelineWrap die zowel Cards (direct) als CopyWraps (genest in Frames) bevat: Content-tab toont card-editors + timeline-item-editors.
2. Edit in Card-heading (binnen TimelineWrap): canvas update binnen ≤300ms.
3. Edit in timeline-item-heading: canvas update binnen ≤300ms.
4. Icon-picker werkt op Card in TimelineWrap.
5. Regressie: slide met alléén CardWrap werkt normaal.
6. Regressie: slide met alléén TableWrap blijft in Grafieken-tab.
7. `npm run build` clean.

**Commit-message template.**

```
fix(welder-slide-editor): T31.2 — TimelineWrap polymorphic scan (recursive descendant-walk + Card routing)
```

---

### T32 — Card icon-picker verbergen bij `visible === false` `[DONE 2026-04-24]`

**Aanleiding.** Als de icon-INSTANCE binnen een Card op canvas `visible === false` stond (via Figma's eye-toggle), renderde de icon-picker in `CardItemEditor.vue` nog steeds. User kon iets "bewerken" dat de kijker niet ziet.

**Fix (4 files, ~25 LOC).** Zelfde visibility-pattern als T19 (paragraph-hide) en `dc2eb2e` (badge-section-hide).

1. `plugin-src/types.ts` — `CardItem.icon` van `string` naar `string | null`. `null` = icon-instance afwezig of `visible === false`; picker verborgen in UI.

2. `plugin-src/code.ts` — `readCardIcon(card, slide): string | null` (Optie A):
   - Accepteert nu `slide: InstanceNode` voor `isEffectivelyVisible`-call.
   - Elke strategie (A/B/C) returnt `null` i.p.v. `''` wanneer geen icon gevonden.
   - Wanneer icon-instance gevonden maar niet-zichtbaar: `null`.
   - `extractCards(scope, slide)` krijgt `slide`-parameter mee; call-sites in `scanContent` bijgewerkt.

3. `plugin-src/ui/components/CardItemEditor.vue` — `v-if="modelValue.icon !== null"` op de icon-`UFormField`. `localIcon` init + watch vallen terug op `''` wanneer prop `null` is.

4. `plugin-src/ui/components/ContentPanel.vue` — `icon`-veld in `update-card`-payload wordt weggelaten wanneer `value.icon === null` (main-thread silent-skip op ontbrekend icon-veld).

**Exit-criteria.**

1. Slide met Card waar icon-INSTANCE `visible === false`: Content-tab toont NIET de icon-picker. Heading + Paragraph blijven bewerkbaar.
2. Zelfde Card icon visible → picker verschijnt met de huidige slug preselected.
3. Edit heading op Card zonder zichtbare icon werkt ongewijzigd.
4. Regressie: Card met zichtbaar icon blijft werken — slug wordt gelezen, picker rendert, click togglet.
5. `npm run build` clean.

**Commit-message template.**

```
fix(welder-slide-editor): T32 — hide Card icon-picker when icon-instance invisible
```

---

### T33 — Table appendChild-crash + findTableWrap variant-naam `[DONE 2026-04-24]`

Twee gekoppelde fixes: (1) `findTableWrap` matcht ook `Property 1=`-prefix
(Slide Machine variant-naam voor TableWrap); (2) `update-table`-fallback-
pad wraps parent-appendChild in try/catch zodat slides met TableWrap in
een Slide-INSTANCE niet crashen met `Cannot move node`. Dezelfde fix op
update-graph indien identiek bug-pad.

Lange-termijn: `replaceTableContent` herschrijven naar in-place editing
van bestaande children (geen appendChild/remove — alleen setText). Buiten
scope v0.1.x.

---

### T34 — TableWrap via Slot + TableRow/TableItem components `[ACTIVE 2026-04-24 — v0.2.0 target]`

**Supersedes eerdere T34-aanpak.** Research 2026-04-24 via Figma MCP op file
`kAZqxj4nxpafYjB5FhfOru` node `476:51929` bevestigt: TableWrap op slide-
templates wordt een **`SlotNode`** (Figma Slides `<slot>`-node-type). Slots
zijn mutable — plugins mogen `appendChild` / `remove` / `createInstance` vrij
uitvoeren binnen een Slot, ook al is de enclosing slide een Slide Machine-
INSTANCE. Dit lost de fundamentele appendChild-constraint op (T33).

Combinatie met twee nieuwe library-components (`TableRow` + `TableItem`):

- Slide Machine bezit alle styling (kleuren via library-vars, fonts, layout,
  divider-styling, textSize-variants)
- Plugin bezit het count-management (rijen/kolommen, CSV-import, validatie)
- Dynamische grid-sizes + CSV-import werken triviaal
- Theme-switch blijft uit plugin (library-variable-modes hogerop)

Zie `.archive/T34-table-research-2026-04-24.md` (v2) voor volledige research
en `.archive/T34-slide-machine-design-brief-2026-04-24.md` voor de
designer-brief aan Welder's Slide Machine-designer.

**Key-decisions (vastgelegd zonder verdere discussie).**

- **TableWrap op slides = `SlotNode`** (`name === 'TableWrap'`). Plugin
  detecteert via `slide.findOne(n => n.type === 'SLOT' && n.name === 'TableWrap')`.
- **Slide Machine levert 2 library-components:**
  - `TableRow` — FRAME-component met horizontal auto-layout + divider-styling
    via `isFirst = true | false` variant
  - `TableItem` — FRAME-component met text-node + `Size = sm | md | lg`
    variant (3 font-size-opties) + library-variable-binding voor kleuren
- **Plugin vult de Slot via `createInstance` + `appendChild`.** Geen
  rebuild-of-FRAME-logica; gebruikt library-components rechtstreeks.
- **Plugin-validatie:** `maxRows = 15`, `maxCols = { sm: 3, md: 4, lg: 6 }`.
  Error-state in UI bij overschrijding.
- **Width (sm/md/lg):** plugin-owned via `slot.setPluginData('width', …)`.
  Plugin past slot-dimensies aan bij width-keuze.
- **TextSize (sm/md/lg):** plugin-owned via `slot.setPluginData('textSize', …)`.
  Plugin zet op elke TableItem-instance `setProperties({ Size: … })`.
- **Theme-switch weg.** Kleuren via library-variables; automatische
  overerving van slide-level variable-modes.
- **Badge-cells weg (v0.2.0 out-of-scope).** Delete `editors/table/badge.ts`.
  Bestaande slides met badge-cells degraderen naar text-cells — regressie
  in CHANGELOG.
- **CSV-import behouden.** Feasible dankzij Slot-mutability. UI parseert
  CSV, valideert tegen max, emit `import-csv` message, main-thread bouwt
  N×M via createInstance + appendChild.
- **Charts expliciet out-of-scope.** Eerst tables, charts later (T35 —
  BLOCKED pending T34-verification).
- **ES2017-target blijft.** Geen `?.` / `??` / `includes` / `startsWith` in
  `code.ts`.

**Geen designer-dependency** (update post-user-clarification 2026-04-24).
De bestaande TableWrap-component met `<Slot>` volstaat. Plugin bouwt rows/cells
zelf als FRAMEs + TEXT-nodes binnen de Slot, gebruikt bestaande `Text` + `Text
Dimmer` library-variables voor kleuren. Welder-designer hoeft niks te doen.
Plugin-team draait T34.0 → T34.7 serieel.

**Sub-task budget.** Elke sub-task ≤3 files ≤200 LOC netto. Sub-tasks
T34.2 + T34.3 zijn kandidaten voor specialist-direct-dispatch
(`plugin-runtime` en `iframe-ui` respectievelijk) — narrow-scope.

#### T34.0 — Dead-code cleanup + theme/text-picker/columns-editor verwijdering `[DONE 2026-04-24]` `[S, ~200 LOC delete]`

**Files.**

- `plugins/welder-slide-editor/widget-src/editors/table/badge.ts` — delete
- `plugins/welder-slide-editor/widget-src/editors/table/lucide-icons.ts` — delete (verifieer via grep dat alleen `badge.ts` import'de)
- `plugins/welder-slide-editor/widget-src/ui/components/ThemePicker.vue` — delete als exclusief voor table-tab
- `plugins/welder-slide-editor/widget-src/ui/components/TextSizePicker.vue` — delete (nieuwe textSize-picker wordt inline in TableEditor, 3 waarden sm/md/lg)
- `plugins/welder-slide-editor/widget-src/ui/components/ColumnsEditor.vue` — delete (geen kolom-toevoegen-flow meer vanuit UI; plugin beheert via row-level +/- knoppen direct)
- `plugins/welder-slide-editor/widget-src/ui/components/TableDataEditor.vue` — delete (oude rebuild-gebonden component)
- `plugins/welder-slide-editor/widget-src/code.ts` — strip `set-variable-mode`-handler + `slide-theme`-poster als die nog theme-only zijn
- `plugins/welder-slide-editor/widget-src/table-core/` — evaluatie per bestand (constants/CSV-tokenizer mogelijk herbruikbaar; rest weg)

**Acties.**

1. Grep `ThemePicker` / `TextSizePicker` / `ColumnsEditor` / `TableDataEditor` / `lucide-icons` op usage; alles exclusief voor table → delete.
2. Strip `theme` en `textSize` fields uit oude `TableData` (T34.1 herschrijft volledig).
3. Strip `set-variable-mode` uit `UIToPluginMessage` + handler als niet door andere tabs gebruikt.
4. `table-core/csv.ts` — evalueer: CSV-parsing logic hergebruiken in T34.3? Zo ja, behoud; zo nee, delete.

**Exit.**

- Grep op `ThemePicker` / `set-variable-mode` / `lucide-icons` in `plugin-src/` is leeg.
- `npm run build` clean. TypeScript errors op call-sites van de oude renderer-functies mogen blijven — T34.2 fixt die.

---

#### T34.1 — Types refactor naar Slot-shape `[S, 1 file, ~80 LOC delta]`

**Files.**

- `plugins/welder-slide-editor/widget-src/types.ts`

**Acties.**

1. Vervang `TableData` door nieuwe shape:
   ```ts
   export interface TableWrapModel {
     slotId: string; // SlotNode-id op slide
     width: 'sm' | 'md' | 'lg'; // plugin-owned via slot.pluginData
     textSize: 'sm' | 'md' | 'lg'; // plugin-owned via slot.pluginData
     rows: TableRowModel[];
   }
   export interface TableRowModel {
     rowNodeId: string; // TableRow-INSTANCE-id binnen slot
     cells: TableCellModel[];
   }
   export interface TableCellModel {
     cellNodeId: string; // TableItem-INSTANCE-id binnen row
     value: string;
   }
   ```
2. Nieuwe bridge-messages (full-state PUT):
   ```ts
   | { type: 'update-table'; slideId: string; slotId: string; desired: TableWrapModel; }
   | { type: 'import-csv'; slideId: string; slotId: string; csv: string; }
   ```
3. Oude `TableData` blijft staan met `// @deprecated — legacy v0.1.x, behouden voor backward-read-compat (zie T34.4)`.

**Exit.**

- `TableWrapModel` + sub-types geëxporteerd, oude `TableData` gemarkeerd deprecated.
- `UIToPluginMessage` bevat `update-table` + `import-csv`.
- `npm run build` mag nog falen op call-sites — T34.2 fixt.

---

#### T34.6 — Table-constants in constants.ts `[S, 1 file, ~20 LOC]`

> **Kan parallel met T34.0 + T34.1** — geen designer-dependency meer (plugin
> bouwt zelf in de Slot, geen library-component-keys nodig).

**Files.**

- `plugins/welder-slide-editor/widget-src/constants.ts`

**Acties.**

1. Voeg constants toe:
   ```ts
   export const TABLE_WIDTHS: Record<'sm' | 'md' | 'lg', number> = { sm: 800, md: 1200, lg: 1728 };
   export const TABLE_MAX_COLS: Record<'sm' | 'md' | 'lg', number> = { sm: 3, md: 4, lg: 6 };
   export const TABLE_MAX_ROWS = 15;
   export const TABLE_TEXT_SIZES = {
     sm: { heading: 20, body: 14 },
     md: { heading: 26, body: 22 },
     lg: { heading: 32, body: 26 },
   };
   ```
2. Deze constants worden geïmporteerd in T34.2 (`renderer.ts`, voor font-size en slot-resize) en T34.3 (`TableEditor.vue`, voor UI-validation).

**Exit.**

- Constants beschikbaar voor import.
- Geen code-gebruik nog — alleen declaraties.

---

#### T34.2 — `scanTableSlot` + `applyTable` + `importCSV` in code.ts + new renderer.ts `[DONE 2026-04-24]` `[M, 2-3 files, ~250 LOC]`

**Files.**

- `plugins/welder-slide-editor/widget-src/code.ts`
- `plugins/welder-slide-editor/widget-src/editors/table/renderer.ts` (volledige rewrite)
- evt. `plugins/welder-slide-editor/widget-src/editors/table/csv.ts` (nieuwe file, of in renderer.ts)

**Acties.**

1. Nieuwe `findTableSlot(slide: SceneNode): SlotNode | null` in `slide-machine.ts` of `renderer.ts`. Traverseer via `slide.findOne`:
   ```ts
   // Zoek eerst TableWrap-INSTANCE (via Layout-nesting), dan Slot erbinnen
   const tableWrap = slide.findOne(
     (n) => n.type === 'INSTANCE' && (n.name === 'TableWrap' || n.name.indexOf('Table') >= 0),
   );
   if (tableWrap === null) return null;
   return tableWrap.findOne((n) => n.type === 'SLOT') as SlotNode | null;
   ```
2. Nieuwe `scanTableSlot(slot: SlotNode): TableWrapModel` — traverse `slot.children` (FRAMEs genaamd `TableRow-*`) → row.children (FRAMEs genaamd `TableItem-*`) → findOne TEXT → read characters. Lees `width` en `textSize` uit `slot.getPluginData`.
3. Nieuwe `applyTable(slot, desired)` — full-state-PUT met plugin-built FRAMEs (niet library-components):
   - Clear bestaande children: `for (const child of [...slot.children]) child.remove()` — allowed binnen SlotNode.
   - Preload fonts: `loadFontAsync` voor Inter Regular + Instrument Sans SemiBold (gebruikt in cellen).
   - Resolve library-vars: gebruik bestaande `loadAccentVars` + `resolveColor` uit code.ts (T28.2-pattern).
   - Voor elke row: `figma.createFrame()` → auto-layout horizontal + gap 32 + vertical padding 20. Row 2+ krijgt border-top met `Text Dimmer`-variable-binding.
   - Voor elke cell in row: `figma.createFrame()` + `figma.createText()`. Text-node krijgt font (eerste kolom = Instrument Sans SemiBold, rest = Inter Regular), fontSize uit `TABLE_TEXT_SIZES[textSize]`, fills via `setBoundVariableForPaint` op `Text`-variable.
   - `slot.appendChild(rowFrame)` per rij — allowed binnen Slot.
   - Persist via `slot.setPluginData('width', …)` + `setPluginData('textSize', …)` + kind/v migration-marker.
   - Resize slot: `slot.resize(TABLE_WIDTHS[width], slot.height)`.
4. Nieuwe `importCSV(slot, csv)` — parseer CSV (raw split of hergebruik `table-core/csv.ts` als die nog bestaat), bouw `TableWrapModel.rows` uit data, pas `TABLE_MAX_ROWS` + `TABLE_MAX_COLS[width]` truncation toe, roep `applyTable` aan.
5. `code.ts`: nieuwe handlers voor `update-table` + `import-csv`. Verwijder oude `update-table` / `replaceTableContent` / fallback-paden.
6. **Empty-state detection.** Als `findTableSlot` null → graphs-tab verbergt table-sectie (T22-pattern).

**GEEN library-component-import.** Plugin bouwt alles vrij in de Slot met `createFrame`/`createText`. Dit verwijdert de designer-dependency — zie `.archive/T34-slide-machine-design-brief-2026-04-24.md` (v2).

**Exit.**

- Grep op `appendChild` binnen `editors/table/*` is legitiem (binnen SlotNode-context, gecommentarieerd).
- Grep op `replaceTableContent` is leeg.
- `npm run build` clean.
- Rook-test: plugin detecteert Slot, scant bestaande TableRows/TableItems (als aanwezig), lijst wordt naar UI gestuurd.

---

#### T34.3 — UI rewrite `TableEditor.vue` + width/textSize/row/col-controls + CSV-paste `[DONE 2026-04-24]` `[M, 1-2 files, ~280 LOC]`

**Files.**

- `plugins/welder-slide-editor/widget-src/ui/components/TableEditor.vue` (volledige rewrite)
- evt. `plugins/welder-slide-editor/widget-src/ui/App.vue` of `GraphsPanel.vue` — alleen als mount-prop-shape verandert

**Acties.**

1. Nieuwe `TableEditor.vue`-template:
   - **Width-picker** — 3 knoppen of `USelect` voor sm/md/lg. Emit bij switch.
   - **TextSize-picker** — 3 knoppen of `USelect` voor sm/md/lg. Emit bij switch.
   - **Rows +/- controls** — knop "Voeg rij toe" (disabled bij `rows.length >= TABLE_MAX_ROWS`) + kruisje per rij om te verwijderen.
   - **Cols +/- controls per rij** — knop "Voeg kolom toe" (disabled bij `cells.length >= TABLE_MAX_COLS[width]`) + kruisje per cell.
   - **Error-state indicator** — "`N / M kolommen`" met rode kleur indien N > M.
   - **Cell-grid-edit** — `v-for` rows × `v-for` cells → `<UInput>` per cel.
   - **CSV-paste-textarea** — collapsable sectie "CSV importeren": `<UTextarea>` + "Toepassen"-knop. Bij klik: parseer local, validate (rows ≤ max, cols ≤ max per width), emit `import-csv` message óf toon error-melding.
2. Debounced emit-pattern (200-300ms) volgens `CardItemEditor.vue`-precedent (T30-fix: granulaire watches + `!== local`-guards).
3. **Géén** icon-picker, **géén** visual-upload, **géén** theme-picker.
4. Layout in outer card-container conform T35-style (`rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[...] divide-y`).

**Exit.**

- `TableEditor.vue` < 280 LOC.
- Geen imports van `ThemePicker` / oude pickers meer.
- Test-scenarios:
  - Lege slide + slot → empty-state "Tabel is leeg — voeg een rij toe".
  - Rij toevoegen → canvas toont nieuwe TableRow-instance binnen 300ms.
  - CSV plakken van 4 rijen × 3 kolommen bij width=md → canvas rebuilt naar 4×3.
  - Width wisselen naar sm met 4 kolommen → error-state (4 > max 3), apply disabled.
  - Variant-switch werkt, cell-values blijven behouden.
- `npm run build` clean.

---

#### T34.4 — Migration legacy pluginData `[DONE 2026-04-24]` `[S, 1 file, ~40 LOC]`

> Nice-to-have, niet-blokkerend voor ship.

**Files.**

- `plugins/welder-slide-editor/widget-src/editors/table/renderer.ts`

**Acties.**

1. In `scanTableSlot`: lees `slot.getPluginData('kind')` + `slot.getPluginData('v')`. Als `kind === 'welder-table'` en `v === '2'`: log "legacy pluginData detected, canvas-truth wordt gebruikt" in dev-console. Geen mapping.
2. Na elke `applyTable`: `slot.setPluginData('kind', 'welder-tablewrap')` + `slot.setPluginData('v', '3')`.
3. Optioneel: check bestaande (niet-slot) TableWrap-INSTANCEs. Als gedetecteerd: toon user-facing migration-warning in UI: "Oude tabel-format — kopieer een nieuwe tabel-slide vanuit Templates-Welder om te upgraden."

**Exit.**

- Bestaande slides met legacy `v: '2'` data openen zonder crash.
- Post-edit: slot heeft `v='3'`.
- User ziet migration-warning op non-slot TableWraps.

---

#### T34.5 — Empty-state + validation error-states `[DONE 2026-04-24]` `[part of T34.3, ~30 LOC extra]`

**Files.**

- `plugins/welder-slide-editor/widget-src/ui/components/TableEditor.vue` (dezelfde als T34.3)

**Acties.**

1. Als `model.rows.length === 0` → toon "Tabel is leeg — voeg een rij toe om te starten" met call-to-action-knop.
2. Validation-rules (runtime, in UI):
   - `rows.length > TABLE_MAX_ROWS` → error "Maximum 15 rijen"
   - Per rij: `cells.length > TABLE_MAX_COLS[width]` → error "Maximum M kolommen bij width={width}"
3. Apply-knop disabled zolang validation fails. Add-rij / add-cel knoppen disabled bij max.
4. Error-messages onder de input in `<UAlert>` of vergelijkbare Nuxt-UI-primitive.

**Exit.**

- User kan geen invalid state submitten.
- Visuele feedback bij max-overschrijding direct.

---

#### T34.7 — Release v0.2.0 `[docs only]`

**Files.**

- `CHANGELOG.md` (repo-root)
- `PLUGINS.md` (repo-root)

**Acties.**

1. CHANGELOG `v0.2.0`-entry met **BREAKING CHANGES**:
   - TableWrap-architectuur: van library-INSTANCE naar Slot + createInstance-children. Vereist Slide Machine-redesign (zie designer-brief).
   - Badge-cells verwijderd (bestaande degraderen naar text-cells).
   - Theme-picker verwijderd (library-variables regelen thema's).
   - Legacy pluginData (`v: '2'`) read-only; canvas is source-of-truth.
2. PLUGINS.md bump `welder-slide-editor` → `0.2.0`.
3. Tag-instructie voor orchestrator: `v0.2.0-welder-slide-editor`.
4. Handoff-note Charts: T35 gereserveerd, BLOCKED pending T34-verification.

**Exit.**

- CHANGELOG + PLUGINS up-to-date, orchestrator tagt release.

---

#### T34-dispatch-volgorde (aanbeveling voor builder)

**Geen designer-dependency** — plugin bouwt zelf in de Slot, geen library-components nodig. Welder-designer hoeft niks te doen.

**Plugin-team (serieel):**

1. **T34.0** — dead-code cleanup (in progress per 2026-04-24)
2. **T34.1** — types refactor
3. **T34.6** — constants (parallel met T34.1 mogelijk)
4. **T34.2** — main-thread scan + apply (`plugin-runtime`-specialist)
5. **T34.3** — UI rewrite inclusief T34.5 validation/empty-state (`iframe-ui`-specialist)
6. **T34.4** — migration (nice-to-have)
7. **T34.7** — release v0.2.0

---

### T35 — ChartWrap in-place-rewrite refactor `[BLOCKED — pending T34-verification]`

Equivalent aan T34 maar voor ChartWrap. Scope: vervang imperatieve
rebuild-architectuur door in-place edit-patroon zodra T34 in productie
geverifieerd is als stabiel. Research-task nog niet uitgeschreven — kan
pas starten als T34 shipped + door gebruiker verified (min. 1 week na
v0.2.0-release).

Voorlopige aanname: ChartWrap heeft vergelijkbare vaste structuur
(`WelderChartContent` → `Bar:<label>` → TEXT-nodes voor values/labels),
maar exacte node-naming moet via Figma MCP op productie-variants worden
bevestigd voordat T35.0-skelet wordt geschreven.

---

### T39 — Responsive table met fixed slot-height `[QUEUED — v0.2.2 target]`

**Doel.** Tabel-renderer wordt slot-driven in vertical-axis: container HUG
verdwijnt, container FILLs de slot-hoogte, rows FILL de container-hoogte
en delen 'm gelijk. fontSize wordt afgeleid uit `rows.length` via een
lookup-matrix — geen user-pick `textSize` meer. Effect: smalle table-slot
met 8 rijen → kleine fontSize + krappe rows; ruime slot met 3 rijen →
grote fontSize + ademende rows. Verschillende slots op verschillende
slide-templates leveren vanzelf verschillende table-hoogtes.

**Hoogte-bron — Route 1 (Slot dicteert).** Container krijgt
`layoutSizingVertical='FILL'` van de slot. Slot zelf wordt verondersteld
FIXED-height te zijn binnen het Welder Slide-template. Verschillende slots →
verschillende table-hoogtes vanzelf. Geen user-control over hoogte; geen
HUG-fallback in v1.

**Key-decisions (vastgelegd door user 2026-04-25, geen verdere discussie).**

- Container `primaryAxisSizingMode = 'FIXED'` (was `AUTO`).
- Container `layoutSizingVertical = 'FILL'` na `slot.appendChild(container)`.
- Rows `layoutSizingVertical = 'FILL'` na `container.appendChild(rowFrame)` —
  delen container-hoogte gelijk via auto-layout-FILL-distributie.
- fontSize via matrix-lookup, gevoed door `desired.rows.length` (rowCount).
  Geen sm/md/lg-pick meer.
- `textSize`-veld uit `TableWrapModel` weg. Plugin-data `textSize` wordt
  voortaan genegeerd op scan (read negeert; write overschrijft niet
  expliciet). Geen migration-storm — legacy slides blijven werken zonder
  data-loss.
- Silent-fallback wanneer `slot.height === 0` of FILL-call faalt: log +
  skip, consistent met T37/T38-pattern.
- ES2017-target blijft. Geen `?.` / `??` in `code.ts` / `renderer.ts`.

**Sub-task budget.** Elke sub-task ≤3 files ≤200 LOC netto. T39.1 + T39.2
zijn kandidaten voor specialist-direct-dispatch (`plugin-runtime` en
`iframe-ui` respectievelijk).

#### T39.0 — Pre-flight verification slot-height-shape `[DONE 2026-04-25]` `[S, research-only]`

**Scope.** Per user-keuze (orchestrate-sessie 2026-04-25): 1-template-sample,
geen 2-3-template-spread. Snelheid > spread; risico afgedekt door T39.1
silent-fallback bij `slot.height === 0` of FILL-call-failure.

##### T39.0 — Pre-flight bevindingen 2026-04-25

**Bron 1 — T34-archive.** [`.archive/T34-table-research-2026-04-24.md`](./.archive/T34-table-research-2026-04-24.md)
§2.1: SlotNode `476:51929` heeft `width="1760" height="1161"` met type `'SLOT'`,
`.children` mutable, geen "inside an instance"-constraint. Resize via `slot.resize(...)`
werkt (huidige renderer regel 307 doet dit succesvol).

**Bron 2 — live MCP-check 2026-04-25 (template-slot).** `get_metadata(476:51929)`
op file `kAZqxj4nxpafYjB5FhfOru` retourneert identieke dimensies:

```xml
<slot id="476:51929" name="Slot" x="0" y="0" width="1760" height="1161" />
```

Dimensies stable over een dag; geen content-driven HUG-grow zichtbaar
(slot zou anders veranderen wanneer plugin children added/removed).

**Bron 3 — live MCP-check 2026-04-25 (productie-slide met data).**
`get_metadata(277:2823)` op zelfde file — een Slide-INSTANCE die de plugin
al gebruikt heeft (6 plugin-gebouwde rijen aanwezig):

```
Slide 277:2823          1920×1080
  TableWrap 0:14          1728×678   ← INSTANCE, FIXED
    Slot 0:15             1728×678   ← inherits INSTANCE-FIXED
      WelderTableContent  1728×522   ← HUG-vertical (huidige bug)
        TableRow-0..5     1664×79    ← HUG, 6 rijen × 79 = 474 + 48 pad = 522
```

**Belangrijkste observaties:**

1. TableWrap-INSTANCE is FIXED (1728×678) op zowel breedte als hoogte —
   confirmt dat slot-hoogte niet content-driven is maar template-vastgelegd.
2. Slot erft FIXED van TableWrap-INSTANCE (zelfde 678 height).
3. **Huidige container WelderTableContent is HUG-vertical** (522px) — laat
   `678 - 522 = 156px whitespace` onbenut onderaan de slot. Dit is precies
   de bug die T39.1 fixt.
4. Met T39.1 (rows FILL): 6 rijen delen `678 - 2×24 padding = 630px` → 105px
   per rij. Bij rowCount=6 levert font-matrix `{ heading: 26, body: 20 }`,
   tekst-blokken passen comfortabel binnen 105px-rij.

**Bron 3 — bestaand-renderer-bewijs.** [renderer.ts:306-308](./plugin-src/editors/table/renderer.ts:306)
doet `slot.resize(desiredWidth, slot.height)` zonder fout in v0.2.1. Slot
accepteert resize-calls, dus is niet HUG-from-content.

\*\*Verdict — GO Route 1 (T39.1 unblocked) — bevestigd op 2 samples (template

- productie-slide).\*\*

**Onderbouwing.**

1. Slot heeft expliciete pixel-dimensies in beide samples (1760×1161 in
   template, 1728×678 in productie-slide) — wijzend op FIXED-sizing van
   parent-component.
2. TableWrap-INSTANCE is FIXED in productie-slide (1728×678) — bevestigt dat
   slot-hoogte uit het slide-template komt, niet uit content.
3. Slot accepteert reeds `slot.resize(...)` in productie-renderer — geen
   parent-locked-state geobserveerd.
4. Mutability-claim T34-research bevestigd in v0.2.0 release: gebruiker
   verifieerde tabel-rebuilds in echte slides, geen "Cannot move node"-crashes.
5. **Bug-bewijs in productie**: huidige container HUG-vertical laat 156px
   whitespace ongebruikt — exact wat T39 oplost.

**Resterende risico's (afgedekt door T39.1 silent-fallback).**

- ⚠️ Andere templates dan `kAZqxj4nxpafYjB5FhfOru/476:51929` zijn niet
  gesampled. Welder-designer kan in toekomst nieuwe TableWrap-variants
  toevoegen met HUG-slots. Mitigatie: T39.1 wraps `container.layoutSizingVertical = 'FILL'`
  in try/catch + log; failed FILL → container blijft default (AUTO of FIXED met
  origin-height), rows wraps eveneens — visueel afwijkend maar geen crash.
- ⚠️ Als `slot.height === 0` (mogelijk wanneer slot net is aangemaakt en nog
  geen layout-pass had), FILL produceert ongeldige geometry. Mitigatie: T39.1
  pre-check `if (slot.height > 0) { try FILL }`.

**Plan B/C niet uitgewerkt.** Niet nodig — verdict GO. Als toekomstige bug-reports
HUG-slots aan het licht brengen, openen we T40-fallback in dezelfde spec-locatie.

---

#### T39.1 — Renderer rewrite: slot-FILL container + matrix-fontSize `[QUEUED]` `[M, 1 file, ~40-60 LOC delta]`

**Prerequisites.**

- T39.0 verdict = GO Route 1 (slots zijn FIXED-height in template).
- T39.2 NIET nodig vooraf — `desired.textSize` mag in renderer veilig
  genegeerd worden zelfs als de UI hem nog meestuurt.

**Files.**

- `plugins/welder-slide-editor/widget-src/editors/table/renderer.ts` (rewrite-zone:
  container-config rond regel 138-139 + buildRow rond 218-247 + buildCell
  rond 175-197 + apply-pad rond 310-330)
- (geen andere files raken aan in T39.1)

**Acties.**

1. Container-init (huidige regel 138-139):
   ```ts
   container.primaryAxisSizingMode = 'FIXED'; // was 'AUTO'
   container.counterAxisSizingMode = 'FIXED'; // ongewijzigd
   ```
2. Na `slot.appendChild(container)` in apply-pad (rond regel 310-320):
   ```ts
   try {
     container.layoutSizingVertical = 'FILL';
   } catch (_e) {
     /* silent */
   }
   try {
     container.layoutSizingHorizontal = 'FILL';
   } catch (_e) {
     /* silent */
   }
   // Slot-dicteert: container neemt slot.height over.
   ```
3. Rows na `container.appendChild(rowFrame)` (rond regel 328-330):
   ```ts
   try {
     rowFrame.layoutSizingHorizontal = 'FILL';
   } catch (_e) {
     /* silent */
   }
   try {
     rowFrame.layoutSizingVertical = 'FILL';
   } catch (_e) {
     /* silent */
   }
   // Was 'HUG' — rows delen container-hoogte gelijk.
   ```
4. Nieuwe helper `getFontSizes(rowCount: number): { heading: number; body: number }`
   in renderer.ts of `editors/table/font-matrix.ts`. Implementatie:
   ```ts
   // T39 lookup-matrix — verbatim per spec
   //   2     → { heading: 40, body: 32 }
   //   3     → { heading: 36, body: 28 }
   //   4     → { heading: 32, body: 24 }
   //   5     → { heading: 28, body: 22 }
   //   6     → { heading: 26, body: 20 }
   //   7     → { heading: 22, body: 18 }
   //   8     → { heading: 20, body: 16 }
   //   9-10  → { heading: 18, body: 14 }
   //   11-15 → { heading: 16, body: 12 }
   ```
   Onder 2 → gebruik 2-row preset. Boven 15 → cap op 15-row preset
   (consistent met `TABLE_MAX_ROWS`).
5. `buildCell` neemt geen `textSize`-parameter meer — calls krijgen
   `sizes` via parameter (parent geeft het door, parent leest het uit
   matrix). Of: `buildCell` accepteert `(t: TextNode, sizes: {heading,body}, isFirst: boolean)`.
6. `buildRow`-signature: drop `textSize`-param, accepteer `sizes` of leid
   het in `buildRow` zelf af (laat builder kiezen op basis van helper-LOC).
7. Apply-pad: `desired.textSize` wordt **niet meer gelezen**. Verwijder de
   `textSize`-parameter-doorgifte naar `buildRow` / `buildCell`.
8. **Silent-fallback uitbreiden.** Wrap de container-FILL-call in
   try/catch (al gedaan voor child-FILLs). Als `slot.height === 0` na
   appendChild: log `console.warn('[table] slot.height=0, skipping FILL')`
   en val terug op AUTO+HUG (oude gedrag) — voorkomt zero-height table
   in misconfigured slots.
9. Persist gedrag: `slot.setPluginData('textSize', …)` wordt **niet meer
   aangeroepen**. Bestaande pluginData blijft staan op canvas, plugin
   negeert hem op read (T39.2 strip de `textSize`-veld-read uit `scanTableSlot`).

**Exit.**

- `npm run build` clean.
- Rook-test: tabel met 3 rijen in slot van 600px → grote font, ademende
  rows. Zelfde tabel, slot-height geforceerd naar 300px → kleinere rows
  (FILL distributeert), fontSize blijft op 3-row preset.
- Tabel met 10 rijen in slot van 1100px → fontSize valt op 9-10-preset
  (heading 18, body 14), rows krap maar leesbaar.
- Zero-height-slot → silent-skip, geen crash, logging zichtbaar in console.
- `desired.textSize` in payload heeft geen visueel effect meer (renderer
  negeert hem).

---

#### T39.2 — UI/types/constants cleanup: textSize-veld + TABLE_TEXT_SIZES weg `[QUEUED]` `[M, 5 files, ~60 LOC netto delete]`

**Update (T39.1.1, 2026-04-25).** T39.1 had matrix-fontSize uit `rowCount` als
constant, maar de hotfix T39.1.1 ging formula-based: `getFontSizes(slotHeight, rowCount)`
berekent fontSize via 0.36/0.30-ratios met clamps. **Geen `TABLE_FONT_SIZE_MATRIX`-
constant nodig** — deze sub-task is daarom puur een DELETE-pass: textSize-veld weg
uit types, picker weg uit UI, oude `TABLE_TEXT_SIZES`-constant weg, scan/csv
opgeschoond.

**Prerequisites.**

- T39.1.1 in productie geverifieerd (renderer doet niks meer met `textSize`).
- Mag parallel met T39.1 ontwikkeld worden, maar **niet eerder gemerged** —
  anders breekt UI tijdens transitie.

**Files.**

- `plugins/welder-slide-editor/widget-src/types.ts` (verwijder
  `textSize: 'sm' | 'md' | 'lg';` uit `TableWrapModel`)
- `plugins/welder-slide-editor/widget-src/ui/components/TableEditor.vue`
  (regel 236-245: verwijder `<UFormField name="table-text-size">`-blok +
  bijbehorende `localTextSize`-state, watcher, change-handler)
- `plugins/welder-slide-editor/widget-src/constants.ts` (regel 316-328:
  vervang `TABLE_TEXT_SIZES` door `TABLE_FONT_SIZE_MATRIX`)
- `plugins/welder-slide-editor/widget-src/editors/table/renderer.ts`
  (helpers `buildCell`/`buildRow` updaten om matrix-lookup te gebruiken
  i.p.v. parameter — als T39.1 dit niet al deed; check eindstaat T39.1)

**Acties.**

1. **`constants.ts`** — verwijder `TABLE_TEXT_SIZES`, voeg toe:
   ```ts
   /**
    * T39 — fontSize-lookup per rowCount.
    * Heading = kolom-0 (label-kolom, Instrument Sans SemiBold).
    * Body = overige kolommen (Inter Regular).
    * rowCount < 2 → val terug op preset[2]. rowCount > 15 → cap op preset[15].
    */
   export const TABLE_FONT_SIZE_MATRIX: Record<number, { heading: number; body: number }> = {
     2: { heading: 40, body: 32 },
     3: { heading: 36, body: 28 },
     4: { heading: 32, body: 24 },
     5: { heading: 28, body: 22 },
     6: { heading: 26, body: 20 },
     7: { heading: 22, body: 18 },
     8: { heading: 20, body: 16 },
     9: { heading: 18, body: 14 },
     10: { heading: 18, body: 14 },
     11: { heading: 16, body: 12 },
     12: { heading: 16, body: 12 },
     13: { heading: 16, body: 12 },
     14: { heading: 16, body: 12 },
     15: { heading: 16, body: 12 },
   };
   ```
2. **`types.ts`** — strip `textSize` uit `TableWrapModel`:
   ```ts
   export interface TableWrapModel {
     slotId: string;
     width: 'sm' | 'md' | 'lg';
     // textSize: weg per T39 — fontSize wordt afgeleid uit rows.length
     rows: TableRowModel[];
   }
   ```
   Bridge-message-types ongewijzigd (`update-table { desired: TableWrapModel }`
   neemt automatisch de nieuwe shape over).
3. **`TableEditor.vue`** — verwijder de TextSize-picker-sectie + alle
   gerelateerde reactive-state (`localTextSize`, watch, handler die
   debounced emit). De `<UFormField name="table-text-size">` rond regel
   236-245 + de bijbehorende `<USelect>` of segmented-control gaat in zijn
   geheel weg. Spacing in `divide-y`-stack hercompileert vanzelf.
4. **`renderer.ts`** — als T39.1 nog parameter-based was, refactor `buildCell`/`buildRow`
   om `TABLE_FONT_SIZE_MATRIX[rowCount]` direct te lezen. Helper-fn:
   ```ts
   function getFontSizes(rowCount: number): { heading: number; body: number } {
     if (rowCount < 2) return TABLE_FONT_SIZE_MATRIX[2];
     if (rowCount > 15) return TABLE_FONT_SIZE_MATRIX[15];
     return TABLE_FONT_SIZE_MATRIX[rowCount];
   }
   ```
5. **Backwards-compat check.** Legacy slides met `slot.getPluginData('textSize')`-
   waarde laten dat veld gewoon staan op canvas — `scanTableSlot` leest het
   niet meer (geen `textSize`-property in `TableWrapModel`). Geen
   delete-call op pluginData ("write overschrijft niet expliciet").

**Exit.**

- `npm run build` clean. Geen TypeScript-errors over ontbrekende `textSize`-veld.
- Grep `textSize` in `plugin-src/` is leeg behalve in renderer-comments
  ("`textSize` weg per T39") en eventueel scan-helper waar `getPluginData('textSize')`
  als legacy-no-op wordt overgeslagen.
- TableEditor.vue mist de TextSize-picker. Width-picker + rows/cols-controls
  blijven.
- Open een tabel die in v0.2.1 was opgeslagen met `textSize='lg'` → opent
  zonder error, fontSize wordt nu uit rowCount-matrix bepaald, oude
  pluginData blijft op canvas (geen data-loss).

---

#### T39-dispatch-volgorde

1. **T39.0** (architect, research-only) — verifieer slot-height-shape, kies route.
2. **T39.1** (`plugin-runtime`-specialist) — renderer rewrite incl. matrix-helper.
3. **T39.2** (`iframe-ui`-specialist of `builder`) — types/UI/constants cleanup.
4. CHANGELOG-bump v0.2.2 + PLUGINS-bump (orchestrator).

---

### T40 — Column-header optie voor TableWrap `[QUEUED — v0.2.4 target]`

**Doel.** Optionele "Eerste rij is kolomkop"-toggle waarmee rij 0 een aparte
visual treatment krijgt (compacte hoogte, gecentreerde tekst, dimmer-color,
divider eronder). Lost designer-request op om tabellen met kolom-labels te
ondersteunen, zoals een journey-table met Besef/Ontdekking/Selectie/etc.
kolommen.

**Key-decisions (vastgelegd door user 2026-04-26).**

- **Hoogte** (Route B): header rij = HUG-vertical (compact, content-driven),
  body rijen = FILL-vertical en delen het restant van de container-hoogte.
- **Header-styling** (volledig screenshot-getrouw):
  - Font: Instrument Sans SemiBold (al geladen voor col-0)
  - Size: kleiner dan body (vast 16px, of 0.6× body als clamp het toelaat)
  - Color: bound aan `Text Dimmer` library-variable (lichtere variant)
  - Alignment: `textAlignHorizontal = 'CENTER'` + cell `primaryAxisAlignItems = 'CENTER'`
  - Divider: 1px bottom-border bound aan `Text Dimmer`
- **Corner-cell** (rij 0, kolom 0): header-styling overschrijft de col-0-
  label-styling. Volledig consistent — rij 0 = volledig header.
- **Default**: `hasColumnHeader = false` (backward-compat — bestaande tabellen
  blijven onveranderd).
- **Persist**: `slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0')`.
- **getFontSizes**-impact: bij `hasColumnHeader=true` is body-availability
  `slot.height - 48 - estimatedHeaderHeight (~50px)` en `bodyRowCount = rowCount - 1`.

**Sub-tasks.**

- T40.1 spec write-up (deze sectie) — orchestrator inline
- T40.2 types.ts veld + csv.ts pluginData-read — orchestrator inline (~10 LOC)
- T40.3 renderer.ts (plugin-runtime, ~50 LOC) — header-row branch in apply,
  scanTableSlot leest pluginData, persist on apply, getFontSizes adjust
- T40.4 TableEditor.vue (iframe-ui, ~20 LOC) — toggle/switch onder breedte-picker

### T46 — JourneyWrap kolom-headers boven pills `[QUEUED — v0.3.x target]`

**Doel.** Boven de bestaande JourneyWrap-pills (T45.5–T45.14, stabiel) een
tabelkop-achtige header-sectie renderen: 4-7 kolommen, elk met een
`header` (groot, theme-color, gecentreerd), een `subheader` (klein,
theme-color, gecentreerd) en een `body` (medium-bold, theme-color,
links uitgelijnd). Verticale dividers tussen kolommen lopen door tot
onderlangs de pills (visueel grid). Tussen subheader-row en body-row
één horizontale divider. Pills blijven na deze header-sectie verschijnen
en behouden hun continue percentage-positionering — pills snappen NIET
op de kolom-grid.

**Use case.** Customer-journey-slides waar de user de fasen ("Besef",
"Ontdekking", …) als kolom-labels wil aanduiden met een one-liner
("Aargh, ik heb een probleem!"), en daaronder vrij gepositioneerde
pills voor concrete touchpoints. De header is structuur, de pills zijn
events op een tijdlijn.

**Key-decisions (vastgelegd door user 2026-04-26).**

- **Aantal kolommen:** configureerbaar 4-7, default 6.
  Geen hard-coded 6 — user kan in de editor aantal aanpassen.
- **Implementatie:** zelfde aanpak als TableWrap — from-scratch FRAMEs
  - TEXT-nodes binnen de Slot (geen library-component zoals JourneyItem).
    Reden: header-cells hebben simpele structuur, library-component zou
    bootstrap-overhead toevoegen zonder visuele winst.
- **3 velden per kolom:** `header` / `subheader` / `body`, allemaal in
  theme-color (NIET gray). Sluit aan bij user-canvas-design.
- **Pills blijven vrij:** continue start/end percentages, geen
  column-snapping. Header is decoratie, geen positioneringsgrid.
- **Verticale dividers:** dunne RECT-lines, full-height (header + pills),
  achter alles getekend (z-order eerst). Geen strokes op cells —
  cells krijgen geen verticale separators.
- **Horizontale divider:** 1 lijn tussen subheader-row en body-row,
  full-width binnen de container.
- **Backward-compat:** bestaande JourneyWraps (pluginData `v=6`) hebben
  geen columns; scan defaultet naar 6 lege kolommen. pluginData bumpt
  naar `v=7`.

**Layout (concept-schets).**

```
┌──────────────────────────────────────────────────────────────────┐
│ [Besef]    │ [Ontdekking] │ [Selectie]  │ [Aankoop]   │ [Loyaliteit]│
│ [Prospect] │ [Onderzoek]  │ [Afweging]  │ [Conversie] │ [Retentie] │
├────────────┼──────────────┼─────────────┼─────────────┼────────────┤
│ Aargh, ik  │ Hmm, wie     │ Welke past  │ Hoera,      │ Ik blijf!  │
│ heb een    │ kan helpen?  │ bij mij?    │ nu nog      │            │
│ probleem!  │              │             │ snel.       │            │
├────────────┼──────────────┼─────────────┼─────────────┼────────────┤
│   ▓▓▓▓▓▓ pill 1 ▓▓▓▓▓▓                                            │
│             ▓▓▓▓▓▓▓▓▓ pill 2 ▓▓▓▓▓▓▓▓                              │
│                              ▓▓▓▓▓▓▓▓ pill 3 ▓▓▓▓▓▓▓▓             │
└──────────────────────────────────────────────────────────────────┘
```

Verticale dividers spannen over header + pill-area. Horizontale divider
alleen onder de subheader-row (niet onder body, niet boven pills).

**A. Data-model wijzigingen (`plugin-src/types.ts`).**

```ts
/**
 * Eén kolom-header binnen een JourneyWrap (T46).
 * Drie tekstvelden, allemaal optioneel ingevuld.
 */
export interface JourneyColumnModel {
  header: string;
  subheader: string;
  body: string;
}

export interface JourneyWrapModel {
  slotId: string;
  /**
   * T46 — kolom-headers boven de pills (4-7 kolommen, default 6).
   * Backward-compat: scan defaultet naar 6 lege kolommen wanneer
   * pluginData v < 7 is (geen header-FRAME aanwezig).
   */
  columns: JourneyColumnModel[];
  items: JourneyItemModel[];
}
```

Geen breaking change op `JourneyItemModel`; pills-veld blijft ongewijzigd.

**B. Constants (`plugin-src/constants.ts`).**

```ts
/** Min/max aantal kolomheaders (T46). */
export const JOURNEY_MIN_COLUMNS = 4;
export const JOURNEY_MAX_COLUMNS = 7;
export const JOURNEY_DEFAULT_COLUMN_COUNT = 6;

/** Default kolom (gebruikt door UI bij "+ Kolom toevoegen" en backward-compat default). */
export const JOURNEY_DEFAULT_COLUMN: { header: string; subheader: string; body: string } = {
  header: '',
  subheader: '',
  body: '',
};

/**
 * Geschatte vaste hoogte (pixels) voor de hele header-sectie:
 * header-row + subheader-row + horizontal-divider + body-row + paddings.
 * Wordt door applyJourney gebruikt om container-hoogte te berekenen
 * (JOURNEY_HEADER_HEIGHT + N_pills × PILL_HEIGHT + paddings + gaps).
 */
export const JOURNEY_HEADER_HEIGHT = 220;

/** Font-sizes voor de drie header-velden (Figma-pixels). */
export const JOURNEY_HEADER_FONT_PX = 32; // Header (groot)
export const JOURNEY_SUBHEADER_FONT_PX = 20; // Subheader (klein)
export const JOURNEY_BODY_FONT_PX = 24; // Body (medium-bold)

/** Divider-line-thickness voor verticale + horizontale dividers (pixels). */
export const JOURNEY_DIVIDER_WEIGHT = 1;
```

Bestaande `JOURNEY_*` constants (WIDTH/PADDING/POS\_\*) blijven ongewijzigd.

**C. Renderer (`plugin-src/editors/journey/renderer.ts`).**

Public API ongewijzigd (`scanJourneySlot` + `applyJourney`); intern komt
er een nieuwe header-render-fase bij.

1. **Container-hoogte herberekening.**

   ```
   containerH = JOURNEY_HEADER_HEIGHT
              + JOURNEY_CONTAINER_PADDING * 2
              + items.length * PILL_HEIGHT
              + (items.length > 1 ? (items.length - 1) * PILL_GAP : 0);
   ```

2. **Nieuwe helper `renderJourneyHeader(container, columns, contentWidth, theme)`.**
   Bouwt N column-cells via from-scratch FRAMEs met 3 TEXT-nodes elk
   (header, subheader, body). Cell-naming voor scan: `JourneyHeaderCell-{i}`
   met child-FRAMEs `JourneyHeader-h`, `JourneyHeader-sub`, `JourneyHeader-body`.
   Layout per cell: `VERTICAL` auto-layout, header + subheader gecentreerd
   (`textAlignHorizontal='CENTER'`), body links (`'LEFT'`).
   Text-fills bound aan `Text` library-variable (theme-color).

3. **Vertical column-dividers.**
   Render N-1 thin RECT-lines met `width = JOURNEY_DIVIDER_WEIGHT`,
   `height = container-height - 2 × JOURNEY_CONTAINER_PADDING`,
   x = `JOURNEY_CONTAINER_PADDING + (col_index / N) × contentWidth`,
   y = `JOURNEY_CONTAINER_PADDING`. **Eerst** appended (z-order
   onderlaag — pills tekenen daarbovenop). Fill bound aan `Text Dimmer`.

4. **Horizontal divider.**
   Eén RECT-line tussen subheader-row en body-row binnen de header-sectie.
   `width = contentWidth`, `height = JOURNEY_DIVIDER_WEIGHT`. Y-positie =
   `header-row-height + subheader-row-height + paddings`. Fill bound aan
   `Text Dimmer`.

5. **Pill-positionering shift.**
   `pillY = JOURNEY_CONTAINER_PADDING + JOURNEY_HEADER_HEIGHT + index × (PILL_HEIGHT + PILL_GAP)`.
   X-formule (`startPct/100 × contentWidth + JOURNEY_CONTAINER_PADDING`)
   blijft gelijk.

6. **pluginData-bump.** `slot.setPluginData('v', '7');` (was `'6'`).
   Persist column-content via FRAME-naming (geen pluginData per cell —
   text-content lezen via TextNode-characters, zoals header-cells in
   TableWrap).

7. **Diff-based update voor columns** (mirror T45.13 voor pills).
   Hergebruik bestaande `WelderJourneyHeader`-FRAME en cells per index;
   alleen veranderde text-content schrijven. Resize alleen als kolom-
   aantal of contentWidth gewijzigd.

8. **Backward-compat.** Wanneer `desired.columns` leeg is (eerste apply
   na scan-default), render alsnog 6 lege cells — UI laat de user dan
   de cells invullen.

**D. Scan (`scanJourneySlot` in `editors/journey/renderer.ts`).**

1. Zoek naar `WelderJourneyHeader`-FRAME als sibling van bestaande
   `WelderJourneyContent` binnen de Slot.
2. Per cell `JourneyHeaderCell-{i}`: lees text-content uit child-FRAMEs
   met namen `JourneyHeader-h`, `JourneyHeader-sub`, `JourneyHeader-body`
   → `JourneyColumnModel { header, subheader, body }`.
3. **Backward-compat:** geen `WelderJourneyHeader`-FRAME aanwezig
   (oude v=6 slides) → return `columns = Array(JOURNEY_DEFAULT_COLUMN_COUNT).fill({...JOURNEY_DEFAULT_COLUMN})`.
4. Pluginata `v` lezen voor diagnostiek (log "T46 legacy v=6 detected"
   wanneer geen header-FRAME, vergelijkbaar met T34.4 legacy-detection).

**E. UI (`plugin-src/ui/components/JourneyEditor.vue`).**

Nieuwe sectie `<section>` BOVEN de bestaande "Items"-sectie binnen
hetzelfde rounded-card. Pattern mirror van bestaande Items-sectie:

```
┌─ Kolommen          {{ localColumns.length }} / {{ JOURNEY_MAX_COLUMNS }} ┐
│  [empty-state OF cards-stack]                                            │
│  - Per kolom: Card met "Kolom {{ idx+1 }}" header + X-knop                │
│    Body: 3 UInput's (header / subheader / body), placeholders + sm-size   │
│  + Kolom toevoegen-button (block, disabled bij MAX)                      │
└──────────────────────────────────────────────────────────────────────────┘

──── divider ────

┌─ Items (bestaand)                                ┐
│ ...                                              │
└──────────────────────────────────────────────────┘
```

State-pattern (mirror van localItems):

```ts
const localColumns = ref<JourneyColumnModel[]>(cloneColumns(props.modelValue.columns));
const canAddColumn = computed(() => localColumns.value.length < JOURNEY_MAX_COLUMNS);
const canRemoveColumn = computed(() => localColumns.value.length > JOURNEY_MIN_COLUMNS);

function cloneColumns(cols: JourneyColumnModel[]): JourneyColumnModel[] {
  // identiek pattern als cloneItems
}

function columnsDiffer(a: JourneyColumnModel[], b: JourneyColumnModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].header !== b[i].header) return true;
    if (a[i].subheader !== b[i].subheader) return true;
    if (a[i].body !== b[i].body) return true;
  }
  return false;
}
```

Granulaire watch op `props.modelValue.columns` met `columnsDiffer`-guard,
debounced emit gedeeld met items-emit (200ms). UI emitteert volledig
`JourneyWrapModel` inclusief `columns` + `items`.

Min-cap (4): X-knop disabled wanneer `localColumns.length === JOURNEY_MIN_COLUMNS`.
Max-cap (7): "+ Kolom toevoegen"-button disabled wanneer
`localColumns.length === JOURNEY_MAX_COLUMNS`.

**Sub-task breakdown.**

Per CLAUDE.md "Tasks must be small": ≤3 files, ≤200 LOC, één concept,
zo onafhankelijk mogelijk.

#### T46.1 — Data-model + constants `[S, 2 files, ~50 LOC]`

**Files.** `plugin-src/types.ts`, `plugin-src/constants.ts`.

**Changes.**

- types.ts: `JourneyColumnModel` interface + `columns` veld op
  `JourneyWrapModel`.
- constants.ts: `JOURNEY_MIN_COLUMNS`, `JOURNEY_MAX_COLUMNS`,
  `JOURNEY_DEFAULT_COLUMN_COUNT`, `JOURNEY_DEFAULT_COLUMN`,
  `JOURNEY_HEADER_HEIGHT`, `JOURNEY_HEADER_FONT_PX`,
  `JOURNEY_SUBHEADER_FONT_PX`, `JOURNEY_BODY_FONT_PX`,
  `JOURNEY_DIVIDER_WEIGHT`.

**Exit criterion.** `npm run build` slaagt; `tsc` typing-check zonder
errors. Geen runtime-impact (renderer leest `columns` nog niet).

**Dispatch.** Direct → `plugin-runtime` (single concern, 2 files,
geen UI). Of `builder` als specialist niet beschikbaar.

#### T46.2 — Scan-helper voor columns (backward-compat) `[S, 1 file, ~50 LOC]`

**Files.** `plugin-src/editors/journey/renderer.ts` (alleen `scanJourneySlot` aanpassen).

**Changes.**

- Voeg helper `scanJourneyHeaderColumns(slot)` toe die naar
  `WelderJourneyHeader`-FRAME zoekt en cells inleest.
- Backward-compat: geen FRAME → return 6 lege kolommen.
- `scanJourneySlot` returnt nu `JourneyWrapModel` mét `columns`.
- Geen render-aanpassing in deze sub-task — applyJourney negeert
  `desired.columns` nog (volgende sub-task).

**Exit criterion.** Bestaande slides scannen zonder error; `columns`
in scan-output bevat 6 lege entries; `npm run build` + tsc groen.
Manuele check: re-open een v=6 slide → JourneyEditor krijgt 6 lege
kolommen in de UI (na T46.4) of in console-log.

**Dispatch.** Direct → `plugin-runtime` (renderer-only, narrow change).

#### T46.3 — Renderer: header-render + dividers + pluginData v=7 `[L, 1 file, ~180 LOC]`

**Files.** `plugin-src/editors/journey/renderer.ts` (alleen `applyJourney`

- nieuwe helpers).

**Changes.**

- Nieuwe helper `renderJourneyHeader(container, columns, contentWidth, theme)`.
- Nieuwe helper `renderColumnDividers(container, columnCount, contentWidth, contentHeight)`.
- Nieuwe helper `renderHorizontalDivider(container, contentWidth, yPos)`.
- `applyJourney` aangepast:
  - container-hoogte = `JOURNEY_HEADER_HEIGHT + paddings + N_pills × (PILL_HEIGHT + PILL_GAP)`
  - eerst: vertical-dividers (z-onderlaag)
  - daarna: header-sectie (3 rows × N cells)
  - daarna: horizontal divider tussen subheader + body
  - tot slot: pills met `pillY += JOURNEY_HEADER_HEIGHT`
- pluginData bump: `slot.setPluginData('v', '7')`.
- Diff-based update voor columns (hergebruik `WelderJourneyHeader`-FRAME).
- Theme-binding: header-fills via `loadAccentVars` + `setBoundVariableForPaint`
  (mirror TableWrap).

**Exit criterion.** v=6 slide opnieuw applyJourney'd → renderer plaatst 6
lege header-cells boven de pills, dividers zichtbaar; pills behouden
correcte y-positie (verschoven met JOURNEY_HEADER_HEIGHT). `npm run
build` + tsc groen.

**Risico-noot.** Dit is de "L"-task — splits in T46.3a (header-render

- dividers) en T46.3b (apply-integration + pluginData-bump) als de
  schatting tijdens dispatch hoger uitvalt dan 180 LOC. Splitspunt:
  helpers in eigen bestand `editors/journey/header-renderer.ts`,
  applyJourney importeert ze.

**Dispatch.** `builder` (Opus). Cross-cutting genoeg voor full builder-
loop met validator-pas; renderer-changes raken theme-vars + tree-mutaties

- z-order — niet narrow genoeg voor `plugin-runtime` direct.

#### T46.4 — UI Kolommen-sectie in JourneyEditor.vue `[M, 1 file, ~150 LOC]`

**Files.** `plugin-src/ui/components/JourneyEditor.vue`.

**Changes.**

- Import nieuwe constants (`JOURNEY_MIN_COLUMNS`, `JOURNEY_MAX_COLUMNS`,
  `JOURNEY_DEFAULT_COLUMN`).
- `localColumns` ref + `cloneColumns` + `columnsDiffer` helpers.
- `canAddColumn` + `canRemoveColumn` computeds.
- Granulaire watch op `props.modelValue.columns` (mirror items-watch).
- Handlers: `addColumn`, `removeColumn`, `updateColumnHeader`,
  `updateColumnSubheader`, `updateColumnBody`.
- Debounced emit gedeeld — emit-payload bevat `columns` + `items`.
- Template: nieuwe `<section>` BOVEN bestaande "Items"-sectie met:
  - kop "Kolommen" + counter
  - cards per kolom (3 UInput's, X-knop)
  - "+ Kolom toevoegen"-button.

**Exit criterion.** UI toont kolommen-sectie boven items; user kan
kolom toevoegen/verwijderen binnen 4-7; text-edits emitten debounced
JourneyWrapModel met `columns`-payload. Manuele canvas-check: na edit
verschijnen gewijzigde kolom-headers binnen 200ms-debounce-window.

**Dispatch.** Direct → `iframe-ui` (single Vue-file, geen main-thread).

#### T46.5 — Smoketest + screenshot + spec-stamp `[S, docs only]`

**Doel.** Verifieer end-to-end op 1 slide met JourneyWrap; vergelijk
visueel met user-design-reference; markeer T46 als DONE in spec met
commit-hash.

**Files.** `plugins/welder-slide-editor/spec.md` (status-flip).

**Exit criterion.** Spec-entry T46 krijgt `[DONE YYYY-MM-DD]` stempel;
HANDOFF.md noteert T46 als shipped.

#### T46-dispatch-volgorde

1. **T46.1** (data + constants) — `plugin-runtime`, 1 commit. Vereist
   geen runtime; veilig om vooraf te landen.
2. **T46.2** (scan backward-compat) — `plugin-runtime`, 1 commit.
   Kan onafhankelijk; renderer negeert `columns` nog.
3. **T46.3** (renderer + pluginData v=7) — `builder` (Opus). Vereist
   T46.1 + T46.2. Splits in T46.3a/3b indien LOC > 180.
4. **T46.4** (UI) — `iframe-ui`, 1 commit. Vereist alleen T46.1
   (constants + types). Kan parallel met T46.3 opgesteld worden, maar
   merge na T46.3 zodat user direct kan testen.
5. **T46.5** (smoketest + stamp) — orchestrator inline.

**Niet-doelen / out-of-scope voor T46.**

- Pills snappen naar kolommen (user-keuze: pills blijven vrij).
- Per-kolom kleur of accent (alle text in theme-color).
- Extra rijen in de header (vast: header / subheader / body).
- Header-export naar pluginData voor rebuild zonder canvas-truth
  (text-content blijft op TEXT-nodes — scan = canvas-truth, T34-pattern).
- CSV-import voor kolom-headers (geen designer-vraag, kan later in T47
  als nodig).

**Open vragen — geen blockers, post-implementation revisit.**

- Header-section hoogte (220px) is een schatting; mogelijk responsive
  maken op slot-hoogte als header te krap of te ruim aanvoelt na
  smoketest. Voor v1: vaste 220.
- Body-cell font-bold-niveau (`Inter Medium` vs `Inter SemiBold`):
  default `Inter Medium`; user kan in smoketest aangeven of bolder
  gewenst is.
- Verticale dividers extra strokeWeight bij MIN-aantal-kolommen (4) —
  mogelijk dunner laten lijken bij weinig kolommen. Voor v1: vast 1px.

## 14. Backlog (niet-actief)

Tasks die tijdelijk uit de UI zijn getrokken maar in de codebase of spec
leven. Terughalen wanneer een ontwerp-beslissing gemaakt is.

### B1 — Slide-theme-selector terughalen `[PARKED 2026-04-24]`

De `ThemePicker` in `GeneralPanel.vue` is verwijderd (UI-section + listener +
`onThemeSelect` + `unsubTheme`). Main-thread blijft `detectAndSendThemeModes`
uitvoeren en `slide-theme` posten; UI negeert het bericht stil.

- **Restanten in codebase:** `plugin-src/ui/components/ThemePicker.vue` (unused),
  `detectAndSendThemeModes` in `code.ts`, `set-variable-mode` in
  `UIToPluginMessage` types, `slide-theme` in `PluginToUIMessage` types.
- **Terughalen:** herstel de ThemePicker-sectie in `GeneralPanel.vue` + de
  listener + `onThemeSelect`-post. Alle types en main-thread-handlers zijn
  ongewijzigd, dus UI-import is voldoende.
- **Open vraag:** UX-plek — blijft hij bovenaan de General-card, of verhuist
  hij naar een aparte "Slide-settings" sectie bij de slide-selector in de
  header?

### B2 — Skip-toggle: snelheid + strakkere native-sync `[OPEN 2026-04-24]`

v0.1.2 (`1b352a6`) fixte de basis-sync tussen het plugin-oogje en Figma's
native skip-toggle in de left-panel thumbnails, maar de ervaring kan nog
strakker. Functionaliteit werkt; dit is polish.

- **Snelheid:** na een click op het oogje duurt het zichtbaar lang voordat
  de UI-state update. `set-slide-skipped` → `buildSlideList` → `page-changed`
  → store-patch is een full round-trip + volledige slide-list-rebuild.
  Optimistic UI: update `slides[i].isSkipped` direct in de store vóór de
  bridge-post en rollback alleen bij een `target-updated { ok: false }`.
  Overweeg ook de `page-changed` na een skip-toggle te vervangen door een
  gerichtere `slide-updated { slideId, isSkipped }`-variant zodat we niet
  de hele lijst opnieuw hoeven te bouwen.
- **Native-sync:** de `documentchange`-handler pakt nu `PROPERTY_CHANGE` op
  `SLIDE`-nodes op, maar `postSlideList` is 200ms-debounced. Bij snelle
  multi-skip (user klikt meerdere thumbnails achter elkaar) kan de plugin
  één tick achterlopen. Overweeg de debounce voor PROPERTY_CHANGE op
  SLIDE te verlagen naar ~50ms of direct door te schieten.
- **Open vraag:** moeten we ook `change.properties.includes('isSkippedSlide')`
  checken voordat we reposten? Nu triggeren álle PROPERTY_CHANGE-events op
  SlideNodes een slide-list-rebuild (name-wijziging, notes, etc.) — correct
  maar licht wasteful. Check of `NodeChangeProperty`-type `isSkippedSlide`
  bevat in de huidige plugin-typings.
- **Files:** `plugin-src/code.ts` (`set-slide-skipped`-handler rond regel
  1068, `documentchange`-handler rond regel 1155, `slideListSignature`
  rond regel 580), `plugin-src/ui/App.vue` (`toggleSkip` + `currentSummary`),
  evt. `plugin-src/ui/composables/usePluginView.ts` voor de optimistic
  store-patch.

### B3 — v0.1.x polish-tasks on-hold tot na T28 `[RESOLVED 2026-04-24]`

T28 is **reverted 2026-04-24** (feature geparkeerd pending fresh approach
— zie §13 T28-entry). T29 (P0 data-loss font-loading fix, orthogonaal aan
T28) is gemerged als commit `5e0af6d`. T30 (heading-accent via inline
word-chips) is geshipped 2026-04-24. Polish-tasks T19-T24 zijn inmiddels
allemaal geshipped en uit §13 verwijderd. T31 / T31.1 / T31.2 / T32 / T33
shipped 2026-04-24.

**Status per 2026-04-24:** v0.1.x polish-backlog is leeg. v0.2.0-werk
actief: **T34 — TableWrap in-place-rewrite refactor** (zie §13 T34.0–T34.6)
is de volgende feature-reeks. **T35 — ChartWrap refactor** gereserveerd
maar BLOCKED pending T34-verification.
