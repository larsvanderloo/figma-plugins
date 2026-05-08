declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/**
 * Plugin version, injected at build time by Vite's `define` config from
 * `package.json`. Used to render the "v0.x.y" badge in the iframe header.
 */
declare const __APP_VERSION__: string;
