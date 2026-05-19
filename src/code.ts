// ============================================================
// Welder Slide Editor — Plugin Main (T4 skelet)
//
// Entry-point voor de plugin-thread. Verantwoordelijkheden:
//   1. UI-iframe tonen (figma.showUI).
//   2. Fonts preloaden (FIG-FONT-01) zodat latere debounced text-edits
//      direct kunnen doorzetten zonder per-call loadFontAsync.
//   3. Command-dispatch op `figma.command` (manifest menu "open").
//   4. Bridge-message-loop: vertaalt UI-events naar figma-node-scans
//      en response-messages (spec §5, FIG-MSG-01).
//   5. Page-change listener: hercomputet de slidelist bij page-nav.
//
// Update-handlers voor general/card/graph/image zijn bewust no-op met
// TODO-comments — die krijgen hun implementatie in T8–T12.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing,
// geen catch-without-binding (memory feedback_figma_runtime.md).
// ============================================================

import uiHtml from '../dist/ui.html';
import { REQUIRED_FONTS } from './constants';
import { debugLog, debugMessage, isPluginDebugEnabled } from './debug';
import {
  findSlidesOnPage,
  slideSummary,
  findCopyWrap,
  findBadge,
  findImageWrap,
  findCardWrap,
  findTableWrap,
  findTableSlot,
  findTimelineWrap,
  findJourneyWrap,
  findJourneySlot,
  isSlide,
  isEffectivelyVisible,
  readBooleanProperty,
} from './slide-machine';
import {
  applyTitleDescription,
  TitleDescriptionPayload,
} from './editors/general/title-description';
import { applyBadge, BadgePayload } from './editors/general/badge';
import { applyImage, findImageSlot } from './editors/general/image';
import { applyCard, applyCardVisual } from './editors/content/card';
import { normalizeIconKey, LUCIDE_SLUG_RE, primeIconCache } from './editors/_shared/icon-swap';
import { applyTable, scanTableSlot } from './editors/table/renderer';
import { applyJourney, scanJourneySlot } from './editors/journey/renderer';
import { importCSV } from './editors/table/csv';
import { setTextCharactersSafe } from './editors/_shared/fonts';
import { loadAccentVars } from './editors/_shared/accent-vars';
import { applyAccentRanges, readDimRanges } from './editors/_shared/accent-ranges';
import type {
  SlideSummary,
  GeneralSections,
  ThemeMode,
  ContentItems,
  GraphItems,
  CardItem,
  TimelineItem,
  TableWrapModel,
  JourneyWrapModel,
  UIToPluginMessage,
  PluginToUIMessage,
  PluginRuntimeInfo,
} from './types';

// ============================================================
// Bootstrap
// ============================================================

figma.showUI(uiHtml, { width: 520, height: 760, themeColors: true });

function isDevModeRuntime(): boolean {
  return figma.editorType === 'dev';
}

function getRuntimeInfo(): PluginRuntimeInfo {
  return {
    editorType: figma.editorType,
    mode: figma.mode,
    command: figma.command,
    vscode: figma.vscode !== undefined && figma.vscode !== null,
    debug: isPluginDebugEnabled(),
  };
}

debugLog('sandbox', 'startup', getRuntimeInfo());

// Restore last-saved iframe size (clientStorage, per-user). Async so the
// UI shows immediately at the default; the resize is a no-op flicker if
// the saved values match the defaults.
(function restoreUiSize(): void {
  figma.clientStorage
    .getAsync('welder-ui-size')
    .then(function (stored: unknown) {
      if (stored === null || stored === undefined || typeof stored !== 'object') return;
      const s = stored as { width?: unknown; height?: unknown };
      const w = typeof s.width === 'number' ? s.width : null;
      const h = typeof s.height === 'number' ? s.height : null;
      if (w !== null && h !== null && w >= 320 && h >= 400) {
        try {
          figma.ui.resize(w, h);
        } catch (_e) {
          /* silent — resize can reject on detached UI */
        }
      }
    })
    .catch(function () {
      /* silent — clientStorage may be unavailable */
    });
})();

// ============================================================
// Proactive icon backfill — walks every Welder Slide on every page,
// captures each Card's currently-visible icon into plugin data when
// it has no record yet. One-shot per plugin session, fire-and-forget.
//
// Why: the reconcile fix only protects icons that already have plugin
// data. Cards on slides the user hasn't visited via the new plugin yet
// have no record, so a subsequent library update wipes their slot
// child without anything to restore from. Running this on startup
// ensures every card in the file is protected before the user gets a
// chance to accept the next library update.
// ============================================================
async function backfillAllIcons(): Promise<void> {
  try {
    await figma.loadAllPagesAsync();
  } catch (e) {
    console.log('[icon-backfill] loadAllPagesAsync failed: ' + String(e));
    return;
  }
  let cardsVisited = 0;
  let cardsWritten = 0;
  let badgesVisited = 0;
  let badgesWritten = 0;
  const staleCards: Array<{ slideId: string; cardNodeId: string; iconIntended: string }> = [];
  const staleBadges: Array<{ slideId: string; iconIntended: string }> = [];
  const pages = figma.root.children;
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    if (page.type !== 'PAGE') continue;
    let slides: InstanceNode[];
    try {
      slides = findSlidesOnPage(page);
    } catch (_e) {
      continue;
    }
    for (let s = 0; s < slides.length; s++) {
      const slide = slides[s];
      // ── Cards ──
      let cards: SceneNode[];
      try {
        cards = slide.findAll(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'Card';
        });
      } catch (_e) {
        cards = [];
      }
      for (let c = 0; c < cards.length; c++) {
        const card = cards[c];
        if (card.type !== 'INSTANCE') continue;
        const cardInst = card as InstanceNode;
        cardsVisited++;
        let stored = '';
        try {
          stored = cardInst.getSharedPluginData('welder', 'icon');
        } catch (_e) {
          continue;
        }
        const current = readCardIcon(card, slide);
        if (typeof stored === 'string' && stored.length > 0) {
          // Already persisted — flag stale when slot diverged from the
          // record (library republish wiped the override).
          if (current !== null && current.length > 0 && current !== stored) {
            staleCards.push({
              slideId: slide.id,
              cardNodeId: cardInst.id,
              iconIntended: stored,
            });
          }
          continue;
        }
        // No record yet — backfill from current slot value.
        if (current === null || current.length === 0) continue;
        try {
          cardInst.setSharedPluginData('welder', 'icon', current);
          cardsWritten++;
        } catch (_e) {
          /* silent */
        }
      }
      // ── Badges ──
      let badges: SceneNode[];
      try {
        badges = slide.findAll(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'Badge';
        });
      } catch (_e) {
        badges = [];
      }
      for (let b = 0; b < badges.length; b++) {
        const badge = badges[b];
        if (badge.type !== 'INSTANCE') continue;
        const badgeInst = badge as InstanceNode;
        badgesVisited++;
        let stored = '';
        try {
          stored = badgeInst.getSharedPluginData('welder', 'icon');
        } catch (_e) {
          continue;
        }
        const current = readBadgeIcon(badgeInst);
        if (typeof stored === 'string' && stored.length > 0) {
          if (current.length > 0 && current !== stored) {
            staleBadges.push({ slideId: slide.id, iconIntended: stored });
          }
          continue;
        }
        if (current.length === 0) continue;
        try {
          badgeInst.setSharedPluginData('welder', 'icon', current);
          badgesWritten++;
        } catch (_e) {
          /* silent */
        }
      }
    }
  }
  console.log(
    '[icon-backfill] cards: visited ' + cardsVisited + ', wrote ' + cardsWritten +
      ', stale ' + staleCards.length +
      ' · badges: visited ' + badgesVisited + ', wrote ' + badgesWritten +
      ', stale ' + staleBadges.length,
  );
  // Post stale list (always — possibly empty) so the iframe can dismiss
  // its "reconciling" splash phase once it sees this message.
  postToUI({ type: 'stale-icons', cards: staleCards, badges: staleBadges });
}

// Fire-and-forget — happens in the background after the UI is shown.
// Plugin-data writes are cheap and the user is unlikely to accept a
// library update within the first ~second of opening the plugin.
// Dev Mode is read-only for this debug manifest, so skip backfills there.
if (!isDevModeRuntime()) {
  backfillAllIcons().catch(function (e: unknown) {
    console.log('[icon-backfill] failed:', e);
  });
} else {
  debugLog('icon-backfill', 'skipped-dev-mode');
}

/**
 * Parallel preload van alle fonts die we in text-mutaties gebruiken.
 * Faalt hard bij een missing font zodat we niet later in T8/T9/T11
 * stille crashes krijgen. FIG-FONT-01.
 */
async function loadFonts(): Promise<void> {
  await Promise.all(REQUIRED_FONTS.map((font) => figma.loadFontAsync(font)));
}

// ============================================================
// Slide-scan — bouwt de drie tab-payloads voor één slide
// ============================================================

/** Combinatie van de drie tab-payloads; exact de shape van `slide-loaded`. */
interface SlideScan {
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

/**
 * Leest een descendant text-node op naam en geeft zijn characters terug.
 * Bounded scope (findOne binnen de wrapper) en naam-gebaseerd — zie
 * spec §7. Text-lookup is read-only zodat we geen font hoeven te
 * laden alvorens `characters` te lezen.
 */
function readTextByName(scope: SceneNode, name: string): string | null {
  if (!('findOne' in scope)) return null;
  const node = scope.findOne((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  if (node === null) return null;
  if (node.type !== 'TEXT') return null;
  return node.characters;
}

/**
 * Als readTextByName, maar retourneert null wanneer de gevonden text-node
 * (of één van zijn ancestors binnen `slide`) visible=false heeft.
 *
 * Gebruikt voor de Paragraph-textnode in CopyWrap: de Slide Machine-
 * variant "Heading only" zet de Paragraph-subtree op visible=false, en
 * de plugin moet de Paragraph-textarea dan niet tonen (spec §13 T19).
 * Zelfde patroon als findBadge (T18).
 */
function readVisibleTextByName(scope: SceneNode, name: string, slide: InstanceNode): string | null {
  if (!('findAll' in scope)) return null;
  // Slide Machine variant-componenten bevatten vaak meerdere text-nodes
  // met dezelfde naam (één per variant-branch); we moeten de eerste
  // *zichtbare* match pakken, niet de eerste in de tree — anders verbergen
  // we de textarea terwijl de user de paragraph wel degelijk toont.
  const matches = scope.findAll((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  for (const m of matches) {
    if (m.type !== 'TEXT') continue;
    if (!isEffectivelyVisible(m, slide)) continue;
    return m.characters;
  }
  return null;
}

/**
 * Leest de huidige icon-slug uit een Badge-instance.
 * Structuur: Badge → icon_wrapper (FRAME) → eerste INSTANCE-kind → .name
 * Normaliseert de naam via normalizeIconKey (strip 'i-lucide-' etc.).
 * Retourneert '' wanneer de wrapper of icon-kind ontbreekt.
 */
function readBadgeIcon(badge: InstanceNode): string {
  if (!('findOne' in badge)) return '';

  // Slot-based (new): Badge → icon-slot (SLOT) → first child (INSTANCE or
  // FRAME after SVG-replace). The slot helper sets the child's name to
  // the Lucide slug after insertion, so normalising the name is enough.
  const slot = badge.findOne(function (n: SceneNode) {
    return n.type === 'SLOT' && n.name === 'icon-slot';
  });
  if (slot !== null && slot.type === 'SLOT' && 'children' in slot) {
    const slotNode = slot as SlotNode;
    if (slotNode.children.length > 0) {
      return normalizeIconKey(slotNode.children[0].name);
    }
  }

  // Legacy fallback: Badge → icon_wrapper (FRAME) → first INSTANCE-kind.
  if ('findChild' in badge) {
    const wrapper = badge.findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (child.type === 'INSTANCE') {
          return normalizeIconKey(child.name);
        }
      }
    }
  }
  return '';
}

/**
 * Leest de huidige icon-slug uit een Card-node.
 * Drie strategieën (symmetrisch met applyCardIconSwap in card.ts):
 *
 *   A. Directe INSTANCE-children — eerste child wier naam een Lucide-slug is.
 *   B. icon_wrapper-child → eerste INSTANCE-kind daarin.
 *   C. findOne descendant — eerste INSTANCE-descendant met Lucide-slug-naam.
 *
 * Retourneert null wanneer geen passend kind gevonden wordt of wanneer de
 * gevonden icon-instance niet zichtbaar is (visible === false via ancestor-chain).
 *
 * T32: signatuur uitgebreid met `slide` zodat isEffectivelyVisible aangeroepen
 * kan worden. Zelfde visibility-pattern als readVisibleTextByName (T19).
 */
function readCardIcon(card: SceneNode, slide: InstanceNode): string | null {
  // Both INSTANCE (legacy library icon) and FRAME (post-SVG-replace) are
  // valid icon-node shapes. The frame inserted by replaceCardIconWithSvg
  // carries the Lucide name as its node name, so the normalize-check is
  // the only thing the reader needs.
  const isIconNode = function (n: SceneNode): boolean {
    return n.type === 'INSTANCE' || n.type === 'FRAME';
  };

  // Strategy 0: read the ACTIVE icon-slot's first child. Card masters
  // can carry multiple icon-slots (top vs side variant) with the inactive
  // one hidden via ancestor visibility. findOne hits tree-order and lands
  // on the hidden one — by which point isEffectivelyVisible nukes the
  // result and the picker shows a blank preview. Walk all icon-slots and
  // pick the one whose ancestor chain is visible.
  if ('findAll' in card) {
    const slots = (card as InstanceNode).findAll(function (n: SceneNode) {
      return n.type === 'SLOT' && n.name === 'icon-slot';
    });
    for (let i = 0; i < slots.length; i++) {
      const candidate = slots[i];
      if (candidate.type !== 'SLOT') continue;
      let visible = true;
      let cursor: BaseNode | null = candidate;
      while (cursor !== null && cursor.id !== card.id) {
        if ('visible' in cursor && (cursor as SceneNode).visible === false) {
          visible = false;
          break;
        }
        cursor = cursor.parent;
      }
      if (!visible) continue;
      const slotNode = candidate as SlotNode;
      if (slotNode.children.length > 0) {
        const slug = normalizeIconKey(slotNode.children[0].name);
        if (slug.length > 0) return slug;
      }
    }
  }

  // Strategy A: directe INSTANCE/FRAME-children met Lucide-slug-naam
  if ('children' in card) {
    const children = (card as FrameNode | GroupNode | InstanceNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!isIconNode(child)) continue;
      const normalized = normalizeIconKey(child.name);
      if (LUCIDE_SLUG_RE.test(normalized)) {
        return isEffectivelyVisible(child, slide) ? normalized : null;
      }
    }
  }

  // Strategy B: icon_wrapper → eerste icon-kind (INSTANCE of FRAME)
  if ('findChild' in card) {
    const wrapper = (card as InstanceNode).findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (isIconNode(child)) {
          return isEffectivelyVisible(child, slide) ? normalizeIconKey(child.name) : null;
        }
      }
    }
  }

