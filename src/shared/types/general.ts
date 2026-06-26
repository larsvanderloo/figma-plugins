// ============================================================
// General-tab types — update-general payloads en de slide-level
// singleton-sections.
// ============================================================

import type { ThemeSection } from './theme';

/** Payload-shape voor `update-general` met section `titleDescription`. */
export interface TitleDescriptionPayload {
  heading?: string;
  paragraph?: string;
  /** Optional heading accent ranges to apply after a heading text write. */
  headingDim?: Array<[number, number]>;
  /** Explicit heading visibility — toggled by the iframe switch. */
  headingVisible?: boolean;
  /** Explicit paragraph visibility — toggled by the iframe switch. */
  paragraphVisible?: boolean;
}

/** Payload-shape voor `update-general` met section `badge`. */
export interface BadgePayload {
  label?: string;
  icon?: string;
  /**
   * Volledig SVG-document voor het gekozen Lucide-icon. Aanwezig wanneer
   * de iframe het uit `lucide-svgs.ts` heeft kunnen opzoeken. De sandbox
   * gebruikt dit voor de slot-based swap; bij afwezigheid valt het
   * terug op de legacy INSTANCE_SWAP-route.
   */
  iconSvg?: string;
}

// ============================================================
// General-tab — slide-level singletons
// ============================================================

export interface TitleDescriptionSection {
  copyWrapId: string;
  heading: string;
  /** null wanneer CopyWrap geen Paragraph-textnode heeft. */
  paragraph: string | null;
  /**
   * Heading-section visibility. Driven by the whole CopyWrap instance's
   * `.visible` flag because CopyWrap owns the fill/container. The iframe
   * exposes a switch so the user can preserve the text while hiding the
   * section in Figma.
   */
  headingVisible: boolean;
  /**
   * Paragraph-section visibility (driven by the `showParagraph` BOOLEAN
   * component property on CopyWrap). Null when the master has neither
   * the BOOLEAN nor a Paragraph TextNode — iframe hides the input then.
   */
  paragraphVisible: boolean | null;
  /**
   * CopyWrap heading-size VARIANT property (variant typically
   * ranges from "display" through "h4"). Null when the CopyWrap master
   * doesn't expose a Size property — the iframe hides the slider then.
   * `current` is the active value; `options` mirrors the master's
   * `variantOptions` array in declaration order so the slider can map
   * an index directly to a variant string without hardcoding names.
   */
  size: { current: string; options: ReadonlyArray<string> } | null;
  /**
   * Dim-accent-ranges op de heading (Text Dimmer-variable).
   *
   * - `Array<[start, end]>` — canonicale, niet-overlappende, gesorteerde
   *   ranges (`e_i < s_{i+1}`). Lege array = geen accent.
   * - `null` — library-variables (Text / Text Dimmer) niet bereikbaar op
   *   deze team-omgeving. UI verbergt dan het accent-blok.
   *
   * Heading-only — paragraph-accent is permanent out-of-scope (user-besluit).
   */
  headingDim: Array<[number, number]> | null;
}

export interface BadgeSection {
  badgeNodeId: string;
  label: string;
  /** Lucide-icon-key (genormaliseerde slug uit de Lucide-set). */
  icon: string;
  /**
   * Persisted-via-plugin-data Lucide slug of the icon the user last
   * picked for this Badge. Survives library-master republishes (Figma
   * resets icon-slot child overrides on master update; plugin data
   * stays put). When non-empty AND different from `icon`, the iframe
   * detects a stale slot and re-applies the user's pick automatically.
   * Empty when no icon was ever picked / backfilled.
   */
  iconIntended: string;
  /**
   * Driven by `showBadge` BOOLEAN on CopyWrap (Slide Machine canonical).
   * Null when the master has no such property — the iframe hides the
   * switch then but keeps the label / icon editors active.
   */
  visible: boolean | null;
}

export interface ImageSection {
  imageWrapId: string;
  /** Figma ImagePaint-hash; null wanneer er nog een placeholder-fill staat. */
  imageHash: string | null;
  /** Crop-support; blijft undefined zonder crop. Inline tuple matches Figma Transform = [[a,b,tx],[c,d,ty]]. */
  cropTransform?: [[number, number, number], [number, number, number]];
}

export interface GeneralSections {
  titleDescription: TitleDescriptionSection | null;
  badge: BadgeSection | null;
  image: ImageSection | null;
  /**
   * Slide-level Theme-collection mode binding. Null when no `Theme`
   * variable collection exists in the file (older Welder libraries
   * may pre-date the collection and the picker stays hidden).
   *
   * `explicitModeId` is set when the slide pins a specific mode via
   * `explicitVariableModes`; `null` means the slide inherits the
   * page-level mode. `resolvedModeId` is what Figma actually renders
   * (explicit if set, else inherited). `modes` lists the available
   * options for the picker UI.
   */
  theme: ThemeSection | null;
  /**
   * Slide-level "Show Confidental" toggle — the Slide component's boolean
   * component property that shows/hides the ConfidentalBadgeWrap. Null when
   * the slide's component has no such property (older variants); the editor
   * then hides the toggle. `show` is the current property value.
   */
  confidential: { show: boolean } | null;
}
