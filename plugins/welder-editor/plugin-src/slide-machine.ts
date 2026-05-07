// ============================================================
// Welder Slide Editor — Slide Machine Selectors
//
// Pure synchrone helpers die (a) Slide Machine-slides op de huidige
// pagina vinden en (b) binnen zo'n slide de verschillende wrapper-
// instances lokaliseren (CopyWrap / Badge / ImageWrap / CardWrap /
// ChartWrap / TableWrap / JourneyWrap).
//
// Zie spec.md §7 voor de naam-conventies en §9-T3 voor de exit-criteria.
//
// Conventies:
//   - Alle selectors geven `InstanceNode | null` terug (niet undefined).
//   - Traversal binnen een slide is O(descendants); een slide heeft
//     typisch <300 descendants dus findAll is OK.
//   - Paginaniveau gebruikt `findAll` met een strikte predicate
//     (INSTANCE + name='Slide' + 1920x1080) zodat we óók slides vinden
//     die in Figma Slides editor binnen SlideNode-containers genest zijn.
//   - Geen mutaties, geen async calls, geen figma.ui-interactie.
// ============================================================

import type { SlideSummary } from './types';
import { SLIDE_NODE_NAME, SLIDE_WIDTH, SLIDE_HEIGHT } from './constants';

// ============================================================
// Slide-detectie
// ============================================================

/**
 * Type-guard — vertelt TS dat `node` een Slide-instance is.
 * Match-criteria per spec §7.1:
 *   - type === 'INSTANCE'
 *   - name === 'Slide'
 *   - width 1920 × height 1080
 */
export function isSlide(node: SceneNode): node is InstanceNode {
  if (node.type !== 'INSTANCE') return false;
  if (node.name !== SLIDE_NODE_NAME) return false;
  // Figma geeft width/height als number met subpixel-floats bij
  // geschaalde instances; Slide Machine blijft exact 1920×1080.
  if (node.width !== SLIDE_WIDTH) return false;
  if (node.height !== SLIDE_HEIGHT) return false;
  return true;
}

/**
 * Scant de opgegeven page (default: currentPage) op Slide Machine-slides.
 *
 * In Figma Design liggen Welder-Slide-instances op top-level van de page.
 * In Figma Slides editor (manifest.editorType=['figma','slides']) zitten
 * ze in SlideNode-containers, één niveau dieper. `findAll` met de strikte
 * isSlide-predicate (INSTANCE + name === 'Slide' + 1920x1080) vangt beide
 * zonder false-positives — geen wrapper binnen een slide (CopyWrap,
 * CardWrap, etc.) matcht die criteria.
 */
export function findSlidesOnPage(page?: PageNode): InstanceNode[] {
  const target = page !== undefined ? page : figma.currentPage;
  const found = target.findAll(isSlide);
  return found as InstanceNode[];
}

/**
 * Bouwt een SlideSummary (id + number + display-naam + isSkipped-flag) voor een slide.
 * De `number` is 1-based en wordt door de caller gezet op basis van
 * de volgorde in findSlidesOnPage(); deze helper bouwt alleen de
 * display-naam. Scanning naar een 'Heading' text-node binnen de slide
 * geeft een leesbaardere titel dan de bare instance-naam.
 *
 * `isSkipped` wordt afgeleid uit de SlideNode-parent (Figma Slides-editor):
 *   - `SLIDE`-parent aanwezig → `parent.isSkippedSlide` (true/false).
 *   - Geen SlideNode-parent (Figma Design) → null; skip is niet ondersteund
 *     op dit surface en de UI verbergt de toggle.
 * ES2017-compat: var, geen optional chaining.
 */
export function slideSummary(slide: InstanceNode, number: number): SlideSummary {
  const title = findSlideHeadingText(slide);
  var isSkipped: boolean | null = null;
  var parent: BaseNode | null = slide.parent;
  if (parent !== null && parent.type === 'SLIDE') {
    isSkipped = (parent as SlideNode).isSkippedSlide;
  }
  return {
    id: slide.id,
    number: number,
    name: title !== null && title.length > 0 ? title : 'Slide ' + String(number),
    isSkipped: isSkipped,
  };
}

