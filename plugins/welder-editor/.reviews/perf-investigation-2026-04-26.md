# Kolomkop-toggle data-flow perf investigation (2026-04-26)

## TL;DR

- **Root-cause asymmetrie:** Reka UI's `CollapsibleContent` doet bij ELKE open een sync `getBoundingClientRect()` op de **volledige** content (cells incl. alle UInputs). Bij grote tabel-state moet de browser eerst layout draaien op het volledige cell-grid voordat de animation start — bij sluiten is de hoogte al bekend uit een eerdere meting. De measurement-pass komt dus alleen in het kritieke pad bij open.
- **Most-impactful fix:** `bodyRows` herdefiniëren zodat slicen geen nieuwe array-ref oplevert wanneer de inhoud niet wijzigt (of `bodyRows` vervangen door een offset-iteratie). Dit elimineert een full v-for diff op alle body-rijen + alle UInputs op iedere toggle. Zie Finding 1.
- **Secondary fixes:** (a) `estimateRowTruncation` is een non-cached function-call die in elke `:key`-loop opnieuw uitgevoerd wordt — verplaats naar memoized computed per row; (b) per-row anonieme arrow `(v: string) => updateCell(...)` wordt elke render opnieuw gealloceerd → propagereert naar UInput's `useVModel`/`computed(ui)` als prop-change-ish trigger; (c) `cloneRows` in `scheduleEmit` is goedkoop maar onnodig — kan vervangen worden door deep-freeze of structuredClone alleen op echte commit.

---

## Reactivity-graph bij toggle-click

```
USwitch click
  └─ @update:model-value (Reka)
     └─ TableEditor.setHasColumnHeader(true)
        ├─ localHasColumnHeader.value = true                 (sync, ref mutation)
        │   ├─ TRIGGER: bodyRows computed             (depends on localHasColumnHeader)
        │   │   └─ INVALIDATE: v-for over bodyRows    (line 437)
        │   │       └─ NEW bodyRows-array-ref (slice/.slice() → always new ref)
        │   │           └─ Vue diff over N body-rows; per-row: re-render UInputs
        │   │
        │   ├─ TRIGGER: UCollapsible :open = true     (line 411)
        │   │   └─ Reka CollapsibleRoot → context.open.value = true
        │   │       └─ Reka CollapsibleContent watch fires (lines 49-78)
        │   │           ├─ await nextTick()
        │   │           ├─ node.style.transitionDuration = '0s'
        │   │           ├─ node.style.animationName = 'none'
        │   │           ├─ node.getBoundingClientRect()  ← FORCED LAYOUT op volledige content
        │   │           ├─ height.value = rect.height + width.value = rect.width
        │   │           └─ animation re-enabled → CSS animation kicks in
        │   │
        │   └─ TRIGGER: header-section UBadge re-eval (line 399)
        │       └─ estimateRowTruncation(localRows[0], …) opnieuw uitgevoerd
        │
        └─ scheduleEmit()                                    (sync, schedules timer)
            └─ setTimeout(200ms) → debounceTimer
               └─ (na 200ms) emit('update:modelValue', cloneRows(localRows))
                  └─ GraphsPanel.onTableUpdate
                     └─ inst.tableModel = value  (assign nieuwe TableWrapModel-ref)
                        ├─ TRIGGER: watch(props.modelValue.width)        → guarded, no-op
                        ├─ TRIGGER: watch(props.modelValue.hasColumnHeader) → guarded, no-op
                        ├─ TRIGGER: watch(props.modelValue.textSize)     → guarded, no-op
                        └─ TRIGGER: watch(props.modelValue.rows)         → rowsDiffer → false → no-op
```

De synchrone tak (linker-spoor) is wat de eerste frame van de open-animation moet beconcurreren. Specifiek: tussen `localHasColumnHeader.value = true` en de eerstvolgende paint, draait Vue een sync re-render storm:

1. `bodyRows` computed → nieuwe array-ref door `.slice()` (lines 124-128)
2. v-for diff over body-rows (line 437) → Vue herdiff per cell-key
3. Per body-row: per-cell v-for diff (line 459) → UInput re-render check
4. Per UInput: prop-vergelijking + `computed(ui)` re-evaluatie + `useVModel` reset
5. Reka CollapsibleContent watch → nextTick → forceer layout via `getBoundingClientRect()` op de net opnieuw berekende DOM

