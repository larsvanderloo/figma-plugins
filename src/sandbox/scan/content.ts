import {
  findCardWrap,
  findAllCardWraps,
  findTimelineWrap,
  isEffectivelyVisible,
} from '../slide-machine';
import { ContentItems, CardItem, InstructorCardItem, TimelineItem } from '../../shared/types';
import {
  findInstructorListTexts,
  readInstructorVariant,
  readInstructorOptions,
  INSTRUCTOR_CARD_NODE_NAME,
} from '../editors/content/instructor';
import { debugLog } from '../../shared/debug';
import { isDevModeRuntime } from '../runtime';
import {
  readTextByName,
  readCardIcon,
  readCardVisualHash,
  readCardTypeVariant,
  readCardStyleVariant,
} from './readers';

function extractCards(scope: InstanceNode, slide: InstanceNode): CardItem[] {
  const items: CardItem[] = [];
  if (!('findAll' in scope)) return items;
  const cardInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card';
  });
  for (let i = 0; i < cardInstances.length; i++) {
    const card = cardInstances[i] as InstanceNode;
    // TimelineWrap masters carry a hidden template Card sibling; without this
    // gate it gets a normal editor panel and edits land on it with no visible change.
    if (!isEffectivelyVisible(card, slide)) continue;
    const heading = readTextByName(card, 'Heading');
    if (heading === null) continue;

    // The Type variant is the source of truth for icon vs image: both scans
    // below can false-positive on the wrong variant. Unknown variant: run both.
    const cardType = readCardTypeVariant(card);
    const isIconType = cardType === 'Stack Icon' || cardType === 'Icon Side';
    const isImageType = cardType === 'Image' || cardType === 'User';

    // Persisted icon slug: a library-master republish resets the icon-slot
    // child override but plugin data survives, so the UI can re-apply the user's pick.
    let iconIntended: string | null = null;
    try {
      const stored = card.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        iconIntended = stored;
      }
    } catch (_e) {
      /* silent — plugin data unreadable */
    }
    // Backfill: cards without an icon record would lose their slot child on the
    // next library republish — capture the visible icon as intent, once per card.
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
      icon: currentSlotIcon,
      iconIntended: iconIntended,
      visualHash: isIconType ? undefined : readCardVisualHash(card),
      style: readCardStyleVariant(card),
    });
  }
  return items;
}

// Only CopyWrap instances are editable content; sibling 'Stepper Item'
// instances are decorative and deliberately not scanned.
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

// The Instructor variant and its options are designer-owned (component set);
// only the list-item texts are editable content.
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
        if (instructor === null) return null;
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

// TimelineWrap is polymorphic: direct Card instances route to content.cards
// (so the icon picker works there), nested CopyWraps to content.timelineItems.
export async function scanContent(slide: InstanceNode): Promise<ContentItems | null> {
  // Whitepaper slides carry multiple CardWraps.
  const cardWraps = findAllCardWraps(slide);
  const cardWrap = cardWraps.length > 0 ? cardWraps[0] : findCardWrap(slide);
  const timelineWrap = findTimelineWrap(slide);

  if (cardWraps.length === 0 && timelineWrap === null) return null;

  const cards: CardItem[] = [];
  const instructorCards: InstructorCardItem[] = [];
  const timelineItems: TimelineItem[] = [];

  for (let cw = 0; cw < cardWraps.length; cw++) {
    const wrap = cardWraps[cw];
    const fromCardWrap = extractCards(wrap, slide);
    for (let i = 0; i < fromCardWrap.length; i++) {
      cards.push(fromCardWrap[i]);
    }
    const instructorsFromWrap = await extractInstructorCards(wrap);
    for (let k = 0; k < instructorsFromWrap.length; k++) {
      instructorCards.push(instructorsFromWrap[k]);
    }
  }

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

  // Loose Cards outside any wrap are editable too (edits target cardNodeId
  // directly); skip cards already found or living inside an InstructorCard,
  // which belong to the instructor editor.
  const seenCardIds: { [id: string]: boolean } = {};
  for (let i = 0; i < cards.length; i++) seenCardIds[cards[i].cardNodeId] = true;
  const looseCardHosts = slide.findAll(function (n: SceneNode) {
    try {
      return n.type === 'INSTANCE' && n.name === 'Card';
    } catch (_e) {
      return false;
    }
  });
  const allowedLooseIds: { [id: string]: boolean } = {};
  let hasLoose = false;
  for (let i = 0; i < looseCardHosts.length; i++) {
    const host = looseCardHosts[i] as InstanceNode;
    if (seenCardIds[host.id] === true) continue;
    let owned = false;
    let parent: BaseNode | null = host.parent;
    while (parent !== null && parent.id !== slide.id) {
      if (parent.type === 'INSTANCE') {
        const pname = parent.name;
        if (
          pname.indexOf('InstructorCard') === 0 ||
          pname === 'CardWrap' ||
          pname.indexOf('Timeline') >= 0
        ) {
          owned = true;
          break;
        }
      }
      parent = parent.parent;
    }
    if (owned) continue;
    allowedLooseIds[host.id] = true;
    hasLoose = true;
  }
  if (hasLoose) {
    const slideWide = extractCards(slide, slide);
    for (let j = 0; j < slideWide.length; j++) {
      if (allowedLooseIds[slideWide[j].cardNodeId] === true && seenCardIds[slideWide[j].cardNodeId] !== true) {
        seenCardIds[slideWide[j].cardNodeId] = true;
        cards.push(slideWide[j]);
      }
    }
  }

  if (cards.length === 0 && instructorCards.length === 0 && timelineItems.length === 0) {
    return null;
  }

  // cardWrapId falls back to the TimelineWrap id on timeline-only slides.
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
