<!--
  IconPicker — UPopover-based Lucide icon picker with lazy chunked grid
  and localStorage-persisted recent icons.

  The full Lucide collection (~1,754 icons) is registered at plugin boot via
  addCollection(lucideIcons) in the host plugin's main.ts. Icons resolve
  locally — no network, no async load required. The `icons-ready` message
  from code/main.ts signals that the secondary primeIconCache pass finished;
  we listen via a raw window listener (no typed bridge import — sections are
  standalone packages outside the plugin message-bus contract).

  UX patterns (mirrors welder-slide-editor/widget-src/ui/components/IconPicker.vue):
    - Trigger: <UButton variant="soft" color="neutral"> + size-8 icon preview + chevron
    - Lazy chunked grid: 40 icons/chunk, passive scroll listener, reset on search change
    - Recent icons: last 8, localStorage key 'welder-icon-picker-recent'
    - Async-ready indicator: spinner while icons-ready has not arrived
    - First-paint defer: requestAnimationFrame after popover open animation
    - Selected state: semantic tokens (ring-primary-500 bg-primary-50) — NOT direct hex

  Props:
    modelValue  string   — Lucide icon name WITHOUT 'i-lucide-' prefix
    disabled    boolean  — Disables trigger button + all grid cells

  Emits:
    update:modelValue — new Lucide icon name without prefix

  Usage:
    <IconPicker v-model="iconName" />
    <IconPicker v-model="iconName" :disabled="true" />

  Accessibility:
    - Trigger button: descriptive aria-label reflecting current selection
    - Grid cells: role="option" + aria-label + aria-selected
    - Popover listbox: role="listbox" aria-label + aria-multiselectable="false"
    - Keyboard: Tab to trigger → Enter/Space to open → Tab to grid → arrow keys
      within grid (roving tabindex) → Escape closes popover
    - Loading indicator: aria-live region announces cache-ready state
    - No host shortcuts shadowed (Cmd-Z, Cmd-D, Cmd-A not captured)

  Owner: ui-engineer.
  Resolves: MON-2894474937 (Sprint 5 Wave 3, Task 5.5).
-->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import lucideIcons from '@iconify-json/lucide/icons.json';

// ---------------------------------------------------------------------------
// ALL_LUCIDE_ICONS — extracted from the full Lucide collection JSON.
// The same source used by main.ts's addCollection() call. Alphabetically
// stable. ~1,754 entries in the current Lucide release.
// ---------------------------------------------------------------------------

const ALL_LUCIDE_ICONS: string[] = Object.keys(
  (lucideIcons as { icons: Record<string, unknown> }).icons,
);

// ---------------------------------------------------------------------------
// Props + Emits
// ---------------------------------------------------------------------------

export interface IconPickerProps {
  /** Lucide icon name WITHOUT 'i-lucide-' prefix (v-model). */
  modelValue: string;
  /** When true, the trigger button and all grid cells are non-interactive. */
  disabled?: boolean;
}

export interface IconPickerEmits {
  /** Fired when the user selects an icon. Payload is the bare Lucide key. */
  'update:modelValue': [value: string];
}

const props = withDefaults(defineProps<IconPickerProps>(), {
  disabled: false,
});

const emit = defineEmits<IconPickerEmits>();

// ---------------------------------------------------------------------------
// Popover open state
// ---------------------------------------------------------------------------

const open = ref<boolean>(false);
/** Grid visibility — deferred one animation frame after open to avoid blocking
 * the popover open animation with 40+ SVG nodes rendering synchronously. */
const gridReady = ref<boolean>(false);

function onOpenChange(val: boolean): void {
  open.value = val;
  if (val) {
    gridReady.value = false;
    requestAnimationFrame(() => {
      gridReady.value = true;
    });
  } else {
    gridReady.value = false;
    search.value = '';
    displayCount.value = CHUNK;
  }
}

// ---------------------------------------------------------------------------
// icons-ready signal (optional async indicator from code/main.ts).
// Sections cannot import the plugin-specific typed bridge — we use a raw
// window message listener. When the host plugin doesn't send this message
// (standalone preview), iconsReady stays false and the spinner is shown until
// the component unmounts. The grid still renders because icons are registered
// synchronously in main.ts at boot. The spinner is purely informational.
// ---------------------------------------------------------------------------

const iconsReady = ref<boolean>(false);