De `getBoundingClientRect()`-call dwingt de browser om al het uitstaande layout-werk te flushen (de v-for-shifts hierboven). Dit blokkeert de eerste animation-frame.

---

## Findings (gesorteerd op waarschijnlijke impact)

### 1. `bodyRows` computed maakt altijd een nieuwe array-ref → full v-for diff bij elke toggle

**Wat:** De `bodyRows` computed gebruikt zowel `.slice(1)` als `.slice()` (lines 124-128). Beide produceren een NIEUWE array-reference. Vue's v-for op `bodyRows` (line 437) ziet daardoor een nieuwe array elke keer en draait een full keyed-diff over alle body-rijen — ook al zijn 99% van die rijen identiek aan de vorige render.

**Bewijs:**

```ts
// TableEditor.vue lines 124-128
const bodyRows = computed<TableRowModel[]>(() =>
  localHasColumnHeader.value ? localRows.value.slice(1) : localRows.value.slice(),
);
```

```html
<!-- TableEditor.vue line 437 -->
<div
  v-for="(row, idx) in bodyRows"
  :key="row.rowNodeId !== '' ? row.rowNodeId : 'body-' + idx"
  ...
></div>
```

**Waarom asymmetrisch:** bij **open** schuift de body van N → N-1 (header wordt afgesneden van localRows). Bij **sluiten** schuift de body van N-1 → N. In beide gevallen rendert Vue een complete keyed-diff. ECHTER: bij OPEN gebeurt deze diff **terwijl** Reka tegelijk de full content-height moet meten voor de animation. Bij CLOSE is de measurement triviaal (`height.value` is 0 ofwel pre-bekend).

**Impact:** **HIGH** — voor een typische 5-15 rijen × 3-6 kolommen tabel heb je:

- 1 v-for over `bodyRows` (5-14 rijen)
- 1 v-for per body-row over cells (3-6 cells)
- Totaal: 15-84 UInput-instanties die getrackt moeten worden bij elke toggle
- Plus alle UBadge-checks via `estimateRowTruncation`

De diff zelf is O(N) maar elke UInput bezit een `useVModel`, `useFormField`, `useComponentIcons`, `useComponentUI` en een `computed(ui)` met `tv()`-call. Per UInput is dat best wat werk; vermenigvuldigd met 15-84 instances levert dat een merkbare frame-spike op.

**Fix (voorgesteld, niet geapplyceerd):**

```ts
// Alternatief 1 — render-tijd offset, geen slice nodig:
const bodyRowOffset = computed(() => localHasColumnHeader.value ? 1 : 0);
// in template:
<template v-for="(row, idx) in localRows">
  <div v-if="idx >= bodyRowOffset" ...>
```

Of:

```ts
// Alternatief 2 — cache slice via shallowRef + alleen patchen bij echte mutaties:
import { shallowRef, watchEffect } from 'vue';
const bodyRows = shallowRef<TableRowModel[]>([]);
watchEffect(() => {
  const next = localHasColumnHeader.value ? localRows.value.slice(1) : localRows.value.slice();
  // Vue zal alleen v-for opnieuw diffen als de outer-array-ref wijzigt;
  // door referentie-stabiel te blijven kun je dat triggeren wanneer JIJ wilt
  bodyRows.value = next;
});
```

Maar: het issue zit niet in dat `bodyRows` "te vaak" recomputed (computed-cache lost dat al op), het zit in dat HET RESULTAAT altijd een nieuwe array-ref is. Slice elimineren via offset is structureel het schoonst.

---

### 2. Reka `CollapsibleContent` doet sync `getBoundingClientRect()` op de volledige cells-content bij open — verklaart de open-vs-close asymmetrie

**Wat:** Reka UI's `CollapsibleContent.vue` (lines 49-78 in `node_modules/reka-ui/src/Collapsible/CollapsibleContent.vue`) heeft een `watch` die op elke `open`-state-flip:

1. transition/animation pauseert
2. `getBoundingClientRect()` aanroept op de full content-DOM
3. de `--reka-collapsible-content-height` CSS-variabele zet
4. animation re-enabled

De CSS `@keyframes collapsible-down` interpolereert `height: 0 → var(--reka-collapsible-content-height)`. Het MOET dus eerst de full hoogte weten voordat het kan animeren.

