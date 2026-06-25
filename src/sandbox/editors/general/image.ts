// ============================================================
// editors/general/image.ts
//
// Main-thread mutator voor de General → Image-sectie. Zoekt binnen de
// slide de ImageWrap-instance en vervangt de fill met een verse
// ImagePaint op basis van de geüploade bytes.
//
// Replace-fill only — geen crop, scaleMode blijft 'FILL'. Bytes komen
// via structured-cloning binnen als Uint8Array; we geven ze rechtstreeks
// door aan `figma.createImage`.
//
// FIG-GUARD-01: `'fills' in imageWrap` check voordat we de property
// aanraken (ImageWrap is een INSTANCE en ondersteunt fills, maar we
// valideren defensief voor toekomstige wrapper-variaties).
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findImageWrap } from '../../slide-machine';
import { findImageSlot } from '../_shared/node-finders';

/** Payload-shape voor het `upload-image`-bericht (UI → main). */
export interface ImageUploadPayload {
  bytes: Uint8Array;
}

/**
 * Vervangt de fill van het image-slot binnen de ImageWrap met de geüploade
 * afbeelding. Resolveert zonder error wanneer de ImageWrap ontbreekt (silent
 * skip, FIG-GUARD-01) — de UI toont dan de oude state tot een slide-wissel.
 *
 * Returns de nieuwe ImagePaint-hash bij succes, of null als er geen
 * mutatie is uitgevoerd (ImageWrap niet gevonden, of `fills`-property
 * niet beschikbaar).
 */
export async function applyImage(
  slide: InstanceNode,
  payload: ImageUploadPayload,
): Promise<string | null> {
  const imageWrap = findImageWrap(slide);
  if (imageWrap === null) return null;

  const slot = findImageSlot(imageWrap, true);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  // figma.createImage is synchroon; retourneert een Image-object met
  // een stabiele hash. De bytes moeten een geldige PNG/JPG/GIF zijn —
  // Figma valideert het formaat en gooit een error bij corrupt input.
  const image = figma.createImage(payload.bytes);
  const imageHash = image.hash;

  // Build een verse ImagePaint. scaleMode 'FILL' is de default voor
  // placeholder-ImageWraps in Slide Machine en past het beeld zo dat
  // de hele wrapper bedekt is. Crop is nog niet geïmplementeerd.
  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'FILL',
  };

  // Vervang alle bestaande fills op het gevonden slot — we nemen nooit
  // meerdere fills over omdat het image-slot conceptueel één image draagt.
  (slot as GeometryMixin).fills = [paint];

  return imageHash;
}

