// ============================================================
// editors/general/image.ts
//
// Main-thread mutator voor de General → Image-sectie (spec §9-T10).
// Zoekt binnen de slide de ImageWrap-instance (spec §7.2) en vervangt
// de fill met een verse ImagePaint op basis van de geüploade bytes.
//
// v0.1.0:
//   - Replace-fill only. Geen crop — scaleMode blijft 'FILL' (spec §11
//     Known issues).
//   - Bytes komen via structured-cloning binnen als Uint8Array; we
//     geven ze rechtstreeks door aan `figma.createImage`.
//
// FIG-GUARD-01: `'fills' in imageWrap` check voordat we de property
// aanraken (ImageWrap is een INSTANCE en ondersteunt fills, maar we
// valideren defensief voor toekomstige wrapper-variaties).
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findImageWrap } from '../../slide-machine';

/** Payload-shape voor het `upload-image`-bericht (UI → main). */
export interface ImageUploadPayload {
  bytes: Uint8Array;
}

/**
 * Zoekt het image-slot (fill-dragende child) binnen de ImageWrap.
 * Strategie 1: descendant met name 'Image' of 'Visual' met fills-property.
 * Strategie 2: descendant met een bestaande IMAGE-fill (placeholder-patroon).
 * Strategie 3: de wrapper zelf als fallback.
 * Spiegelt findImageSlot uit editors/content/card.ts.
 *
 * Geëxporteerd zodat code.ts de slot-dimensies kan meesturen in
 * de `image-preview`-message voor preview-aspect-ratio-match (T28a-fix).
 */
