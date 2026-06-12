# Chart delta badge (T48) — research note

Onderzoek naar hoe professionele dashboard/BI-tools delta/trend-badges
presenteren, en de conventie die de Welder chart-renderer volgt.

## Wat de tools doen

**Patroon (KPI-/stat-cards in Power BI, Geckoboard, Salesforce CRM
Analytics, shadcn-stijl stat-cards):** naast of direct onder de
hoofdwaarde staat een kleinere indicator met een richtingsglyph
(driehoek ▲/▼ of pijl ↑/↓) plus de procentuele verandering t.o.v. de
vorige periode. De badge is typografisch ondergeschikt aan de waarde
(kleiner korps, medium gewicht).

- **Power BI KPI visual** toont de indicator naast/onder de callout-
  waarde met het procentuele verschil; de "Direction"-instelling
  (high/low is good) bepaalt de kleursemantiek — d.w.z. kleur is
  *configuratie*, richting (glyph + teken) is het feit.
  ([Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-kpi),
  [phData](https://www.phdata.io/blog/adding-up-and-down-arrows-in-power-bi/))
- **Geckoboard** vergelijkt "huidige periode vs vorige periode" en
  toont de verandering als percentage; bij vorige waarde = 0 tonen ze
  de *absolute* verandering in plaats van een oneindig percentage.
  ([Geckoboard updates](https://www.geckoboard.com/updates/4/),
  [help center](https://support.geckoboard.com/en/articles/6055540-customize-datasets-widgets))
- **Kleurconventie** is klassiek groen-op / rood-neer, maar
  toegankelijkheidsrichtlijnen (Carbon, Red Hat, Lightning) zijn
  expliciet: rood/groen alleen is de meest voorkomende a11y-fout
  (deuteranopie); status moet minstens door glyph + tekst gedragen
  worden, kleur is secundair.
  ([Carbon status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/),
  [Red Hat badge a11y](https://ux.redhat.com/elements/badge/accessibility/),
  [Lightning color accessibility](https://www.lightningdesignsystem.com/guidelines/color/color-accessibility/))

## Gekozen conventie

1. **Berekening:** delta per categorie t.o.v. de **vorige categorie in
   serie 0** — `(huidig − vorig) / vorig`, afgerond op hele procenten.
   Eerste categorie heeft geen vorige → geen badge. Vorige waarde 0 →
   absolute verandering (Geckoboard-conventie); beide 0 → geen badge.
   Multi-series: alleen serie 0 krijgt badges — per-serie badges maken
   bar/line-charts onleesbaar en serie 0 is de primaire reeks (zelfde
   regel als donut/pie/progress die serie 0 renderen).
2. **Vorm:** `▲ +12%` / `▼ −5%` — gevulde driehoek + getekend
   percentage, Inter Medium, ±70% van het label-korps (kleiner dan het
   waarde-label, zelfde familie). Richting wordt dubbel gedragen
   (glyph + plus/minteken), nooit door kleur alleen.
3. **Kleur: géén hardcoded groen/rood.** De Welder-theming is een
   single-accent-ramp (`palette.ts`, afgeleid van de `Text`-variable);
   een vast groen/rood paar valt buiten elk theme én botst met de
   a11y-bevinding hierboven. De badge gebruikt één gedempte accent-
   tint (`deltaTextColor`: kaart-tekstkleur 35% richting wit) voor
   beide richtingen — monochroom zoals Stripe-achtige stat-cards,
   theme-volgend bij een theme-switch, en de semantiek zit volledig in
   glyph + teken.
4. **Plaatsing per chart-type:**
   - **bar:** badge onder het waarde-label, boven de serie-0-bar.
   - **line:** badge gestapeld boven het serie-0-punt (waarde boven,
     delta eronder, dichtst bij de dot).
   - **progress:** extra kolom rechts van de waarde.
   - **donut/pie:** parts-of-whole — delta tussen aangrenzende slices
     is zwakker gedefinieerd, dus geen badge in de cirkel; de delta
     staat als tekst-suffix in de legenda (alleen met legenda aan).
5. **Toggle:** `showDelta` op het model, default **uit** (additief,
   bestaande charts veranderen niet), naast Legenda/Waarden in de
   editor. De badge rendert onafhankelijk van `showValues` zodat een
   slide alleen trends kan tonen zonder absolute getallen.
