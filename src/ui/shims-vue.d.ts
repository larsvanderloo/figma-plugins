declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/**
 * Debug flag injected by Vite. Production builds replace this with false.
 */
declare const __PLUGIN_DEBUG__: boolean;

/**
 * App version injected by Vite at bundle-time from package.json.
 */
declare const __APP_VERSION__: string;