  // Strategy C: findOne descendant — eerste icon-node met Lucide-slug-naam
  if ('findOne' in card) {
    const found = (card as InstanceNode).findOne((n: SceneNode) => {
      if (!isIconNode(n)) return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && isIconNode(found)) {
      return isEffectivelyVisible(found, slide) ? normalizeIconKey(found.name) : null;
    }
  }

  return null;
}

/**
 * Zoekt het eerste zichtbare descendant-TextNode met de gegeven naam binnen
 * de CopyWrap. Spiegelbeeld van `readVisibleTextByName`, maar retourneert
 * het TextNode-object zelf (nodig voor `getStyledTextSegments`).
 */
function findVisibleTextNodeByName(
  scope: SceneNode,
  name: string,
  slide: InstanceNode,
): TextNode | null {
  if (!('findAll' in scope)) return null;
  const matches = scope.findAll((n: SceneNode) => {
    return n.type === 'TEXT' && n.name === name;
  });
  for (const m of matches) {
    if (m.type !== 'TEXT') continue;
    if (!isEffectivelyVisible(m, slide)) continue;
    return m;
  }
  return null;
}

/**
 * Heading-size source on CopyWrap is the nested `TypHeading` instance's
 * VARIANT property (verified via Figma MCP on Welder Templates v0). Some
 * older library generations may not have a TypHeading wrapper — we fall
 * back to scanning CopyWrap itself for a size-named VARIANT in case the
 * property was lifted up. Both reads (current value) and writes
 * (setProperties) need the same host + key, so the resolver returns both.
 */
interface HeadingSizeHost {
  host: InstanceNode;
  key: string;
  value: string;
  options: ReadonlyArray<string>;
}

async function resolveTypHeadingSizeHost(
  copyWrap: InstanceNode,
): Promise<HeadingSizeHost | null> {
  const candidates: InstanceNode[] = [];
  // Prefer TypHeading; fall back to CopyWrap-level scan for legacy masters.
  if ('findOne' in copyWrap) {
    const typHeading = copyWrap.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'TypHeading';
    });
    if (typHeading !== null && typHeading.type === 'INSTANCE') {
      candidates.push(typHeading as InstanceNode);
    }
  }
  candidates.push(copyWrap);

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const props = cand.componentProperties;
    if (props === null || props === undefined) continue;
    const keys = Object.keys(props);
    let key: string | null = null;
    // Pass 1: exact "size" (case-insensitive). The Figma plugin API
    // returns variant keys with a `#nodeId:n` suffix in some files; we
    // strip the suffix before comparing.
    for (let k = 0; k < keys.length; k++) {
      const bare = keys[k].split('#')[0].toLowerCase();
      if (bare === 'size' && props[keys[k]].type === 'VARIANT') {
        key = keys[k];
        break;
      }
    }
    // Pass 2: any VARIANT key containing "size" (alnum-stripped).
    if (key === null) {
      for (let k = 0; k < keys.length; k++) {
        const stripped = keys[k].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (stripped.indexOf('size') >= 0 && props[keys[k]].type === 'VARIANT') {
          key = keys[k];
          break;
        }
      }
    }
    if (key === null) {
      console.log(
        '[copywrap-size]   candidate "' + cand.name + '" props=[' + keys.join(', ') + '] — no size key',
      );
      continue;
    }
    const main = await cand.getMainComponentAsync();
    const parent = main !== null ? main.parent : null;
    if (parent === null || parent.type !== 'COMPONENT_SET') {
      console.log(
        '[copywrap-size]   candidate "' + cand.name + '" main parent is ' +
          (parent !== null ? parent.type : 'null') + ', not COMPONENT_SET',
      );
      continue;
    }
    const defs = (parent as ComponentSetNode).componentPropertyDefinitions;
    const def = defs !== null && defs !== undefined ? defs[key] : undefined;
    if (def === undefined || def.type !== 'VARIANT' || !Array.isArray(def.variantOptions)) {
      console.log(
        '[copywrap-size]   candidate "' + cand.name + '" def missing variantOptions for key "' +
          key + '"',
      );
      continue;
    }
    // H5 is intentionally excluded from the picker — the library exposes
    // it but Welder's editor only ships Display through H4 as user-facing
    // sizes. If a slide is currently on H5 the value passes through (no
    // forced rewrite); the slider just snaps to the nearest allowed
    // option as soon as the user drags it.
    const filteredOptions: string[] = [];
    for (let o = 0; o < def.variantOptions.length; o++) {
      if (def.variantOptions[o].toLowerCase() !== 'h5') {
        filteredOptions.push(def.variantOptions[o]);
      }
    }
    // Reverse so the slider goes small → big left → right (H4 on the
    // left, Display on the right) — matches user expectation that
    // dragging right means a bigger heading. Figma's variantOptions
    // are declared big → small in the library.
    filteredOptions.reverse();
    return {
      host: cand,
      key: key,
      value: String(props[key].value),
      options: filteredOptions,
    };
  }
  return null;
}

async function scanGeneral(slide: InstanceNode): Promise<GeneralSections | null> {
  const copyWrap = findCopyWrap(slide);
  const badge = findBadge(slide);
  const imageWrap = findImageWrap(slide);

  // Secties opbouwen; elke null wanneer de wrapper niet bestaat.
  let titleDescription: GeneralSections['titleDescription'] = null;
  if (copyWrap !== null) {
    // Visibility-aware read (used for accent dim-ranges below — those
    // require the live TextNode reference). Plain characters are read
    // regardless of visibility so the iframe can preserve text across
    // toggle-off-then-on without round-tripping to Figma.
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    const paragraphHidden = readBooleanProperty(copyWrap, 'showParagraph') === false;
    const paragraphNode = paragraphHidden
      ? null
      : findVisibleTextNodeByName(copyWrap, 'Paragraph', slide);
    const heading = readTextByName(copyWrap, 'Heading') || '';
    // `paragraph` is null only when the master has no Paragraph TextNode
    // at all — that's the "section unsupported" signal. When the node
    // exists but the section is hidden via showParagraph, we still send
    // the chars so the toggle can preserve them across off/on cycles.
    const paragraphChars = readTextByName(copyWrap, 'Paragraph');
    const paragraph = paragraphChars !== null ? paragraphChars : null;

    // Heading visibility — CopyWrap's .visible flag. CopyWrap owns the
    // title fill/container, so hiding only TypHeading leaves a visual
    // shell behind. Paragraph visibility — showParagraph BOOLEAN
    // component property (null when the property doesn't exist OR
    // there's no Paragraph TextNode).
    let headingVisible = copyWrap.visible !== false;
    const typHeading = copyWrap.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'TypHeading';
    });
    if (headingVisible && typHeading !== null && 'visible' in typHeading) {
      // Legacy read: pre-CopyWrap-toggle builds hid TypHeading directly.
      // Keep reflecting that as hidden until the next "on" toggle
      // normalizes both CopyWrap and TypHeading back to visible.
      headingVisible = (typHeading as InstanceNode).visible !== false;
    }
    let paragraphVisible: boolean | null = null;
    if (paragraph !== null) {
      const showParagraphValue = readBooleanProperty(copyWrap, 'showParagraph');
      paragraphVisible = showParagraphValue === null ? true : showParagraphValue;
    }

    // Dim-range scan (spec §13 T30) — heading-only, silent-fail naar null
    // wanneer de library onbereikbaar is of het heading-node ontbreekt.
    // Paragraph-accent is permanent out-of-scope (geen paragraphDim).
    let headingDim: Array<[number, number]> | null = null;
    if (headingNode !== null) {
      try {
        headingDim = await readDimRanges(headingNode);
      } catch (err: unknown) {
        console.log('[welder-slide-editor] readDimRanges(heading) failed:', err);
        headingDim = null;
      }
    }

    // Heading-size VARIANT property lives on the nested `TypHeading`
    // instance inside CopyWrap, not on CopyWrap itself (verified via
    // Figma MCP — CopyWrap's componentProperties only exposes Badge/
    // Paragraph toggles; size is a TypHeading-level variant).
    let size: { current: string; options: ReadonlyArray<string> } | null = null;
    try {
      const headingHost = await resolveTypHeadingSizeHost(copyWrap);
      if (headingHost !== null) {
        size = {
          current: headingHost.value,
          options: headingHost.options,
        };
        console.log(
          '[copywrap-size] options=[' + headingHost.options.join(', ') +
            '], current=' + headingHost.value,
        );
      } else {
        console.log('[copywrap-size] TypHeading + size property not resolved');
      }
    } catch (e) {
      console.log('[copywrap-size] lookup failed:', e);
    }

    titleDescription = {
      copyWrapId: copyWrap.id,
      heading: heading,
      paragraph: paragraph,
      headingVisible: headingVisible,
      paragraphVisible: paragraphVisible,
      headingDim: headingDim,
      size: size,
    };
  }

  // Badge visibility — the `Badge_wrap` FRAME inside CopyWrap is the
  // source of truth (verified via Figma MCP on Welder Templates v0).
  // Toggling its `.visible` cleanly collapses the badge out of CopyWrap's
  // auto-layout, which is what the audience expects when the badge is
  // hidden. Fallback to the `showBadge` BOOLEAN for legacy CopyWraps
  // that predate the wrap-based pattern.
  let badgeVisible: boolean | null = null;
  if (badge !== null && copyWrap !== null) {
    const badgeWrap = copyWrap.findOne(function (n: SceneNode) {
      return (n.type === 'FRAME' || n.type === 'INSTANCE') && n.name === 'Badge_wrap';
    });
    if (badgeWrap !== null && 'visible' in badgeWrap) {
      badgeVisible = (badgeWrap as SceneNode).visible !== false;
    } else {
      const v = readBooleanProperty(copyWrap, 'showBadge');
      badgeVisible = v === null ? true : v;
    }
  }
  let badgeSection: GeneralSections['badge'] = null;
  if (badge !== null) {
    const currentBadgeIcon = readBadgeIcon(badge);
    // Plugin data — same pattern as Card. Survives library republishes
    // that wipe the slot child. The iframe compares with `icon` and
    // re-applies on mismatch.
    let badgeIconIntended = '';
    try {
      const stored = badge.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        badgeIconIntended = stored;
      }
    } catch (_e) {
      /* silent */
    }
    // Backfill: if no record yet but the slot already shows a real
    // icon, capture it so the next library update can reconcile.
    if (
      !isDevModeRuntime() &&
      badgeIconIntended.length === 0 &&
      currentBadgeIcon.length > 0
    ) {
      try {
        badge.setSharedPluginData('welder', 'icon', currentBadgeIcon);
        badgeIconIntended = currentBadgeIcon;
        console.log(
          '[badge-scan] backfilled iconIntended="' + currentBadgeIcon + '" for ' + badge.id,
        );
      } catch (_e) {
        /* silent */
      }
    }
    badgeSection = {
      badgeNodeId: badge.id,
      label: readTextByName(badge, 'Label') || badge.name,
      icon: currentBadgeIcon,
      iconIntended: badgeIconIntended,
      visible: badgeVisible,
    };
  }

  const imageSection =
    imageWrap === null
      ? null
      : {
          imageWrapId: imageWrap.id,
          imageHash: readImageWrapHash(imageWrap),
        };

  const themeSection = await scanTheme(slide);

  if (
    titleDescription === null &&
    badgeSection === null &&
    imageSection === null &&
    themeSection === null
  ) {
    return null;
  }
  return {
    titleDescription: titleDescription,
    badge: badgeSection,
    image: imageSection,
    theme: themeSection,
  };
}

// ============================================================
// Theme — slide-level Theme-collection mode binding
// ============================================================

/**
 * Discover every variable collection named "Theme" that the slide is
 * actually bound to (explicit OR resolved). Welder Templates files
 * carry TWO `Theme` collections in parallel — a local one and the
 * library one from "Templates Welder" — and both must be set in lock-
 * step so the body theme AND the accent (which references library
 * variables) follow the picker.
 *
 * Returns the collections in stable order: local first, library second
 * (or whatever order their IDs sort in). The picker uses the first
 * collection's modes for its UI; the writer below maps the chosen mode
 * onto every collection by NAME.
 */
async function findThemeCollectionsForSlide(slide: InstanceNode): Promise<VariableCollection[]> {
  const ids = new Set<string>();
  if (slide.explicitVariableModes) {
    for (const k of Object.keys(slide.explicitVariableModes)) ids.add(k);
  }
  if (slide.resolvedVariableModes) {
    for (const k of Object.keys(slide.resolvedVariableModes)) ids.add(k);
  }
  // Fetch every candidate collection in parallel — sequential awaits
  // serialized 2-5 round-trips per slide selection.
  const fetched = await Promise.all(
    Array.from(ids).map(function (id) {
      return figma.variables.getVariableCollectionByIdAsync(id).catch(function () {
        return null;
      });
    }),
  );
  const result: VariableCollection[] = [];
  for (let i = 0; i < fetched.length; i++) {
    const c = fetched[i];
    if (c !== null && c.name === 'Theme') result.push(c);
  }
  // Local before remote so the picker's swatches come from the local
  // collection (faster to resolve, no library round-trip).
  result.sort((a, b) => (a.remote === b.remote ? 0 : a.remote ? 1 : -1));
  return result;
}

async function scanTheme(slide: InstanceNode): Promise<GeneralSections['theme']> {
  const collections = await findThemeCollectionsForSlide(slide);
  if (collections.length === 0) return null;
  // Picker reads its modes + swatches from the first (local-preferred)
  // collection. The set-slide-theme handler then mirrors the choice onto
  // every Theme collection by name.
  const collection = collections[0];

  const explicit =
    slide.explicitVariableModes !== undefined && slide.explicitVariableModes !== null
      ? slide.explicitVariableModes[collection.id]
      : undefined;
  const resolved =
    slide.resolvedVariableModes !== undefined && slide.resolvedVariableModes !== null
      ? slide.resolvedVariableModes[collection.id]
      : undefined;

  // resolvedMode is required for the picker to highlight the active
  // mode. Fall back to the collection's default when the slide doesn't
  // resolve any mode (shouldn't happen in practice but defensive).
  const resolvedModeId =
    typeof resolved === 'string' && resolved.length > 0 ? resolved : collection.defaultModeId;

  // Pick the first two COLOR variables in the collection as the picker's
  // swatch colors. Library-agnostic: works for any Theme collection
  // whose first two color slots are the dominant + accent colors.
  // Fetch all variables in parallel — sequential awaits added ~10ms ×
  // collection-size before the picker could render.
  const allVars = await Promise.all(
    collection.variableIds.map(function (id) {
      return figma.variables.getVariableByIdAsync(id);
    }),
  );
  const colorVars: Variable[] = [];
  for (let i = 0; i < allVars.length && colorVars.length < 2; i++) {
    const v = allVars[i];
    if (v !== null && v.resolvedType === 'COLOR') colorVars.push(v);
  }

  // Resolve every mode's primary + secondary in parallel — modes × 2
  // awaits previously serialized into ~2M round-trips before render.
  const modes: ThemeMode[] = await Promise.all(
    collection.modes.map(async function (m) {
      const [primary, secondary] = await Promise.all([
        colorVars.length >= 1
          ? resolveColorAsHex(colorVars[0].valuesByMode[m.modeId], m.modeId)
          : Promise.resolve(null),
        colorVars.length >= 2
          ? resolveColorAsHex(colorVars[1].valuesByMode[m.modeId], m.modeId)
          : Promise.resolve(null),
      ]);
      return {
        id: m.modeId,
        name: m.name,
        swatchPrimary: primary,
        swatchSecondary: secondary,
      };
    }),
  );

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    explicitModeId: typeof explicit === 'string' && explicit.length > 0 ? explicit : null,
    resolvedModeId: resolvedModeId,
    modes: modes,
  };
}

/**
 * Resolve a Figma variable value (which may be `RGB`/`RGBA` directly or
 * a `VARIABLE_ALIAS` pointing at another variable) to a `#rrggbb` hex
 * string. Walks one alias hop; on alias-to-another-collection, falls
 * back to the aliased variable's first available mode value.
 *
 * Returns null when the value is undefined, isn't a color, or the alias
 * chain can't be resolved.
 */
