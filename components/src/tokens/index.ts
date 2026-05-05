// Design tokens for Figma plugins. Surfaced to Tailwind via Nuxt UI v4's
// theme override mechanism in each plugin's app.config.ts. Hex values are
// kept here so a token change re-themes every consumer.
//
// Owned by ui-engineer.
//
// SCOPE: iframe chrome only (panel backgrounds, button states, focus rings,
// spacing, typography scale). Canvas content tokens — Welder brand colors,
// slide fill colors, text-dimmer variable, journey pill fills — are NOT
// defined here. They live as Figma library variables in the published Slide
// Machine library and are applied by packages/figma-api/src/variables.ts.
// See ADR-0005 for the boundary definition.

export const tokens = {
  // Figma's brand-blue analog. Override per-plugin only with an ADR.
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  // Compact-density spacing scale, in px. Aligned with Tailwind's defaults
  // but extended down because plugin iframes are tight.
  spacing: {
    px: '1px',
    0.5: '2px',
    1: '4px',
    1.5: '6px',
    2: '8px',
    2.5: '10px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
  },
} as const;

export type Tokens = typeof tokens;
