// The plugin iframe runs with `networkAccess: ["none"]`, so Iconify's runtime
// fetch to api.iconify.design is CSP-blocked; the full Lucide collection is
// registered compile-time via `addCollection` so `i-lucide-*` resolves offline.

import './main.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import { addCollection } from '@iconify/vue';
import lucideIcons from '@iconify-json/lucide/icons.json';
import App from './App.vue';

addCollection(lucideIcons as Parameters<typeof addCollection>[0]);

const app = createApp(App);
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<span />' } }],
});

app.use(createPinia());
app.use(router);
app.use(ui);
app.mount('#app');

if (import.meta.env.DEV) {
  void import('./dev/mockBridge').then(({ installMockBridge }) => {
    installMockBridge();
  });
}