/**
 * Zoekt de Heading-text-node binnen CopyWrap en geeft zijn characters terug.
 *
 * Scope is bewust beperkt tot CopyWrap: een Slide bevat meerdere text-nodes
 * met name 'Heading' (één in CopyWrap, meer in Card-instances en hidden
 * badge-varianten). Een ongescoped findOne raakte soms een Card-heading of
 * hidden-badge-heading wiens content literal "Slide 1 — Vestibulum..."
 * bevat — dat gaf een dubbele "Slide N — " prefix in de dropdown-naam.
 *
 * Retourneert null wanneer er geen CopyWrap is, geen Heading binnen CopyWrap
 * staat, of wanneer de text-node leeg is. Caller valt dan terug op "Slide N".
 */
function findSlideHeadingText(slide: InstanceNode): string | null {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return null;
  const headingNode = copyWrap.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === 'Heading';
  });
  if (headingNode === null) return null;
  if (headingNode.type !== 'TEXT') return null;
  const chars = headingNode.characters;
  if (chars.length === 0) return null;
  return chars;
}

// ============================================================
// Wrapper-finders
//
// Elk van deze helpers zoekt één specifieke wrapper-instance binnen
// een slide. Match-criteria volgen spec §7.2. Alle helpers retourneren
// het eerste gevonden InstanceNode of null.
// ============================================================

function findFirstInstance(
  slide: InstanceNode,
  predicate: (n: InstanceNode) => boolean,
): InstanceNode | null {
  const found = slide.findOne((n: SceneNode) => {
    if (n.type !== 'INSTANCE') return false;
    return predicate(n as InstanceNode);
  });
  if (found === null) return null;
  if (found.type !== 'INSTANCE') return null;
  return found;
}

/** CopyWrap: INSTANCE met name 'CopyWrap' (exact match). */
export function findCopyWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => n.name === 'CopyWrap');
}

/**
 * Retourneert true wanneer `node` en al zijn ancestors binnen `slide`
 * visible zijn. Stopt bij de slide zelf (die altijd visible is op dit
 * pad, anders zou hij niet in findSlidesOnPage verschijnen).
 *
 * Bounded op 10 hops — een wrapper-instance zit typisch 1-3 niveaus diep
 * onder de Slide; 10 is ruim genoeg met een harde safety-break tegen
 * onverwachte parent-ketens.
 */
export function isEffectivelyVisible(node: SceneNode, slide: InstanceNode): boolean {
  let current: BaseNode | null = node;
  for (let i = 0; i < 10; i++) {
    if (current === null) return true;
    if ('visible' in current) {
      if ((current as SceneNode).visible === false) return false;
    }
    if (current.id === slide.id) return true;
    const parent: BaseNode | null = 'parent' in current ? (current as SceneNode).parent : null;
    if (parent === null) return true;
    current = parent;
  }
  return true;
}

/**
 * Badge: INSTANCE waarvan name start met 'Badge'
 * (bevestigd per §12-Q2 — 2026-04-23).
 *
 * Alleen zichtbare badges — CopyWrap heeft een 'Show Badge'-toggle die
 * de instance (of een van zijn ancestors) op visible=false zet. Als de
 * user de badge niet toont, laat de plugin de Badge-editor-sectie ook
 * weg in de General tab. Schrijven naar een onzichtbare badge slaat
 * applyBadge dus ook over — dat is correct gedrag: er is geen
 * zichtbare target.
 */
export function findBadge(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    if (n.name.indexOf('Badge') !== 0) return false;
    if (!isEffectivelyVisible(n, slide)) return false;
    return true;
  });
}

