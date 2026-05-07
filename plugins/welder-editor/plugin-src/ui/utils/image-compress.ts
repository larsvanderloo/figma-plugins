// ============================================================
// image-compress.ts — best-effort image compression for upload
//
// User-uploaded images often arrive at phone-camera dimensions (8000px,
// 8 MB+). Slide image-slots top out around 1920px on the long edge,
// so anything bigger is wasted bytes that bloat the Figma file, slow
// the upload-image bridge round-trip, and add nothing visually.
//
// Pipeline:
//   1. Decode bytes via createImageBitmap (modern Chromium iframe).
//   2. Compute target dimensions: max(srcW, srcH) capped at MAX_DIMENSION,
//      preserving aspect ratio. If the source already fits AND its byte
//      size is under SKIP_THRESHOLD, return the original — no quality
//      loss from re-encoding.
//   3. Render to a 2D canvas at the target size with high-quality
//      smoothing.
//   4. Encode as JPEG at JPEG_QUALITY. PNG transparency is sacrificed
//      — for Welder's slide visuals (photos) this is the right trade.
//   5. If the JPEG is somehow larger than the source, fall back to the
//      source. (Happens on very small inputs where JPEG headers
//      dominate.)
//
// Failures (no createImageBitmap, no canvas context, decode error)
// fall back to the original bytes — uploads never block on
// compression.
// ============================================================

/** Target ceiling for the longest side. 2048px covers retina at most slot sizes. */
const MAX_DIMENSION = 2048;

/** JPEG quality for re-encoded output. 0.85 is the standard "indistinguishable from source" sweet spot. */
const JPEG_QUALITY = 0.85;

/**
 * If the source is already small enough, skip re-encoding entirely
 * to preserve quality (re-encoding is lossy even at q=0.85).
 */
const SKIP_THRESHOLD_BYTES = 500 * 1024;

/**
 * Compress + scale image bytes to a sensible upload ceiling. Returns
 * the original bytes when compression isn't needed or would not help.
 */
export async function compressImageForUpload(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof createImageBitmap !== 'function') return bytes;

  let bitmap: ImageBitmap;
  try {
    const blob = new Blob([bytes as BlobPart]);
    bitmap = await createImageBitmap(blob);
  } catch {
    return bytes;
  }

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const longest = Math.max(srcW, srcH);

  // Already within budget by both dimension and bytes — keep original.
  if (longest <= MAX_DIMENSION && bytes.length < SKIP_THRESHOLD_BYTES) {
    bitmap.close?.();
    return bytes;
  }

  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return bytes;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const outBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  );
  if (outBlob === null) return bytes;

  const outBuffer = await outBlob.arrayBuffer();
  const out = new Uint8Array(outBuffer);
  return out.length < bytes.length ? out : bytes;
}
