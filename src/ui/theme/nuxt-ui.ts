export const welderNuxtUiTheme = {
  colors: {
    primary: 'orange',
    secondary: 'blue',
    neutral: 'neutral',
  },
  card: {
    slots: {
      // HeroUI-style surface, expressed through Nuxt UI slots:
      // the card owns padding/radius/shadow; slots compose inside it.
      root: 'relative flex flex-col gap-3 overflow-hidden h-auto box-border p-4 rounded-surface text-default subpixel-antialiased',
      header: 'flex flex-col gap-3 w-full shrink-0 p-0 text-sm font-medium text-highlighted [&_h2]:text-sm [&_h2]:font-medium [&_h3]:text-sm [&_h3]:font-medium',
      body: 'relative flex flex-1 w-full flex-auto flex-col break-words text-left overflow-y-auto p-0 subpixel-antialiased',
      footer: 'flex w-full items-center p-0 subpixel-antialiased',
    },
    variants: {
      variant: {
        solid: { root: 'bg-inverted text-inverted shadow-surface' },
        outline: { root: 'bg-default ring-1 ring-default/70 shadow-surface' },
        soft: { root: 'bg-elevated/50 shadow-none' },
        subtle: { root: 'bg-elevated/50 ring-1 ring-default/70 shadow-surface' },
      },
    },
  },
} as const;
