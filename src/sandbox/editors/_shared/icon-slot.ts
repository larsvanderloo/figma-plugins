// Slot-based icon swap (shared by Card / Badge). SlotNodes accept child
// mutations inside an instance without detaching it, which makes this faster
// and library-independent vs INSTANCE_SWAP + importComponentByKeyAsync.

import { debugLog } from '../../../shared/debug';

const SLOT_NAME = 'icon-slot';

/**
 * Card masters hold one `icon-slot` per variant, the inactive one hidden via
 * `.visible = false` on the slot or an ancestor — `findOne` would return that
 * hidden slot first in tree order and mutations would silently target the
 * wrong node. Pick the first slot whose whole ancestor chain is visible.
 */
function findActiveIconSlot(root: InstanceNode): SlotNode | null {
  if (!('findAll' in root)) return null;
  const all = root.findAll(function (n: SceneNode) {
    return n.type === 'SLOT' && n.name === SLOT_NAME;
  });
  debugLog(
    'icon-slot',
    'findActiveIconSlot on "' + root.name + '" → ' + all.length + ' candidate(s)',
  );
  if (all.length === 0) return null;
  for (let i = 0; i < all.length; i++) {
    const candidate = all[i];
    if (candidate.type !== 'SLOT') continue;
    let visible = true;
    let firstInvisibleName = '';
    let cursor: BaseNode | null = candidate;
    while (cursor !== null && cursor.id !== root.id) {
      if ('visible' in cursor && (cursor as SceneNode).visible === false) {
        visible = false;
        firstInvisibleName = cursor.name;
        break;
      }
      cursor = cursor.parent;
    }
    debugLog(
      'icon-slot',
      '  #' + i + ' parent="' + (candidate.parent !== null ? candidate.parent.name : 'null') +
        '" children=' + candidate.children.length + ' visible=' + visible +
        (visible ? '' : ' (hidden by "' + firstInvisibleName + '")'),
    );
    if (visible) return candidate as SlotNode;
  }
  // A hidden slot beats none: callers can still stage a fresh icon.
  debugLog('icon-slot', 'no visible slot — falling back to slot #0');
  const first = all[0];
  return first.type === 'SLOT' ? (first as SlotNode) : null;
}

/**
 * Returns false when no slot is found, so the caller can fall back to legacy
 * INSTANCE_SWAP. `forceRefresh` clears the override before reading the stroke
 * paint so it comes from the variant-master defaults: each variant binds the
 * stroke to a different theme variable, and reading the old override after a
 * variant toggle would carry the stale binding and render the icon invisible.
 */