async function resolveColorAsHex(value: VariableValue | undefined, modeId: string): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && 'r' in value && typeof (value as RGB).r === 'number') {
    return rgbToHex(value as RGB);
  }
  if (typeof value === 'object' && 'type' in value && (value as VariableAlias).type === 'VARIABLE_ALIAS') {
    const aliased = await figma.variables.getVariableByIdAsync((value as VariableAlias).id);
    if (aliased === null || aliased.resolvedType !== 'COLOR') return null;
    const sameMode = aliased.valuesByMode[modeId];
    if (sameMode !== undefined) return resolveColorAsHex(sameMode, modeId);
    // Cross-collection alias: take the aliased variable's first mode.
    const otherColl = await figma.variables.getVariableCollectionByIdAsync(aliased.variableCollectionId);
    if (otherColl !== null) {
      for (let i = 0; i < otherColl.modes.length; i++) {
        const v = aliased.valuesByMode[otherColl.modes[i].modeId];
        if (v !== undefined) return resolveColorAsHex(v, otherColl.modes[i].modeId);
      }
    }
  }
  return null;
}

function rgbToHex(c: RGB): string {
  const to = (x: number): string => {
    const v = Math.round(x * 255);
    const s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + to(c.r) + to(c.g) + to(c.b);
}

/**
 * Leest de huidige ImagePaint-hash van het image-slot binnen de ImageWrap.
 * Hergebruikt dezelfde heuristiek als findImageSlot in editors/general/image.ts.
 * Returns null wanneer het slot leeg is of geen IMAGE-fill draagt.
 */
function readImageWrapHash(imageWrap: InstanceNode): string | null {
  if (!('findOne' in imageWrap)) return null;

  // Strategie 1: naam-gebaseerd
  var byName = imageWrap.findOne(function (n: SceneNode) {
    if (n.name !== 'Image' && n.name !== 'Visual' && n.name !== 'ImageSlot') return false;
    return 'fills' in n;
  });
  // Strategie 2: bestaande IMAGE-fill
  var slot =
    byName !== null
      ? byName
      : imageWrap.findOne(function (n: SceneNode) {
          if (!('fills' in n)) return false;
          var fills = (n as GeometryMixin).fills;
          if (fills === figma.mixed) return false;
          if (!Array.isArray(fills)) return false;
          for (var i = 0; i < fills.length; i++) {
            if (fills[i].type === 'IMAGE') return true;
          }
          return false;
        });
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  var fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (var i = 0; i < fills.length; i++) {
    if (fills[i].type === 'IMAGE') {
      var hash = (fills[i] as ImagePaint).imageHash;
      return hash !== null ? hash : null;
    }
  }
  return null;
}

/**
 * Best-effort detectie van de image-slot binnen een card.
 * Retourneert de huidige ImagePaint-hash wanneer de slot een IMAGE-fill
 * draagt, null wanneer de slot aanwezig is maar leeg, of undefined
 * wanneer de card geen slot heeft (de UI verbergt dan de upload-knop).
 * Heuristiek matcht editors/content/card.ts:findImageSlot.
 */
/**
 * Find the SceneNode that owns the IMAGE fill on a Card — the analogue
 * of `findImageSlot` for slide-level ImageWraps. Used both by the
 * read path (`readCardVisualHash` → hash for the iframe scan) and the
 * preview path (post-slide-loaded byte fetch + thumbnail emit).
 *
 * Strategy is the same as `readCardVisualHash`: prefer a descendant
 * named 'Visual' / 'Image' that has a `fills` property, fall back to
 * any descendant whose fills include an IMAGE paint.
 */
function findCardVisualSlot(card: SceneNode): SceneNode | null {
  if (!('findOne' in card)) return null;
  const byName = card.findOne((n: SceneNode) => {
    if (n.name !== 'Visual' && n.name !== 'Image') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;
  return card.findOne((n: SceneNode) => {
    if (!('fills' in n)) return false;
    const fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed) return false;
    if (!Array.isArray(fills)) return false;
    for (const f of fills) {
      if (f.type === 'IMAGE') return true;
    }
    return false;
  });
}

function readCardVisualHash(card: SceneNode): string | null | undefined {
  if (!('findOne' in card)) return undefined;

  // Strategie 1: descendant met name 'Visual' of 'Image'.
  const byName = card.findOne((n: SceneNode) => {
    if (n.name !== 'Visual' && n.name !== 'Image') return false;
    return 'fills' in n;
  });
  const slot: SceneNode | null =
    byName !== null
      ? byName
      : card.findOne((n: SceneNode) => {
          if (!('fills' in n)) return false;
          const fills = (n as GeometryMixin).fills;
          if (fills === figma.mixed) return false;
          if (!Array.isArray(fills)) return false;
          for (const f of fills) {
            if (f.type === 'IMAGE') return true;
          }
          return false;
        });
  if (slot === null) return undefined;
  if (!('fills' in slot)) return undefined;

  const fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (const f of fills) {
    if (f.type === 'IMAGE') {
      const hash = (f as ImagePaint).imageHash;
      return hash !== null ? hash : null;
    }
  }
  return null;
}

/**
 * T31.2: Extraheert Card-instances (recursief via findAll) binnen een
 * wrapper-scope (CardWrap of TimelineWrap). Bounded tot de wrapper-subtree
 * (FIG-TRAVERSE-01 — findAll op een wrapper-node, niet op de hele pagina).
 *
 * Corrupt-items zonder Heading-textnode worden silent overgeslagen.
 *
 * T32: `slide` parameter toegevoegd zodat readCardIcon de visibility van de
 * icon-instance kan beoordelen via isEffectivelyVisible.
 */
function extractCards(scope: InstanceNode, slide: InstanceNode): CardItem[] {
  const items: CardItem[] = [];
  if (!('findAll' in scope)) return items;
  const cardInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'Card';
  });
  for (let i = 0; i < cardInstances.length; i++) {
    const card = cardInstances[i] as InstanceNode;
    const heading = readTextByName(card, 'Heading');
    if (heading === null) continue; // corrupt card: skip

    // Welder Card has a `Type` VARIANT property with values
    // 'Stack Icon' | 'Icon Side' | 'Image' | 'User'. The first two
    // render an icon child; the latter two render an ImageWrap. The
    // icon and image scans below can both produce false positives on
    // the wrong variant (readCardIcon's Strategy A matches `ImageWrap`
    // as a Lucide slug; readCardVisualHash's any-IMAGE-fill fallback
    // could pick up an unrelated descendant). Variant is the source
    // of truth — confirmed via Figma MCP for the Welder Card master.
    const cardType = readCardTypeVariant(card);
    const isIconType = cardType === 'Stack Icon' || cardType === 'Icon Side';
    const isImageType = cardType === 'Image' || cardType === 'User';

    // Persisted-by-the-plugin icon slug. Survives library-master
    // republishes (Figma resets icon-slot child overrides on master
    // update; plugin data stays). The iframe compares this with the
    // current visible `icon` and re-applies the user's pick when they
    // diverge (auto-reconcile after library updates).
    let iconIntended: string | null = null;
    try {
      const stored = card.getSharedPluginData('welder', 'icon');
      if (typeof stored === 'string' && stored.length > 0) {
        iconIntended = stored;
      }
    } catch (_e) {
      /* silent — plugin data unreadable */
    }
    // Backfill: cards whose icons were picked in plugin builds older
    // than 0.5.149 have no plugin-data record. The next library update
    // would wipe their slot child without any way to restore. Capture
    // the currently-visible icon as the user's intent NOW so the next
    // republish doesn't lose them too. One-time per card — once
    // iconIntended is set, subsequent scans skip this branch.
    const currentSlotIcon = isImageType ? null : readCardIcon(card, slide);
    if (
      !isDevModeRuntime() &&
      iconIntended === null &&
      currentSlotIcon !== null &&
      currentSlotIcon.length > 0
    ) {
      try {
        (card as InstanceNode).setSharedPluginData('welder', 'icon', currentSlotIcon);
        iconIntended = currentSlotIcon;
        console.log(
          '[card-scan] backfilled iconIntended="' + currentSlotIcon + '" for ' + card.id,
        );
      } catch (_e) {
        /* silent */
      }
    }

    items.push({
      cardNodeId: card.id,
      heading: heading,
      paragraph: readTextByName(card, 'Paragraph') || '',
      // Icon picker shows iff the variant carries an icon. On unknown
      // variants we fall back to the scan (cardType === null).
      icon: currentSlotIcon,
      iconIntended: iconIntended,
      // Image picker shows iff the variant carries an image. On
      // unknown variants we fall back to the scan.
      visualHash: isIconType ? undefined : readCardVisualHash(card),
      style: readCardStyleVariant(card),
    });
  }
  return items;
}

/**
 * Reads the `Type` VARIANT property off a Card instance. The Welder
 * library's Card master defines this as a flat 'Type' key (no #N:N
 * suffix) so we look it up by name directly. Returns null when the
 * card has no Type property or it isn't a VARIANT.
 */
function readCardTypeVariant(card: InstanceNode): string | null {
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const t = props['Type'];
  if (t === undefined || t === null) return null;
  if (t.type !== 'VARIANT') return null;
  return typeof t.value === 'string' ? t.value : null;
}

/**
 * Reads the `Style` VARIANT property off a Card instance. Welder Card
 * masters expose `Default` (filled) and `Outline` (bordered). Returns
 * null when the card has no Style property OR its value isn't one of
 * the two known options — protects the iframe toggle from rendering on
 * card variants that don't actually support outline/fill switching
 * (e.g. CardWrap layouts that flatten cards into inline divs).
 */
function readCardStyleVariant(card: InstanceNode): 'Default' | 'Outline' | null {
  const props = card.componentProperties;
  if (props === null || props === undefined) return null;
  const s = props['Style'];
  if (s === undefined || s === null) return null;
  if (s.type !== 'VARIANT') return null;
  if (s.value === 'Default') return 'Default';
  if (s.value === 'Outline') return 'Outline';
  return null;
}

/**
 * T31.2: Extraheert CopyWrap-instances (recursief via findAll) binnen een
 * wrapper-scope (TimelineWrap). Bounded tot de wrapper-subtree (FIG-TRAVERSE-01).
 *
 * Skipt decoratieve `Stepper Item`-instances; pakt alleen CopyWrap-
 * instances als editable items. Elk item heeft Heading + Paragraph
 * (geen icon, geen visual). Corrupt-items zonder Heading-textnode
 * worden silent overgeslagen.
 */
function extractCopyWrapItems(scope: InstanceNode): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (!('findAll' in scope)) return items;
  const copyWrapInstances = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === 'CopyWrap';
  });
  for (let i = 0; i < copyWrapInstances.length; i++) {
    const cw = copyWrapInstances[i];
    const heading = readTextByName(cw, 'Heading');
    if (heading === null) continue;
    items.push({
      copyWrapNodeId: cw.id,
      heading: heading,
      paragraph: readTextByName(cw, 'Paragraph') || '',
    });
  }
  return items;
}

/**
 * T31.2: Polymorphic scan van CardWrap en TimelineWrap.
 *
 * TimelineWrap kan in productie bevatten:
 *   - directe Card-instances (worden in content.cards gerouted — icon-picker werkt)
 *   - genestede CopyWrap-instances binnen tussenliggende Frames (→ content.timelineItems)
 *
 * Beide worden gevonden via findAll (recursieve descendant-walk, bounded tot wrapper-scope).
 */
function scanContent(slide: InstanceNode): ContentItems | null {
  const cardWrap = findCardWrap(slide);
  const timelineWrap = findTimelineWrap(slide);
  const journeySlot = findJourneySlot(slide);
  const journeyModel: JourneyWrapModel | null =
    journeySlot !== null ? scanJourneySlot(journeySlot) : null;

  // Retourneer null wanneer geen van alle wrappers aanwezig is.
  if (cardWrap === null && timelineWrap === null && journeyModel === null) return null;

  const cards: CardItem[] = [];
  const timelineItems: TimelineItem[] = [];

  // CardWrap: Cards zijn directe children (Slide Machine-pattern); ook hier
  // gebruiken we extractCards zodat de helper consistent en testbaar blijft.
  if (cardWrap !== null) {
    const fromCardWrap = extractCards(cardWrap, slide);
    for (let i = 0; i < fromCardWrap.length; i++) {
      cards.push(fromCardWrap[i]);
    }
  }

  // TimelineWrap: polymorphic — directe Cards (met icon + visual) én genestede
  // CopyWraps (heading + paragraph only) via tussenliggende Frames.
  if (timelineWrap !== null) {
    const fromTimeline = extractCards(timelineWrap, slide);
    for (let i = 0; i < fromTimeline.length; i++) {
      cards.push(fromTimeline[i]);
    }
    const cwItems = extractCopyWrapItems(timelineWrap);
    for (let j = 0; j < cwItems.length; j++) {
      timelineItems.push(cwItems[j]);
    }
    console.log(
      '[welder-slide-editor] T31.2 timelineWrap scan: ' +
        String(fromTimeline.length) +
        ' cards, ' +
        String(cwItems.length) +
        ' copyWrap-items on slide ' +
        slide.id,
    );
  }

  if (cards.length === 0 && timelineItems.length === 0 && journeyModel === null) return null;

  // `cardWrapId` blijft semantisch gebonden aan CardWrap wanneer aanwezig;
  // bij slide-met-alleen-TimelineWrap vallen we terug op de TimelineWrap-id.
  // Bij slide-met-alleen-JourneyWrap vallen we terug op de JourneySlot-id.
  var wrapId: string;
  if (cardWrap !== null) {
    wrapId = cardWrap.id;
  } else if (timelineWrap !== null) {
    wrapId = (timelineWrap as InstanceNode).id;
  } else if (journeySlot !== null) {
    wrapId = journeySlot.id;
  } else {
    wrapId = '';
  }

  return {
    cardWrapId: wrapId,
    cards: cards,
    timelineItems: timelineItems,
    journeyModel: journeyModel,
  };
}

function scanGraphs(slide: InstanceNode): GraphItems | null {
  // v0.1.0 wrapper-finder geeft de eerste TableWrap; in de praktijk heeft
  // een Slide-template precies één TableWrap. De instance-selector in
  // GraphsPanel kan hier later groeien wanneer we meerdere tables per
  // slide toestaan (out of scope v0.1.0).
  const tableWrap = findTableWrap(slide);
  if (tableWrap === null) return null;

  // T34.2: lees via findTableSlot + scanTableSlot. Wanneer de TableWrap
  // een Slot heeft, gebruiken we het Slot-id als nodeId zodat
  // `update-table` en `import-csv` direct naar de Slot kunnen.
  const slot = findTableSlot(slide);
  const tableModel: TableWrapModel | null = slot !== null ? scanTableSlot(slot) : null;
  const nodeId = slot !== null ? slot.id : tableWrap.id;

  const instance: GraphItems['instances'][number] = {
    nodeId: nodeId,
    label: 'Table — ' + tableWrap.name,
    tableModel: tableModel,
  };

  return {
    instances: [instance],
    selectedGraphId: nodeId,
  };
}

/**
 * T39.5 — normaliseer Heading/Paragraph-zichtbaarheid op slide-load.
 *
 * Bestaande slides kunnen lege heading/paragraph text-nodes hebben die
 * nooit door de plugin gemuteerd zijn (visible=true ondanks characters="").
 * T39.4 fixt alleen het mutation-pad; deze helper handelt de existing-
 * empty case op pick-slide.
 *
 * Returnt `true` als er minstens één visibility-flip plaatsvond, zodat
 * de caller weet of een refreshTablesOnSlide nodig is.
 *
 * Idempotent: als beide nodes al de juiste visibility hebben → no-op.
 */
