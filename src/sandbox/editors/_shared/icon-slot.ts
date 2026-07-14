// ============================================================
// editors/_shared/icon-slot.ts
//
// Slot-based icon-swap (gedeeld door Card / Badge).
//
// Welder-componenten declareren een `SlotNode` met name `icon-slot`
// op de positie waar het Lucide-icon moet komen. SlotNodes accepteren
// child-mutaties binnen een instance zonder de instance te detachen
// — property-overrides zijn beperkt binnen instances, slot-children
// niet. Dat maakt deze route fundamenteel sneller en library-onafhankelijk
// dan INSTANCE_SWAP + importComponentByKeyAsync.
//
// Geometrie + stroke-properties van de uitgaande icon worden gelezen
// uit de huidige slot-child (eerste VECTOR-descendant) en opnieuw
// toegepast op de nieuwe SVG-content, zodat:
//   - de variable-binding op stroke-paint behouden blijft (theme-color)
//   - stroke-weight, stroke-align, stroke-cap, stroke-join niet
//     terugvallen op Lucide-defaults (2 / CENTER / ROUND / ROUND).
//   - de nieuwe icon dezelfde footprint krijgt als de oude (anders
//     krijg je een 24×24 mini-icon in een 68×68 slot).
//
// FIG-GUARD-01: silent skip wanneer geen slot, geen createNodeFromSvg.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { debugLog } from '../../../shared/debug';

const SLOT_NAME = 'icon-slot';

/**
 * Card masters can hold multiple `icon-slot` SlotNodes — one positioned
 * for the top variant, one wrapped in `icon-border-wrap` for the side
 * variant — with the inactive variant's structural pieces hidden via
 * `.visible = false` on either the slot itself or an ancestor. `findOne`
 * picks the FIRST tree-order match, which on side variants lands on the
 * hidden top slot, so subsequent mutations silently target the wrong
 * node and the user sees nothing change.
 *
 * Returns the first slot whose entire ancestor chain (up to `root`) is
 * visible. Falls back to the first slot encountered when none qualify so
 * callers still get a sensible default (e.g. when both slots are hidden
 * during a transient state).
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
  // Fallback: take the first slot even if hidden, so callers can still
  // apply a fresh icon when no variant currently exposes one.
  debugLog('icon-slot', 'no visible slot — falling back to slot #0');
  const first = all[0];
  return first.type === 'SLOT' ? (first as SlotNode) : null;
}

/**
 * Vervangt de inhoud van het `icon-slot` SlotNode binnen `host` met
 * de SVG-render van het gekozen Lucide-icon. Returns true bij succes,
 * false wanneer geen slot gevonden wordt — caller kan dan fallbacken
 * op legacy INSTANCE_SWAP.
 *
 * `forceRefresh` — wanneer true wordt de override-content éérst verwijderd
 * zodat de slot terugvalt op de variant-master defaults, en daar wordt de
 * stroke-paint van afgelezen. Nodig na een variant-toggle: elke variant
 * bindt de stroke aan een andere theme-variable (Default → background,
 * Outline → text); zonder force zou de read vanuit de oude SVG-override
 * de OUDE variant-binding doorzetten en de icon wordt onzichtbaar.
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

  // ── Pre-snapshot stroke geometry from current override (forceRefresh) ─
  // Stroke weight + cap/join/align rarely change between variants — only
  // the paint binding does. Snapshot them before we wipe the override so
  // we have a fallback to use when the variant master has no stroked
  // vector to read from. The snapshot preserves any manual adjustments
  // the user made to the icon in Figma.
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

  // ── Optioneel: clear override BEFORE capture ───────────────────────
  // Bij forceRefresh wordt de override-content éérst verwijderd zodat
  // slotNode.children terugvalt op de variant-master defaults — daar zit
  // de variant-correcte stroke-binding in. Zonder force lezen we eerst en
  // verwijderen we daarna (zelfde resultaat voor normale picks: het eerste
  // child IS de huidige slot-content, geen variant-switch nodig).
  if (forceRefresh === true) {
    const cleared: SceneNode[] = [];
    for (let i = 0; i < slotNode.children.length; i++) cleared.push(slotNode.children[i]);
    for (let i = 0; i < cleared.length; i++) {
      try {
        cleared[i].remove();
      } catch (_e) {
        /* silent — master-level children may be non-removable */
      }
    }
  }

  // ── Capture stroke + size from current slot content ─────────────────
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

  // ── Fallback stroke geometry from pre-remove snapshot ──────────────
  // When the variant master had no stroked vector to copy from, fall back
  // to the values we snapshotted off the previous override before clearing.
  // This preserves the user's icon weight/style across variant toggles.
  if (strokeWeight === null && preStrokeWeight !== null) strokeWeight = preStrokeWeight;
  if (strokeAlign === null && preStrokeAlign !== null) strokeAlign = preStrokeAlign;
  if (strokeCap === null && preStrokeCap !== null) strokeCap = preStrokeCap;
  if (strokeJoin === null && preStrokeJoin !== null) strokeJoin = preStrokeJoin;

  // ── Fallback paint: heading-text fill ──────────────────────────────
  // When the slot master has no stroked vector to copy from (typical
  // when the designer leaves the slot empty), read the host's first
  // TEXT-node fill instead. The heading is bound to the same `text`
  // theme variable that the icon should match — variant-aware automatically
  // (Default mode → cream; Outline mode → orange). Keeps the icon visible
  // and on-brand without requiring designer-side per-variant placeholders.
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

  // ── Render new SVG ─────────────────────────────────────────────────
  let temp: FrameNode;
  try {
    temp = figma.createNodeFromSvg(svgString);
  } catch (e) {
    console.log('[icon-slot] createNodeFromSvg failed: ' + String(e));
    return false;
  }

  // ── Clear slot (idempotent — already done above when forceRefresh) ─
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slotNode.children.length; i++) snapshot.push(slotNode.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
      /* silent */
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

  // ── Match footprint ────────────────────────────────────────────────
  if (targetWidth > 0 && targetHeight > 0) {
    try {
      temp.resize(targetWidth, targetHeight);
    } catch (_e) {
      /* silent — slot kan auto-layout-locked zijn */
    }
  }

  // ── Centreer in slots zonder auto-layout ───────────────────────────
  // Auto-layout-slots (Badge, Card-top) centreren hun children zelf en
  // negeren x/y. De side-variant slot (in `icon-border-wrap`) heeft GEEN
  // auto-layout: een vers geappende node blijft dan op (0,0) linksboven
  // hangen terwijl de master-default gecentreerd staat (bv. 58×58 in een
  // 68×68 slot op (5,5)). Expliciet centreren i.p.v. de oude positie
  // overnemen: dat herstelt ook overrides die eerder al scheef zijn gezet.
  try {
    const slotFrame = slotNode as unknown as { layoutMode?: string };
    if (slotFrame.layoutMode === undefined || slotFrame.layoutMode === 'NONE') {
      temp.x = (slotNode.width - temp.width) / 2;
      temp.y = (slotNode.height - temp.height) / 2;
    }
  } catch (_e) {
    /* silent — positie is cosmetisch, mag de swap nooit laten falen */
  }

  // ── Re-apply captured stroke properties to all child vectors ───────
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
