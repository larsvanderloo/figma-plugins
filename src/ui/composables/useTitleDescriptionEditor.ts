// useTitleDescriptionEditor — binds the General → Title & Description
// section to the store + bridge. Exposes the v-model payload, the
// debounced-text update handler, and the heading-accent update handler.
// Consumers don't see the message-bus contract.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';
import type { TitleDescriptionValue } from '../components/TitleDescriptionEditor.vue';

export function useTitleDescriptionEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  const model = computed<TitleDescriptionValue | null>(() => {
    const td = view.state.general?.titleDescription;
    if (td === null || td === undefined) return null;
    return {
      heading: td.heading,
      paragraph: td.paragraph,
      headingDim: td.headingDim,
    };
  });

  function update(next: TitleDescriptionValue): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    td.heading = next.heading;
    td.paragraph = next.paragraph;

    bridge.post({
      type: 'update-general',
      slideId: slideId,
      section: 'titleDescription',
      payload: {
        heading: next.heading,
        paragraph: next.paragraph === null ? undefined : next.paragraph,
      },
    });
  }

  function updateHeadingDim(ranges: Array<[number, number]>): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    td.headingDim = ranges;

    bridge.post({
      type: 'update-accent',
      slideId: slideId,
      dimRanges: ranges,
    });
  }

  // reactive() wrapper unwraps `model` so `editor.model` returns the
  // current value directly in both script and template — no `.value`
  // dance at the call site.
  return reactive({ model, update, updateHeadingDim });
}
