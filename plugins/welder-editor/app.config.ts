// Welder Editor — Nuxt UI v4 theme configuration.
//
// This file maps the canonical design tokens from `components/src/tokens/` to
// Nuxt UI v4's theme contract for the plugin's iframe chrome.
//
// SCOPE — iframe chrome only (per ADR-0005):
//   buttons, inputs, selects, badges, focus rings, panel surfaces, tab labels.
//
// NOT here — canvas content tokens (Welder Oranje, Text Dimmer, Background):
//   those are Figma library variables applied by packages/figma-api/src/variables.ts.
//   See ADR-0005 for the boundary definition.
//
// Usage (vite.config.ts):
//   import welderTheme from './app.config';
//   ui({ ui: welderTheme })
//
// Owned by: ui-engineer.
// References: components/src/tokens/index.ts, ADR-0005, ADR-0003.

import type { NuxtUIOptions } from '@nuxt/ui/vite';

// The canonical Welder iframe theme. Export is typed against AppConfigUI
// (the `ui` key from NuxtUIOptions) so vite.config.ts can pass it directly.
const welderTheme: NuxtUIOptions['ui'] = {
  colors: {
    // Primary — Tailwind's `orange` palette.
    //
    // Welder Oranje (#ff7700) sits in the orange-500/600 range of the Tailwind
    // oklch palette, giving semantic primary utilities (bg-primary-500,
    // text-primary-600, focus-visible:outline-primary) that match the brand's
    // action color without hardcoding a hex value in this file.
    //
    // The orange palette provides all 11 shades (50–950) for hover/active/focus
    // states on UButton, UInput focus ring, UBadge, USwitch, etc.
    //
    // Per ADR-0005: orange is used for iframe chrome only.  Canvas fills
    // (slide backgrounds, heading accent colours) use the Figma library
    // variable "Welder Oranje" applied by packages/figma-api/src/variables.ts —
    // those hex values are not defined here.
    primary: 'orange',

    // Neutral — `zinc` palette.
    //
    // Figma's own chrome uses zinc-toned grays (slightly warm, low-saturation).
    // Zinc matches that visual language better than slate (cool-blue-tinted) or
    // neutral (pure gray).  Affects panel backgrounds, disabled states,
    // placeholder text, border colours.
    neutral: 'zinc',
  },

  // ----------------------------------------------------------------
  // Compact-density defaults for plugin iframe context.
  //
  // Plugin iframes are constrained: the Figma panel is narrow (240–360 px
  // wide) and users expect compact controls.  Nuxt UI's default size is `md`
  // which is optimised for full-page web apps — too roomy for an iframe.
  //
  // Setting `size: 'sm'` as the default variant reduces padding and
  // font-size to values from `components/src/tokens/index.ts` spacing
  // scale without overriding the Tailwind utilities directly.
  //
  // Individual sections can still pass `size="md"` to a `UButton` or
  // `UInput` when a larger touch target is appropriate (e.g. the main
  // action CTA in a section that has enough vertical space).
  // ----------------------------------------------------------------

  button: {
    defaultVariants: {
      // sm: px-2.5 py-1.5 text-xs (maps to tokens.spacing.2 / tokens.spacing.1.5)
      size: 'sm',
      color: 'primary',
      variant: 'solid',
    },
  },

  input: {
    defaultVariants: {
      // sm: px-2.5 py-1 text-xs — matches SlidePicker's native <select> sizing
      size: 'sm',
      color: 'primary',
      variant: 'outline',
    },
  },

  select: {
    defaultVariants: {
      size: 'sm',
      color: 'primary',
      variant: 'outline',
    },
  },

  // ----------------------------------------------------------------
  // Dark mode — deferred to v0.2.0.
  //
  // Per ADR-0005 §"Iframe side — light/dark mode": Figma does not expose a
  // figma.editorTheme API as of v0.1.0. Dark-mode wiring is a v0.2.0 scope
  // item and requires figma-api-engineer to identify the host-theme
  // detection path before the App.vue class-toggle can be wired.
  //
  // When dark mode is added:
  //   1. figma-api-engineer includes the theme in the `init` message.
  //   2. App.vue toggles `document.documentElement.classList.toggle('dark')`.
  //   3. Nuxt UI v4 dark-mode variants activate via its `class="dark"` strategy.
  //
  // No dark-mode overrides are set here until that wiring lands.
  // ----------------------------------------------------------------
};

export default welderTheme;
