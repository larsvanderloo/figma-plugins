// Pending posts are cancelled on slide switch: a trailing debounce would
// otherwise fire with the NEW currentSlideId and write stale text to the wrong slide.

import { onUnmounted, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';

export function useLiveText(post: () => void, delayMs = 200) {
  const view = usePluginView();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function fire(): void {
    timer = null;
    post();
  }

  function schedule(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fire, delayMs);
  }

  function flush(): void {
    if (timer === null) return;
    cancel();
    post();
  }

  watch(() => view.state.currentSlideId, cancel);
  onUnmounted(flush);

  return { schedule, flush, cancel };
}
