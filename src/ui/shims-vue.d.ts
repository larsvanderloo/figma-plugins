declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** Injected by Vite `define`; production builds replace it with false. */
declare const __PLUGIN_DEBUG__: boolean;

/** Injected by Vite `define` from package.json at build time. */
declare const __APP_VERSION__: string;
