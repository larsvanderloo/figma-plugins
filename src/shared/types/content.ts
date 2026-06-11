// ============================================================
// Content-tab — card-list (spec §3.4)
// ============================================================

export interface CardItem {
  cardNodeId: string;
  heading: string;
  paragraph: string;
  /**
   * Lucide-icon-slug voor het directe icon-INSTANCE-kind van de card
   * (bv. 'sparkles', 'snowflake').
   *
   * - `string` — icon-instance aanwezig en zichtbaar; slug is de huidige icon-keuze.
   * - `null`   — icon-instance afwezig of visible === false; icon-picker wordt
   *              verborgen in de UI (zelfde pattern als paragraph-hide T19).
   */
  icon: string | null;
  /**
   * Persisted-via-plugin-data Lucide slug of the icon the user last
   * picked for this Card. Survives library-master republishes (Figma
   * resets icon-slot child overrides on master update; plugin data
   * stays put). When non-null AND different from `icon`, the iframe
   * detects a stale slot and re-applies the user's pick automatically.
   * Null when no icon was ever picked for this card via the plugin.
   */
  iconIntended: string | null;
  /**
   * ImagePaint-hash op het image-slot; null wanneer de card een image-slot
   * heeft maar nog leeg is. Undefined wanneer de card geen slot heeft
   * (de visual-editor verschijnt dan niet in de UI).
   */
  visualHash: string | null | undefined;
  /**
   * Card `Style` VARIANT property — `Default` (filled) of `Outline`.
   * `null` wanneer de card-instance geen `Style`-variant blootstelt (sommige
   * CardWrap-layout-varianten bakken Cards plat in zonder variant-prop —
   * de UI verbergt de toggle dan).
   */
  style: 'Default' | 'Outline' | null;
}

/**
 * Eén bewerkbaar timeline-item binnen een TimelineWrap (spec §13 T31).
 *
 * TimelineWrap's children zijn CopyWrap-instances (niet Card-instances);
 * elk item heeft alleen Heading + Paragraph — geen icon-swap, geen
 * visual-slot. Decoratieve `Stepper Item`-children worden door de scan
 * overgeslagen.
 */
export interface TimelineItem {
  /** Node-id van de CopyWrap-instance binnen TimelineWrap. */
  copyWrapNodeId: string;
  heading: string;
  /** Altijd een string — lege string wanneer de Paragraph-textnode ontbreekt. */
  paragraph: string;
}

/**
 * Eén InstructorCard binnen een CardWrap — de Instructor-variant van de
 * Card-slot. Foto + naam komen uit de `Instructor` VARIANT van de
 * InstructorCard-component-set (designer-beheerd); de plugin switcht
 * alleen de variant en bewerkt de list-item-teksten.
 */
export interface InstructorCardItem {
  /** Node-id van de InstructorCard-instance binnen CardWrap. */
  cardNodeId: string;
  /** Huidige `Instructor` VARIANT-waarde (bv. 'Gijs', 'Myra'). */
  instructor: string;
  /**
   * Beschikbare `Instructor`-variant-opties uit de component-set, in
   * library-volgorde. Leeg wanneer de set onbereikbaar is — de UI toont
   * de picker dan disabled.
   */
  instructorOptions: string[];
  /** Bewerkbare list-item-teksten binnen de card, in document-volgorde. */
  items: string[];
  /**
   * Node-zichtbaarheid van de card. Hidden cards collapsen uit de
   * CardWrap-auto-layout (overige cards reflowen); de scan blijft ze
   * meenemen zodat de toggle ze terug kan zetten.
   */
  visible: boolean;
}

export interface ContentItems {
  cardWrapId: string;
  cards: CardItem[];
  /**
   * InstructorCards (Instructor-variant van de Card-slot). Lege array
   * wanneer de CardWrap geen InstructorCards bevat.
   */
  instructorCards: InstructorCardItem[];
  /**
   * Timeline-items (spec §13 T31). Lege array wanneer de slide geen
   * TimelineWrap heeft. Slides met alleen TimelineWrap hebben een lege
   * `cards`-array en een niet-lege `timelineItems`-array.
   */
  timelineItems: TimelineItem[];
}
