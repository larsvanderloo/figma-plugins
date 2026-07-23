// Camera-size uploads (8000px, 8 MB+) bloat the Figma file and slow the upload
// bridge while slide image slots top out around 1920px, so downscale + re-encode
// as JPEG (transparency deliberately dropped — slide visuals are photos).
// Any decode/encode failure falls back to the original bytes: uploads never
// block on compression.

/** 2048px covers retina at most slot sizes. */
const MAX_DIMENSION = 2048;

/** 0.85 is the "indistinguishable from source" sweet spot. */
const JPEG_QUALITY = 0.85;

/** Below this, skip re-encoding — it is lossy even at q=0.85. */
const SKIP_THRESHOLD_BYTES = 500 * 1024;

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
