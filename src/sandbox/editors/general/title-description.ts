// ============================================================
// editors/general/title-description.ts
//
// Main-thread mutator voor de General → TitleDescription-sectie.
// Zoekt binnen de slide de CopyWrap-instance (spec §7.2) en muteert
// de descendant text-nodes `Heading` en `Paragraph` in-place.
//
// Beide velden zijn optioneel in de payload — alleen gezette velden
// worden toegepast. Wanneer een target-text-node niet bestaat slaan
// we die update stil over (FIG-GUARD-01) zodat een CopyWrap zonder
// Paragraph geen harde error oplevert.
//
// FIG-FONT-01: elke text-mutatie gaat via `setTextCharactersSafe`
// (editors/_shared/fonts.ts), die álle fonts in de bestaande styled-
// range laadt vóór de write. REQUIRED_FONTS is al bij startup geladen
// maar mixed-font nodes vereisen een volledige segment-scan — alleen
// char-0's font laden truncate-t stil bij de eerste font-boundary.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findCopyWrap, findEnclosingInstanceByName } from '../../slide-machine';
import { applyAccentRanges } from '../_shared/accent-ranges';
import { findTextByName } from '../_shared/node-finders';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

import type { TitleDescriptionPayload } from '../../../shared/types';

/**
 * Past een TitleDescription-payload toe op de CopyWrap van `slide`.
 * Resolveert zonder error wanneer de CopyWrap of target-nodes ontbreken
 * (silent skip, FIG-GUARD-01).
 */
export async function applyTitleDescription(
  slide: InstanceNode,
  payload: TitleDescriptionPayload,
): Promise<void> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return;

  if (typeof payload.heading === 'string') {
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (headingNode !== null) {
      await setTextCharactersSafe(headingNode, payload.heading);
      // Visibility is driven by the explicit `headingVisible` switch
      // (see below). Keep the inner TEXT visible so the CopyWrap toggle
      // never blanks the node itself.
      headingNode.visible = true;
      if (payload.headingDim !== undefined) {
        await applyAccentRanges(headingNode, payload.headingDim);
      }
    }
  }

  if (typeof payload.paragraph === 'string') {
    const paragraphNode = findTextByName(copyWrap, 'Paragraph');
    if (paragraphNode !== null) {
      await setTextCharactersSafe(paragraphNode, payload.paragraph);
      paragraphNode.visible = true;
    }
  }

  // Explicit visibility toggles — decoupled from text content so the
  // user can hide a section without losing what they typed. Heading
  // toggles the whole CopyWrap because CopyWrap owns the fill/container;
  // hiding only TypHeading leaves the container visible. Paragraph still
  // routes through the `showParagraph` BOOLEAN component property on
  // CopyWrap (canonical Welder mechanism — Slide Machine reflows the
  // rest of the slide off this signal).
  if (typeof payload.headingVisible === 'boolean') {
    copyWrap.visible = payload.headingVisible;
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (payload.headingVisible === true && headingNode !== null) {
      // Legacy cleanup: older builds hid TypHeading itself. When the
      // CopyWrap comes back, make sure that nested state does not keep
      // the title visually hidden.
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
        // Legacy cleanup — mirror the heading path above: a TypParagraph
        // that was hidden directly on the canvas (instead of via
        // showParagraph) does not come back through the property alone.
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
      // Legacy fallback: no BOOLEAN prop — toggle the wrapper instance.
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
