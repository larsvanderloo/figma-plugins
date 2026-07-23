import type { GeneralSections } from './general';
import type { ContentItems } from './content';
import type { GraphItems } from './graphs';

export interface SlideSummary {
  /** Figma node id of the Slide instance; stable only within a session. */
  id: string;
  /** 1-based position, in findAll order on the current page. */
  number: number;
  name: string;
  /** Mirrors SlideNode.isSkippedSlide; null = no SlideNode parent (Figma Design editor), where skip is unsupported. */
  isSkipped: boolean | null;
}

export interface PluginView {
  /** null while no slide is selected. */
  currentSummary: SlideSummary | null;
  /** null until a slide is chosen, or when the slide lacks this wrapper. */
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
