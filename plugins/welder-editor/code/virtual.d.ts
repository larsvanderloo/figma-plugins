// TypeScript declaration for the virtual:ui-html module provided by
// the chunkedUiHtml Vite plugin in vite.code.config.ts.
// anti-pattern 0004: do not use figma.showUI(__html__) for bundles > ~150 KB.
declare module 'virtual:ui-html' {
  const html: string;
  export default html;
}
