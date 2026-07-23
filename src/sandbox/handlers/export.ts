import { postToUI } from '../bridge';
import { findSlideById, getSlidesOnCurrentPage, summaryForSlide } from '../slides';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleExportDocument(
  msg: Extract<UIToPluginMessage, { type: 'export-document' }>,
): Promise<void> {
  // Export the SLIDE parent when present — that's what Figma's native export
  // targets, not the Welder instance inside it. Figma Design has no SLIDE parent.
  if (msg.target === 'slide') {
    if (typeof msg.slideId !== 'string' || msg.slideId.length === 0) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'No slide selected to export.',
      });
      return;
    }
    const welderSlide = await findSlideById(msg.slideId);
    if (welderSlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const target: SceneNode =
      welderSlide.parent !== null && welderSlide.parent.type === 'SLIDE'
        ? (welderSlide.parent as SlideNode)
        : welderSlide;

    // Same naming logic as the SlideSelector picker, so the downloaded file
    // carries the name the user saw when picking the slide.
    const summary = summaryForSlide(welderSlide);
    const baseName = summary.name;

    const ext = msg.format === 'PNG' ? '.png' : '.pdf';
    const filename = sanitizeBaseFilename(baseName) + ext;
    let bytes: Uint8Array;
    try {
      bytes = await (target as unknown as ExportMixin).exportAsync({ format: msg.format });
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      postToUI({
        type: 'target-updated',
        ok: false,
        error: msg.format + '-export mislukt: ' + text,
      });
      return;
    }
    postToUI({
      type: 'document-ready',
      target: 'slide',
      format: msg.format,
      bytes: bytes,
      filename: filename,
      title: baseName,
    });
    return;
  }

  const baseName = figma.currentPage.name || 'presentation';
  if (msg.format === 'PNG') {
    // Whole-presentation PNG is ambiguous (one giant image vs. a zip of
    // per-slide PNGs); the UI gates this combo, so this is a defensive guard.
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'PNG-export voor de hele presentatie wordt nog niet ondersteund.',
    });
    return;
  }

  // Export each slide as its own single-page PDF and merge in the iframe with
  // pdf-lib — page-level exportAsync yields one giant page spanning the canvas.
  const welderSlides = getSlidesOnCurrentPage();
  const targets: SceneNode[] = [];
  for (let i = 0; i < welderSlides.length; i++) {
    const ws = welderSlides[i];
    if (ws.parent !== null && ws.parent.type === 'SLIDE') {
      const slide = ws.parent as SlideNode;
      if (slide.isSkippedSlide) continue;
      targets.push(slide);
    } else {
      targets.push(ws);
    }
  }
  if (targets.length === 0) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Geen slides om te exporteren.',
    });
    return;
  }

  const parts: Uint8Array[] = [];
  for (let i = 0; i < targets.length; i++) {
    try {
      const bytes = await (targets[i] as unknown as ExportMixin).exportAsync({
        format: 'PDF',
      });
      parts.push(bytes);
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'PDF-export slide ' + String(i + 1) + ' mislukt: ' + text,
      });
      return;
    }
  }
  postToUI({
    type: 'presentation-pdf-parts',
    parts: parts,
    filename: sanitizeBaseFilename(baseName) + '.pdf',
    title: baseName,
  });
  return;
}

// Strips the Windows-reserved filename chars (strictest download-target OS);
// caller appends the extension.
function sanitizeBaseFilename(raw: string): string {
  const trimmed = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  const collapsed = trimmed.replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const safe = collapsed.length > 0 ? collapsed : 'export';
  return safe.length > 80 ? safe.slice(0, 80) : safe;
}