async function normalizeCopyWrapVisibility(slide: InstanceNode): Promise<boolean> {
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) return false;
  let changed = false;

  // Scope guard: only mutate text nodes that belong to CopyWrap's OWN
  // content, not nodes inside a nested instance (e.g. a Badge embedded
  // in CopyWrap, which has its own Heading/Placeholder semantics owned
  // by the Badge component). Without this, the plugin clobbers state
  // it doesn't own — confirmed via Figma MCP for the Welder Templates
  // file (Badge has a `Placeholder` TEXT child whose visibility carries
  // the badge's displayed text appearance; flipping it to false hides
  // the badge text on every slide-load).
  const isOwnNode = (n: SceneNode): boolean => !isInsideNestedInstance(n, copyWrap);

  // Heading + Paragraph: visible alleen als characters niet leeg zijn.
  const charDriven = ['Heading', 'Paragraph'];
  for (let i = 0; i < charDriven.length; i++) {
    const name = charDriven[i];
    const node = copyWrap.findOne(
      (n: SceneNode) => n.type === 'TEXT' && n.name === name && isOwnNode(n),
    );
    if (node === null || node.type !== 'TEXT') continue;
    const text = (node as TextNode).characters;
    const desiredVisible = text !== '';
    if (node.visible !== desiredVisible) {
      node.visible = desiredVisible;
      changed = true;
    }
  }

  // T39.6 — Placeholder is een Slide-Machine-template-hint die zich toont
  // wanneer Paragraph leeg is. Plugin is source-of-truth; placeholder is
  // designer-crutch en moet altijd verborgen zijn zodat CopyWrap-auto-
  // layout om de werkelijke content sluit. Naam "Placeholder" matcht alle
  // bekende Welder-template-varianten.
  const placeholders = copyWrap.findAll(
    (n: SceneNode) => n.type === 'TEXT' && n.name === 'Placeholder' && isOwnNode(n),
  );
  for (let p = 0; p < placeholders.length; p++) {
    const ph = placeholders[p];
    if (ph.visible !== false) {
      ph.visible = false;
      changed = true;
    }
  }

  return changed;
}

/**
 * Walks the parent chain from `node` up to (but not past) `scopeRoot`.
 * Returns true if any ancestor along the way is itself an INSTANCE — i.e.
 * `node` lives inside a nested component instance whose internal structure
 * is owned by that component, not by the scope.
 *
 * Confirmed via Figma MCP that Welder Badge instances live inside CopyWrap
 * and carry their own `Placeholder` TEXT child (visibility = badge's
 * displayed text), which the plugin must not touch.
 */
function isInsideNestedInstance(node: SceneNode, scopeRoot: InstanceNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current !== null && current !== scopeRoot) {
    if (current.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

/**
 * Posts the initial slide's image-preview + card-visual-preview bytes
 * during the ui-ready handshake. Mirrors the fire-and-forget IIFEs in
 * the pick-slide handler so the splash screen window can pre-fetch
 * thumbnails too. Errors are silent — a missing thumbnail just falls
 * back to the iframe's "no preview" state.
 */
async function postInitialSlidePreviews(slide: InstanceNode, scan: SlideScan): Promise<void> {
  if (scan.general !== null && scan.general.image !== null && scan.general.image.imageHash !== null) {
    const imageWrapId = scan.general.image.imageWrapId;
    const imageHash = scan.general.image.imageHash;
    try {
      const img = figma.getImageByHash(imageHash);
      if (img !== null) {
        let fillW = 0;
        let fillH = 0;
        try {
          const wrapNode = await figma.getNodeByIdAsync(imageWrapId);
          if (wrapNode !== null && wrapNode.type === 'INSTANCE') {
            const slot = findImageSlot(wrapNode as InstanceNode);
            if (slot !== null && 'width' in slot && 'height' in slot) {
              const w = (slot as LayoutMixin).width;
              const h = (slot as LayoutMixin).height;
              if (w > 0 && h > 0) {
                fillW = w;
                fillH = h;
              }
            }
          }
        } catch (_e) {
          // fallback: 0/0 → iframe falls back to fixed-height preview
        }
        const bytes = await img.getBytesAsync();
        postToUI({
          type: 'image-preview',
          imageWrapId: imageWrapId,
          bytes: bytes,
          fillW: fillW,
          fillH: fillH,
        });
        lastSentPreviewHash.set(imageWrapId, imageHash);
      }
    } catch (_e) {
      // silent — slide-level image preview is non-essential
    }
  }

  if (scan.content !== null) {
    // Card-visual prefetch: each card has two awaits (getNodeByIdAsync
    // → getBytesAsync). Run all cards concurrently — a slide with 8
    // cards would otherwise serialize 16 round-trips before any
    // preview rendered.
    await Promise.all(
      scan.content.cards.map(async function (ci) {
        if (typeof ci.visualHash !== 'string') return;
        try {
          const cardNode = await figma.getNodeByIdAsync(ci.cardNodeId);
          if (cardNode === null || cardNode.type !== 'INSTANCE') return;
          const slot = findCardVisualSlot(cardNode as InstanceNode);
          if (slot === null) return;
          const fills = (slot as GeometryMixin).fills;
          if (fills === figma.mixed || !Array.isArray(fills)) return;
          let imageHash: string | null = null;
          for (let f = 0; f < fills.length; f++) {
            if (fills[f].type === 'IMAGE') {
              imageHash = (fills[f] as ImagePaint).imageHash;
              break;
            }
          }
          if (imageHash === null) return;
          const img = figma.getImageByHash(imageHash);
          if (img === null) return;
          const bytes = await img.getBytesAsync();
          let fillW = 0;
          let fillH = 0;
          if ('width' in slot && 'height' in slot) {
            const w = (slot as LayoutMixin).width;
            const h = (slot as LayoutMixin).height;
            if (w > 0 && h > 0) {
              fillW = w;
              fillH = h;
            }
          }
          postToUI({
            type: 'card-visual-preview',
            cardNodeId: ci.cardNodeId,
            bytes: bytes,
            fillW: fillW,
            fillH: fillH,
          });
        } catch (_e) {
          // per-card silent
        }
      }),
    );
  }
}

async function scanSlide(slide: InstanceNode): Promise<SlideScan> {
  const startedAt = Date.now();
  let normalizeMs = 0;
  let refreshTablesMs = 0;
  if (!isDevModeRuntime()) {
    const normalizeStartedAt = Date.now();
    const visibilityChanged = await normalizeCopyWrapVisibility(slide);
    normalizeMs = Date.now() - normalizeStartedAt;
    if (visibilityChanged) {
      const refreshStartedAt = Date.now();
      await refreshTablesOnSlide(slide);
      refreshTablesMs = Date.now() - refreshStartedAt;
    }
  } else {
    debugLog('sandbox', 'scan-readonly', { slideId: slide.id });
  }

  const generalStartedAt = Date.now();
  const general = await scanGeneral(slide);
  const generalMs = Date.now() - generalStartedAt;

  const contentStartedAt = Date.now();
  const content = scanContent(slide);
  const contentMs = Date.now() - contentStartedAt;

  const graphsStartedAt = Date.now();
  const graphs = scanGraphs(slide);
  const graphsMs = Date.now() - graphsStartedAt;

  debugLog('perf', 'scan-slide', {
    slideId: slide.id,
    normalizeMs: normalizeMs,
    refreshTablesMs: refreshTablesMs,
    generalMs: generalMs,
    contentMs: contentMs,
    graphsMs: graphsMs,
    totalMs: Date.now() - startedAt,
    hasGeneral: general !== null,
    cardCount: content !== null ? content.cards.length : 0,
    graphCount: graphs !== null ? graphs.instances.length : 0,
  });

  return {
    general: general,
    content: content,
    graphs: graphs,
  };
}

/**
 * T39.3 — Re-render TableWraps op een slide na een mutatie die de slide-
 * layout heeft kunnen veranderen (bv. CopyWrap-tekst korter/langer).
 *
 * Container.resize bevriest slot.height op het moment van applyTable.
 * Als de slot daarna reflowt, blijft de container op de oude snapshot.
 * Deze helper scant + re-applyt de TableWrap-slot op de slide zodat
 * fontSize + container-hoogte de actuele slot.height pakken.
 *
 * Geen-op als de slide geen TableWrap/Slot heeft of het model leeg is.
 * Errors worden stilletjes gelogd; mag de caller-flow niet meeslepen.
 */
async function refreshTablesOnSlide(slide: InstanceNode): Promise<void> {
  const slot = findTableSlot(slide);
  if (slot === null) return;
  try {
    const model = scanTableSlot(slot);
    if (model.rows.length === 0) return;
    await applyTable(slot, model);
  } catch (e) {
    console.log('[welder-slide-editor] refreshTablesOnSlide failed:', String(e));
  }
}

// T34.0: detectAndSendThemeModes verwijderd. ThemePicker-UI is permanent
// verwijderd; library-variable-modes regelen het buiten de plugin om
// (T34 research §8). T34.1: slide-theme + set-variable-mode message-types
// verwijderd uit types.ts; ThemeMode-interface verwijderd.

// ============================================================
// Slide-lookup helpers
// ============================================================

interface SlidePageCache {
  pageId: string;
  slides: InstanceNode[];
  numberById: { [id: string]: number };
}

interface SlideLookupResult {
  slides: InstanceNode[];
  source: 'canvas-grid' | 'children' | 'fallback';
}

let slidePageCache: SlidePageCache | null = null;

function invalidateSlidePageCache(reason: string): void {
  if (slidePageCache === null) return;
  debugLog('perf', 'slide-cache-invalidate', {
    reason: reason,
    pageId: slidePageCache.pageId,
    slideCount: slidePageCache.slides.length,
  });
  slidePageCache = null;
}

function getSlidesOnCurrentPage(): InstanceNode[] {
  if (slidePageCache !== null && slidePageCache.pageId === figma.currentPage.id) {
    return slidePageCache.slides;
  }
  const startedAt = Date.now();
  const lookup = findSlidesOnCurrentPageOptimized();
  const slides = lookup.slides;
  const numberById: { [id: string]: number } = {};
  for (let i = 0; i < slides.length; i++) {
    numberById[slides[i].id] = i + 1;
  }
  slidePageCache = {
    pageId: figma.currentPage.id,
    slides: slides,
    numberById: numberById,
  };
  debugLog('perf', 'slide-cache-build', {
    pageId: figma.currentPage.id,
    slideCount: slides.length,
    source: lookup.source,
    totalMs: Date.now() - startedAt,
  });
  return slides;
}

function findSlidesOnCurrentPageOptimized(): SlideLookupResult {
  const gridSlides = findSlidesFromCanvasGrid();
  if (gridSlides.length > 0) {
    return { slides: gridSlides, source: 'canvas-grid' };
  }

  const childSlides = findSlidesFromPageChildren();
  if (childSlides.length > 0 && (figma.editorType !== 'slides' || childSlides.length > 1)) {
    return { slides: childSlides, source: 'children' };
  }

  return { slides: findSlidesOnPage(), source: 'fallback' };
}

function findSlidesFromCanvasGrid(): InstanceNode[] {
  if (figma.editorType !== 'slides') return [];
  try {
    const grid = figma.getCanvasGrid();
    const slides: InstanceNode[] = [];
    for (let row = 0; row < grid.length; row++) {
      const nodes = grid[row];
      for (let col = 0; col < nodes.length; col++) {
        const slide = findNestedWelderSlide(nodes[col]);
        if (slide !== null) {
          slides.push(slide);
        }
      }
    }
    return slides;
  } catch (_e) {
    return [];
  }
}

function findSlidesFromPageChildren(): InstanceNode[] {
  const children = figma.currentPage.children;
  const slides: InstanceNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const slide = findNestedWelderSlide(children[i]);
    if (slide !== null) {
      slides.push(slide);
    }
  }
  return slides;
}

function findNestedWelderSlide(node: SceneNode): InstanceNode | null {
  if (node.type === 'INSTANCE' && isSlide(node)) {
    return node;
  }
  if ('children' in node) {
    const children = (node as SceneNode & { children: ReadonlyArray<SceneNode> }).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'INSTANCE' && isSlide(child)) {
        return child as InstanceNode;
      }
    }
  }
  if ('findOne' in node) {
    const scope = node as SceneNode & { findOne: SlideNode['findOne'] };
    const found = scope.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && isSlide(n);
    });
    if (found !== null && found.type === 'INSTANCE') {
      return found as InstanceNode;
    }
  }
  return null;
}

function getSlideNumber(slide: InstanceNode): number {
  getSlidesOnCurrentPage();
  if (slidePageCache !== null) {
    const number = slidePageCache.numberById[slide.id];
    if (typeof number === 'number') return number;
  }
  return 1;
}

/**
 * Compute the SlideSummary for a single slide. Used by every slide-loaded
 * / slide-summary emission. `findSlidesOnPage` here is for the 1-based
 * `number` fallback when the slide has no heading text — most slides have
 * a heading, so the number rarely shows in the UI but it keeps the
 * SlideSummary shape consistent with the export-document filename logic.
 */
function summaryForSlide(slide: InstanceNode): SlideSummary {
  return slideSummary(slide, getSlideNumber(slide));
}

function findSlideById(id: string): InstanceNode | null {
  const nodes = getSlidesOnCurrentPage();
  for (const node of nodes) {
    if (node.id === id) return node;
  }
  return null;
}

/**
 * Loopt vanaf `node` omhoog langs `.parent` tot we een Slide-instance
 * vinden (isSlide-check). Retourneert null wanneer we de pagina-root
 * bereiken zonder hit — dan zit het target niet binnen een Slide.
 * Gebruikt door `upload-image` om vanuit een ImageWrap-id terug te
 * herleiden welke slide hij draagt.
 */
function findSlideAncestor(node: BaseNode): InstanceNode | null {
  let current: BaseNode | null = node;
  // Bounded: Slide Machine-slides staan op page-level, dus ≤5 parent-hops.
  for (let i = 0; i < 10; i++) {
    if (current === null) return null;
    // Alleen SceneNodes (dus niet page/document) kunnen isSlide-match zijn.
    if ('type' in current && (current as SceneNode).type === 'INSTANCE') {
      const asScene = current as SceneNode;
      if (isSlide(asScene)) return asScene as InstanceNode;
    }
    const parent: BaseNode | null = 'parent' in current ? (current as SceneNode).parent : null;
    if (parent === null || parent === undefined) return null;
    current = parent;
  }
  return null;
}

/**
 * Bepaalt welke Welder-Slide de user momenteel voor ogen heeft op basis
 * van de huidige selectie. Drie scenarios (in volgorde):
 *   1. Primary selection = Welder-Slide zelf → direct return.
 *   2. Primary selection = descendant van een Welder-Slide (bv. text-klik
 *      in Figma Design) → walk up via findSlideAncestor.
 *   3. Primary selection = container die een Welder-Slide BEVAT (bv.
 *      SlideNode in Figma Slides navigator) → walk down via findOne met
 *      isSlide-predicate, bounded.
 * Retourneert null wanneer geen match — caller doet niets.
 */
function findFocusedWelderSlide(): InstanceNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;
  const selected = selection[0];

  // Scenario 1: selected IS a Welder-Slide
  if (selected.type === 'INSTANCE' && isSlide(selected)) {
    return selected;
  }

  // Scenario 2: selected is INSIDE a Welder-Slide
  const ancestor = findSlideAncestor(selected);
  if (ancestor !== null) return ancestor;

  // Scenario 3: selected is a CONTAINER of a Welder-Slide (e.g. SlideNode)
  if ('findOne' in selected) {
    const container = selected as SceneNode & { findOne: SlideNode['findOne'] };
    const descendant = container.findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return isSlide(n as InstanceNode);
    });
    if (descendant !== null && descendant.type === 'INSTANCE') {
      return descendant as InstanceNode;
    }
  }

  return null;
}

function postToUI(msg: PluginToUIMessage): void {
  debugMessage('plugin->ui', msg);
  figma.ui.postMessage(msg);
}

// ============================================================
// Library text-style resolution by name
//
// Library-subscribed styles can't be enumerated by name — only local
// styles can. To resolve one we have to read its id off a TextNode that
// already references it. We walk every TEXT node on the current page,
// fetch each distinct textStyleId via getStyleByIdAsync, and cache the
// resulting name → id map per session. Subsequent lookups are O(1).
//
// Returns null when no node in the file uses a style matching `name`
// (exact match or `<path>/<name>` suffix to allow folder-grouped styles).
// ============================================================
const textStyleByName: { [name: string]: string } = {};
let textStyleMapBuilt = false;

