// ============================================================
// Runtime- en slide-level types — slide-overzicht (spec §3.1),
// overkoepelende PluginView-state (spec §3.2) en runtime-info.
// ============================================================

import type { GeneralSections } from './general';
import type { ContentItems } from './content';
import type { GraphItems } from './graphs';

// ============================================================
// Slide-overzicht (spec §3.1)
// ============================================================

export interface SlideSummary {
  /** Figma node-id van de Slide-instance (stabiel binnen een sessie). */
  id: string;
  /** 1-based volgnummer — gesorteerd op findAll-volgorde op currentPage. */
  number: number;
  /** Display-naam, bv. "Slide 3 — Customer Journey". */
  name: string;
  /**
   * Wordt deze slide overgeslagen bij presenteren?
   * `true`  → SlideNode.isSkippedSlide === true (skip-mode aan).
   * `false` → SlideNode.isSkippedSlide === false (normale slide).
   * `null`  → geen SlideNode-parent (Figma Design-editor); skip niet ondersteund op dit surface.
   */
  isSkipped: boolean | null;
}

// ============================================================
// Overkoepelende PluginView-state (spec §3.2)
// ============================================================

export interface PluginView {
  /** Current slide summary (id, number, name, isSkipped); null when no slide selected. */
  currentSummary: SlideSummary | null;
  /** null tot er een slide is gekozen óf als de slide deze wrapper niet heeft. */
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

export interface PluginRuntimeInfo {
  editorType: string;
  mode: string;
  command: string;
  vscode: boolean;
  debug: boolean;
}
