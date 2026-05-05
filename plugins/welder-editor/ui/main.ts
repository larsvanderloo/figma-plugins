// plugins/welder-editor/ui/main.ts
//
// Vue 3 application entry for the Welder Editor plugin iframe.
// Runs in the iframe sandbox: full DOM, no figma.*.
//
// Boot order:
//   1. createApp(App)
//   2. createPinia() + pinia-plugin-persistedstate
//   3. app.mount('#app')
//   4. usePluginBridge is called inside App.vue's setup() — the global
//      window.addEventListener('message', ...) listener is installed there,
//      not here, so it is always torn down with the component tree.
//
// No direct figma.* calls are made here — those live entirely in code/main.ts.
// No localStorage reads — persisted plugin state flows via the message bus
// through figma.clientStorage (pinia-plugin-persistedstate is the in-memory
// write path; it mirrors to localStorage only as a warm-cache hint; the
// reconcileFrom / clearDataSlices guard in useEditorStore handles stale data).

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';

const app = createApp(App);

const pinia = createPinia();
pinia.use(piniaPersistedstate);

app.use(pinia);
app.mount('#app');
