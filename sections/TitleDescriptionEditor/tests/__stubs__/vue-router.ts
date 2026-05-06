// Minimal vue-router stub for jsdom vitest tests.
//
// @nuxt/ui/vite resolves vue-router as an optional peer dep. When it isn't
// installed, the Vite plugin fails to resolve the router stub it uses for
// non-Nuxt contexts. This stub provides the subset of the vue-router API
// surface that @nuxt/ui v4 components reference internally so the plugin
// can initialise without the full router being present.
//
// Do NOT add real routing logic here — this section has no router.

import { ref } from 'vue';

export const useRoute = () => ({
  path: '/',
  name: undefined,
  params: {},
  query: {},
  hash: '',
  fullPath: '/',
  matched: [],
  meta: {},
  redirectedFrom: undefined,
});

export const useRouter = () => ({
  push: async () => {},
  replace: async () => {},
  back: () => {},
  forward: () => {},
  go: () => {},
  currentRoute: ref({
    path: '/',
    name: undefined,
    params: {},
    query: {},
    hash: '',
    fullPath: '/',
    matched: [],
    meta: {},
  }),
  resolve: (to: unknown) => ({ href: String(to) }),
});

export const RouterLink = { template: '<a><slot /></a>' };
export const RouterView = { template: '<div><slot /></div>' };