**Bewijs:**

```ts
// node_modules/reka-ui/src/Collapsible/CollapsibleContent.vue lines 49-78
watch(
  () => [isOpen.value, presentRef.value?.present],
  async () => {
    await nextTick()
    const node = currentElement.value
    if (!node) return
    currentStyle.value = currentStyle.value || { ... }
    node.style.transitionDuration = '0s'      // ← block animation
    node.style.animationName = 'none'
    const rect = node.getBoundingClientRect() // ← FORCE LAYOUT (incl. all UInputs in cells)
    height.value = rect.height
    width.value = rect.width
    if (!isMountAnimationPrevented.value) {
      node.style.transitionDuration = currentStyle.value.transitionDuration
      node.style.animationName = currentStyle.value.animationName
    }
  },
  { immediate: true },
)
```

```css
/* node_modules/@nuxt/ui/dist/runtime/keyframes.css */
@keyframes collapsible-down {
  0% {
    height: 0;
  }
  to {
    height: var(--reka-collapsible-content-height);
  }
}
@keyframes collapsible-up {
  0% {
    height: var(--reka-collapsible-content-height);
  }
  to {
    height: 0;
  }
}
```

**Waarom asymmetrisch:**

- Bij **OPEN**: content was op `height:0` (collapsed). Het `getBoundingClientRect()` op de net-zichtbaar-gemaakte content forceert layout op het volledige cell-grid (alle UInputs, badges, alles). Browser doet sync layout-pass + style-recalc op alle nieuwe descendants → blokkeert de eerste animation-frame.
- Bij **CLOSE**: content stond al volledig zichtbaar (height fully measured). De `getBoundingClientRect()` is een goedkope re-read uit de cache, en `height.value` heeft al een geldige waarde uit de vorige open-cycle. Browser hoeft niets nieuws te layouten.

**Bovendien** (omdat `:unmount-on-hide="false"` op line 411): de cells-content STAAT al in de DOM zelfs als collapsed. Maar omdat hij `height: 0` + `overflow: hidden` heeft, slaat de browser visibility-layout over (display:none-style optimalisatie via `hidden=until-found`). Bij open MOET hij dat weer doen.

**Impact:** **HIGH** — fundamenteel onvermijdelijk gegeven Reka's height-measurement-strategie, MAAR de cost is direct evenredig met de hoeveelheid DOM in de kolomkop-content. Op een tabel met 1-3 cells in de kolomkop is dit verwaarloosbaar; op een 6-cells brede tabel waar elke cell een UInput is met label, is het merkbaar.

**Fix (voorgesteld, niet geapplyceerd):** twee opties:

**Optie A — pre-warm de measurement.** Render de kolomkop-cells altijd, zelfs als collapsed (los van Collapsible). Bij collapsed `style="visibility:hidden;height:0"`. Dit voorkomt de eerste-keer-layout-cost — maar betekent wel dat de cells altijd in de DOM zitten met een measurable height. Niet gratis op CPU bij idle, maar verplaatst de cost weg van het kritieke pad van de toggle.

**Optie B — content cachen via `v-show` ipv `:unmount-on-hide="false"` UCollapsible.** UCollapsible heeft een `:unmount-on-hide="false"` waarde, wat betekent dat de DOM aanwezig blijft maar `hidden` wordt. Een eigen v-show-implementatie met een eenvoudige height-CSS-transition (geen JS measurement) zou dit omzeilen — maar je verliest dan smooth height-aware animation en moet een `max-height` werken (kost ofwel een te-grote-fixed-max of trial-and-error).

**Optie C — accepteer en verzacht.** Doe niets aan Reka's measurement-strategie maar verklein de hoeveelheid DOM die Reka moet meten. Dit lost zichzelf op door Findings 1+3+4 te fixen — minder UInput-her-renders → minder werk in `getBoundingClientRect()`-recalc.

Aanbevolen: **Optie C** — de measurement-cost is laag mits er weinig DOM is om te meten.

---

### 3. `estimateRowTruncation` wordt 1× per body-row + 1× voor de header GEËVALUEERD bij elke render — niet gememoiseerd

**Wat:** Bij elke toggle-trigger draait `estimateRowTruncation(...)` voor:

- 1× de header (line 399, in de truncation-badge `v-if`)
- N× per body-row (line 445, in de truncation-badge `v-if`)

