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

import { findCopyWrap } from '../../slide-machine';
import { setTextCharactersSafe } from '../_shared/fonts';

/** Payload-shape voor `update-general` met section `titleDescription`. */
export interface TitleDescriptionPayload {
  heading?: string;
  paragraph?: string;
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
      // T39.4: lege Heading verbergen zodat de CopyWrap-auto-layout om
      // de overgebleven nodes sluit. Zet visible weer true zodra er weer
      // tekst getypt wordt. T39.3 picks de slide-reflow op en re-rendert
      // de tabel(len) automatisch met de nieuwe slot-hoogte.
      headingNode.visible = payload.heading !== '';
    }
  }

  if (typeof payload.paragraph === 'string') {
    const paragraphNode = findTextByName(copyWrap, 'Paragraph');
    if (paragraphNode !== null) {
      await setTextCharactersSafe(paragraphNode, payload.paragraph);
      // T39.4: idem voor Paragraph — lege paragraaf verbergen i.p.v.
      // visueel een lege regel laten staan.
      paragraphNode.visible = payload.paragraph !== '';
    }
  }
}