async function buildTextStyleMap(): Promise<void> {
  if (textStyleMapBuilt) return;
  const pages = figma.root.children.filter(function (p) {
    return p.type === 'PAGE';
  }) as PageNode[];
  // Load every page in parallel rather than sequentially — 5 pages
  // serialized was ~5× the cost of a single loadAsync.
  await Promise.all(
    pages.map(function (page) {
      return page.loadAsync().catch(function (e: unknown) {
        console.log('[text-style-map] page.loadAsync failed: ' + String(e));
      });
    }),
  );
  // Collect every distinct textStyleId across all pages first, THEN
  // batch the getStyleByIdAsync fetches in parallel. Was a sequential
  // await per text node — N styles × ~10ms each on every plugin open.
  const distinctIds: string[] = [];
  const seenIds: { [id: string]: true } = {};
  for (let p = 0; p < pages.length; p++) {
    const textNodes = pages[p].findAll(function (n: SceneNode) {
      return n.type === 'TEXT';
    });
    for (let i = 0; i < textNodes.length; i++) {
      const id = (textNodes[i] as TextNode).textStyleId;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (seenIds[id]) continue;
      seenIds[id] = true;
      distinctIds.push(id);
    }
  }
  const styles = await Promise.all(
    distinctIds.map(function (id) {
      return figma.getStyleByIdAsync(id).catch(function () {
        return null;
      });
    }),
  );
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (style !== null && typeof style.name === 'string') {
      textStyleByName[style.name] = distinctIds[i];
    }
  }
  textStyleMapBuilt = true;
  const names = Object.keys(textStyleByName);
  console.log('[text-style-map] built: ' + String(names.length) + ' entries');
  for (let i = 0; i < names.length; i++) {
    console.log('[text-style-map]   "' + names[i] + '"');
  }
}

async function resolveTextStyleByName(name: string): Promise<string | null> {
  await buildTextStyleMap();
  if (textStyleByName[name] !== undefined) return textStyleByName[name];
  // Try suffix-match (folder-grouped style names).
  const suffix = '/' + name;
  const keys = Object.keys(textStyleByName);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.length >= suffix.length && key.lastIndexOf(suffix) === key.length - suffix.length) {
      return textStyleByName[key];
    }
  }
  return null;
}

// ============================================================
// Live current-slide refresh — debounced content + summary posts
// ============================================================

// Module-level: last-sent imageHash per imageWrapId — prevents re-posting on unrelated documentchange events.
var lastSentPreviewHash: Map<string, string> = new Map();

/** clientStorage key for the user's recently-picked icon names (max 8). */
const ICON_RECENTS_KEY = 'icon-recents';

/**
 * Iframe's currently-displayed slide id. Set on every `pick-slide`
 * message; consumed by `postSlideContent()` so the sandbox can re-emit
 * `slide-loaded` when the canvas mutates externally (native Cmd+Z,
 * documentchange, etc.). Without this the iframe's optimistic store
 * state survives undo and the pickers desync from the canvas.
 */
let lastDisplayedSlideId: string | null = null;

/**
 * Debounced re-scan + slide-loaded re-emit for whatever slide the
 * iframe is currently showing. Mirrors the postSlideList shape — same
 * 200ms coalesce, same dedup-by-signature so a no-op documentchange
 * doesn't spam the bridge.
 */
let pendingSlideContentUpdate: number | null = null;
let lastSentSlideContentSignature: string = '';

/**
 * Self-write echo suppression — timestamp window.
 *
 * Each iframe-driven `applyXxx` calls `markSelfWrite()` after the
 * mutation completes. `postSlideContent`'s debounced scan checks
 * whether we're still within `SELF_WRITE_WINDOW_MS` of the last
 * self-write; if so, skips the slide-loaded post.
 *
 * Why timestamps over the previous sig-pre-seed approach: pre-seed
 * required an async `scanSlide` per apply, and rapid emits could
 * complete out of order, leaving the seeded sig stale. The
 * timestamp comparison is atomic and order-independent — it
 * doesn't matter how many emits stack up; as long as the last one
 * was recent, the documentchange-driven scan stays suppressed.
 *
 * Tradeoff: native Cmd+Z within ~250ms of a plugin write also gets
 * suppressed (the iframe pickers won't update for that one undo).
 * The window is short enough that this is rare and self-correcting
 * — any subsequent documentchange (or pause + slide-pick) re-syncs.
 * Plugin-driven undo (`trigger-undo` handler) bypasses
 * `postSlideContent` entirely with its own explicit `slide-loaded`
 * post, so iframe-button-driven undo always works.
 */
// Bumped 500 → 1500ms after user-reported typing-skip on slower accounts.
// Apply chains on accounts without the Welder library subscribed pay
// repeated importVariableByKeyAsync / importComponentByKeyAsync failure
// timeouts, and apply can run 600-1200ms. The 500ms window let the
// post-apply documentchange-driven re-scan slip past, which clobbered
// in-progress typing. 1500ms covers the worst-case apply duration plus
// the 200ms postSlideContent debounce with margin to spare. Cmd+Z
// within 1500ms of a self-write still gets suppressed (acceptable —
// self-correcting on next documentchange).
const SELF_WRITE_WINDOW_MS = 1500;
let lastSelfWriteAt = 0;

function markSelfWrite(): void {
  lastSelfWriteAt = Date.now();
}

function postSlideContent(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideContentUpdate !== null) {
    clearTimeout(pendingSlideContentUpdate);
  }
  pendingSlideContentUpdate = setTimeout(() => {
    pendingSlideContentUpdate = null;
    if (lastDisplayedSlideId === null) return;
    if (Date.now() - lastSelfWriteAt < SELF_WRITE_WINDOW_MS) {
      // Inside the self-write window: this documentchange almost
      // certainly came from our own apply path. Skip — the iframe
      // already has the value it just emitted in its local refs.
      return;
    }
    void (async function () {
      const startedAt = Date.now();
      try {
        const slide = findSlideById(lastDisplayedSlideId!);
        if (slide === null) return;
        const scanStartedAt = Date.now();
        const scan = await scanSlide(slide);
        const scanMs = Date.now() - scanStartedAt;
        // Cheap signature: stringify the general/content/graphs payload.
        // If it matches the last sent, skip the post (avoids spamming
        // the bridge on documentchanges that didn't actually change
        // editable state — e.g. selection-only events).
        const signatureStartedAt = Date.now();
        const sig = JSON.stringify({
          g: scan.general,
          c: scan.content,
          h: scan.graphs,
        });
        const signatureMs = Date.now() - signatureStartedAt;
        if (sig === lastSentSlideContentSignature) {
          debugLog('perf', 'post-slide-content-skip', {
            slideId: slide.id,
            reason: 'signature',
            scanMs: scanMs,
            signatureMs: signatureMs,
            totalMs: Date.now() - startedAt,
          });
          return;
        }
        lastSentSlideContentSignature = sig;
        debugLog('sandbox', 'post-slide-content', {
          slideId: slide.id,
          hasGeneral: scan.general !== null,
          cardCount: scan.content !== null ? scan.content.cards.length : 0,
          graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
        });
        const postStartedAt = Date.now();
        postToUI({
          type: 'slide-loaded',
          summary: summaryForSlide(slide),
          general: scan.general,
          content: scan.content,
          graphs: scan.graphs,
        });
        debugLog('perf', 'post-slide-content', {
          slideId: slide.id,
          scanMs: scanMs,
          signatureMs: signatureMs,
          postMs: Date.now() - postStartedAt,
          totalMs: Date.now() - startedAt,
          hasGeneral: scan.general !== null,
          cardCount: scan.content !== null ? scan.content.cards.length : 0,
          graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
        });
      } catch (err: unknown) {
        debugLog('sandbox', 'post-slide-content:error', err);
        console.log('[welder-slide-editor] postSlideContent failed:', err);
      }
    })();
  }, 200) as unknown as number;
}

/**
 * Lightweight summary-only post for the currently-displayed slide.
 * Used by the documentchange handler when the slide's name (heading
 * text) or isSkipped flag changes — no need to rescan content.
 *
 * Debounced 200ms and signature-deduped against the last emit so a
 * burst of name-keystrokes doesn't spam the bridge.
 */
let pendingSlideSummaryUpdate: number | null = null;
let lastSentSummarySignature: string = '';

function postSlideSummary(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideSummaryUpdate !== null) {
    clearTimeout(pendingSlideSummaryUpdate);
  }
  pendingSlideSummaryUpdate = setTimeout(() => {
    pendingSlideSummaryUpdate = null;
    if (lastDisplayedSlideId === null) return;
    const startedAt = Date.now();
    try {
      const slide = findSlideById(lastDisplayedSlideId);
      if (slide === null) return;
      const summaryStartedAt = Date.now();
      const summary = summaryForSlide(slide);
      const summaryMs = Date.now() - summaryStartedAt;
      const sig = summary.id + '|' + summary.name + '|' + String(summary.isSkipped);
      if (sig === lastSentSummarySignature) {
        debugLog('perf', 'post-slide-summary-skip', {
          slideId: slide.id,
          reason: 'signature',
          summaryMs: summaryMs,
          totalMs: Date.now() - startedAt,
        });
        return;
      }
      lastSentSummarySignature = sig;
      debugLog('sandbox', 'post-slide-summary', summary);
      const postStartedAt = Date.now();
      postToUI({ type: 'slide-summary', summary: summary });
      debugLog('perf', 'post-slide-summary', {
        slideId: slide.id,
        summaryMs: summaryMs,
        postMs: Date.now() - postStartedAt,
        totalMs: Date.now() - startedAt,
        isSkipped: summary.isSkipped,
      });
    } catch (err: unknown) {
      debugLog('sandbox', 'post-slide-summary:error', err);
      console.log('[welder-slide-editor] postSlideSummary failed:', err);
    }
  }, 200) as unknown as number;
}

/**
 * Scan + post slide-loaded for the given slide. Wraps the scan, the
 * signature-cache update, the slide-loaded post, and the fire-and-forget
 * preview emissions. Called by ui-ready, selectionchange, and
 * currentpagechange.
 */
async function emitSlideLoaded(slide: InstanceNode): Promise<void> {
  const startedAt = Date.now();
  try {
    debugLog('sandbox', 'emit-slide-loaded:start', {
      slideId: slide.id,
      slideName: slide.name,
    });
    const scanStartedAt = Date.now();
    const scan = await scanSlide(slide);
    const scanMs = Date.now() - scanStartedAt;
    lastDisplayedSlideId = slide.id;
    const signatureStartedAt = Date.now();
    lastSentSlideContentSignature = JSON.stringify({
      g: scan.general,
      c: scan.content,
      h: scan.graphs,
    });
    const summary = summaryForSlide(slide);
    lastSentSummarySignature = summary.id + '|' + summary.name + '|' + String(summary.isSkipped);
    const signatureMs = Date.now() - signatureStartedAt;
    const postStartedAt = Date.now();
    postToUI({
      type: 'slide-loaded',
      summary: summary,
      general: scan.general,
      content: scan.content,
      graphs: scan.graphs,
    });
    const postMs = Date.now() - postStartedAt;
    debugLog('sandbox', 'emit-slide-loaded:posted', {
      slideId: slide.id,
      hasGeneral: scan.general !== null,
      cardCount: scan.content !== null ? scan.content.cards.length : 0,
      graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
    });
    debugLog('perf', 'emit-slide-loaded', {
      slideId: slide.id,
      scanMs: scanMs,
      signatureMs: signatureMs,
      postMs: postMs,
      totalMs: Date.now() - startedAt,
      hasGeneral: scan.general !== null,
      cardCount: scan.content !== null ? scan.content.cards.length : 0,
      graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
    });
    void postInitialSlidePreviews(slide, scan);
    if (!isDevModeRuntime()) {
      void primeIconCacheForSlide(scan);
    }
    void preloadSlideFonts(slide);
    // Pre-warm the Text/Text Dimmer variable imports so the first
    // heading-accent edit doesn't pay the importVariableByKeyAsync cost.
    // loadAccentVars is Promise-cached, so subsequent edits are free.
    if (!isDevModeRuntime()) {
      void loadAccentVars();
    }
  } catch (err: unknown) {
    debugLog('sandbox', 'emit-slide-loaded:error', err);
    console.log('[welder-slide-editor] emitSlideLoaded failed:', err);
  }
}

/**
 * Pre-load every unique font used by editable TEXT descendants of the
 * slide. Lets the per-keystroke setTextCharactersSafe call hit Figma's
 * font cache instead of paying loadFontAsync on the first edit. Run
 * fire-and-forget after slide-loaded; even on slow accounts it finishes
 * before the user finishes reading the slide.
 */
async function preloadSlideFonts(slide: InstanceNode): Promise<void> {
  try {
    const textNodes = slide.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
    const seen: { [k: string]: boolean } = {};
    const loads: Array<Promise<void>> = [];
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const fontName = node.fontName;
      if (fontName === figma.mixed) {
        const segments = node.getStyledTextSegments(['fontName']);
        for (let s = 0; s < segments.length; s++) {
          const fn = segments[s].fontName;
          const key = fn.family + '::' + fn.style;
          if (seen[key] === true) continue;
          seen[key] = true;
          loads.push(figma.loadFontAsync(fn));
        }
      } else {
        const fn = fontName as FontName;
        const key = fn.family + '::' + fn.style;
        if (seen[key] === true) continue;
        seen[key] = true;
        loads.push(figma.loadFontAsync(fn));
      }
    }
    await Promise.all(loads);
  } catch (err: unknown) {
    console.log('[welder-slide-editor] preloadSlideFonts failed:', err);
  }
}

/**
 * Prime the icon-swap cache using the first card or badge on the slide
 * so the IconPicker doesn't pay the import cost on first open. Posts
 * `icons-ready` when done (or immediately if no suitable node found) so
 * the picker UI can unlock.
 */
async function primeIconCacheForSlide(scan: SlideScan): Promise<void> {
  const startedAt = Date.now();
  let cardNodeId: string | null = null;
  if (scan.content !== null && scan.content.cards.length > 0) {
    cardNodeId = scan.content.cards[0].cardNodeId;
  }
  let targetNode: InstanceNode | null = null;
  if (cardNodeId !== null) {
    try {
      const n = await figma.getNodeByIdAsync(cardNodeId);
      if (n !== null && n.type === 'INSTANCE') {
        targetNode = n as InstanceNode;
      }
    } catch (_e) {
      /* node not found — skip */
    }
  }
  if (targetNode === null) {
    debugLog('perf', 'prime-icon-cache-slide', {
      targetFound: false,
      totalMs: Date.now() - startedAt,
    });
    postToUI({ type: 'icons-ready' });
    return;
  }
  let ok = true;
  try {
    await primeIconCache(targetNode);
  } catch (e) {
    ok = false;
    debugLog('sandbox', 'prime-icon-cache:error', e);
    // fall through to icons-ready so the picker can open even if priming fails
  }
  debugLog('perf', 'prime-icon-cache-slide', {
    targetFound: true,
    ok: ok,
    targetId: targetNode.id,
    targetName: targetNode.name,
    totalMs: Date.now() - startedAt,
  });
  postToUI({ type: 'icons-ready' });
}

function clearDisplayedSlide(): void {
  debugLog('sandbox', 'slide-deselected');
  lastDisplayedSlideId = null;
  lastSentSlideContentSignature = '';
  lastSentSummarySignature = '';
  postToUI({ type: 'slide-deselected' });
}

// ============================================================
// Bridge-message-loop (spec §5)
// ============================================================