De function is een pure-compute (geen IO), maar rekent ~10 floating-point ops + een `row.cells.some(...)` (string-length-iteratie) per call. Niet duur op zichzelf, maar wordt onnodig vaak aangeroepen bij elke reactive-trigger (toggle, typ-tick, width-switch, …).

**Bewijs:**

```html
<!-- TableEditor.vue line 399 -->
<UBadge
  v-if="localHasColumnHeader && localRows.length > 0 && estimateRowTruncation(localRows[0], localWidth, currentCols, localRows.length, localTextSize)"
  ...
/>

<!-- TableEditor.vue line 445 -->
<UBadge
  v-if="estimateRowTruncation(row, localWidth, currentCols, localRows.length, localTextSize)"
  ...
/>
```

**Impact:** **MED** — niet de bottleneck, maar 5-15 calls per render-tick is onnodig. Cumulatief over een rapid typ-storm of een width-switch is dit meetbaar.

**Fix (voorgesteld, niet geapplyceerd):**

```ts
// Vervang per-row functie-call met een memoized computed:
const truncationFlags = computed<{ header: boolean; body: boolean[] }>(() => {
  const w = localWidth.value;
  const ts = localTextSize.value;
  const cc = currentCols.value;
  const rc = localRows.value.length;
  const header =
    localHasColumnHeader.value && rc > 0
      ? estimateRowTruncation(localRows.value[0], w, cc, rc, ts)
      : false;
  const body = bodyRows.value.map((r) => estimateRowTruncation(r, w, cc, rc, ts));
  return { header, body };
});
// in template: v-if="truncationFlags.header"  /  v-if="truncationFlags.body[idx]"
```

Vue's computed-cache short-circuit'et automatisch als geen van de deps veranderd is.

---

### 4. Per-render anonieme arrow handlers reallocated op elke v-for iteratie

**Wat:** In de cell-loops (lines 427 + 468) wordt per cell een nieuwe arrow-functie gealloceerd:

```html
@update:model-value="(v: string) => updateCell(0, j, v)" @update:model-value="(v: string) =>
updateCell(bodyRowIndex(idx), j, v)"
```

Dit is gangbaar Vue-pattern en NIET het issue voor Vue zelf (Vue 3 heeft geen `==` event-listener-comparison; het zet gewoon een nieuwe handler). MAAR: deze handler-prop-change kan via `useVModel` van UInput propageren naar interne effects.

**Bewijs:** UInput gebruikt `useVModel(props, 'modelValue', emits, …)`. `useVModel` is een `computed`-getter+setter wrapper. De handler-allocation zelf raakt UInput niet rechtstreeks (omdat `@update:model-value` op de UInput is, niet als prop). Dus dit is in de praktijk minimal.

**Impact:** **LOW** — meet hooguit microseconden per iteratie, geen merkbaar effect.

**Fix:** Niet aangeraden om dit te fixen tenzij andere fixes onvoldoende zijn.

---

### 5. Width-section header (line 399) heeft een dubbele dependency-chain via `localRows[0]`

**Wat:** De header-truncation-badge condition leest `localRows[0]`. Bij toggle wijzigt `localRows` zelf niet — alleen `localHasColumnHeader`. Maar omdat de hele `v-if`-expression een single dep-tracking is, wordt heel de chain re-evaluated.

**Bewijs:** Geen — dit is normale Vue-tracking, geen anti-pattern. Genoemd voor compleetheid.

**Impact:** **LOW**

---

### 6. `cloneRows` is goedkoop maar wordt gedupliceerd in scheduleEmit én in watch

**Wat:** `cloneRows` wordt aangeroepen:

- 1× in `scheduleEmit()` voor elke debounce-fire (line 181)
- 1× in de `props.modelValue.rows` watch wanneer rowsDiffer-true (line 167)

Voor een typ-storm (200ms debounce) gaat dit dus om 1 clone per 200ms. Niet kritisch.

**Impact:** **LOW** — cloneRows is O(N×M) string-only allocatie, voor een 15×6 tabel = ~90 lege object-allocaties. Verwaarloosbaar.

---

## Asymmetrie open vs sluiten (verklaring)

De gebruikersobservatie ("openen voelt traag, sluiten voelt smooth") is **structureel** aan de combinatie van:

