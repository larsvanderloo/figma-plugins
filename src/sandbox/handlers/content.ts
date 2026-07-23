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
    // An instructor switch resets the list texts to the new variant's defaults, so the
    // sandbox is the source here; a full emitSlideLoaded made the switch noticeably slow.
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
  // Library-subscribed styles aren't enumerable by name — the resolver walks all
  // TEXT nodes on first use to build a name → id map (cached for the session).
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
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  // findOne over the whole slide so CopyWraps nested inside intermediate frames are found.
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
  // Mark before AND after: the writes below arm postSlideContent's 200ms debounce, and if
  // apply takes longer (font-loads, reflow) the re-scan clobbers in-progress typing in the
  // iframe. Pre-apply opens the suppress window early; post-apply extends it past the last write.
  markSelfWrite();
  if (typeof msg.payload.heading === 'string') {
    const headingNode = copyWrap.findOne((n: SceneNode) => {
      return n.type === 'TEXT' && n.name === 'Heading';
    });
    if (headingNode !== null && headingNode.type === 'TEXT') {
      const headingText = headingNode as TextNode;
      // The iframe sends heading and paragraph together per typing pause even if only
      // one changed; skipping unchanged values saves the font-load + write.
      if (headingText.characters !== msg.payload.heading) {
        await setTextCharactersSafe(headingText, msg.payload.heading);
      }
    }
  }
  if (typeof msg.payload.paragraph === 'string') {
    const paragraphNode = copyWrap.findOne((n: SceneNode) => {
      return n.type === 'TEXT' && n.name === 'Paragraph';
    });
    if (paragraphNode !== null && paragraphNode.type === 'TEXT') {
      const paragraphText = paragraphNode as TextNode;
      if (paragraphText.characters !== msg.payload.paragraph) {
        await setTextCharactersSafe(paragraphText, msg.payload.paragraph);
      }
    }
  }
  markSelfWrite();
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.copyWrapNodeId,
  });
  return;
}