function isMutatingMessage(msg: UIToPluginMessage): boolean {
  if (msg.type === 'ui-ready') return false;
  if (msg.type === 'set-icon-recents') return false;
  if (msg.type === 'resize-ui') return false;
  if (msg.type === 'export-document') return false;
  if (msg.type === 'close') return false;
  return true;
}

function readMessageRequestId(msg: UIToPluginMessage): string | null {
  const raw = (msg as { requestId?: unknown }).requestId;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

async function handleMessage(msg: UIToPluginMessage): Promise<void> {
  if (isDevModeRuntime() && isMutatingMessage(msg)) {
    const text =
      'Read-only Dev Mode diagnostics: "' +
      msg.type +
      '" is disabled. Use manifest.json in Figma Desktop for document edits.';
    debugLog('sandbox', 'dev-mode-command-blocked', { type: msg.type });
    postToUI({ type: 'target-updated', ok: false, error: text });
    return;
  }

  if (msg.type === 'ui-ready') {
    // Selection-driven: post init, then if there's a currently-focused
    // slide on the active page, scan + emit slide-loaded. Otherwise the
    // iframe stays in its empty state until the user clicks a slide.
    postToUI({ type: 'init', runtime: getRuntimeInfo() });

    const focused = findFocusedWelderSlide();
    if (focused !== null) {
      await emitSlideLoaded(focused);
    }

    // Hydrate icon-recents from clientStorage. Fire-and-forget; init
    // doesn't block on it. UI shows an empty Recents row until this
    // resolves (typically <50ms).
    figma.clientStorage
      .getAsync(ICON_RECENTS_KEY)
      .then((value: unknown) => {
        const items = Array.isArray(value) ? (value as string[]) : [];
        postToUI({ type: 'icon-recents', items: items });
      })
      .catch((err: unknown) => {
        console.log('[welder-slide-editor] icon-recents load failed:', err);
        postToUI({ type: 'icon-recents', items: [] });
      });
    return;
  }

  if (msg.type === 'set-icon-recents') {
    // Fire-and-forget. `useIconRecents` is the source of truth in the
    // iframe; clientStorage is a persistence sink. A failed write only
    // affects the next plugin open.
    figma.clientStorage.setAsync(ICON_RECENTS_KEY, msg.items).catch((err: unknown) => {
      console.log('[welder-slide-editor] icon-recents save failed:', err);
    });
    return;
  }

  if (msg.type === 'resize-ui') {
    // Apply the new size on every drag event so the iframe tracks the
    // user's pointer 1:1; persist asynchronously so a write storm
    // during drag doesn't block UI updates. clientStorage drops
    // intermediate writes naturally — only the latest in-flight value
    // matters for restore.
    const w = Math.max(320, Math.min(2000, Math.round(msg.width)));
    const h = Math.max(400, Math.min(2000, Math.round(msg.height)));
    try {
      figma.ui.resize(w, h);
    } catch (e) {
      console.log('[welder-slide-editor] resize failed:', e);
      return;
    }
    figma.clientStorage
      .setAsync('welder-ui-size', { width: w, height: h })
      .catch(function () {
        /* silent */
      });
    return;
  }

  if (msg.type === 'update-general') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    if (msg.section === 'titleDescription') {
      const payload = msg.payload as TitleDescriptionPayload;
      figma.commitUndo();
      // Mark BEFORE apply: the apply chain triggers documentchange events
      // that arm postSlideContent's 200ms debounce. If apply takes longer
      // than 200ms (multi-text + auto-layout reflow), the debounce can
      // fire before apply completes. Marking pre-apply opens the window
      // early so the debounced scan still skips. We also mark post-apply
      // to extend the window past completion.
      markSelfWrite();
      await applyTitleDescription(slide, payload);
      await refreshTablesOnSlide(slide); // T39.3: re-render tables na CopyWrap-edit
      markSelfWrite();
      postToUI({
        type: 'target-updated',
        ok: true,
        targetId: slide.id,
      });
      return;
    }
    if (msg.section === 'badge') {
      const payload = msg.payload as BadgePayload;
      // commitUndo before each plugin mutation creates a discrete
      // checkpoint so the iframe's plugin-Undo button reverts EXACTLY
      // this action (and not a coalesced batch with whatever followed).
      figma.commitUndo();
      markSelfWrite();
      await applyBadge(slide, payload);
      markSelfWrite();
      postToUI({
        type: 'target-updated',
        ok: true,
        targetId: slide.id,
      });
      return;
    }
    // TODO(T10): dispatch naar editors/general/image.ts
    console.log('[welder-slide-editor] update-general (T10+ placeholder):', msg.section);
    return;
  }

  if (msg.type === 'update-accent') {
    // Spec §13 T30 — heading-only. Paragraph-accent permanent out-of-scope.
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        requestId: msg.requestId,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const copyWrap = findCopyWrap(slide);
    if (copyWrap === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        requestId: msg.requestId,
        error: 'CopyWrap not found on slide: ' + msg.slideId,
      });
      return;
    }
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    if (headingNode === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        requestId: msg.requestId,
        error: 'Heading node not found',
      });
      return;
    }
    const startedAt = Date.now();
    debugLog('accent', 'sandbox:start', {
      slideId: msg.slideId,
      rangeCount: msg.dimRanges.length,
    });
    figma.commitUndo();
    markSelfWrite();
    const applyStartedAt = Date.now();
    await applyAccentRanges(headingNode, msg.dimRanges);
    const applyMs = Date.now() - applyStartedAt;
    // Fill-only accent writes do not alter CopyWrap geometry; table refresh is
    // reserved for text/size mutations that can actually reflow layout.
    markSelfWrite();
    debugLog('accent', 'sandbox:done', {
      slideId: msg.slideId,
      targetId: headingNode.id,
      rangeCount: msg.dimRanges.length,
      applyMs: applyMs,
      totalMs: Date.now() - startedAt,
    });
    postToUI({ type: 'target-updated', ok: true, requestId: msg.requestId, targetId: headingNode.id });
    return;
  }

  if (msg.type === 'update-card') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    await applyCard(slide, {
      cardNodeId: msg.cardNodeId,
      heading: msg.payload.heading,
      paragraph: msg.payload.paragraph,
      icon: msg.payload.icon,
      iconSvg: msg.payload.iconSvg,
      style: msg.payload.style,
    });
    markSelfWrite();
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.cardNodeId,
    });
    return;
  }

  if (msg.type === 'set-card-size') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    // Resolve the heading text-style id once, up front. Library-subscribed
    // styles aren't enumerable by name — sandbox walks all TEXT nodes on
    // first use to build a styleName → styleId map (cached for the session).
    const styleId = await resolveTextStyleByName(msg.headingStyleName);
    if (styleId === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error:
          'Text style "' + msg.headingStyleName +
          '" not found in this file. Apply it once to any text node so the plugin can register it.',
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();

    // Swap the bound variable on every Card's gap-relevant fields to the
    // named variable in the same Spacing collection. The collection holds
    // separate variables for each spacing step (named "1".."9", values
    // 4..36). We re-bind `itemSpacing` (and the other gap-shaped fields
    // if they're present) so the new spacing flows through Welder's
    // existing layout system.
    let targetSpacingVariable: Variable | null = null;
    let compactSidePaddingVariable: Variable | null = null;
    // Compact (= iconVisible AND gapModeName "4") is the only side-card
    // case that overrides the master padding — to variable "4" (16px).
    // Default and Text-only let the master's binding (variable "8" =
    // 32px) flow through unchanged.
    const wantsCompactSidePadding = msg.iconVisible === true && msg.gapModeName === '4';
    let firstSpacingFields: string[] = [];
    try {
      const firstCard = slide.findOne(function (n: SceneNode) {
        return n.type === 'INSTANCE' && n.name === 'Card';
      });
      if (firstCard !== null && firstCard.type === 'INSTANCE') {
        const bound = (firstCard as InstanceNode).boundVariables;
        console.log(
          '[set-card-size] card.boundVariables keys=' +
            (bound !== null && bound !== undefined ? Object.keys(bound).join(',') : 'NONE'),
        );
        // Only true gap fields — paddings on the Card are bound to the
        // same Spacing collection but shouldn't follow the SM/LG picker.
        const GAP_FIELDS = ['itemSpacing', 'gridRowGap', 'gridColumnGap'];
        let templateAlias: VariableAlias | null = null;
        if (bound !== null && bound !== undefined) {
          for (let f = 0; f < GAP_FIELDS.length; f++) {
            const field = GAP_FIELDS[f];
            const raw = (bound as { [k: string]: unknown })[field];
            if (raw === undefined || raw === null) continue;
            const aliases = Array.isArray(raw) ? raw : [raw];
            for (let a = 0; a < aliases.length; a++) {
              const alias = aliases[a] as VariableAlias;
              if (alias.type === 'VARIABLE_ALIAS') {
                if (templateAlias === null) templateAlias = alias;
                if (firstSpacingFields.indexOf(field) < 0) firstSpacingFields.push(field);
                break;
              }
            }
          }
        }
        console.log(
          '[set-card-size] spacing fields=[' + firstSpacingFields.join(', ') +
            '], template var=' + (templateAlias !== null ? templateAlias.id : 'NONE'),
        );

        if (templateAlias !== null) {
          const templateVar = await figma.variables.getVariableByIdAsync(templateAlias.id);
          if (templateVar !== null) {
            const collection = await figma.variables.getVariableCollectionByIdAsync(
              templateVar.variableCollectionId,
            );
            if (collection !== null) {
              // Resolve every variable in the collection in parallel.
              // Was a sequential `for await` loop — 9 round-trips in a
              // 9-variable Spacing collection meant ~450ms of latency
              // before any card got touched.
              const variables = await Promise.all(
                collection.variableIds.map(function (id) {
                  return figma.variables.getVariableByIdAsync(id);
                }),
              );
              const tried: string[] = [];
              for (let i = 0; i < variables.length; i++) {
                const v = variables[i];
                if (v === null) continue;
                tried.push(v.name);
                if (
                  targetSpacingVariable === null &&
                  (v.name === msg.gapModeName || v.name.endsWith('/' + msg.gapModeName))
                ) {
                  targetSpacingVariable = v;
                }
                if (
                  wantsCompactSidePadding &&
                  compactSidePaddingVariable === null &&
                  (v.name === '4' || v.name.endsWith('/4'))
                ) {
                  compactSidePaddingVariable = v;
                }
                if (
                  targetSpacingVariable !== null &&
                  (!wantsCompactSidePadding || compactSidePaddingVariable !== null)
                ) {
                  break;
                }
              }
              if (wantsCompactSidePadding && compactSidePaddingVariable === null) {
                console.log(
                  '[set-card-size] compact-side-padding variable "4" not found in collection "' +
                    collection.name + '"',
                );
              }
              if (targetSpacingVariable === null) {
                console.log(
                  '[set-card-size] variable "' + msg.gapModeName +
                    '" not found in collection "' + collection.name + '" — available: [' + tried.join(', ') + ']',
                );
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('[set-card-size] spacing-variable lookup failed: ' + String(e));
    }

    // One walk; resize icon-slot child, swap heading text style, and (when
    // we resolved a target spacing variable) re-bind every gap-shaped
    // field on each Card so the new spacing flows through.
    const cards = slide.findAll(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'Card';
    });

    // Cache for the per-card padding-mirror step. Without this each
    // card would `getMainComponentAsync` + up to 4 `getVariableByIdAsync`
    // calls, scaling to ~5N round-trips for N cards on the slide. Cards
    // typically share a master (same variant), so the cache collapses
    // it to one master fetch + a handful of variable fetches per call.
    type PaddingSource =
      | { kind: 'var'; variable: Variable }
      | { kind: 'literal'; value: number }
      | { kind: 'none' };
    interface PaddingMirror {
      paddingLeft: PaddingSource;
      paddingRight: PaddingSource;
      paddingTop: PaddingSource;
      paddingBottom: PaddingSource;
    }
    const paddingMirrorCache: { [masterId: string]: Promise<PaddingMirror> } = {};
    const PADDING_FIELDS: VariableBindableNodeField[] = [
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'paddingBottom',
    ];

    function resolvePaddingMirror(
      master: ComponentNode,
    ): Promise<PaddingMirror> {
      const cached = paddingMirrorCache[master.id];
      if (cached !== undefined) return cached;
      // Promise-keyed cache — concurrent cards sharing a master see a
      // cache hit immediately on the first call and await the same
      // in-flight resolution instead of each firing its own fetches.
      const p: Promise<PaddingMirror> = (async function () {
        const masterBound = master.boundVariables;
        const result: PaddingMirror = {
          paddingLeft: { kind: 'none' },
          paddingRight: { kind: 'none' },
          paddingTop: { kind: 'none' },
          paddingBottom: { kind: 'none' },
        };
        // Resolve all four variable aliases in parallel.
        const fieldFetches = PADDING_FIELDS.map(async function (field) {
          const alias =
            masterBound !== null && masterBound !== undefined
              ? (masterBound as { [k: string]: unknown })[field]
              : undefined;
          if (
            alias !== undefined &&
            alias !== null &&
            typeof alias === 'object' &&
            'id' in (alias as object)
          ) {
            try {
              const v = await figma.variables.getVariableByIdAsync(
                (alias as VariableAlias).id,
              );
              if (v !== null) {
                return { field, source: { kind: 'var' as const, variable: v } };
              }
            } catch (_e) {
              /* fall through */
            }
          }
          const literal = (master as unknown as { [k: string]: number })[field];
          if (typeof literal === 'number') {
            return { field, source: { kind: 'literal' as const, value: literal } };
          }
          return { field, source: { kind: 'none' as const } };
        });
        const resolved = await Promise.all(fieldFetches);
        for (let i = 0; i < resolved.length; i++) {
          (result as unknown as Record<string, PaddingSource>)[resolved[i].field] =
            resolved[i].source;
        }
        return result;
      })();
      paddingMirrorCache[master.id] = p;
      return p;
    }
    // Per-card work is independent — run them concurrently so a slide
    // with N cards finishes in roughly one card's worth of latency
    // instead of N × the per-card cost (was sequential setTextStyleId +
    // getMainComponent).
    await Promise.all(cards.map(async function (card) {
      if (card.type !== 'INSTANCE') return;
      const cardInst = card as InstanceNode;

      // Side-variant detection — read the canonical `Type` VARIANT
      // property on the Card instance. "Icon Side" is the only value
      // that gets side-specific treatment (smaller heading style,
      // horizontal-padding rebind, hide the icon-border-wrap in
      // text-only mode). All other Types (Stack Icon, Image, User)
      // stay on the master-defined padding/heading.
      const isSideVariant = readCardTypeVariant(cardInst) === 'Icon Side';
      const borderWrap = isSideVariant
        ? cardInst.findOne(function (n: SceneNode) {
            return n.name === 'icon-border-wrap';
          })
        : null;
      if (borderWrap !== null) {
        try {
          borderWrap.visible = msg.iconVisible;
        } catch (_e) {
          /* silent */
        }
      }

      // Card masters can carry multiple icon-slots (top vs side variant) —
      // walk all of them and prefer the one whose ancestor chain is visible.
      // Without this, side variants land on the hidden top slot and the
      // visibility/resize ops silently no-op on the wrong node.
      const slotMatches = cardInst.findAll(function (n: SceneNode) {
        return n.type === 'SLOT' && n.name === 'icon-slot';
      });
      let slotNode: SlotNode | null = null;
      for (let s = 0; s < slotMatches.length; s++) {
        const candidate = slotMatches[s];
        if (candidate.type !== 'SLOT') continue;
        let visible = true;
        let cursor: BaseNode | null = candidate;
        while (cursor !== null && cursor.id !== cardInst.id) {
          if ('visible' in cursor && (cursor as SceneNode).visible === false) {
            visible = false;
            break;
          }
          cursor = cursor.parent;
        }
        if (visible) {
          slotNode = candidate as SlotNode;
          break;
        }
      }
      if (slotNode === null && slotMatches.length > 0 && slotMatches[0].type === 'SLOT') {
        slotNode = slotMatches[0] as SlotNode;
      }
      if (slotNode !== null) {
        // Toggle the slot's own visibility — the entire icon area
        // collapses out of the auto-layout when hidden, giving the text
        // more room. The slot's child SVG stays put, so flipping back to
        // a visible mode restores the previously-picked icon.
        try {
          slotNode.visible = msg.iconVisible;
        } catch (_e) {
          /* silent */
        }
        if (msg.iconVisible && slotNode.children.length > 0) {
          const child = slotNode.children[0];
          if ('resize' in child) {
            try {
              child.resize(msg.iconSize, msg.iconSize);
            } catch (_e) {
              /* silent — auto-layout-locked slots may reject */
            }
          }
          // The slot's own geometric box is master-locked; calling
          // .resize() on it is silently rejected. The smaller icon
          // (e.g. 58 in Compact) sits inside the master-sized slot
          // (68), so center it manually rather than letting it stick
          // to (0,0). Master-side fix would be a Card `Size` variant
          // that defines a different slot size per mode.
          if (
            'x' in child &&
            'y' in child &&
            'width' in slotNode &&
            'height' in slotNode
          ) {
            const slotW = (slotNode as SceneNode & { width: number }).width;
            const slotH = (slotNode as SceneNode & { height: number }).height;
            try {
              (child as SceneNode & { x: number; y: number }).x =
                (slotW - msg.iconSize) / 2;
              (child as SceneNode & { x: number; y: number }).y =
                (slotH - msg.iconSize) / 2;
            } catch (_e) {
              /* silent — child may be locked by parent auto-layout */
            }
          }
        }
      }

      const headingNode = cardInst.findOne(function (n: SceneNode) {
        return n.type === 'TEXT' && n.name === 'Heading';
      });
      if (headingNode !== null && headingNode.type === 'TEXT') {
        try {
          await (headingNode as TextNode).setTextStyleIdAsync(styleId);
        } catch (e) {
          console.log('[set-card-size] setTextStyleIdAsync failed: ' + String(e));
        }
      }

      if (targetSpacingVariable !== null) {
        for (let f = 0; f < firstSpacingFields.length; f++) {
          const field = firstSpacingFields[f] as VariableBindableNodeField;
          try {
            cardInst.setBoundVariable(field, targetSpacingVariable);
          } catch (e) {
            console.log(
              '[set-card-size] setBoundVariable ' + field + ' failed: ' + String(e),
            );
          }
        }
      }

      // Reset paddings to mirror the variant master exactly. Cached
      // resolution means we only pay for getMainComponentAsync +
      // variable fetches once per unique master, regardless of how
      // many cards we touch.
      try {
        const mainComp = await cardInst.getMainComponentAsync();
        if (mainComp !== null) {
          const mirror = await resolvePaddingMirror(mainComp as ComponentNode);
          for (let f = 0; f < PADDING_FIELDS.length; f++) {
            const field = PADDING_FIELDS[f];
            const src = (mirror as unknown as Record<string, PaddingSource>)[field];
            if (src.kind === 'var') {
              try {
                cardInst.setBoundVariable(field, src.variable);
              } catch (_e) {
                /* silent */
              }
            } else if (src.kind === 'literal') {
              try {
                cardInst.setBoundVariable(field, null);
              } catch (_e) {
                /* silent */
              }
              try {
                (cardInst as unknown as { [k: string]: number })[field] = src.value;
              } catch (_e) {
                /* silent */
              }
            }
          }
        }
      } catch (e) {
        console.log('[set-card-size] padding-reset failed: ' + String(e));
      }

      // Compact side variant override — after mirroring master (above),
      // rebind paddingLeft/Right to variable "4" (16px). Only applies
      // to Icon Side cards in Compact mode; Default and Text-only let
      // the master padding stand.
      if (isSideVariant && wantsCompactSidePadding && compactSidePaddingVariable !== null) {
        for (let f = 0; f < PADDING_FIELDS.length; f++) {
          const field = PADDING_FIELDS[f];
          try {
            cardInst.setBoundVariable(field, compactSidePaddingVariable);
          } catch (e) {
            console.log(
              '[set-card-size] compact side-padding rebind ' + field + ' failed: ' + String(e),
            );
          }
        }
      }
    }));

    markSelfWrite();
    postToUI({ type: 'target-updated', ok: true });
    return;
  }

  if (msg.type === 'update-timeline-item') {
    // T31.2 — muteert heading/paragraph van één CopyWrap-item.
    // Zoek CopyWrap via slide.findOne(id) zodat ook genestede CopyWraps
    // (binnen tussenliggende Frames) gevonden worden — wrapper-agnostisch.
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    // T31.2: slide-scoped findOne op node-id — vindt ook genestede CopyWraps.
    const copyWrapNode = slide.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'CopyWrap' && n.id === msg.copyWrapNodeId;
    });
    const copyWrap: InstanceNode | null =
      copyWrapNode !== null && copyWrapNode.type === 'INSTANCE'
        ? (copyWrapNode as InstanceNode)
        : null;
    if (copyWrap === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Timeline CopyWrap not found: ' + msg.copyWrapNodeId,
      });
      return;
    }
    figma.commitUndo();
    if (typeof msg.payload.heading === 'string') {
      const headingNode = copyWrap.findOne((n: SceneNode) => {
        return n.type === 'TEXT' && n.name === 'Heading';
      });
      if (headingNode !== null && headingNode.type === 'TEXT') {
        await setTextCharactersSafe(headingNode as TextNode, msg.payload.heading);
      }
    }
    if (typeof msg.payload.paragraph === 'string') {
      const paragraphNode = copyWrap.findOne((n: SceneNode) => {
        return n.type === 'TEXT' && n.name === 'Paragraph';
      });
      if (paragraphNode !== null && paragraphNode.type === 'TEXT') {
        await setTextCharactersSafe(paragraphNode as TextNode, msg.payload.paragraph);
      }
    }
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.copyWrapNodeId,
    });
    return;
  }

  if (msg.type === 'update-table') {
    // T34.2: Slot-based full-state PUT. msg.slotId adresseert de SlotNode
    // rechtstreeks (de UI ontving 'm via `GraphInstance.nodeId`).
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const slotNode = await figma.getNodeByIdAsync(msg.slotId);
    if (slotNode === null || slotNode.type !== 'SLOT') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Table slot not found: ' + msg.slotId,
      });
      return;
    }
    figma.commitUndo();
    await applyTable(slotNode as SlotNode, msg.desired);
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.slotId,
    });
    return;
  }

  if (msg.type === 'import-csv') {
    // T34.2 / T39.2: parse + truncate + applyTable. Width blijft behouden
    // (gelezen uit pluginData) — import verandert alleen row/cel-inhoud.
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const slotNode = await figma.getNodeByIdAsync(msg.slotId);
    if (slotNode === null || slotNode.type !== 'SLOT') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Table slot not found: ' + msg.slotId,
      });
      return;
    }
    figma.commitUndo();
    await importCSV(slotNode as SlotNode, msg.csv);
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.slotId,
    });
    return;
  }

  if (msg.type === 'update-journey') {
    // T45: Slot-based full-state PUT voor JourneyWrap.
    const journeySlide = findSlideById(msg.slideId);
    if (journeySlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const journeySlotNode = await figma.getNodeByIdAsync(msg.slotId);
    if (journeySlotNode === null || journeySlotNode.type !== 'SLOT') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Journey slot not found: ' + msg.slotId,
      });
      return;
    }
    figma.commitUndo();
    await applyJourney(journeySlotNode as SlotNode, msg.desired, msg.iconSvgs);
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.slotId,
    });
    return;
  }

  if (msg.type === 'upload-image') {
    // Target-node lookup — `documentAccess: "dynamic-page"` vereist de
    // async-variant. Bytes komen als Uint8Array via structured-cloning
    // binnen en hoeven niet geconverteerd te worden.
    const target = await figma.getNodeByIdAsync(msg.targetNodeId);
    if (target === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Target node not found: ' + msg.targetNodeId,
      });
      return;
    }
    const slide = findSlideAncestor(target);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'No enclosing slide for target: ' + msg.targetNodeId,
      });
      return;
    }

    // Routing: wanneer de target een directe child is van CardWrap gaan
    // de bytes naar de card-slot; anders naar de slide-level ImageWrap.
    const cardWrap = findCardWrap(slide);
    const targetParent = 'parent' in target ? (target as SceneNode).parent : null;
    const isCardChild =
      cardWrap !== null && targetParent !== null && targetParent.id === cardWrap.id;

    figma.commitUndo();

    if (isCardChild) {
      const newHash = await applyCardVisual(slide, msg.targetNodeId, msg.bytes);
      if (newHash === null) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'Card visual slot not found: ' + msg.targetNodeId,
        });
        return;
      }
      // Refresh thumbnail in iframe immediately — bytes are already in
      // scope (the user just uploaded them), so no getBytesAsync round-
      // trip. fillW/fillH come from the card's visual slot for aspect-
      // ratio matching in the thumbnail box.
      let cardFillW = 0;
      let cardFillH = 0;
      if (target.type === 'INSTANCE') {
        const cardSlot = findCardVisualSlot(target as InstanceNode);
        if (cardSlot !== null && 'width' in cardSlot && 'height' in cardSlot) {
          const w = (cardSlot as LayoutMixin).width;
          const h = (cardSlot as LayoutMixin).height;
          if (w > 0 && h > 0) {
            cardFillW = w;
            cardFillH = h;
          }
        }
      }
      postToUI({
        type: 'card-visual-preview',
        cardNodeId: msg.targetNodeId,
        bytes: msg.bytes,
        fillW: cardFillW,
        fillH: cardFillH,
      });
      postToUI({
        type: 'target-updated',
        ok: true,
        targetId: msg.targetNodeId,
      });
      return;
    }

    const newHash = await applyImage(slide, { bytes: msg.bytes });
    if (newHash === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'ImageWrap not found on slide: ' + slide.id,
      });
      return;
    }

    // Refresh thumbnail in UI immediately — no need for getBytesAsync, we
    // already have the bytes that were just uploaded (FIG-ASYNC-01 compliant:
    // no fire-and-forget; this is synchronous within the async handler).
    var previewFillW = 0;
    var previewFillH = 0;
    try {
      if (target.type === 'INSTANCE') {
        var previewSlot = findImageSlot(target as InstanceNode);
        if (previewSlot !== null && 'width' in previewSlot && 'height' in previewSlot) {
          var previewSlotW = (previewSlot as LayoutMixin).width;
          var previewSlotH = (previewSlot as LayoutMixin).height;
          if (previewSlotW > 0 && previewSlotH > 0) {
            previewFillW = previewSlotW;
            previewFillH = previewSlotH;
          }
        }
      }
    } catch (_e) {
      // Fallback: laat dims op 0 staan; UI toont h-36 fallback.
    }
    postToUI({
      type: 'image-preview',
      imageWrapId: msg.targetNodeId,
      bytes: msg.bytes,
      fillW: previewFillW,
      fillH: previewFillH,
    });
    // Update dedup-cache so that een documentchange-triggered pick-slide
    // de preview niet opnieuw verstuurt met de verouderde hash.
    lastSentPreviewHash.set(msg.targetNodeId, newHash);

    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.targetNodeId,
    });
    return;
  }

  if (msg.type === 'set-slide-theme') {
    const themeSlide = findSlideById(msg.slideId);
    if (themeSlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const collections = await findThemeCollectionsForSlide(themeSlide);
    if (collections.length === 0) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Theme variable collection not found on this slide',
      });
      return;
    }
    // Resolve the chosen mode to its NAME on the source (first) collection,
    // then apply the equivalent mode (matched by name) on every other
    // Theme collection in scope. Welder Templates carries a local Theme
    // mirror of the library Theme; both must move together so the body
    // theme AND the accent text colour follow the picker.
    const sourceMode =
      msg.modeId === null
        ? null
        : collections[0].modes.find((m) => m.modeId === msg.modeId) ?? null;
    const targetName = sourceMode === null ? null : sourceMode.name;

    figma.commitUndo();
    // Suppress the documentchange-driven full re-scan window. Without
    // this, every theme tap would trigger `postSlideContent` →
    // `scanSlide` → `slide-loaded` round-trip after the apply, which
    // perceptibly lagged the picker swatch.
    markSelfWrite();
    try {
      for (let i = 0; i < collections.length; i++) {
        const c = collections[i];
        if (msg.modeId === null) {
          // Clear: slide inherits the page-level mode for this collection.
          themeSlide.clearExplicitVariableModeForCollection(c);
          continue;
        }
        const matching = c.modes.find((m) => m.name === targetName);
        if (matching === undefined) {
          console.log(
            '[welder-slide-editor] no Theme mode named "' +
              String(targetName) +
              '" in collection ' +
              c.name +
              ' (id ' +
              c.id +
              ') — skipping',
          );
          continue;
        }
        themeSlide.setExplicitVariableModeForCollection(c, matching.modeId);
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'setExplicitVariableModeForCollection failed: ' + text,
      });
      return;
    }
    // No slide re-scan: a theme change doesn't affect any other content
    // (text, icons, structure all stay the same). The iframe applies the
    // new mode optimistically before posting; this confirmation just
    // closes the round-trip. Saves a 100-500ms scanSlide + slide-loaded
    // round-trip on every theme click.
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: themeSlide.id,
    });
    return;
  }

  if (msg.type === 'set-slide-skipped') {
    var skipSlide = findSlideById(msg.slideId);
    if (skipSlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        requestId: msg.requestId,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    var skipParent: BaseNode | null = skipSlide.parent;
    if (skipParent === null || skipParent.type !== 'SLIDE') {
      postToUI({
        type: 'target-updated',
        ok: false,
        requestId: msg.requestId,
        error: 'Slide has no SlideNode parent (requires Figma Slides editor)',
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    (skipParent as SlideNode).isSkippedSlide = msg.skipped;
    const skipSummary = summaryForSlide(skipSlide);
    lastSentSummarySignature =
      skipSummary.id + '|' + skipSummary.name + '|' + String(skipSummary.isSkipped);
    // No slide-summary re-emit: the iframe flips its visibility pill
    // optimistically before posting, so a sandbox echo just forces a
    // wasted round-trip and can clobber a rapid second click. Same
    // pattern as set-slide-theme.
    //
    // `markSelfWrite()` above suppresses the documentchange-driven
    // re-scan window — without it, every toggle would trigger a full
    // `postSlideContent` → `scanSlide` round-trip, making the toggle
    // perceptibly lag.
    postToUI({
      type: 'target-updated',
      ok: true,
      requestId: msg.requestId,
      targetId: skipSlide.id,
    });
    return;
  }

  if (msg.type === 'set-typography-visibility') {
    const visSlide = findSlideById(msg.slideId);
    if (visSlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    try {
      if (msg.field === 'badge') {
        // Badge visibility binds to the `Badge_wrap` FRAME inside
        // CopyWrap — toggling that wrapper collapses the badge out of
        // CopyWrap's auto-layout cleanly. Legacy fallback: setProperties
        // on the `showBadge` BOOLEAN for older masters without the wrap.
        const cw = findCopyWrap(visSlide);
        if (cw !== null) {
          const badgeWrap = cw.findOne(function (n: SceneNode) {
            return (n.type === 'FRAME' || n.type === 'INSTANCE') && n.name === 'Badge_wrap';
          });
          if (badgeWrap !== null && 'visible' in badgeWrap) {
            (badgeWrap as SceneNode).visible = msg.visible;
          } else {
            const props = cw.componentProperties;
            let showKey: string | null = null;
            if (props !== null && props !== undefined) {
              const keys = Object.keys(props);
              for (let i = 0; i < keys.length; i++) {
                const bare = keys[i].split('#')[0].toLowerCase();
                if (bare === 'showbadge' && props[keys[i]].type === 'BOOLEAN') {
                  showKey = keys[i];
                  break;
                }
              }
            }
            if (showKey !== null) {
              const overrides: { [k: string]: boolean } = {};
              overrides[showKey] = msg.visible;
              cw.setProperties(overrides);
            }
          }
        }
      } else {
        await applyTitleDescription(visSlide, {
          headingVisible: msg.field === 'heading' ? msg.visible : undefined,
          paragraphVisible: msg.field === 'paragraph' ? msg.visible : undefined,
        });
      }
    } catch (e) {
      console.log('[set-typography-visibility] failed: ' + String(e));
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'apply failed: ' + String(e),
      });
      return;
    }
    postToUI({ type: 'target-updated', ok: true, targetId: visSlide.id });
    return;
  }

  if (msg.type === 'set-copywrap-size') {
    const sizeSlide = findSlideById(msg.slideId);
    if (sizeSlide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const copyWrapForSize = findCopyWrap(sizeSlide);
    if (copyWrapForSize === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'CopyWrap not found on slide',
      });
      return;
    }
    // Same resolver as the read-side: the actual VARIANT host is the
    // nested TypHeading instance (legacy fallback to CopyWrap-level).
    const sizeHostInfo = await resolveTypHeadingSizeHost(copyWrapForSize);
    if (sizeHostInfo === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'TypHeading + size variant property not found',
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    try {
      const overrides: { [k: string]: string } = {};
      overrides[sizeHostInfo.key] = msg.size;
      sizeHostInfo.host.setProperties(overrides);
    } catch (e) {
      console.log('[set-copywrap-size] setProperties failed: ' + String(e));
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'setProperties failed: ' + String(e),
      });
      return;
    }
    postToUI({ type: 'target-updated', ok: true, targetId: sizeHostInfo.host.id });
    return;
  }

  if (msg.type === 'trigger-undo') {
    // Figma's plugin API exposes triggerUndo but no triggerRedo, so
    // the iframe's redo button is disabled with a tooltip pointing
    // at the native shortcut. Undo here reverts to the last
    // commitUndo() checkpoint.
    figma.triggerUndo();
    // Re-sync the iframe's view of the currently-displayed slide.
    // Without this, optimistic store updates (e.g. picker's
    // view.state.general.badge.icon = newIcon written before the
    // bridge.post) survive the undo and the picker keeps showing
    // the pre-undo value while the canvas correctly reverts.
    if (typeof msg.slideId === 'string' && msg.slideId.length > 0) {
      const undoSlide = findSlideById(msg.slideId);
      if (undoSlide !== null) {
        try {
          const scan = await scanSlide(undoSlide);
          postToUI({
            type: 'slide-loaded',
            summary: summaryForSlide(undoSlide),
            general: scan.general,
            content: scan.content,
            graphs: scan.graphs,
          });
        } catch (err: unknown) {
          console.log('[welder-slide-editor] post-undo scanSlide failed:', err);
        }
      }
    }
    return;
  }

  if (msg.type === 'export-document') {
    // Single slide → walk up to the SLIDE parent (1920×1080) when one
    // exists; that's what Figma's native present/export targets, not
    // the Welder INSTANCE inside it. In Figma Design (no SLIDE parent)
    // we fall back to the INSTANCE itself.
    if (msg.target === 'slide') {
      if (typeof msg.slideId !== 'string' || msg.slideId.length === 0) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'No slide selected to export.',
        });
        return;
      }
      const welderSlide = findSlideById(msg.slideId);
      if (welderSlide === null) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'Slide not found: ' + msg.slideId,
        });
        return;
      }
      const target: SceneNode =
        welderSlide.parent !== null && welderSlide.parent.type === 'SLIDE'
          ? (welderSlide.parent as SlideNode)
          : welderSlide;

      // Match the picker name exactly: heading text within CopyWrap,
      // fallback to "Slide N" where N is the slide's 1-based index on
      // the current page. Same logic as `slideSummary` (used by the
      // SlideSelector dropdown), so the file the user downloads is
      // labelled with the same name they see in the picker.
      const summary = summaryForSlide(welderSlide);
      const baseName = summary.name;

      const ext = msg.format === 'PNG' ? '.png' : '.pdf';
      const filename = sanitizeBaseFilename(baseName) + ext;
      let bytes: Uint8Array;
      try {
        bytes = await (target as unknown as ExportMixin).exportAsync({ format: msg.format });
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        postToUI({
          type: 'target-updated',
          ok: false,
          error: msg.format + '-export mislukt: ' + text,
        });
        return;
      }
      postToUI({
        type: 'document-ready',
        target: 'slide',
        format: msg.format,
        bytes: bytes,
        filename: filename,
        title: baseName,
      });
      return;
    }

    // Presentation export.
    const baseName = figma.currentPage.name || 'presentation';
    if (msg.format === 'PNG') {
      // PNG of an entire presentation is ambiguous (giant single image
      // vs. a zip of per-slide PNGs). Not supported in v1; UI gates
      // this combo, so this branch is a defensive guard.
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'PNG-export voor de hele presentatie wordt nog niet ondersteund.',
      });
      return;
    }

    // Presentation PDF — iterate non-skipped SLIDE nodes (or the
    // Welder INSTANCE when there's no SLIDE parent), exportAsync
    // each as a single-page PDF, ship the parts to the iframe; the
    // iframe merges with pdf-lib. Page-level exportAsync would just
    // produce one giant single-page PDF spanning the canvas grid.
    const welderSlides = getSlidesOnCurrentPage();
    const targets: SceneNode[] = [];
    for (let i = 0; i < welderSlides.length; i++) {
      const ws = welderSlides[i];
      if (ws.parent !== null && ws.parent.type === 'SLIDE') {
        const slide = ws.parent as SlideNode;
        if (slide.isSkippedSlide) continue;
        targets.push(slide);
      } else {
        targets.push(ws);
      }
    }
    if (targets.length === 0) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Geen slides om te exporteren.',
      });
      return;
    }

    const parts: Uint8Array[] = [];
    for (let i = 0; i < targets.length; i++) {
      try {
        const bytes = await (targets[i] as unknown as ExportMixin).exportAsync({
          format: 'PDF',
        });
        parts.push(bytes);
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'PDF-export slide ' + String(i + 1) + ' mislukt: ' + text,
        });
        return;
      }
    }
    postToUI({
      type: 'presentation-pdf-parts',
      parts: parts,
      filename: sanitizeBaseFilename(baseName) + '.pdf',
      title: baseName,
    });
    return;
  }

  if (msg.type === 'close') {
    figma.closePlugin();
    return;
  }
}