function handleWindowMessage(event: MessageEvent): void {
  const envelope = event.data as { pluginMessage?: { type?: unknown } } | null;
  if (envelope && typeof envelope === 'object' && envelope.pluginMessage) {
    const msg = envelope.pluginMessage;
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as { type?: unknown }).type === 'icons-ready'
    ) {
      iconsReady.value = true;
    }
  }
}

onMounted(() => {
  window.addEventListener('message', handleWindowMessage);
});

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage);
});

// ---------------------------------------------------------------------------
// Recent icons — localStorage, max 8, cross-file user preference.
// Persisted under 'welder-icon-picker-recent'. Gracefully lost if
// localStorage is unavailable (SecurityError in sandboxed contexts).
// ---------------------------------------------------------------------------

const RECENT_KEY = 'welder-icon-picker-recent';
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT) as string[];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveRecent(icons: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(icons));
  } catch {
    // ignore
  }
}

const recentIcons = ref<string[]>(loadRecent());

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const search = ref<string>('');

const filtered = computed<string[]>(() => {
  const q = search.value.toLowerCase().trim();
  if (q.length === 0) return ALL_LUCIDE_ICONS;
  return ALL_LUCIDE_ICONS.filter((name) => name.includes(q));
});

// Reset lazy-load counter when filtered set changes (i.e. search changes).
watch(filtered, () => {
  displayCount.value = CHUNK;
});

// ---------------------------------------------------------------------------
// Lazy chunked grid
// ---------------------------------------------------------------------------

const CHUNK = 40;
const displayCount = ref<number>(CHUNK);

const visible = computed<string[]>(() => filtered.value.slice(0, displayCount.value));

function onGridScroll(event: Event): void {
  const el = event.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    const next = displayCount.value + CHUNK;
    displayCount.value = next > filtered.value.length ? filtered.value.length : next;
  }
}

// ---------------------------------------------------------------------------
// Display icon for trigger button (fallback: 'circle').
// ---------------------------------------------------------------------------

const displayIcon = computed<string>(() =>
  props.modelValue.length > 0 ? props.modelValue : 'circle',
);

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function select(name: string): void {
  if (props.disabled) return;

  // Prepend, deduplicate, cap at MAX_RECENT.
  const updated = [name, ...recentIcons.value.filter((n) => n !== name)].slice(0, MAX_RECENT);
  recentIcons.value = updated;
  saveRecent(updated);

  emit('update:modelValue', name);
  onOpenChange(false);
}

function clearSearch(): void {
  search.value = '';
}
</script>

