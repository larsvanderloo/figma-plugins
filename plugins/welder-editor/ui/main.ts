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

// ── Dev-only mock bridge ──────────────────────────────────────────────────
// Intercepts outgoing parent.postMessage calls and responds with canned
// mock data so the UI renders fully populated without a Figma main thread.
// The dynamic import is evaluated only when import.meta.env.DEV is true;
// Vite's dead-code elimination strips the entire block in production builds.
if (import.meta.env.DEV) {
  void import('./dev-mock-bridge.js').then(({ installDevMockBridge }) => {
    installDevMockBridge();
  });
}

app.mount('#app');