/**
 * Strip filesystem-unfriendly characters from a string so it's safe
 * as a download filename across macOS / Windows / Linux. Collapses
 * runs of spaces / underscores into a single hyphen, drops leading
 * and trailing hyphens, caps length at 80 chars. Caller appends the
 * format extension.
 */
function sanitizeBaseFilename(raw: string): string {
  const trimmed = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  const collapsed = trimmed.replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const safe = collapsed.length > 0 ? collapsed : 'export';
  return safe.length > 80 ? safe.slice(0, 80) : safe;
}

// ============================================================
// Main — init-sequence
// ============================================================

async function main(): Promise<void> {
  // Command-dispatch: v0.1.0 heeft alleen 'open' (manifest menu +
  // relaunch-buttons vuren met diezelfde command). Geen command-match
  // betekent dat de plugin via een ander event is gestart; we tonen
  // dan alsnog de UI (defensief).
  const cmd = figma.command;
  debugLog('sandbox', 'main:start', getRuntimeInfo());
  if (cmd !== '' && cmd !== 'open') {
    // Onbekend command: log maar blijf draaien zodat de UI debugbaar is.
    console.log('[welder-slide-editor] Unknown command:', cmd);
  }

  // Font-preload: klaar vóór live-events. FIG-FONT-01, FIG-ASYNC-01.
  // loadAllPagesAsync is verwijderd — het scande alle pagina's en veroorzaakte
  // 10-30s vertraging bij grote bestanden. primeIconCache bestaat niet meer,
  // dus er is geen volledige paginascan nodig.
  await loadFonts();

  // Pre-warm icon-swap cache. The Welder Card master's INSTANCE_SWAP
  // property carries ~1500 preferredValues (the full Lucide collection),
  // and `buildPrefValueCache` resolves each via importComponentByKeyAsync
  // — many seconds in aggregate. Without pre-warming, a user who picks
  // a badge icon shortly after plugin open lands inside the cache-build
  // wait inside `swapComponentByName` (Badge's icon path), and the swap
  // visibly stalls; the bug surfaces as "works after switching slides
  // back and forth" because by then the build has finished.
  //
  // Kick the build off here, fire-and-forget, so it's already running
  // (or done) by the time the iframe sends ui-ready. The post-slide-
  // loaded primeIconCache call is now a no-op safety net — it
  // short-circuits on the existing prefValueBuildPromise.
  if (!isDevModeRuntime()) {
    (async function () {
      try {
        const slides = getSlidesOnCurrentPage();
        for (let i = 0; i < slides.length; i++) {
          const card = slides[i].findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name === 'Card');
          if (card !== null && card.type === 'INSTANCE') {
            primeIconCache(card as InstanceNode).catch(() => {});
            return;
          }
        }
      } catch (_e) {
        // Fall back to the post-slide-loaded prime path; nothing to do here.
      }
    })();
  } else {
    debugLog('sandbox', 'prime-icon-cache-skipped-dev-mode');
  }

  figma.ui.onmessage = (raw: unknown) => {
    const msg = raw as UIToPluginMessage;
    const startedAt = Date.now();
    debugMessage('ui->plugin', msg);
    handleMessage(msg).then(() => {
      debugLog('perf', 'sandbox-handler', {
        type: msg.type,
        requestId: readMessageRequestId(msg),
        ok: true,
        totalMs: Date.now() - startedAt,
      });
    }).catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err);
      debugLog('perf', 'sandbox-handler', {
        type: msg.type,
        requestId: readMessageRequestId(msg),
        ok: false,
        totalMs: Date.now() - startedAt,
        error: text,
      });
      debugLog('sandbox', 'handler-error', { type: msg.type, error: text });
      figma.notify('Slide editor error: ' + text, { error: true });
      postToUI({ type: 'target-updated', ok: false, error: text });
    });
  };

  // Per-page nodechange subscription instead of figma.on('documentchange').
  // documentchange forces Figma to load every page in the file just to
  // subscribe — Figma's own dynamic-page docs steer us to PageNode.on
  // ('nodechange') for targeted monitoring. We re-attach the listener
  // whenever the current page changes so we always observe the page
  // the user is editing.
  type NodeChangeEvent = {
    nodeChanges: ReadonlyArray<{ type: string; node: SceneNode }>;
  };
  type PageWithNodeChange = PageNode & {
    on: (type: 'nodechange', cb: (e: NodeChangeEvent) => void) => void;
    off: (type: 'nodechange', cb: (e: NodeChangeEvent) => void) => void;
  };
  function onPageNodeChange(event: NodeChangeEvent): void {
    try {
      let summaryDirty = false;
      let contentDirty = false;
      const changes = event.nodeChanges;
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (
          (change.node.type === 'INSTANCE' && isSlide(change.node)) ||
          (change.node.type === 'SLIDE' && change.type !== 'PROPERTY_CHANGE')
        ) {
          invalidateSlidePageCache('slide-structure-change');
        }
        if (change.type === 'PROPERTY_CHANGE' && change.node.type === 'SLIDE') {
          summaryDirty = true;
          continue;
        }
        if (
          change.type === 'PROPERTY_CHANGE' &&
          change.node.type === 'TEXT' &&
          change.node.name === 'Heading'
        ) {
          summaryDirty = true;
          contentDirty = true;
          continue;
        }
        contentDirty = true;
      }
      debugLog('figma-event', 'nodechange', {
        pageId: figma.currentPage.id,
        changeCount: changes.length,
        summaryDirty: summaryDirty,
        contentDirty: contentDirty,
      });
      if (summaryDirty) postSlideSummary();
      if (contentDirty) postSlideContent();
    } catch (err: unknown) {
      debugLog('figma-event', 'nodechange:error', err);
      console.log('[welder-slide-editor] nodechange handler failed:', err);
    }
  }

  let subscribedPage: PageWithNodeChange | null = null;
  function attachNodeChangeListener(): void {
    const newPage = figma.currentPage as PageWithNodeChange;
    if (subscribedPage === newPage) return;
    if (subscribedPage !== null) {
      try {
        subscribedPage.off('nodechange', onPageNodeChange);
      } catch (_e) {
        /* silent */
      }
    }
    try {
      newPage.on('nodechange', onPageNodeChange);
      subscribedPage = newPage;
      debugLog('figma-event', 'nodechange:attached', {
        pageId: newPage.id,
        pageName: newPage.name,
      });
    } catch (err: unknown) {
      debugLog('figma-event', 'nodechange:attach-error', err);
      console.log('[welder-slide-editor] page.on(nodechange) failed:', err);
    }
  }
  attachNodeChangeListener();

  figma.on('currentpagechange', () => {
    try {
      debugLog('figma-event', 'currentpagechange', {
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
      });
      invalidateSlidePageCache('currentpagechange');
      // Swap the nodechange subscription to the new current page first
      // so any edits there reach the iframe.
      attachNodeChangeListener();

      // Page changed — the previously-focused slide is on a different page
      // now, so the iframe should re-evaluate based on the new page's
      // current selection.
      const focused = findFocusedWelderSlide();
      if (focused === null) {
        clearDisplayedSlide();
        return;
      }
      debugLog('figma-event', 'currentpagechange:focused-slide', {
        slideId: focused.id,
        slideName: focused.name,
      });
      if (focused.id === lastDisplayedSlideId) return;
      void emitSlideLoaded(focused);
    } catch (err: unknown) {
      debugLog('figma-event', 'currentpagechange:error', err);
      console.log('[welder-slide-editor] currentpagechange handler failed:', err);
    }
  });

  // Selection-driven slide switching. When the user selects a slide (or
  // anything inside one), the sandbox scans it and posts slide-loaded.
  // When the selection no longer resolves to a slide, posts slide-deselected.
  // Full try/catch — crashing this would re-introduce the earlier "plugin
  // opent niet meer" bug; silent skip is fine.
  try {
    figma.on('selectionchange', () => {
      try {
        const focused = findFocusedWelderSlide();
        debugLog('figma-event', 'selectionchange', {
          selectionCount: figma.currentPage.selection.length,
          focusedSlideId: focused !== null ? focused.id : null,
          focusedSlideName: focused !== null ? focused.name : null,
        });
        if (focused === null) {
          if (lastDisplayedSlideId !== null) clearDisplayedSlide();
          return;
        }
        if (focused.id === lastDisplayedSlideId) return;
        void emitSlideLoaded(focused);
      } catch (err: unknown) {
        debugLog('figma-event', 'selectionchange:error', err);
        console.log('[welder-slide-editor] selectionchange handler failed:', err);
      }
    });
  } catch (err: unknown) {
    debugLog('figma-event', 'selectionchange:registration-error', err);
    console.log('[welder-slide-editor] selectionchange not available:', err);
  }

  figma.on('close', () => {
    debugLog('figma-event', 'close');
    // Cleanup hook — Figma ruimt listeners automatisch op. FIG-CLOSE-01.
    if (pendingSlideContentUpdate !== null) {
      clearTimeout(pendingSlideContentUpdate);
      pendingSlideContentUpdate = null;
    }
    if (pendingSlideSummaryUpdate !== null) {
      clearTimeout(pendingSlideSummaryUpdate);
      pendingSlideSummaryUpdate = null;
    }
  });
}

main().catch((err: unknown) => {
  const text = err instanceof Error ? err.message : String(err);
  debugLog('sandbox', 'startup-error', err);
  figma.notify('Slide editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
