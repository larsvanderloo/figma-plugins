// Deliberately stateless: all state patched here is owned by App.vue or the
// stores and arrives as refs/callbacks — don't add local state to this composable.

import { PDFDocument } from 'pdf-lib';
import type { Ref } from 'vue';
import { getLucideSvg } from '../lucide-svgs';
import type { useIconRecents } from '../stores/useIconRecents';
import type { useNotifications } from '../stores/useNotifications';
import type { useOnboarding } from '../stores/useOnboarding';
import type { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';

const PDF_AUTHOR = 'Welder B.V.';
const PDF_CREATOR = 'Welder Slide Editor';
const PDF_PRODUCER = 'Welder Slide Editor';
const PDF_KEYWORDS = ['Welder', 'Welder Slide Editor', 'presentation', 'slides'];
const PDF_LANGUAGE = 'nl-NL';

function applyPdfMetadata(doc: PDFDocument, title: string): void {
  const now = new Date();
  doc.setTitle(title);
  doc.setAuthor(PDF_AUTHOR);
  doc.setCreator(PDF_CREATOR);
  doc.setProducer(PDF_PRODUCER);
  doc.setSubject(
    '© ' +
      String(now.getFullYear()) +
      ' Welder B.V. Alle rechten voorbehouden. ' +
      'Gemaakt met Welder Slide Editor.',
  );
  doc.setKeywords(PDF_KEYWORDS);
  doc.setLanguage(PDF_LANGUAGE);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
}

function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface PluginMessagesOptions {
  view: ReturnType<typeof usePluginView>;
  iconRecents: ReturnType<typeof useIconRecents>;
  notifications: ReturnType<typeof useNotifications>;
  onboarding: ReturnType<typeof useOnboarding>;
  initializing: Ref<boolean>;
  finishReconcile: () => void;
  scheduleReconcileFallback: () => void;
  /** Incoming icon-recents originate in the sandbox; saving them back would echo-loop. */
  suppressNextIconRecentsSave: () => void;
}

export function usePluginMessages(options: PluginMessagesOptions): void {
  const bridge = usePluginBridge();
  const {
    view,
    iconRecents,
    notifications,
    onboarding,
    initializing,
    finishReconcile,
    scheduleReconcileFallback,
    suppressNextIconRecentsSave,
  } = options;

  bridge.onMessage((msg) => {
    if (msg.type === 'init') {
      if (msg.runtime !== undefined) {
        view.setRuntime(msg.runtime);
      }
      initializing.value = false;
      return;
    }
    if (msg.type === 'slide-loaded') {
      view.setSlideLoaded(msg.summary, msg.general, msg.content, msg.graphs);
      initializing.value = false;
      return;
    }
    if (msg.type === 'instructor-card-updated') {
      // After an instructor switch the sandbox has already reset the list texts
      // to the new variant's defaults; mirror that here rather than re-deriving.
      const instructorList = view.state.content?.instructorCards ?? null;
      if (instructorList !== null) {
        const cardIdx = instructorList.findIndex((c) => c.cardNodeId === msg.cardNodeId);
        if (cardIdx >= 0) {
          instructorList[cardIdx].instructor = msg.instructor;
          instructorList[cardIdx].items = [...msg.items];
        }
      }
      return;
    }
    if (msg.type === 'stale-icons') {
      const cardCount = msg.cards.length;
      const badgeCount = msg.badges.length;
      console.log(
        '[icon-reconcile] sandbox flagged ' +
          cardCount +
          ' card icon(s) + ' +
          badgeCount +
          ' badge icon(s) as stale',
      );
      for (let i = 0; i < msg.cards.length; i++) {
        const entry = msg.cards[i];
        const svg = getLucideSvg(entry.iconIntended);
        if (svg === null) continue;
        bridge.post({
          type: 'update-card',
          slideId: entry.slideId,
          cardNodeId: entry.cardNodeId,
          payload: { icon: entry.iconIntended, iconSvg: svg },
        });
      }
      for (let i = 0; i < msg.badges.length; i++) {
        const entry = msg.badges[i];
        const svg = getLucideSvg(entry.iconIntended);
        if (svg === null) continue;
        bridge.post({
          type: 'update-general',
          slideId: entry.slideId,
          section: 'badge',
          payload: { icon: entry.iconIntended, iconSvg: svg },
        });
      }
      if (cardCount === 0 && badgeCount === 0) {
        finishReconcile();
      } else {
        scheduleReconcileFallback();
      }
      return;
    }
    if (msg.type === 'slide-summary') {
      view.setSummary(msg.summary);
      return;
    }
    if (msg.type === 'slide-deselected') {
      view.clearSlide();
      return;
    }
    if (msg.type === 'icon-recents') {
      if (msg.items.length === 0) {
        let migrated: string[] | null = null;
        try {
          const raw = localStorage.getItem('welder-icon-picker-recent');
          if (raw !== null) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) {
              migrated = (parsed as string[]).slice(0, 8);
              localStorage.removeItem('welder-icon-picker-recent');
            }
          }
        } catch {
        }
        if (migrated !== null) {
          iconRecents.setItems(migrated);
          return;
        }
      }
      suppressNextIconRecentsSave();
      iconRecents.setItems(msg.items);
      return;
    }
    if (msg.type === 'onboarding-seen') {
      onboarding.setSeenFromSandbox(msg.seen);
      return;
    }
    if (msg.type === 'presentation-pdf-parts') {
      void (async () => {
        try {
          const merged = await PDFDocument.create();
          for (let i = 0; i < msg.parts.length; i++) {
            const slideDoc = await PDFDocument.load(msg.parts[i]);
            const pages = await merged.copyPages(slideDoc, slideDoc.getPageIndices());
            for (let p = 0; p < pages.length; p++) merged.addPage(pages[p]);
          }
          applyPdfMetadata(merged, msg.title);
          const bytes = await merged.save();
          downloadBlob(bytes, msg.filename, 'application/pdf');
        } catch (err: unknown) {
          const text = err instanceof Error ? err.message : String(err);
          notifications.pushError('PDF samenvoegen mislukt', text);
        }
      })();
      return;
    }
    if (msg.type === 'document-ready') {
      if (msg.format === 'PNG') {
        try {
          downloadBlob(msg.bytes, msg.filename, 'image/png');
        } catch (err: unknown) {
          const text = err instanceof Error ? err.message : String(err);
          notifications.pushError('Download mislukt', text);
        }
        return;
      }
      void (async () => {
        try {
          const doc = await PDFDocument.load(msg.bytes);
          applyPdfMetadata(doc, msg.title);
          const bytes = await doc.save();
          downloadBlob(bytes, msg.filename, 'application/pdf');
        } catch (err: unknown) {
          const text = err instanceof Error ? err.message : String(err);
          notifications.pushError('Download mislukt', text);
        }
      })();
      return;
    }
    if (msg.type === 'target-updated' && msg.ok === false) {
      notifications.pushError(
        'Bewerking mislukt',
        typeof msg.error === 'string' && msg.error.length > 0 ? msg.error : undefined,
      );
      return;
    }
  });
}
