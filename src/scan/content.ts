// ============================================================
// scan/content.ts
//
// Content-tab scan: Cards, InstructorCards en Timeline-items binnen
// CardWrap/TimelineWrap. Bouwt de ContentItems-payload voor de iframe.
//
// FIG-TRAVERSE-01: findAll bounded tot de wrapper-subtree.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findCardWrap, findTimelineWrap } from '../slide-machine';
import { ContentItems, CardItem, InstructorCardItem, TimelineItem } from '../types';
import {
  findInstructorListTexts,
  readInstructorVariant,
  readInstructorOptions,
  INSTRUCTOR_CARD_NODE_NAME,
} from '../editors/content/instructor';
import { debugLog } from '../debug';
import { isDevModeRuntime } from '../sandbox/runtime';
import {
  readTextByName,
  readCardIcon,
  readCardVisualHash,
  readCardTypeVariant,
  readCardStyleVariant,
} from './readers';

/**
 * T31.2: Extraheert Card-instances (recursief via findAll) binnen een
 * wrapper-scope (CardWrap of TimelineWrap). Bounded tot de wrapper-subtree
 * (FIG-TRAVERSE-01 — findAll op een wrapper-node, niet op de hele pagina).
 *
 * Corrupt-items zonder Heading-textnode worden silent overgeslagen.
 *
 * T32: `slide` parameter toegevoegd zodat readCardIcon de visibility van de
 * icon-instance kan beoordelen via isEffectivelyVisible.
 */
function extractCards(scope: InstanceNode, slide: InstanceNode): CardItem[] {
  const items: CardItem[] = [];
  if (!('findAll' in scope)) return items;
  const cardInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card';
  });
  for (let i = 0; i < cardInstances.length; i++) {
    const card = cardInstances[i] as InstanceNode;
    const heading = readTextByName(card, 'Heading');
    if (heading === null) continue; // corrupt card: skip

    // Welder Card has a `Type` VARIANT property with values
    // 'Stack Icon' | 'Icon Side' | 'Image' | 'User'. The first two
    // render an icon child; the latter two render an ImageWrap. The
    // icon and image scans below can both produce false positives on
    // the wrong variant (readCardIcon's Strategy A matches `ImageWrap`
    // as a Lucide slug; readCardVisualHash's any-IMAGE-fill fallback
    // could pick up an unrelated descendant). Variant is the source
    // of truth — confirmed via Figma MCP for the Welder Card master.
    const cardType = readCardTypeVariant(card);
    const isIconType = cardType === 'Stack Icon' || cardType === 'Icon Side';
    const isImageType = cardType === 'Image' || cardType === 'User';

    // Persisted-by-the-plugin icon slug. Survives library-master
    // republishes (Figma resets icon-slot child overrides on master
    // update; plugin data stays). The iframe compares this with the
    // current visible `icon` and re-applies the user's pick when they
    // diverge (auto-reconcile after library updates).
    let iconIntended: string | null = null;
    try {
      const stored = card.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        iconIntended = stored;
      }
    } catch (_e) {
      /* silent — plugin data unreadable */
    }
    // Backfill: cards whose icons were picked in plugin builds older
    // than 0.5.149 have no plugin-data record. The next library update
    // would wipe their slot child without any way to restore. Capture
    // the currently-visible icon as the user's intent NOW so the next
    // republish doesn't lose them too. One-time per card — once
    // iconIntended is set, subsequent scans skip this branch.
    const currentSlotIcon = isImageType ? null : readCardIcon(card, slide);
    if (
      !isDevModeRuntime() &&
      iconIntended === null &&
      currentSlotIcon !== null &&
      currentSlotIcon.length > 0
    ) {
      try {
        (card as InstanceNode).setSharedPluginData('welder', 'icon', currentSlotIcon);
        iconIntended = currentSlotIcon;
        debugLog(
          'card-scan',
          'backfilled iconIntended="' + currentSlotIcon + '" for ' + card.id,
        );
      } catch (_e) {
        /* silent */
      }
    }

    items.push({
      cardNodeId: card.id,
      heading: heading,
      paragraph: readTextByName(card, 'Paragraph') || '',
      // Icon picker shows iff the variant carries an icon. On unknown
      // variants we fall back to the scan (cardType === null).
      icon: currentSlotIcon,
      iconIntended: iconIntended,
      // Image picker shows iff the variant carries an image. On
      // unknown variants we fall back to the scan.
      visualHash: isIconType ? undefined : readCardVisualHash(card),
      style: readCardStyleVariant(card),
    });
  }
  return items;
}

/**
 * T31.2: Extraheert CopyWrap-instances (recursief via findAll) binnen een
 * wrapper-scope (TimelineWrap). Bounded tot de wrapper-subtree (FIG-TRAVERSE-01).
 *
 * Skipt decoratieve `Stepper Item`-instances; pakt alleen CopyWrap-
 * instances als editable items. Elk item heeft Heading + Paragraph
 * (geen icon, geen visual). Corrupt-items zonder Heading-textnode
 * worden silent overgeslagen.
 */