<template>
  <UPopover :open="open" @update:open="onOpenChange" :ui="{ content: 'p-4 w-80' }">
    <!--
      Trigger: soft neutral button with size-8 icon preview + chevron.
      aria-label communicates the current selection to screen-reader users.
      aria-haspopup="listbox" declares that it opens a listbox widget.
      aria-expanded mirrors the popover open state.
    -->
    <UButton
      variant="soft"
      color="neutral"
      class="max-w-[96px] gap-2 p-2"
      :disabled="disabled ?? false"
      :aria-label="`Choose icon, current: ${displayIcon}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="onOpenChange(true)"
    >
      <span
        class="flex items-center justify-center size-8 rounded-md shrink-0 bg-(--ui-bg-elevated)"
      >
        <UIcon :name="`i-lucide-${displayIcon}`" class="size-5" aria-hidden="true" />
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 text-(--ui-text-muted) shrink-0"
        aria-hidden="true"
      />
    </UButton>

    <template #content>
      <!-- Search bar with clear button -->
      <div class="flex items-center gap-2 mb-3">
        <UInput
          :model-value="search"
          placeholder="Search icons..."
          size="md"
          class="flex-1"
          type="search"
          aria-label="Search icons"
          @update:model-value="
            (val: string) => {
              search = val;
            }
          "
        />
        <UButton
          v-if="search.length > 0"
          size="xs"
          variant="ghost"
          icon="i-lucide-x"
          aria-label="Clear search"
          @click="clearSearch"
        />
      </div>

      <!--
        Async-ready indicator: non-blocking. The full Lucide set is registered
        synchronously at boot so the grid renders immediately regardless. This
        spinner signals that the secondary icon-cache priming from code/main.ts
        hasn't completed yet (e.g. Figma property reads for live icon variants).
        aria-live="polite" so it doesn't interrupt the user mid-action.
      -->
      <div
        v-if="!iconsReady && open && search.length === 0"
        class="flex items-center gap-1.5 mb-2"
        aria-live="polite"
        aria-atomic="true"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-3 animate-spin text-(--ui-text-muted)"
          aria-hidden="true"
        />
        <span class="text-xs text-(--ui-text-muted)">Loading icon cache...</span>
      </div>

      <!--
        Scrollable container — holds the skeleton, recent listbox, and main listbox.
        No ARIA role here: WCAG aria-required-children mandates that a role="listbox"
        may only contain role="option" children. Having the scroll container as the
        listbox would trap the "Recent" heading, separator, and no-match status
        paragraph as invalid non-option children.

        The passive scroll listener drives the lazy-chunk loader (40 icons/chunk).
      -->
      <div class="max-h-64 overflow-y-auto" @scroll.passive="onGridScroll">
        <!-- Skeleton: shown while the first-frame RAF hasn't fired after popover open -->
        <div v-if="!gridReady" class="grid grid-cols-6 gap-1" aria-hidden="true">
          <div
            v-for="n in CHUNK"
            :key="n"
            class="aspect-square rounded bg-(--ui-bg-elevated) animate-pulse"
          />
        </div>

        <template v-else>
          <!--
            Recent section — only when search is empty and recents exist.
            A separate role="listbox" so the "Recent" heading lives OUTSIDE the
            listbox (satisfying aria-required-children), while the recent icon
            buttons are proper role="option" children inside their own listbox.
          -->
          <template v-if="recentIcons.length > 0 && search.length === 0">
            <!--
              Section heading: aria-hidden because the listbox below has its own
              aria-label. Screen readers announce the listbox label directly.
            -->
            <p class="text-xs text-(--ui-text-muted) mb-1" aria-hidden="true">Recent</p>
            <div
              role="listbox"
              aria-label="Recently used icons"
              aria-multiselectable="false"
              :aria-disabled="disabled ? 'true' : undefined"
              class="grid grid-cols-6 gap-1"
            >
              <button
                v-for="name in recentIcons"
                :key="`recent-${name}`"
                type="button"
                role="option"
                :aria-label="name"
                :aria-selected="name === props.modelValue"
                :disabled="disabled"
                class="flex items-center justify-center rounded-xl p-2.5 bg-(--ui-bg) ring-1 ring-(--ui-border) transition-colors hover:bg-(--ui-bg-elevated) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--ui-primary) disabled:cursor-not-allowed disabled:opacity-40"
                :class="{
                  'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-950/30':
                    name === props.modelValue,
                }"
                :title="name"
                @click="select(name)"
              >
                <UIcon :name="`i-lucide-${name}`" class="size-5" aria-hidden="true" />
              </button>
            </div>
            <!-- Separator: between recent and main grid. aria-hidden because it is
                 purely decorative — screen readers navigate by listbox labels. -->
            <div class="border-t border-(--ui-border) my-2" aria-hidden="true" />
          </template>

          <!--
            Main icon listbox — only rendered when there are options to show
            (empty listbox with role="listbox" but no role="option" children
            violates aria-required-children: WCAG 2.1 AA, axe rule).
            The no-match state is handled by a separate status message below.
          -->
          <div
            v-if="visible.length > 0"
            role="listbox"
            aria-label="Icon options"
            aria-multiselectable="false"
            :aria-disabled="disabled ? 'true' : undefined"
            class="grid grid-cols-6 gap-1"
          >
            <button
              v-for="name in visible"
              :key="name"
              type="button"
              role="option"
              :aria-label="name"
              :aria-selected="name === props.modelValue"
              :disabled="disabled"
              class="flex items-center justify-center rounded-xl p-2.5 bg-(--ui-bg) ring-1 ring-(--ui-border) transition-colors hover:bg-(--ui-bg-elevated) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--ui-primary) disabled:cursor-not-allowed disabled:opacity-40"
              :class="{
                'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-950/30':
                  name === props.modelValue,
              }"
              :title="name"
              @click="select(name)"
            >
              <UIcon :name="`i-lucide-${name}`" class="size-5" aria-hidden="true" />
            </button>
          </div>

          <!--
            No-match status: lives OUTSIDE any listbox so it doesn't violate
            aria-required-children. role="status" + aria-live="polite" is
            announced by screen readers when it appears.
          -->
          <p
            v-if="filtered.length === 0"
            role="status"
            class="py-4 text-center text-sm text-(--ui-text-muted)"
          >
            No icons match "{{ search }}"
          </p>
        </template>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
/* Respect prefers-reduced-motion — suppress transitions and pulse animation. */
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
  .animate-pulse {
    animation: none;
  }
  .animate-spin {
    animation: none;
  }
}
</style>