export function replaceIconViaSlot(
  host: InstanceNode,
  iconName: string,
  svgString: string,
  forceRefresh?: boolean,
): boolean {
  if (!('findOne' in host)) return false;

  const slotNode = findActiveIconSlot(host);
  if (slotNode === null) {
    return false;
  }

  // Snapshot stroke geometry before the forceRefresh wipe: the variant master
  // may have no stroked vector to read from, and the snapshot preserves any
  // manual stroke adjustments the user made to the icon.
  let preStrokeWeight: number | null = null;
  let preStrokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE' | null = null;
  let preStrokeCap: VectorNode['strokeCap'] | null = null;
  let preStrokeJoin: VectorNode['strokeJoin'] | null = null;
  if (forceRefresh === true && slotNode.children.length > 0) {
    const prev = slotNode.children[0];
    if ('findOne' in prev) {
      const vec = (prev as FrameNode | InstanceNode | GroupNode).findOne(function (n: SceneNode) {
        if (n.type !== 'VECTOR') return false;
        const strokes = (n as VectorNode).strokes;
        return Array.isArray(strokes) && strokes.length > 0;
      });
      if (vec !== null && vec.type === 'VECTOR') {
        const v = vec as VectorNode;
        if (typeof v.strokeWeight === 'number') preStrokeWeight = v.strokeWeight;
        preStrokeAlign = v.strokeAlign;
        preStrokeCap = v.strokeCap;
        preStrokeJoin = v.strokeJoin;
      }
    }
  }

  // forceRefresh: clear the override BEFORE capture so slotNode.children
  // falls back to the variant-master defaults, which carry the variant-correct
  // stroke binding. Normal picks read first and remove later.
  if (forceRefresh === true) {
    const cleared: SceneNode[] = [];
    for (let i = 0; i < slotNode.children.length; i++) cleared.push(slotNode.children[i]);
    for (let i = 0; i < cleared.length; i++) {
      try {
        cleared[i].remove();
      } catch (_e) {
        /* master-level children may be non-removable */
      }
    }
  }

  let strokePaint: Paint | null = null;
  let strokeWeight: number | null = null;
  let strokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE' | null = null;
  let strokeCap: VectorNode['strokeCap'] | null = null;
  let strokeJoin: VectorNode['strokeJoin'] | null = null;
  let targetWidth = 0;
  let targetHeight = 0;
  if (slotNode.children.length > 0) {
    const firstChild = slotNode.children[0];
    if ('width' in firstChild && firstChild.width > 0) targetWidth = firstChild.width;
    if ('height' in firstChild && firstChild.height > 0) targetHeight = firstChild.height;
    if ('findOne' in firstChild) {
      const vec = (firstChild as FrameNode | InstanceNode | GroupNode).findOne(function (
        n: SceneNode,
      ) {
        if (n.type !== 'VECTOR') return false;
        const strokes = (n as VectorNode).strokes;
        return Array.isArray(strokes) && strokes.length > 0;
      });
      if (vec !== null && vec.type === 'VECTOR') {
        const v = vec as VectorNode;
        if (v.strokes.length > 0) strokePaint = v.strokes[0];
        if (typeof v.strokeWeight === 'number') strokeWeight = v.strokeWeight;
        strokeAlign = v.strokeAlign;
        strokeCap = v.strokeCap;
        strokeJoin = v.strokeJoin;
      }
    }
  }
  if (targetWidth === 0 && slotNode.width > 0) targetWidth = slotNode.width;
  if (targetHeight === 0 && slotNode.height > 0) targetHeight = slotNode.height;

  if (strokeWeight === null && preStrokeWeight !== null) strokeWeight = preStrokeWeight;
  if (strokeAlign === null && preStrokeAlign !== null) strokeAlign = preStrokeAlign;
  if (strokeCap === null && preStrokeCap !== null) strokeCap = preStrokeCap;
  if (strokeJoin === null && preStrokeJoin !== null) strokeJoin = preStrokeJoin;

  // No stroked vector to copy from (designer left the slot empty): use the
  // host's first TEXT fill — the heading binds to the same `text` theme
  // variable the icon should match, so the paint stays variant-aware.
  if (strokePaint === null && 'findOne' in host) {
    const txt = (host as InstanceNode).findOne(function (n: SceneNode) {
      return n.type === 'TEXT';
    });
    if (txt !== null && txt.type === 'TEXT') {
      const fills = (txt as TextNode).fills;
      if (Array.isArray(fills) && fills.length > 0) {
        strokePaint = fills[0];
      }
    }
  }

  let temp: FrameNode;
  try {
    temp = figma.createNodeFromSvg(svgString);
  } catch (e) {
    console.log('[icon-slot] createNodeFromSvg failed: ' + String(e));
    return false;
  }

  // Idempotent — already emptied above when forceRefresh.
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slotNode.children.length; i++) snapshot.push(slotNode.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
      /* master-level children may be non-removable */
    }
  }

  temp.name = iconName;
  try {
    slotNode.appendChild(temp);
  } catch (e) {
    console.log('[icon-slot] slot.appendChild failed: ' + String(e));
    temp.remove();
    return false;
  }

  // Match the outgoing icon's footprint — otherwise a raw 24×24 Lucide
  // render sits tiny inside e.g. a 68×68 slot.
  if (targetWidth > 0 && targetHeight > 0) {
    try {
      temp.resize(targetWidth, targetHeight);
    } catch (_e) {
      /* slot may be auto-layout-locked */
    }
  }

  // Auto-layout slots center children and ignore x/y, but the side-variant
  // slot (inside `icon-border-wrap`) has no auto-layout: a freshly appended
  // node sits at (0,0). Center explicitly rather than copying the old
  // position — that also repairs overrides that were already skewed.
  try {
    const slotFrame = slotNode as unknown as { layoutMode?: string };
    if (slotFrame.layoutMode === undefined || slotFrame.layoutMode === 'NONE') {
      temp.x = (slotNode.width - temp.width) / 2;
      temp.y = (slotNode.height - temp.height) / 2;
    }
  } catch (_e) {
    /* position is cosmetic — must never fail the swap */
  }

  // Reapply the captured paint (its theme-variable binding rides along) so
  // the new vectors don't fall back to Lucide's stroke defaults.
  const vectors = temp.findAll(function (n: SceneNode) {
    return n.type === 'VECTOR';
  }) as VectorNode[];
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (strokePaint !== null) v.strokes = [strokePaint];
    if (strokeWeight !== null) v.strokeWeight = strokeWeight;
    if (strokeAlign !== null) v.strokeAlign = strokeAlign;
    if (strokeCap !== null) v.strokeCap = strokeCap;
    if (strokeJoin !== null) v.strokeJoin = strokeJoin;
  }

  return true;
}