function extractCopyWrapItems(scope: InstanceNode): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (!('findAll' in scope)) return items;
  const copyWrapInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'CopyWrap';
  });
  for (let i = 0; i < copyWrapInstances.length; i++) {
    const cw = copyWrapInstances[i];
    const heading = readTextByName(cw, 'Heading');
    if (heading === null) continue;
    items.push({
      copyWrapNodeId: cw.id,
      heading: heading,
      paragraph: readTextByName(cw, 'Paragraph') || '',
    });
  }
  return items;
}

/**
 * Extraheert InstructorCard-instances binnen een wrapper-scope. De
 * `Instructor` VARIANT + opties komen uit de component-set (designer-
 * beheerd, picker-bron in de UI); de list-item-teksten zijn de
 * bewerkbare content. Async vanwege getMainComponentAsync (opties) —
 * cards worden parallel gelezen (Promise.all).
 */
async function extractInstructorCards(scope: InstanceNode): Promise<InstructorCardItem[]> {
  if (!('findAll' in scope)) return [];
  const found = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === INSTRUCTOR_CARD_NODE_NAME;
  });
  const reads: Array<Promise<InstructorCardItem | null>> = [];
  for (let i = 0; i < found.length; i++) {
    const node = found[i];
    if (node.type !== 'INSTANCE') continue;
    const card = node as InstanceNode;
    reads.push(
      (async function (): Promise<InstructorCardItem | null> {
        const instructor = readInstructorVariant(card);
        if (instructor === null) return null; // geen Instructor-variant: skip
        const options = await readInstructorOptions(card);
        const textNodes = findInstructorListTexts(card);
        const items: string[] = [];
        for (let t = 0; t < textNodes.length; t++) {
          items.push(textNodes[t].characters);
        }
        return {
          cardNodeId: card.id,
          instructor: instructor,
          instructorOptions: options,
          items: items,
          visible: card.visible !== false,
        };
      })(),
    );
  }
  const resolved = await Promise.all(reads);
  const out: InstructorCardItem[] = [];
  for (let r = 0; r < resolved.length; r++) {
    const item = resolved[r];
    if (item !== null) out.push(item);
  }
  return out;
}

/**
 * T31.2: Polymorphic scan van CardWrap en TimelineWrap.
 *
 * TimelineWrap kan in productie bevatten:
 *   - directe Card-instances (worden in content.cards gerouted — icon-picker werkt)
 *   - genestede CopyWrap-instances binnen tussenliggende Frames (→ content.timelineItems)
 *
 * Beide worden gevonden via findAll (recursieve descendant-walk, bounded tot wrapper-scope).
 */
export async function scanContent(slide: InstanceNode): Promise<ContentItems | null> {
  const cardWrap = findCardWrap(slide);
  const timelineWrap = findTimelineWrap(slide);

  // Retourneer null wanneer geen van alle wrappers aanwezig is.
  if (cardWrap === null && timelineWrap === null) return null;

  const cards: CardItem[] = [];
  const instructorCards: InstructorCardItem[] = [];
  const timelineItems: TimelineItem[] = [];

  // CardWrap: Cards zijn directe children (Slide Machine-pattern); ook hier
  // gebruiken we extractCards zodat de helper consistent en testbaar blijft.
  // InstructorCards (Instructor-variant van de Card-slot) leven in dezelfde
  // CardWrap maar heten 'InstructorCard' — aparte extractie.
  if (cardWrap !== null) {
    const fromCardWrap = extractCards(cardWrap, slide);
    for (let i = 0; i < fromCardWrap.length; i++) {
      cards.push(fromCardWrap[i]);
    }
    const instructorsFromWrap = await extractInstructorCards(cardWrap);
    for (let k = 0; k < instructorsFromWrap.length; k++) {
      instructorCards.push(instructorsFromWrap[k]);
    }
  }

  // TimelineWrap: polymorphic — directe Cards (met icon + visual) én genestede
  // CopyWraps (heading + paragraph only) via tussenliggende Frames.
  if (timelineWrap !== null) {
    const fromTimeline = extractCards(timelineWrap, slide);
    for (let i = 0; i < fromTimeline.length; i++) {
      cards.push(fromTimeline[i]);
    }
    const cwItems = extractCopyWrapItems(timelineWrap);
    for (let j = 0; j < cwItems.length; j++) {
      timelineItems.push(cwItems[j]);
    }
    debugLog('sandbox', 'timelineWrap scan', {
      slideId: slide.id,
      cards: fromTimeline.length,
      copyWrapItems: cwItems.length,
    });
  }

  if (cards.length === 0 && instructorCards.length === 0 && timelineItems.length === 0) {
    return null;
  }

  // `cardWrapId` blijft semantisch gebonden aan CardWrap wanneer aanwezig;
  // bij slide-met-alleen-TimelineWrap vallen we terug op de TimelineWrap-id.
  var wrapId: string;
  if (cardWrap !== null) {
    wrapId = cardWrap.id;
  } else if (timelineWrap !== null) {
    wrapId = (timelineWrap as InstanceNode).id;
  } else {
    wrapId = '';
  }

  return {
    cardWrapId: wrapId,
    cards: cards,
    instructorCards: instructorCards,
    timelineItems: timelineItems,
  };
}
