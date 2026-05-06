// Minimal vue-router stub for vitest.
//
// Nuxt UI v4 lists vue-router as an OPTIONAL peer dep. Its runtime contains
// stubs that try to `import { ... } from 'vue-router'` even when the host
// app doesn't use a router. This stub satisfies those imports so the
// plugin's integration tests in tests/ui/* can render sections using
// Nuxt UI primitives (UFormField, UInput, USelectMenu, etc.) without
// pulling a real router dep.
//
// We provide just enough surface for Nuxt UI's internal stubs:
// `useLink`, `useRouter`, `useRoute`, `RouterLink` — all no-ops.
//
// Owner: figma-api-engineer (vitest config) + ui-engineer (test fixtures).

import { defineComponent, h } from 'vue';

export const RouterLink = defineComponent({
  name: 'RouterLink',
  props: ['to'],
  setup(_, { slots }) {
    return () => h('a', {}, slots.default?.());
  },
});

export function useRouter(): { push: () => void; replace: () => void } {
  return {
    push: () => {},
    replace: () => {},
  };
}

export function useRoute(): {
  path: string;
  query: Record<string, string>;
  params: Record<string, string>;
} {
  return { path: '/', query: {}, params: {} };
}

export function useLink(): {
  isActive: { value: boolean };
  isExactActive: { value: boolean };
  navigate: () => Promise<void>;
} {
  return {
    isActive: { value: false },
    isExactActive: { value: false },
    navigate: async () => {},
  };
}

export default {
  RouterLink,
  useRouter,
  useRoute,
  useLink,
};
