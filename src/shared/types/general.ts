import type { ThemeSection } from './theme';

export interface TitleDescriptionPayload {
  heading?: string;
  paragraph?: string;
  /** Heading accent ranges to apply after the heading text write. */
  headingDim?: Array<[number, number]>;
  headingVisible?: boolean;
  paragraphVisible?: boolean;
}

export interface BadgePayload {
  label?: string;
  icon?: string;
  /**
   * Full SVG document for the chosen Lucide icon, present when the iframe
   * found it in `lucide-svgs.ts`. The sandbox uses it for the slot-based swap;
   * when absent it falls back to the legacy INSTANCE_SWAP route.
   */
  iconSvg?: string;
}

export interface TitleDescriptionSection {
  copyWrapId: string;
  heading: string;
  /** Null when CopyWrap has no Paragraph text node. */
  paragraph: string | null;
  /**
   * Driven by the whole CopyWrap instance's `.visible` flag (CopyWrap owns the
   * fill/container), so hiding the section preserves the text.
   */
  headingVisible: boolean;
  /**
   * Driven by CopyWrap's `showParagraph` BOOLEAN property. Null when the master
   * has neither the BOOLEAN nor a Paragraph TextNode — the iframe hides the input.
   */
  paragraphVisible: boolean | null;
  /**
   * CopyWrap heading-size VARIANT property. Null when the master exposes no
   * Size property — the iframe hides the slider. `options` mirrors the master's
   * `variantOptions` in declaration order so a slider index maps straight to a
   * variant string without hardcoding names.
   */
  size: { current: string; options: ReadonlyArray<string> } | null;
  /**
   * Heading dim-accent ranges (Text Dimmer variable): sorted, non-overlapping;
   * empty array = no accent. Null when the Text / Text Dimmer library variables
   * are unreachable in this environment — the UI hides the accent block.
   * Heading-only; paragraph accent is deliberately out of scope.
   */
  headingDim: Array<[number, number]> | null;
}

export interface BadgeSection {
  badgeNodeId: string;
  label: string;
  /** Normalized Lucide icon slug. */
  icon: string;
  /**
   * Plugin-data-persisted slug of the user's last icon pick. Survives library
   * republishes (Figma resets icon-slot child overrides on master update;
   * plugin data stays put). Non-empty and different from `icon` means the slot
   * is stale and the iframe re-applies the pick. Empty when never picked.
   */
  iconIntended: string;
  /**
   * Driven by CopyWrap's `showBadge` BOOLEAN. Null when the master lacks the
   * property — the iframe hides the switch but keeps the label/icon editors.
   */
  visible: boolean | null;
}

export interface ImageSection {
  imageWrapId: string;
  /** Figma ImagePaint hash; null while a placeholder fill is in place. */
  imageHash: string | null;
  /** Undefined when uncropped. Tuple shape matches Figma Transform = [[a,b,tx],[c,d,ty]]. */
  cropTransform?: [[number, number, number], [number, number, number]];
}

export interface GeneralSections {
  titleDescription: TitleDescriptionSection | null;
  badge: BadgeSection | null;
  image: ImageSection | null;
  /**
   * Null when the file has no `Theme` variable collection (older Welder
   * libraries) — the picker stays hidden. `explicitModeId` null means the slide
   * inherits the page-level mode; `resolvedModeId` is what Figma actually renders.
   */
  theme: ThemeSection | null;
  /**
   * `show` mirrors the Slide's "Show Confidental" BOOLEAN property; `variant`
   * is the `Variant` VARIANT on the nested ConfidentalBadge instance (null
   * when unreadable); `variantOptions` comes from the component set, so the
   * dropdown follows designer-defined values. Null when the slide lacks the
   * "Show Confidental" property (older variants) — the editor hides the control.
   */
  confidential: { show: boolean; variant: string | null; variantOptions: string[] } | null;
}
