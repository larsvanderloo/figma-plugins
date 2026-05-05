// {{plugin_name}} — ui-side entry.
// Runs in the iframe sandbox. Full DOM, no figma.*.
// Owns Vue 3 app initialization and message-bus dispatch on the ui side.

import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
app.mount('#app');