export function findImageSlot(imageWrap: InstanceNode): SceneNode | null {
  if (!('findOne' in imageWrap)) return null;

  // Strategie 1: naam-gebaseerd
  const byName = imageWrap.findOne(function (n: SceneNode) {
    if (n.name !== 'Image' && n.name !== 'Visual' && n.name !== 'ImageSlot') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

  // Strategie 2: bestaande IMAGE-fill
  const byFill = imageWrap.findOne(function (n: SceneNode) {
    if (!('fills' in n)) return false;
    var fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed) return false;
    if (!Array.isArray(fills)) return false;
    for (var i = 0; i < fills.length; i++) {
      if (fills[i].type === 'IMAGE') return true;
    }
    return false;
  });
  if (byFill !== null) return byFill;

  // Strategie 3: gebruik de wrapper zelf als laatste redmiddel
  return imageWrap;
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

  const slot = findImageSlot(imageWrap);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  // figma.createImage is synchroon; retourneert een Image-object met
  // een stabiele hash. De bytes moeten een geldige PNG/JPG/GIF zijn —
  // Figma valideert het formaat en gooit een error bij corrupt input.
  const image = figma.createImage(payload.bytes);
  const imageHash = image.hash;

  // Build een verse ImagePaint. scaleMode 'FILL' is de default voor
  // placeholder-ImageWraps in Slide Machine en past het beeld zo dat
  // de hele wrapper bedekt is. Crop blijft v0.2.0 (spec §11).
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

/**
 * Past een focal-point crop toe op de ImageWrap. Zoekt de IMAGE-fill op
 * het image-slot, kloont de paint, zet scaleMode op 'CROP' en berekent
 * een scale-aware cover-transform op basis van de werkelijke image- en
 * fill-dimensies.
 *
 * Focal-point convention: xPct=0 → links, xPct=0.5 → midden, xPct=1 → rechts;
 * yPct=0 → boven, yPct=0.5 → midden, yPct=1 → onder.
 *
 * Algoritme: schaal de image zodanig dat de fill volledig bedekt is (cover).
 * Dimensies worden uit de bytes geparsed omdat de Figma Plugin API geen
 * image.width/height exposeert.
 *
 * Figma CROP imageTransform maps image-normalized coords to fill-
 * normalized coords (image→fill direction). Identity matrix means the
 * full image is stretched to cover the fill. For cover-fit with focal
 * point: scale `a = scaledW/fillW >= 1` (image oversized), translate
 * `tx = (1-a)*xPct` to shift content left as xPct grows toward 1.
 *
 * Persist focal-point als pluginData voor optionele round-trip in een latere task.
 *
 * Returns imageHash bij succes, null als geen IMAGE-fill gevonden of dimensies
 * niet geparsed konden worden.
 *
 * @deprecated — replaced by canvas-crop in UI (T28c, vue-picture-cropper),
 *   remove in v0.2.0. UI uploadt nu pre-gecropte bytes via de bestaande
 *   `upload-image`-pipeline; scaleMode blijft 'FILL' en imageTransform
 *   wordt niet meer aangeraakt.
 */
export async function applyCrop(
  imageWrap: InstanceNode,
  xPct: number,
  yPct: number,
): Promise<string | null> {
  var slot = findImageSlot(imageWrap);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  var fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;

  var imageIndex = -1;
  for (var i = 0; i < fills.length; i++) {
    if (fills[i].type === 'IMAGE') {
      imageIndex = i;
      break;
    }
  }
  if (imageIndex === -1) return null;

  var existingPaint = fills[imageIndex] as ImagePaint;
  var imageHash = existingPaint.imageHash;
  if (imageHash === null) return null;

  // Fetch image bytes to parse dimensions (needed for cover-scale math).
  var image = figma.getImageByHash(imageHash);
  if (image === null) return null;

  var imgBytes: Uint8Array;
  try {
    imgBytes = await image.getBytesAsync();
  } catch (_e) {
    return null;
  }

  var dims = parseImageDimensions(imgBytes);
  if (dims === null) return null;

  var imgW = dims.width;
  var imgH = dims.height;

  // Fill dimensions — slot is a SceneNode with .width/.height when it's a frame/shape.
  var fillW = (slot as LayoutMixin).width;
  var fillH = (slot as LayoutMixin).height;
  if (fillW <= 0 || fillH <= 0) return null;

  // Cover scale — image scaled to fully cover the fill area.
  var scaleCover = Math.max(fillW / imgW, fillH / imgH);
  var scaledW = imgW * scaleCover;
  var scaledH = imgH * scaleCover;

  // Convention 1: imageTransform maps image-normalized coords to
  // fill-normalized coords. Identity = full image stretched to fill.
  // For cover-fit: a = scaledW/fillW >= 1 (image is larger than fill in
  // image-space, zoomed in). tx = (1 - a) * xPct shifts the image
  // leftward as xPct grows (showing the right portion).
  var a = scaledW / fillW;
  var d = scaledH / fillH;
  var tx = (1 - a) * xPct;
  var ty = (1 - d) * yPct;

  var newPaint: ImagePaint = {
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'CROP',
    imageTransform: [
      [a, 0, tx],
      [0, d, ty],
    ] as Transform,
  };

  var newFills = fills.slice();
  newFills[imageIndex] = newPaint;
  (slot as GeometryMixin).fills = newFills;

  // Persist for potential round-trip in a later task.
  imageWrap.setPluginData('cropX', String(xPct));
  imageWrap.setPluginData('cropY', String(yPct));

  return imageHash;
}

/**
 * Parses width/height from PNG or JPEG bytes. Returns null for unsupported formats.
 * PNG: width/height at bytes 16-23, big-endian.
 * JPEG: scan for SOF0/SOF1/SOF2 marker (FFCn) — height at +5, width at +7.
 */
function parseImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A header
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    var w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    var h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width: w, height: h };
  }

  // JPEG: FF D8 ... scan for SOFn marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    var i = 2;
    var len = bytes.length;
    while (i < len - 8) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      // Skip fill bytes (multiple FFs)
      while (i < len && bytes[i] === 0xff) i++;
      if (i >= len) break;
      var marker = bytes[i];
      i++;
      // SOF0, SOF1, SOF2, SOF3, SOF5..SOF7, SOF9..SOF15 contain dimensions.
      // Most images are SOF0 (baseline) or SOF2 (progressive).
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        // Structure: [length: 2 bytes BE] [precision: 1] [height: 2 BE] [width: 2 BE]
        if (i + 7 >= len) return null;
        var jh = (bytes[i + 3] << 8) | bytes[i + 4];
        var jw = (bytes[i + 5] << 8) | bytes[i + 6];
        return { width: jw, height: jh };
      }
      // Standalone markers (no length field): RST0-7, SOI, EOI, TEM
      if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        continue;
      }
      // Other markers have a 2-byte length field (big-endian), length includes the 2 bytes itself
      if (i + 1 >= len) return null;
      var segLen = (bytes[i] << 8) | bytes[i + 1];
      if (segLen < 2) return null;
      i += segLen;
    }
  }

  return null;
}