/**
 * ImageWrap: INSTANCE met name 'ImageWrap' (exact match), MAAR alleen
 * de slide-level wrap — niet ImageWraps die binnen een Card of CardWrap
 * leven (die zijn eigendom van die card en verschijnen in de Content-
 * panel via de card-eigen visual). Een card-interne ImageWrap retourneren
 * zou hetzelfde plaatje in twee plekken in de plugin-UI tonen.
 *
 * Verified via Figma MCP voor slide 19907:56235: 3 cards waarvan 2 Type=Image
 * met elk een eigen ImageWrap; geen slide-OWN ImageWrap. Voorheen pickte
 * findOne de eerste card-interne ImageWrap als "slide-level" Image.
 */
export function findImageWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    if (n.name !== 'ImageWrap') return false;
    let cur: BaseNode | null = n.parent;
    while (cur !== null && cur !== slide) {
      if (cur.type === 'INSTANCE' && (cur.name === 'Card' || cur.name === 'CardWrap')) {
        return false;
      }
      cur = cur.parent;
    }
    return true;
  });
}

/** CardWrap: INSTANCE met name 'CardWrap' (exact match). */
export function findCardWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => n.name === 'CardWrap');
}

/** ChartWrap: INSTANCE met name 'ChartWrap' (exact match). */
export function findChartWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => n.name === 'ChartWrap');
}

/**
 * TableWrap: instances die een tabel representeren (NIET timeline).
 * Matcht:
 *   - legacy exacte naam `TableWrap`
 *   - Slide Machine variant-namen `Tabel=Table Default`, `Tabel=small`
 *     (beginnen met `Tabel=`) en `Table=`-varianten — zolang ze geen
 *     `Timeline` bevatten (dat wordt door `findTimelineWrap` gepakt).
 *   - Slide Machine variant-property-naam `Property 1=Table Default`,
 *     `Property 1=small`, etc. — on-slide instance-name wanneer het
 *     variant-component `Property 1` als enige property heeft. Filter
 *     op afwezigheid van `Timeline`/`Chart` om ChartWrap- en
 *     TimelineWrap-variants niet per ongeluk te matchen.
 *
 * Voor v0.2.0-compat kan de instance óók `pluginData.kind === 'welder-table'`
 * dragen — die detectie blijft in editors/table/* (T14).
 *
 * T31 (2026-04-24): TimelineWrap gestript uit deze matcher.
 * T31.1 (2026-04-24): Bredere matching voor variant-namen (Tabel=/Table= prefix).
 * T33 (2026-04-24): `Property 1=`-prefix erbij (Slide Machine variant-syntax).
 * ES2017-compat: indexOf i.p.v. startsWith/includes.
 */
export function findTableWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    if (n.name === 'TableWrap') return true;
    if (n.name.indexOf('Tabel=') === 0 && n.name.indexOf('Timeline') < 0) return true;
    if (n.name.indexOf('Table=') === 0 && n.name.indexOf('Timeline') < 0) return true;
    if (
      n.name.indexOf('Property 1=') === 0 &&
      n.name.indexOf('Timeline') < 0 &&
      n.name.indexOf('Chart') < 0
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Locate the SlotNode binnen de TableWrap-INSTANCE van een slide.
 *
 * T34.2: de Slot-based TableWrap-rewrite plaatst rows/cellen direct
 * binnen de Slot (mutable zelfs binnen instance-context). Deze helper
 * wandelt: slide → TableWrap-INSTANCE → Slot. Retourneert null wanneer
 * geen TableWrap of geen Slot binnen de TableWrap gevonden wordt.
 *
 * Naam-matching identiek aan findTableWrap (exact 'TableWrap' of
 * variant-namen met 'Table'/'Tabel' maar zonder 'Timeline'/'Chart').
 */
export function findTableSlot(slide: InstanceNode): SlotNode | null {
  const tableWrap = findTableWrap(slide);
  if (tableWrap === null) return null;
  const slot = tableWrap.findOne((n: SceneNode) => n.type === 'SLOT');
  if (slot === null) return null;
  if (slot.type !== 'SLOT') return null;
  return slot as SlotNode;
}

/**
 * TimelineWrap: instances die een timeline representeren.
 * Matcht:
 *   - legacy exacte naam `TimelineWrap`
 *   - Slide Machine variant-naam `Tabel=Alt Timeline` (en variaties daarop)
 *     — elke instance met `Timeline` in de naam.
 * Namen die `Timeline` bevatten zijn specifiek genoeg dat false-positives
 * onwaarschijnlijk zijn binnen de Slide Machine component-library.
 *
 * Children bevatten editable CopyWrap-items (Heading + Paragraph)
 * en decoratieve Stepper Items. De scan in `scanContent` filtert op CopyWrap.
 *
 * T31 (2026-04-24): initiële implementatie (exact naam).
 * T31.1 (2026-04-24): bredere matching voor variant-namen.
 * ES2017-compat: indexOf i.p.v. includes.
 */
export function findTimelineWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, (n) => {
    return n.name === 'TimelineWrap' || n.name.indexOf('Timeline') >= 0;
  });
}

