// ============================================================
// sandbox/handlers/content.ts
//
// Content-tab messages: cards (update-card / update-instructor-card /
// set-card-size) en timeline-items (update-timeline-item).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById } from '../slides';
import { applyCard } from '../editors/content/card';
import { applyCardSize } from '../editors/content/card-size';
import { applyInstructorCard } from '../editors/content/instructor';
import { setTextCharactersSafe } from '../editors/_shared/fonts';
import { resolveTextStyleByName } from '../editors/_shared/text-styles';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleUpdateCard(
  msg: Extract<UIToPluginMessage, { type: 'update-card' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  await applyCard(slide, {
    cardNodeId: msg.cardNodeId,
    heading: msg.payload.heading,
    paragraph: msg.payload.paragraph,
    icon: msg.payload.icon,
    iconSvg: msg.payload.iconSvg,
    style: msg.payload.style,
  });
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.cardNodeId,
  });
  return;
}

export async function handleUpdateInstructorCard(
  msg: Extract<UIToPluginMessage, { type: 'update-instructor-card' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  const resetItems = await applyInstructorCard(slide, {
    cardNodeId: msg.cardNodeId,
    instructor: msg.payload.instructor,
    items: msg.payload.items,
    visible: msg.payload.visible,
  });
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.cardNodeId,
  });
  if (resetItems !== null && typeof msg.payload.instructor === 'string') {
    // Instructor-switch reset de list-teksten naar de defaults van de
    // nieuwe variant — de sandbox is hier de bron, niet de iframe.
    // Gericht patch-bericht: een volledige emitSlideLoaded (incl.
    // preview-exports + icon-prime) maakte de switch merkbaar traag.
    postToUI({
      type: 'instructor-card-updated',
      cardNodeId: msg.cardNodeId,
      instructor: msg.payload.instructor,
      items: resetItems,
    });
  }
  return;
}

export async function handleSetCardSize(
  msg: Extract<UIToPluginMessage, { type: 'set-card-size' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  // Resolve the heading text-style id once, up front. Library-subscribed
  // styles aren't enumerable by name — sandbox walks all TEXT nodes on
  // first use to build a styleName → styleId map (cached for the session).
  const styleId = await resolveTextStyleByName(msg.headingStyleName);
  if (styleId === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error:
        'Text style "' + msg.headingStyleName +
        '" not found in this file. Apply it once to any text node so the plugin can register it.',
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  await applyCardSize(slide, {
    styleId: styleId,
    iconSize: msg.iconSize,
    gapModeName: msg.gapModeName,
    iconVisible: msg.iconVisible,
  });

  postToUI({ type: 'target-updated', ok: true });
  return;
}

export async function handleUpdateTimelineItem(
  msg: Extract<UIToPluginMessage, { type: 'update-timeline-item' }>,
): Promise<void> {
  // Muteert heading/paragraph van één CopyWrap-item.
  // Zoek CopyWrap via slide.findOne(id) zodat ook genestede CopyWraps
  // (binnen tussenliggende Frames) gevonden worden — wrapper-agnostisch.
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  // Slide-scoped findOne op node-id — vindt ook genestede CopyWraps.
  const copyWrapNode = slide.findOne(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'CopyWrap' && n.id === msg.copyWrapNodeId;
  });
  const copyWrap: InstanceNode | null =
    copyWrapNode !== null && copyWrapNode.type === 'INSTANCE'
      ? (copyWrapNode as InstanceNode)
      : null;
  if (copyWrap === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Timeline CopyWrap not found: ' + msg.copyWrapNodeId,
    });
    return;
  }
  figma.commitUndo();
  if (typeof msg.payload.heading === 'string') {
    const headingNode = copyWrap.findOne((n: SceneNode) => {
      return n.type === 'TEXT' && n.name === 'Heading';
    });
    if (headingNode !== null && headingNode.type === 'TEXT') {
      await setTextCharactersSafe(headingNode as TextNode, msg.payload.heading);
    }
  }
  if (typeof msg.payload.paragraph === 'string') {
    const paragraphNode = copyWrap.findOne((n: SceneNode) => {
      return n.type === 'TEXT' && n.name === 'Paragraph';
    });
    if (paragraphNode !== null && paragraphNode.type === 'TEXT') {
      await setTextCharactersSafe(paragraphNode as TextNode, msg.payload.paragraph);
    }
  }
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.copyWrapNodeId,
  });
  return;
}
