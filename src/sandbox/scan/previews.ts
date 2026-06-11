// ============================================================
// scan/previews.ts
//
// Preview-prefetch: post image-preview en card-visual-preview bytes
// naar de iframe tijdens de ui-ready handshake en na pick-slide.
// Errors zijn silent — een ontbrekende thumbnail valt terug op de
// "no preview"-state in de iframe.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findImageSlot } from '../editors/_shared/node-finders';
import { postToUI } from '../bridge';
import { SlideScan } from './slide-scan';

// Module-level: last-sent imageHash per imageWrapId — voorkomt re-posts op
// ongerelateerde documentchanges. Gedeeld met de upload-image handler in
// handlers/image.ts.
export var lastSentPreviewHash: Map<string, string> = new Map();

/**
 * Posts the initial slide's image-preview + card-visual-preview bytes
 * during the ui-ready handshake. Mirrors the fire-and-forget IIFEs in
 * the pick-slide handler so the splash screen window can pre-fetch
 * thumbnails too.
 */
export async function postInitialSlidePreviews(slide: InstanceNode, scan: SlideScan): Promise<void> {
  if (scan.general !== null && scan.general.image !== null && scan.general.image.imageHash !== null) {
    const imageWrapId = scan.general.image.imageWrapId;
    const imageHash = scan.general.image.imageHash;
    try {
      const img = figma.getImageByHash(imageHash);
      if (img !== null) {
        let fillW = 0;
        let fillH = 0;
        try {
          const wrapNode = await figma.getNodeByIdAsync(imageWrapId);
          if (wrapNode !== null && wrapNode.type === 'INSTANCE') {
            const slot = findImageSlot(wrapNode as InstanceNode, true);
            if (slot !== null && 'width' in slot && 'height' in slot) {
              const w = (slot as LayoutMixin).width;
              const h = (slot as LayoutMixin).height;
              if (w > 0 && h > 0) {
                fillW = w;
                fillH = h;
              }
            }
          }
        } catch (_e) {
          // fallback: 0/0 → iframe falls back to fixed-height preview
        }
        const bytes = await img.getBytesAsync();
        postToUI({
          type: 'image-preview',
          imageWrapId: imageWrapId,
          bytes: bytes,
          fillW: fillW,
          fillH: fillH,
        });
        lastSentPreviewHash.set(imageWrapId, imageHash);
      }
    } catch (_e) {
      // silent — slide-level image preview is non-essential
    }
  }

  if (scan.content !== null) {
    // Card-visual prefetch: each card has two awaits (getNodeByIdAsync
    // → getBytesAsync). Run all cards concurrently — a slide with 8
    // cards would otherwise serialize 16 round-trips before any
    // preview rendered.
    await Promise.all(
      scan.content.cards.map(async function (ci) {
        if (typeof ci.visualHash !== 'string') return;
        try {
          const cardNode = await figma.getNodeByIdAsync(ci.cardNodeId);
          if (cardNode === null || cardNode.type !== 'INSTANCE') return;
          const slot = findImageSlot(cardNode as InstanceNode, false);
          if (slot === null) return;
          const fills = (slot as GeometryMixin).fills;
          if (fills === figma.mixed || !Array.isArray(fills)) return;
          let imageHash: string | null = null;
          for (let f = 0; f < fills.length; f++) {
            if (fills[f].type === 'IMAGE') {
              imageHash = (fills[f] as ImagePaint).imageHash;
              break;
            }
          }
          if (imageHash === null) return;
          const img = figma.getImageByHash(imageHash);
          if (img === null) return;
          const bytes = await img.getBytesAsync();
          let fillW = 0;
          let fillH = 0;
          if ('width' in slot && 'height' in slot) {
            const w = (slot as LayoutMixin).width;
            const h = (slot as LayoutMixin).height;
            if (w > 0 && h > 0) {
              fillW = w;
              fillH = h;
            }
          }
          postToUI({
            type: 'card-visual-preview',
            cardNodeId: ci.cardNodeId,
            bytes: bytes,
            fillW: fillW,
            fillH: fillH,
          });
        } catch (_e) {
          // per-card silent
        }
      }),
    );
  }
}
