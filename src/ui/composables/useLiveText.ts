// useLiveText — debounce voor live-getypte tekst richting de sandbox.
//
// Zelfde patroon als de tabel-grid (200ms trailing): de editor schedule()t
// per keystroke (via het `live`-event van WInput/WTextarea), de post gaat
// één keer per typ-pauze. flush() bij commit (blur/Enter) en bij unmount
// zodat de laatste aanslagen nooit verloren gaan. Pending werk wordt
// geannuleerd bij slide-wissel: de post zou anders ná de wissel met het
// NIEUWE currentSlideId vuren en oude tekst op de verkeerde slide schrijven.

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
