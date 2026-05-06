// plugins/welder-editor/ui/main.ts
//
// Vue 3 application entry. Mount App.vue with Nuxt UI v4 plugin
// + Iconify Lucide collection (offline registration — Figma plugin
// manifest declares networkAccess: ["none"], so api.iconify.design
// runtime fetch is CSP-blocked).

import './main.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPersistedstate from 'pinia-plugin-persistedstate';
import ui from '@nuxt/ui/vue-plugin';
import { addCollection } from '@iconify/vue';
import lucideIcons from '@iconify-json/lucide/icons.json';
import App from './App.vue';

// Register full Lucide icon collection compile-time. UIcon name="i-lucide-foo"
// resolves locally without network. Bundle cost: ~120 KB raw / ~25 KB gzip
// for the full set; subset later if needed.
addCollection(lucideIcons as Parameters<typeof addCollection>[0]);

const app = createApp(App);

const pinia = createPinia();
pinia.use(piniaPersistedstate);
app.use(pinia);
app.use(ui);

app.mount('#app');

// ── Dev-only mock bridge ──────────────────────────────────────────────────
// In Vite dev-server / standalone preview, there's no Figma main thread.
// Simulate the init → slide-loaded handshake so the UI renders fully
// populated for layout/UX iteration. Mirrors v0.2.1's pattern.
if (import.meta.env.DEV) {
  function devPost(msg: unknown, delay: number): void {
    setTimeout(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: msg } }));
    }, delay);
  }

  // Payloads match the exact Message union shapes from shared/messages.ts.
  // init: { type, version, payload: { slides, initialSlideId, editorType } }
  devPost(
    {
      type: 'init',
      version: 1,
      payload: {
        slides: [
          {
            id: 'dev-slide-1',
            number: 1,
            name: 'Welcome — Customer Journey',
            isSkipped: false,
          },
          {
            id: 'dev-slide-2',
            number: 2,
            name: 'Product Pillars',
            isSkipped: false,
          },
        ],
        initialSlideId: 'dev-slide-1',
        editorType: 'figma',
      },
    },
    200,
  );

  // slide-load:result: { type, version, correlationId, payload: Result<{...}> }
  devPost(
    {
      type: 'slide-load:result',
      version: 1,
      correlationId: 'dev-load-1',
      payload: {
        ok: true,
        data: {
          slideId: 'dev-slide-1',
          general: {
            titleDescription: {
              copyWrapId: 'cw-1',
              heading: 'Welder v0.1.0 RC',
              paragraph: 'Branded plugin UI rewire — Sprint 5.',
              headingDim: [],
            },
            badge: {
              badgeNodeId: 'bd-1',
              label: 'Q4 2026',
              icon: 'sparkles',
            },
            image: {
              imageWrapId: 'iw-1',
              imageHash: null,
            },
          },
          content: {
            cardWrapId: 'cw-cards-1',
            cards: [
              {
                cardNodeId: 'c-1',
                heading: 'Faster builds',
                paragraph: 'Single-file vite output cuts plugin load to under a second.',
                icon: 'zap',
                visualHash: null,
              },
              {
                cardNodeId: 'c-2',
                heading: 'Branded chrome',
                paragraph: 'Welder Oranje primary + Inter font + Nuxt UI v4 primitives.',
                icon: 'paint-bucket',
                visualHash: null,
              },
            ],
            timelineItems: [],
            journeyModel: null,
          },
          graphs: null,
        },
      },
    },
    500,
  );
}
