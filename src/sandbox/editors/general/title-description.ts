// All text writes go through setTextCharactersSafe: mixed-font nodes need every
// font in the existing styled range loaded before writing .characters — loading
// only char-0's font silently truncates at the first font boundary.

import { findCopyWrap, findEnclosingInstanceByName } from '../../slide-machine';
import { applyAccentRanges } from '../_shared/accent-ranges';
import { findTextByName } from '../_shared/node-finders';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

import type { TitleDescriptionPayload } from '../../../shared/types';

export async function applyTitleDescription(
  slide: InstanceNode,
  payload: TitleDescriptionPayload,
): Promise<void> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return;

  // Live typing resends the full payload every ~200ms; skip unchanged nodes to
  // avoid a font-load + write per pause. Accent ranges stay outside the guard —
  // dim can change while the text does not.
  if (typeof payload.heading === 'string') {
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (headingNode !== null) {
      if (headingNode.characters !== payload.heading) {
        await setTextCharactersSafe(headingNode, payload.heading);
      }
      // Visibility is owned by the `headingVisible` toggle below; keep the
      // inner TEXT visible so that toggle never blanks the node itself.
      headingNode.visible = true;
      if (payload.headingDim !== undefined) {
        await applyAccentRanges(headingNode, payload.headingDim);
      }
    }
  }

  if (typeof payload.paragraph === 'string') {
    const paragraphNode = findTextByName(copyWrap, 'Paragraph');
    if (paragraphNode !== null) {
      if (paragraphNode.characters !== payload.paragraph) {
        await setTextCharactersSafe(paragraphNode, payload.paragraph);
      }
      paragraphNode.visible = true;
    }
  }

  // Heading visibility toggles the whole CopyWrap — it owns the fill/container,
  // so hiding only TypHeading would leave the container visible. Paragraph goes
  // through the `showParagraph` BOOLEAN prop, which the slide machine reflows off.
  if (typeof payload.headingVisible === 'boolean') {
    copyWrap.visible = payload.headingVisible;
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (payload.headingVisible === true && headingNode !== null) {
      // Older builds hid TypHeading directly; clear that nested state so a
      // re-shown CopyWrap does not keep the title visually hidden.
      const wrapper = findEnclosingInstanceByName(headingNode, 'TypHeading', slide);
      if (wrapper !== null) {
        wrapper.visible = true;
      }
      headingNode.visible = true;
    }
  }

  if (typeof payload.paragraphVisible === 'boolean') {
    const props = copyWrap.componentProperties;
    let showKey: string | null = null;
    if (props !== null && props !== undefined) {
      const keys = Object.keys(props);
      for (let i = 0; i < keys.length; i++) {
        const bare = keys[i].split('#')[0].toLowerCase();
        if (bare === 'showparagraph' && props[keys[i]].type === 'BOOLEAN') {
          showKey = keys[i];
          break;
        }
      }
    }
    if (showKey !== null) {
      try {
        const overrides: { [k: string]: boolean } = {};
        overrides[showKey] = payload.paragraphVisible;
        copyWrap.setProperties(overrides);
        debugLog('title-description', 'paragraphVisible via property', {
          key: showKey,
          value: payload.paragraphVisible,
        });
      } catch (e) {
        console.log('[title-description] setProperties showParagraph failed: ' + String(e));
      }
      if (payload.paragraphVisible === true) {
        // A TypParagraph hidden directly on canvas (older builds) does not
        // come back through the property alone.
        const paragraphNode = findTextByName(copyWrap, 'Paragraph');
        if (paragraphNode !== null) {
          const wrapper = findEnclosingInstanceByName(paragraphNode, 'TypParagraph', slide);
          if (wrapper !== null) {
            wrapper.visible = true;
          }
          paragraphNode.visible = true;
        }
      }
    } else {
      // Older components lack the showParagraph prop; toggle the wrapper instead.
      const paragraphNode = findTextByName(copyWrap, 'Paragraph');
      if (paragraphNode !== null) {
        const wrapper = findEnclosingInstanceByName(paragraphNode, 'TypParagraph', slide);
        if (wrapper !== null) {
          wrapper.visible = payload.paragraphVisible;
          debugLog('title-description', 'paragraphVisible via TypParagraph wrapper', {
            wrapperId: wrapper.id,
            value: payload.paragraphVisible,
          });
        } else {
          paragraphNode.visible = payload.paragraphVisible;
          debugLog('title-description', 'paragraphVisible via text node', {
            nodeId: paragraphNode.id,
            value: payload.paragraphVisible,
          });
        }
      } else {
        debugLog('title-description', 'paragraphVisible: no Paragraph text node found');
      }
    }
  }
}
