// ============================================================
// sandbox/handlers/export.ts
//
// Export-messages: één slide (PNG/PDF) of de hele presentatie als
// per-slide PDF-parts die de iframe met pdf-lib samenvoegt.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { postToUI } from '../bridge';
import { findSlideById, getSlidesOnCurrentPage, summaryForSlide } from '../slides';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleExportDocument(
  msg: Extract<UIToPluginMessage, { type: 'export-document' }>,
): Promise<void> {
  // Single slide → walk up to the SLIDE parent (1920×1080) when one
  // exists; that's what Figma's native present/export targets, not
  // the Welder INSTANCE inside it. In Figma Design (no SLIDE parent)
  // we fall back to the INSTANCE itself.
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

    // Match the picker name exactly: heading text within CopyWrap,
    // fallback to "Slide N" where N is the slide's 1-based index on
    // the current page. Same logic as `slideSummary` (used by the
    // SlideSelector dropdown), so the file the user downloads is
    // labelled with the same name they see in the picker.
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

  // Presentation export.
  const baseName = figma.currentPage.name || 'presentation';
  if (msg.format === 'PNG') {
    // PNG of an entire presentation is ambiguous (giant single image
    // vs. a zip of per-slide PNGs). Not supported in v1; UI gates
    // this combo, so this branch is a defensive guard.
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'PNG-export voor de hele presentatie wordt nog niet ondersteund.',
    });
    return;
  }

  // Presentation PDF — iterate non-skipped SLIDE nodes (or the
  // Welder INSTANCE when there's no SLIDE parent), exportAsync
  // each as a single-page PDF, ship the parts to the iframe; the
  // iframe merges with pdf-lib. Page-level exportAsync would just
  // produce one giant single-page PDF spanning the canvas grid.
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

/**
 * Strip filesystem-unfriendly characters from a string so it's safe
 * as a download filename across macOS / Windows / Linux. Collapses
 * runs of spaces / underscores into a single hyphen, drops leading
 * and trailing hyphens, caps length at 80 chars. Caller appends the
 * format extension.
 */
function sanitizeBaseFilename(raw: string): string {
  const trimmed = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  const collapsed = trimmed.replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const safe = collapsed.length > 0 ? collapsed : 'export';
  return safe.length > 80 ? safe.slice(0, 80) : safe;
}
