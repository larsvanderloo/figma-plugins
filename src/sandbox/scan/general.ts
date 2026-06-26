// ============================================================
// scan/general.ts
//
// General-tab scan: titel/omschrijving (CopyWrap), badge, slide-image
// en theme. Bouwt de GeneralSections-payload voor de iframe.
//
// FIG-GUARD-01: type-checks vóór property-access.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import {
  findCopyWrap,
  findBadge,
  findImageWrap,
  readBooleanProperty,
} from '../slide-machine';
import { GeneralSections } from '../../shared/types';
import { findTextByName } from '../editors/_shared/node-finders';
import { readDimRanges } from '../editors/_shared/accent-ranges';
import { debugLog } from '../../shared/debug';
import { isDevModeRuntime } from '../runtime';
import {
  readTextByName,
  findVisibleTextNodeByName,
  readBadgeIcon,
  readImageWrapHash,
  resolveTypHeadingSizeHost,
} from './readers';
import { scanTheme } from './theme';

export async function scanGeneral(slide: InstanceNode): Promise<GeneralSections | null> {
  const copyWrap = findCopyWrap(slide);
  const badge = findBadge(slide);
  const imageWrap = findImageWrap(slide);

  // Secties opbouwen; elke null wanneer de wrapper niet bestaat.
  let titleDescription: GeneralSections['titleDescription'] = null;
  if (copyWrap !== null) {
    // Visibility-aware read (used for accent dim-ranges below — those
    // require the live TextNode reference). Plain characters are read
    // regardless of visibility so the iframe can preserve text across
    // toggle-off-then-on without round-tripping to Figma.
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    const heading = readTextByName(copyWrap, 'Heading') || '';
    // `paragraph` is null only when the master has no Paragraph TextNode
    // at all — that's the "section unsupported" signal. When the node
    // exists but the section is hidden via showParagraph, we still send
    // the chars so the toggle can preserve them across off/on cycles.
    const paragraphChars = readTextByName(copyWrap, 'Paragraph');
    const paragraph = paragraphChars !== null ? paragraphChars : null;

    // Heading visibility — CopyWrap's .visible flag. CopyWrap owns the
    // title fill/container, so hiding only TypHeading leaves a visual
    // shell behind. Paragraph visibility — showParagraph BOOLEAN
    // component property, layered with a node-level read (below) so a
    // TypParagraph hidden directly on the canvas wins over a missing or
    // true property.
    let headingVisible = copyWrap.visible !== false;
    const typHeading = copyWrap.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'TypHeading';
    });
    if (headingVisible && typHeading !== null && 'visible' in typHeading) {
      // Legacy read: pre-CopyWrap-toggle builds hid TypHeading directly.
      // Keep reflecting that as hidden until the next "on" toggle
      // normalizes both CopyWrap and TypHeading back to visible.
      headingVisible = (typHeading as InstanceNode).visible !== false;
    }
    let paragraphVisible: boolean | null = null;
    if (paragraph !== null) {
      const showParagraphValue = readBooleanProperty(copyWrap, 'showParagraph');
      paragraphVisible = showParagraphValue === null ? true : showParagraphValue;
      if (paragraphVisible) {
        // Node-level read — mirrors the TypHeading legacy read above and
        // the apply-side fallback in title-description.ts: CopyWraps
        // without a showParagraph property (or with a stale true value)
        // carry visibility on the TypParagraph wrapper / Paragraph node
        // itself. Without this read the toggle reports ON for a hidden
        // paragraph and bounces back after every off-toggle.
        const typParagraph = copyWrap.findOne(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'TypParagraph';
        });
        if (typParagraph !== null && 'visible' in typParagraph) {
          paragraphVisible = (typParagraph as InstanceNode).visible !== false;
        } else {
          const paragraphTextNode = findTextByName(copyWrap, 'Paragraph');
          if (paragraphTextNode !== null) {
            paragraphVisible = paragraphTextNode.visible !== false;
          }
        }
      }
    }
    debugLog('scan', 'titleDescription', {
      slideId: slide.id,
      headingChars: heading.length,
      paragraph: paragraph === null ? null : paragraph.length,
      headingVisible: headingVisible,
      paragraphVisible: paragraphVisible,
      showParagraphProp: readBooleanProperty(copyWrap, 'showParagraph'),
    });

    // Dim-range scan — heading-only, silent-fail naar null
    // wanneer de library onbereikbaar is of het heading-node ontbreekt.
    // Paragraph-accent is permanent out-of-scope (geen paragraphDim).
    let headingDim: Array<[number, number]> | null = null;
    if (headingNode !== null) {
      try {
        headingDim = await readDimRanges(headingNode);
      } catch (err: unknown) {
        console.log('[welder-slide-editor] readDimRanges(heading) failed:', err);
        headingDim = null;
      }
    }

    // Heading-size VARIANT property lives on the nested `TypHeading`
    // instance inside CopyWrap, not on CopyWrap itself (verified via
    // Figma MCP — CopyWrap's componentProperties only exposes Badge/
    // Paragraph toggles; size is a TypHeading-level variant).
    let size: { current: string; options: ReadonlyArray<string> } | null = null;
    try {
      const headingHost = await resolveTypHeadingSizeHost(copyWrap);
      if (headingHost !== null) {
        size = {
          current: headingHost.value,
          options: headingHost.options,
        };
        debugLog(
          'copywrap-size',
          'options=[' + headingHost.options.join(', ') +
            '], current=' + headingHost.value,
        );
      } else {
        debugLog('copywrap-size', 'TypHeading + size property not resolved');
      }
    } catch (e) {
      console.log('[copywrap-size] lookup failed:', e);
    }

    titleDescription = {
      copyWrapId: copyWrap.id,
      heading: heading,
      paragraph: paragraph,
      headingVisible: headingVisible,
      paragraphVisible: paragraphVisible,
      headingDim: headingDim,
      size: size,
    };
  }

  // Badge visibility — the `Badge_wrap` FRAME inside CopyWrap is the
  // source of truth (verified via Figma MCP on Welder Templates v0).
  // Toggling its `.visible` cleanly collapses the badge out of CopyWrap's
  // auto-layout, which is what the audience expects when the badge is
  // hidden. Fallback to the `showBadge` BOOLEAN for legacy CopyWraps
  // that predate the wrap-based pattern.
  let badgeVisible: boolean | null = null;
  if (badge !== null && copyWrap !== null) {
    const badgeWrap = copyWrap.findOne(function (n: SceneNode) {
      return (n.type === 'FRAME' || n.type === 'INSTANCE') && n.name === 'Badge_wrap';
    });
    if (badgeWrap !== null && 'visible' in badgeWrap) {
      badgeVisible = (badgeWrap as SceneNode).visible !== false;
    } else {
      const v = readBooleanProperty(copyWrap, 'showBadge');
      badgeVisible = v === null ? true : v;
    }
  }
  let badgeSection: GeneralSections['badge'] = null;
  if (badge !== null) {
    const currentBadgeIcon = readBadgeIcon(badge);
    // Plugin data — same pattern as Card. Survives library republishes
    // that wipe the slot child. The iframe compares with `icon` and
    // re-applies on mismatch.
    let badgeIconIntended = '';
    try {
      const stored = badge.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        badgeIconIntended = stored;
      }
    } catch (_e) {
      /* silent */
    }
    // Backfill: if no record yet but the slot already shows a real
    // icon, capture it so the next library update can reconcile.
    if (
      !isDevModeRuntime() &&
      badgeIconIntended.length === 0 &&
      currentBadgeIcon.length > 0
    ) {
      try {
        badge.setSharedPluginData('welder', 'icon', currentBadgeIcon);
        badgeIconIntended = currentBadgeIcon;
        debugLog(
          'badge-scan',
          'backfilled iconIntended="' + currentBadgeIcon + '" for ' + badge.id,
        );
      } catch (_e) {
        /* silent */
      }
    }
    badgeSection = {
      badgeNodeId: badge.id,
      label: readTextByName(badge, 'Label') || badge.name,
      icon: currentBadgeIcon,
      iconIntended: badgeIconIntended,
      visible: badgeVisible,
    };
  }

  const imageSection =
    imageWrap === null
      ? null
      : {
          imageWrapId: imageWrap.id,
          imageHash: readImageWrapHash(imageWrap),
        };

  const themeSection = await scanTheme(slide);

  // "Show Confidental" — BOOLEAN component property on the Slide instance
  // itself (controls the ConfidentalBadgeWrap). null when the slide's
  // component has no such property → the editor hides the toggle. The node
  // is spelled "Confidental" in the library; fall back to the correct
  // spelling in case a future master fixes it.
  let confidentialProp = readBooleanProperty(slide, 'Show Confidental');
  if (confidentialProp === null) {
    confidentialProp = readBooleanProperty(slide, 'Show Confidential');
  }
  const confidentialSection: GeneralSections['confidential'] =
    confidentialProp === null ? null : { show: confidentialProp };

  if (
    titleDescription === null &&
    badgeSection === null &&
    imageSection === null &&
    themeSection === null &&
    confidentialSection === null
  ) {
    return null;
  }
  return {
    titleDescription: titleDescription,
    badge: badgeSection,
    image: imageSection,
    theme: themeSection,
    confidential: confidentialSection,
  };
}
