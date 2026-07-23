import {
  normalizeIconKey,
  trySwapViaInstanceProperty,
  swapComponentByName,
} from '../_shared/icon-swap';
import { replaceIconViaSlot } from '../_shared/icon-slot';
import {
  findImageSlot,
  findNestedIconInstance,
  findTextByName,
} from '../_shared/node-finders';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

/** `icon` is the Lucide name (diff checks + node naming); `iconSvg` is the full SVG
 *  document from the iframe so the sandbox renders it directly via
 *  figma.createNodeFromSvg — no INSTANCE_SWAP or library import needed. */
export interface CardPayload {
  cardNodeId: string;
  heading?: string;
  paragraph?: string;
  icon?: string;
  iconSvg?: string;
  visualBytes?: Uint8Array;
  /** Card `Style` variant — `Default` is the filled look. */
  style?: 'Default' | 'Outline';
}

async function applyCardIconSwap(card: InstanceNode, iconName: string): Promise<boolean> {
  debugLog('card-icon', 'strategy 1: trySwapViaInstanceProperty on card "' + card.name + '"');
  if (await trySwapViaInstanceProperty(card, iconName)) {
    debugLog('card-icon', 'strategy 1 hit for "' + iconName + '"');
    return true;
  }
  debugLog('card-icon', 'strategy 1 miss for "' + iconName + '"');

  const nestedIcon = findNestedIconInstance(card);
  if (nestedIcon !== null) {
    debugLog(
      'card-icon',
      'strategy 2: trySwapViaInstanceProperty on nested "' + nestedIcon.name + '"',
    );
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) {
      debugLog('card-icon', 'strategy 2 hit for "' + iconName + '"');
      return true;
    }
    debugLog('card-icon', 'strategy 2 miss for "' + iconName + '"');

    debugLog('card-icon', 'strategy 3: swapComponentByName on nested "' + nestedIcon.name + '"');
    if (await swapComponentByName(nestedIcon, iconName)) {
      debugLog('card-icon', 'strategy 3 hit for "' + iconName + '"');
      return true;
    }
    debugLog('card-icon', 'strategy 3 miss for "' + iconName + '"');
  } else {
    debugLog('card-icon', 'no nested icon instance found in card "' + card.name + '"');
  }

  console.log(
    '[card-icon] all strategies failed for "' + iconName + '" on card "' + card.name + '"',
  );
  return false;
}

/** Returns the new image hash, or null when the card or image slot is missing.
 *  slide.findOne (not CardWrap-scoped) so Cards nested inside TimelineWrap frames are found too. */
export async function applyCardVisual(
  slide: InstanceNode,
  cardNodeId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === cardNodeId;
  });
  const card = cardNode;
  if (card === null) return null;
  const slot = findImageSlot(card, false);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  const image = figma.createImage(bytes);
  const hash = image.hash;
  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: hash,
    scaleMode: 'FILL',
  };
  (slot as GeometryMixin).fills = [paint];
  return hash;
}

/** Resolves without error when the target card is missing (silent skip).
 *  slide.findOne (not CardWrap-scoped) so Cards nested inside TimelineWrap frames are found too. */
export async function applyCard(slide: InstanceNode, payload: CardPayload): Promise<void> {
  const cardNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card' && n.id === payload.cardNodeId;
  });
  const card = cardNode;
  if (card === null) return;

  // The iframe re-sends the FULL CardItem on every typing debounce; skip writes when
  // state already matches, or each keystroke re-runs the heavy icon swap and Style
  // setProperties (30-100ms of felt typing lag).

  if (typeof payload.heading === 'string') {
    const headingNode = findTextByName(card, 'Heading');
    if (headingNode !== null && headingNode.characters !== payload.heading) {
      await setTextCharactersSafe(headingNode, payload.heading);
    }
  }

  if (typeof payload.paragraph === 'string') {
    const paragraphNode = findTextByName(card, 'Paragraph');
    if (paragraphNode !== null && paragraphNode.characters !== payload.paragraph) {
      await setTextCharactersSafe(paragraphNode, payload.paragraph);
    }
  }

  // Style must be applied before the icon swap: when both arrive together, the
  // swap must capture the stroke paint bound by the NEW variant, not the old one.
  let styleJustChanged = false;
  if (payload.style !== undefined && card.type === 'INSTANCE') {
    const cardInst = card as InstanceNode;
    const props = cardInst.componentProperties;
    const currentStyle = props && props['Style'] ? props['Style'].value : undefined;
    if (currentStyle !== payload.style) {
      try {
        cardInst.setProperties({ Style: payload.style });
        styleJustChanged = true;
        debugLog('card', 'style → ' + payload.style);
      } catch (e) {
        console.log('[card] setProperties Style failed: ' + String(e));
      }
    }
  }

  if (typeof payload.icon === 'string' && payload.icon.length > 0) {
    debugLog(
      'card',
      'icon update for "' + payload.icon + '", iconSvg ' +
        (typeof payload.iconSvg === 'string' ? 'present (' + String(payload.iconSvg.length) + ' chars)' : 'MISSING'),
    );
    if (card.type === 'INSTANCE') {
      const cardInst = card as InstanceNode;
      // A matching icon still needs re-rendering when the Style variant just
      // changed — the slot must pick up the new variant's stroke paint binding.
      const currentIconInstance = findNestedIconInstance(cardInst);
      const currentIconKey =
        currentIconInstance !== null ? normalizeIconKey(currentIconInstance.name) : '';
      const desiredIconKey = normalizeIconKey(payload.icon);
      debugLog('card', 'currentIconKey="' + currentIconKey + '" desiredIconKey="' + desiredIconKey + '"');
      if (currentIconKey !== desiredIconKey || styleJustChanged) {
        let handled = false;
        if (typeof payload.iconSvg === 'string' && payload.iconSvg.length > 0) {
          handled = replaceIconViaSlot(
            cardInst,
            payload.icon,
            payload.iconSvg,
            styleJustChanged,
          );
        }
        // Legacy INSTANCE_SWAP fallback, kept until the SVG route is verified
        // across all Card variants.
        if (!handled) {
          console.log('[card] SVG path failed/skipped, falling back to legacy swap');
          await applyCardIconSwap(cardInst, payload.icon);
        }
      }
      // Slot-child overrides don't survive a library-master republish, but plugin data
      // does — persist the picked icon as the durable record the scan side reconciles against.
      try {
        cardInst.setSharedPluginData('welder', 'icon', desiredIconKey);
        debugLog(
          'card',
          'persisted icon="' + desiredIconKey + '" to plugin data on ' + cardInst.id,
        );
      } catch (e) {
        console.log('[card] setSharedPluginData failed: ' + String(e));
      }
    }
  }

  if (payload.visualBytes !== undefined) {
    await applyCardVisual(slide, payload.cardNodeId, payload.visualBytes);
  }
}
