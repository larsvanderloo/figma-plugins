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
import { setTextCharactersSafe } from '../_shared/fonts';

/** Payload-shape voor `update-general` met section `titleDescription`. */
export interface TitleDescriptionPayload {
  heading?: string;
  paragraph?: string;
  /** Explicit heading visibility — toggled by the iframe switch. */
  headingVisible?: boolean;
  /** Explicit paragraph visibility — toggled by the iframe switch. */
  paragraphVisible?: boolean;
}

/**
 * Zoekt het eerste descendant-text-node met de opgegeven naam binnen
 * `scope` en retourneert het als TextNode of null. Bounded — blijft
 * binnen de CopyWrap-subtree.
 */
function findTextByName(scope: SceneNode, name: string): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found;
}

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
      // Visibility is now driven by the explicit `headingVisible` switch
      // (see below). Keep the inner TEXT visible so the toggle can show
      // / hide via the wrapper without ever blanking the inner node.
      headingNode.visible = true;
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
  // toggles the TypHeading wrapper; paragraph routes through the
  // `showParagraph` BOOLEAN component property on CopyWrap (canonical
  // Welder mechanism — Slide Machine reflows the rest of the slide
  // off this signal).
  if (typeof payload.headingVisible === 'boolean') {
    const headingNode = findTextByName(copyWrap, 'Heading');
    if (headingNode !== null) {
      const wrapper = findEnclosingInstanceByName(headingNode, 'TypHeading', slide);
      if (wrapper !== null) {
        wrapper.visible = payload.headingVisible;
      } else {
        headingNode.visible = payload.headingVisible;
      }
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
      } catch (e) {
        console.log('[title-description] setProperties showParagraph failed: ' + String(e));
      }
    } else {
      // Legacy fallback: no BOOLEAN prop — toggle the wrapper instance.
      const paragraphNode = findTextByName(copyWrap, 'Paragraph');
      if (paragraphNode !== null) {
        const wrapper = findEnclosingInstanceByName(paragraphNode, 'TypParagraph', slide);
        if (wrapper !== null) {
          wrapper.visible = payload.paragraphVisible;
        } else {
          paragraphNode.visible = payload.paragraphVisible;
        }
      }
    }
  }
}
