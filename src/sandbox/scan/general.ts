import {
  findCopyWrap,
  findBadge,
  findImageWrap,
  findConfidentalBadge,
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

  let titleDescription: GeneralSections['titleDescription'] = null;
  if (copyWrap !== null) {
    // Characters are read regardless of visibility so the iframe can preserve
    // text across a hide/show cycle; the visible node ref is only needed for
    // the accent dim-range read below.
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    const heading = readTextByName(copyWrap, 'Heading') || '';
    // `paragraph` null = master has no Paragraph TextNode at all (section
    // unsupported); a hidden-but-present node still sends its chars.
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
      // Legacy: older builds hid TypHeading directly; report that as hidden
      // until the next "on" toggle normalizes both nodes.
      headingVisible = (typHeading as InstanceNode).visible !== false;
    }
    let paragraphVisible: boolean | null = null;
    if (paragraph !== null) {
      const showParagraphValue = readBooleanProperty(copyWrap, 'showParagraph');
      paragraphVisible = showParagraphValue === null ? true : showParagraphValue;
      if (paragraphVisible) {
        // CopyWraps without a showParagraph property (or a stale true) carry
        // visibility on the TypParagraph wrapper / Paragraph node itself;
        // without this read the toggle bounces back after every off-toggle.
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

    // Heading-only; paragraph accent is permanently out of scope. Falls back
    // to null when the library is unreachable or the heading node is missing.
    let headingDim: Array<[number, number]> | null = null;
    if (headingNode !== null) {
      try {
        headingDim = await readDimRanges(headingNode);
      } catch (err: unknown) {
        console.log('[welder-slide-editor] readDimRanges(heading) failed:', err);
        headingDim = null;
      }
    }

    // The heading-size VARIANT lives on the nested TypHeading instance, not
    // on CopyWrap itself.
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

  // Badge visibility source of truth is the Badge_wrap FRAME's .visible
  // (collapses cleanly out of CopyWrap auto-layout); the showBadge BOOLEAN is
  // a legacy fallback for pre-wrap CopyWraps.
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
    // Plugin data survives library republishes that wipe the slot child; the
    // iframe re-applies the stored pick on mismatch.
    let badgeIconIntended = '';
    try {
      const stored = badge.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        badgeIconIntended = stored;
      }
    } catch (_e) {
      /* silent */
    }
    // Backfill: capture a visible icon without a record so the next library
    // update can reconcile.
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

  // "Show Confidental" is the library's actual (misspelled) property name;
  // the corrected spelling is a fallback for a future master rename. null =
  // the slide's component lacks the property and the editor hides the control.
  let confidentialProp = readBooleanProperty(slide, 'Show Confidental');
  if (confidentialProp === null) {
    confidentialProp = readBooleanProperty(slide, 'Show Confidential');
  }
  // The Variant is NOT exposed on the Slide instance — it lives on the nested
  // ConfidentalBadge. Options are read from its component set so the dropdown
  // mirrors whatever the designer defines.
  let confidentialSection: GeneralSections['confidential'] = null;
  if (confidentialProp !== null) {
    let variant: string | null = null;
    let variantOptions: string[] = [];
    const badge = findConfidentalBadge(slide);
    if (badge !== null) {
      const bp = badge.componentProperties;
      if (bp !== null && bp !== undefined) {
        const entry = bp['Variant'];
        if (entry !== undefined && entry !== null && typeof entry.value === 'string') {
          variant = entry.value;
        }
      }
      // Options come from the component set definition, not the instance.
      // getMainComponentAsync is the dynamic-page-safe path; guarded so a
      // failure just leaves options empty (the dropdown falls back to the
      // current value below).
      try {
        const main = await badge.getMainComponentAsync();
        if (main !== null && main.parent !== null && main.parent.type === 'COMPONENT_SET') {
          const defs = (main.parent as ComponentSetNode).componentPropertyDefinitions;
          if (defs !== null && defs !== undefined) {
            const def = defs['Variant'];
            if (def !== undefined && def !== null && def.variantOptions !== undefined) {
              variantOptions = def.variantOptions;
            }
          }
        }
      } catch (eOpts) {
        console.log('[welder-slide-editor] confidential variant options read failed:', eOpts);
      }
    }
    // Fallback so the dropdown always has the current value even if the option
    // list couldn't be read.
    if (variantOptions.length === 0 && variant !== null) variantOptions = [variant];
    confidentialSection = { show: confidentialProp, variant: variant, variantOptions: variantOptions };
  }

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
