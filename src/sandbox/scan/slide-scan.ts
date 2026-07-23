// Read-side scan composer. Mutations do not belong here — they live in
// editors/**; the on-load CopyWrap visibility normalization is the one exception.

import { findCopyWrap } from '../slide-machine';
import { GeneralSections, ContentItems, GraphItems } from '../../shared/types';
import { debugLog } from '../../shared/debug';
import { isDevModeRuntime } from '../runtime';
import { scanGeneral } from './general';
import { scanContent } from './content';
import { scanGraphs, refreshTablesOnSlide } from './graphs';

/** Exactly the shape of the `slide-loaded` bus message. */
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
 * Pre-existing slides can carry visible=true Heading/Paragraph nodes with empty
 * characters (never plugin-mutated); normalize on slide-load. Returns true when
 * any visibility flipped, so the caller knows tables need a refresh.
 */
async function normalizeCopyWrapVisibility(slide: InstanceNode): Promise<boolean> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return false;
  let changed = false;

  // Only mutate CopyWrap's own text nodes, never those inside a nested instance:
  // e.g. Badge has its own `Placeholder` TEXT child whose visibility carries the
  // badge text — flipping it would hide the badge on every slide-load.
  const isOwnNode = (n: SceneNode): boolean => !isInsideNestedInstance(n, copyWrap);

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

  // "Placeholder" is a designer-side template hint shown when Paragraph is empty;
  // keep it hidden so CopyWrap's auto-layout closes around the real content.
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

function isInsideNestedInstance(node: SceneNode, scopeRoot: InstanceNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current !== null && current !== scopeRoot) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}
