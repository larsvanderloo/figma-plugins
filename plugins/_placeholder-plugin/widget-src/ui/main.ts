// ============================================================
// Vue-app entry. Mount App.vue met Nuxt UI-plugin.
//
// Icon-bundling (T17): Figma plugin-iframe heeft `networkAccess:
// ["none"]`, dus Iconify's runtime-API-fetch (api.iconify.design)
// wordt door CSP geblokkeerd. We registreren de volledige Lucide
// collection compile-time via @iconify/vue's `addCollection`,
// zodat alle `i-lucide-*` iconen lokaal resolven zonder network.
// ============================================================

import './main.css';
import { createApp } from 'vue';
import ui from '@nuxt/ui/vue-plugin';
import { addCollection } from '@iconify/vue';
import lucideIcons from '@iconify-json/lucide/icons.json';
import App from './App.vue';

// Registreer alle Lucide-iconen (prefix = 'lucide') voor offline-gebruik.
// @iconify/vue pakt deze als eerste op voordat het naar de remote API valt.
addCollection(lucideIcons as Parameters<typeof addCollection>[0]);

const app = createApp(App);
app.use(ui);
app.mount('#app');

// ── Dev-only mock bridge ──────────────────────────────────────────────────
// In de Vite dev-server is er geen Figma main thread. We simuleren de
// init → slide-loaded → icons-ready handshake zodat de UI volledig
// rendert in de sidebar preview.
if (import.meta.env.DEV) {
  function devPost(msg: unknown, delay: number): void {
    setTimeout(function () {
      window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: msg } }));
    }, delay);
  }

  devPost(
    {
      type: 'init',
      slides: [
        { id: 'dev-slide-1', name: 'Slide 1 — Intro' },
        { id: 'dev-slide-2', name: 'Slide 2 — Results' },
      ],
      initialSlideId: 'dev-slide-1',
    },
    300,
  );

  devPost(
    {
      type: 'slide-loaded',
      slideId: 'dev-slide-1',
      general: {
        titleDescription: {
          copyWrapId: 'cw-1',
          heading: 'Onze resultaten dit kwartaal',
          paragraph: 'Een korte toelichting op de cijfers en context.',
          headingDim: [[6, 19]],
        },
        badge: { badgeNodeId: 'badge-1', label: 'Q1 2025', icon: 'trending-up' },
        image: { imageWrapId: 'iw-1', imageHash: null },
      },
      content: {
        cardWrapId: 'wrap-1',
        cards: [
          {
            cardNodeId: 'c-1',
            heading: 'Omzet',
            paragraph: 'Totale omzet gestegen met 12% t.o.v. vorig kwartaal.',
            icon: 'euro',
            visualHash: null,
          },
          {
            cardNodeId: 'c-2',
            heading: 'Klanten',
            paragraph: 'Aantal actieve klanten is dit kwartaal met 8% gegroeid.',
            icon: 'users',
            visualHash: undefined,
          },
          {
            cardNodeId: 'c-3',
            heading: 'NPS',
            paragraph: 'Net Promoter Score stabiel op 42.',
            icon: 'heart',
            visualHash: null,
          },
        ],
      },
      graphs: null,
    },
    600,
  );
}
