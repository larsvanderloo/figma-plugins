// ============================================================
// scan/slide-scan.ts
//
// Composer van de read-kant: scanSlide bundelt de per-domein scans
// (general / content / graphs) tot de typed SlideScan die als
// `slide-loaded` over de bus gaat, plus de on-load normalisatie van
// CopyWrap-zichtbaarheid. De domein-scans en readers leven in hun
// eigen modules (scan/general, scan/content, scan/graphs, scan/theme,
// scan/readers, scan/previews). Mutaties horen hier NIET — die leven
// in editors/**.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findCopyWrap } from '../slide-machine';
import { GeneralSections, ContentItems, GraphItems } from '../../shared/types';
import { debugLog } from '../../shared/debug';
import { isDevModeRuntime } from '../runtime';
import { scanGeneral } from './general';
import { scanContent } from './content';
import { scanGraphs, refreshTablesOnSlide } from './graphs';

/** Combinatie van de drie tab-payloads; exact de shape van `slide-loaded`. */
export interface SlideScan {
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

export async function scanSlide(slide: InstanceNode): Promise<SlideScan> {
  const startedAt = Date.now();
  let normalizeMs = 0;
  let refreshTablesMs = 0;
  if (!isDevModeRuntime()) {
    const normalizeStartedAt = Date.now();
    const visibilityChanged = await normalizeCopyWrapVisibility(slide);
    normalizeMs = Date.now() - normalizeStartedAt;
    if (visibilityChanged) {
      const refreshStartedAt = Date.now();
      await refreshTablesOnSlide(slide);
      refreshTablesMs = Date.now() - refreshStartedAt;
    }
  } else {
    debugLog('sandbox', 'scan-readonly', { slideId: slide.id });
  }

  const generalStartedAt = Date.now();
  const general = await scanGeneral(slide);
  const generalMs = Date.now() - generalStartedAt;

  const contentStartedAt = Date.now();
  const content = await scanContent(slide);
  const contentMs = Date.now() - contentStartedAt;

  const graphsStartedAt = Date.now();
  const graphs = scanGraphs(slide);
  const graphsMs = Date.now() - graphsStartedAt;

  debugLog('perf', 'scan-slide', {
    slideId: slide.id,
    normalizeMs: normalizeMs,
    refreshTablesMs: refreshTablesMs,
    generalMs: generalMs,
    contentMs: contentMs,
    graphsMs: graphsMs,
    totalMs: Date.now() - startedAt,
    hasGeneral: general !== null,
    cardCount: content !== null ? content.cards.length : 0,
    graphCount: graphs !== null ? graphs.instances.length : 0,
  });

  return {
    general: general,
    content: content,
    graphs: graphs,
  };
}

/**
 * Normaliseer Heading/Paragraph-zichtbaarheid op slide-load.
 *
 * Bestaande slides kunnen lege heading/paragraph text-nodes hebben die
 * nooit door de plugin gemuteerd zijn (visible=true ondanks characters="").
 * Het mutation-pad wordt elders gefixt; deze helper handelt de existing-
 * empty case op pick-slide.
 *
 * Returnt `true` als er minstens één visibility-flip plaatsvond, zodat
 * de caller weet of een refreshTablesOnSlide nodig is.
 *
 * Idempotent: als beide nodes al de juiste visibility hebben → no-op.
 */
async function normalizeCopyWrapVisibility(slide: InstanceNode): Promise<boolean> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return false;
  let changed = false;

  // Scope guard: only mutate text nodes that belong to CopyWrap's OWN
  // content, not nodes inside a nested instance (e.g. a Badge embedded
  // in CopyWrap, which has its own Heading/Placeholder semantics owned
  // by the Badge component). Without this, the plugin clobbers state
  // it doesn't own — confirmed via Figma MCP for the Welder Templates
  // file (Badge has a `Placeholder` TEXT child whose visibility carries
  // the badge's displayed text appearance; flipping it to false hides
  // the badge text on every slide-load).
  const isOwnNode = (n: SceneNode): boolean => !isInsideNestedInstance(n, copyWrap);

  // Heading + Paragraph: visible alleen als characters niet leeg zijn.
  const charDriven = ['Heading', 'Paragraph'];
  for (let i = 0; i < charDriven.length; i++) {
    const name = charDriven[i];
    const node = copyWrap.findOne(
      (n: SceneNode) => n.type === 'TEXT' && n.name === name && isOwnNode(n),
    );
    if (node === null || node.type !== 'TEXT') continue;
    const text = (node as TextNode).characters;
    const desiredVisible = text !== '';
    if (node.visible !== desiredVisible) {
      node.visible = desiredVisible;
      changed = true;
    }
  }

  // Placeholder is een Slide-Machine-template-hint die zich toont
  // wanneer Paragraph leeg is. Plugin is source-of-truth; placeholder is
  // designer-crutch en moet altijd verborgen zijn zodat CopyWrap-auto-
  // layout om de werkelijke content sluit. Naam "Placeholder" matcht alle
  // bekende Welder-template-varianten.
  const placeholders = copyWrap.findAll(
    (n: SceneNode) => n.type === 'TEXT' && n.name === 'Placeholder' && isOwnNode(n),
  );
  for (let p = 0; p < placeholders.length; p++) {
    const ph = placeholders[p];
    if (ph.visible !== false) {
      ph.visible = false;
      changed = true;
    }
  }

  return changed;
}

/**
 * Walks the parent chain from `node` up to (but not past) `scopeRoot`.
 * Returns true if any ancestor along the way is itself an INSTANCE — i.e.
 * `node` lives inside a nested component instance whose internal structure
 * is owned by that component, not by the scope.
 *
 * Confirmed via Figma MCP that Welder Badge instances live inside CopyWrap
 * and carry their own `Placeholder` TEXT child (visibility = badge's
 * displayed text), which the plugin must not touch.
 */
function isInsideNestedInstance(node: SceneNode, scopeRoot: InstanceNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current !== null && current !== scopeRoot) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}
