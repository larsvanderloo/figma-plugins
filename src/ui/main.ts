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
import { createPinia } from 'pinia';
import ui from '@nuxt/ui/vue-plugin';
import { addCollection } from '@iconify/vue';
import lucideIcons from '@iconify-json/lucide/icons.json';
import App from './App.vue';

// Registreer alle Lucide-iconen (prefix = 'lucide') voor offline-gebruik.
// @iconify/vue pakt deze als eerste op voordat het naar de remote API valt.
addCollection(lucideIcons as Parameters<typeof addCollection>[0]);

const app = createApp(App);
app.use(createPinia());
app.use(ui);
app.mount('#app');

if (import.meta.env.DEV) {
  void import('./dev/mockBridge').then(({ installMockBridge }) => {
    installMockBridge();
  });
}