1. **Reka's height-measurement strategie** (Finding 2). Reka moet de full content-height kennen om de `collapsible-down` keyframe te kunnen animeren. Bij open is dat de eerste keer dat de DOM-content gemeten wordt sinds collapsed; dat triggert een sync layout-pass van de browser op het volledige UInput-grid in de kolomkop-cells. Bij sluiten is de hoogte al bekend (de meting is een goedkope re-read).

2. **Vue's reactive trigger-volgorde** (Finding 1). De `localHasColumnHeader.value = true` mutatie triggert SYNCHROON: (a) de `bodyRows` recompute met nieuwe array-ref, (b) de v-for diff over body-rows, (c) de re-render van alle UInput-cells in zowel header- als body-section. PAS DAARNA komt Reka's nextTick aan bod waarin het de measurement doet.

3. **De compound effect**: bij open zit de browser dus opgescheept met:
   - Vue heeft net de DOM gemuteerd (cells aan body geappend of eraf gehaald)
   - Reka roept `getBoundingClientRect()` aan → forceert sync layout-pass over ALLE pending mutations
   - Animation start pas na deze sync layout — eerste frame is al "te laat"

   Bij sluiten:
   - Vue muteert de DOM (cell-shift body N-1 → N)
   - Reka measure-call is goedkoop (height-cache valid, layout al klaar)
   - `collapsible-up` keyframe start vlot — animation-curve zichtbaar vanaf frame 1

4. **Visuele perceptie versterkt het**: de mens accepteert minimale jank bij sluit (informatie verdwijnt, niet erg) maar is gevoelig voor jank bij open (hij wacht op de inhoud). Dit is een UX-conventie die verklaart waarom dezelfde objectieve frame-drop verschillend voelt.

---

## Aanbevolen action-plan

In volgorde van **ROI / risico-ratio**:

### Stap 1 — Vervang `bodyRows`-slice door render-tijd offset (HIGH ROI, LOW risk)

Rationale: lost Finding 1 in ~10 LOC op zonder enige semantiek-wijziging. De `bodyRowIndex(idx)` helper bestaat al — herbruikbaar.

Voorstel:

```ts
const bodyRowOffset = computed<number>(() => (localHasColumnHeader.value ? 1 : 0));
// remove bodyRows computed entirely
```

```html
<template
  v-for="(row, idx) in localRows"
  :key="row.rowNodeId !== '' ? row.rowNodeId : 'row-' + idx"
>
  <div v-if="idx >= bodyRowOffset" class="rounded-...">
    <span>Rij {{ idx + 1 - bodyRowOffset }}</span>
    ... @update:model-value="(v: string) => updateCell(idx, j, v)"
  </div>
</template>
```

Effect: localRows-array-ref blijft stabiel tussen toggles → Vue's v-for diff is een no-op (alleen de v-if op rij 0 verandert). Reka's measurement-cost zakt drastisch omdat er geen DOM-re-arrangement is om te flushen.

**Verwacht resultaat**: open-animation is even smooth als close.

---

### Stap 2 — Memoize `estimateRowTruncation` via een `truncationFlags` computed (MED ROI, LOW risk)

Rationale: Finding 3. Niet de bottleneck maar lost een onnodige recompute-storm op die straks bij grote tabellen pijn gaat doen.

Voorstel: zie Finding 3.

---

### Stap 3 — (Optioneel) Investigeer of `:unmount-on-hide="false"` daadwerkelijk de cells-DOM behoudt

Rationale: na Stap 1 zou de open-cycle smooth moeten zijn. Als gebruiker nog janks ervaart, controleer of Reka's `hidden=until-found` (line 109 in CollapsibleContent.vue) zich gedraagt zoals verwacht — sommige browsers nemen `hidden=until-found`-content niet mee in initial-layout, wat de eerste-open nog steeds duur maakt. Test ook met `:unmount-on-hide="true"` (krimpt de DOM completely in collapsed state) — dat kan voor sommige use-cases sneller zijn omdat er minder te meten is bij open.

---

### Stap 4 — Niet doen: anonieme handlers vervangen door methods

Rationale: Finding 4. Geen meetbare winst, kost je leesbaarheid.

---

## Bevestiging dat dit géén code-changes inclusief

Rapport-only. Geen edits aan TableEditor.vue, geen git-operaties. Orchestrator + user kiezen op basis hiervan welke fix toe te passen.
