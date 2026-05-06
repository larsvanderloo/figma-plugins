// shims-vue.d.ts — required for vue-tsc to understand *.vue imports.
//
// Without this, vue-tsc reports "Cannot find module '*.vue'" for every SFC
// import. This mirrors v0.2.1's widget-src/ui/shims-vue.d.ts pattern.
//
// The `DefineComponent<{}, {}, any>` signature is intentionally permissive —
// the real component types are resolved by vue-tsc's Vue Language Plugin from
// the individual SFC files. This shim only handles the fallback case where
// the Language Plugin hasn't resolved a specific import yet.
//
// Owner: figma-api-engineer (tsconfig wiring).

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<object, object, any>;
  export default component;
}