// ============================================================
// Component-properties helpers (spec §7.3)
//
// Slide Machine-instances dragen varianten als keys met een hash-suffix
// (`Style#12345:0` ipv `Style`). We moeten de logische naam opzoeken
// via `componentPropertyDefinitions` en de volle hash-key teruggeven.
// ============================================================

/**
 * Zoekt de volledige component-property-key (inclusief `#hash`-suffix)
 * die hoort bij een logische naam (bv. 'Style' → 'Style#1234:0').
 *
 * InstanceNode.componentProperties is een map van hashed keys naar
 * hun huidige waarde; die gebruiken we om de key-naam af te leiden.
 * `setProperties` verwacht diezelfde hashed keys.
 *
 * Retourneert null wanneer de instance geen matching property heeft
 * (detached instance, legacy master, of onbekende logicalName).
 */
export function getPropertyKey(instance: InstanceNode, logicalName: string): string | null {
  const props = instance.componentProperties;
  if (props === null || props === undefined) return null;
  // Direct-hit wanneer de property géén hash-suffix heeft.
  if (Object.prototype.hasOwnProperty.call(props, logicalName)) {
    return logicalName;
  }
  const prefix = logicalName + '#';
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.indexOf(prefix) === 0) return key;
  }
  return null;
}

/**
 * Zet een instance-property op een logische naam.
 * Retourneert true bij succes, false wanneer de key niet bestond (caller
 * kan dan beslissen of dat een hard error is of een silent skip).
 *
 * Wrapper rond `instance.setProperties`; verbergt de hash-suffix-logica
 * zodat editors/**  alleen met logische namen ('Style', 'Type', etc.) werken.
 */
export function setInstanceProperty(
  instance: InstanceNode,
  logicalName: string,
  value: string | boolean,
): boolean {
  const key = getPropertyKey(instance, logicalName);
  if (key === null) return false;
  const patch: { [k: string]: string | boolean } = {};
  patch[key] = value;
  instance.setProperties(patch);
  return true;
}

// ============================================================
// JourneyWrap-helpers (T45)
// ============================================================

/**
 * JourneyWrap: INSTANCE met name 'JourneyWrap'.
 * Analoog aan findChartWrap / findTableWrap.
 */
export function findJourneyWrap(slide: InstanceNode): InstanceNode | null {
  return findFirstInstance(slide, function (n) {
    return n.name === 'JourneyWrap';
  });
}

/**
 * Locate the SlotNode binnen de JourneyWrap-INSTANCE van een slide.
 *
 * Wandelt: slide → JourneyWrap-INSTANCE → Slot. Retourneert null wanneer
 * geen JourneyWrap of geen Slot binnen de JourneyWrap gevonden wordt.
 */
export function findJourneySlot(slide: InstanceNode): SlotNode | null {
  const journeyWrap = findJourneyWrap(slide);
  if (journeyWrap === null) return null;
  const slot = journeyWrap.findOne(function (n: SceneNode) {
    return n.type === 'SLOT';
  });
  if (slot === null) return null;
  if (slot.type !== 'SLOT') return null;
  return slot as SlotNode;
}
