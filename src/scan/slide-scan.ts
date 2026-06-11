// ============================================================
// scan/slide-scan.ts
//
// De volledige read-kant van de plugin: scant een Welder-slide naar de
// typed secties die over de bus naar de iframe gaan (general / theme /
// content / graphs), plus de tekst-, icon- en visual-readers waar die
// scans op leunen. Mutaties horen hier NIET — die leven in editors/**.
//
// FIG-GUARD-01: type-checks vóór property-access.
// FIG-TRAVERSE-01: traversal bounded via findChild / findOne.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import {
  findCopyWrap,
  findBadge,
  findImageWrap,
  findCardWrap,
  findTableWrap,
  findTableSlot,
  findTimelineWrap,
  isEffectivelyVisible,
  readBooleanProperty,
} from '../slide-machine';
import {
  GeneralSections,
  ContentItems,
  GraphItems,
  CardItem,
  InstructorCardItem,
  TimelineItem,
  TableWrapModel,
  ThemeMode,
} from '../types';
import { normalizeIconKey, LUCIDE_SLUG_RE } from '../editors/_shared/icon-swap';
import { findImageSlot, findTextByName } from '../editors/_shared/node-finders';
import {
  findInstructorListTexts,
  readInstructorVariant,
  readInstructorOptions,
  INSTRUCTOR_CARD_NODE_NAME,
} from '../editors/content/instructor';
import { readDimRanges } from '../editors/_shared/accent-ranges';
import { applyTable, scanTableSlot } from '../editors/table/renderer';
import { debugLog } from '../debug';
import { isDevModeRuntime } from '../sandbox/runtime';
import { postToUI } from '../sandbox/bridge';

// ============================================================

/** Combinatie van de drie tab-payloads; exact de shape van `slide-loaded`. */
export interface SlideScan {
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
export function readBadgeIcon(badge: InstanceNode): string {
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
export function readCardIcon(card: SceneNode, slide: InstanceNode): string | null {
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
export function findVisibleTextNodeByName(
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

export async function resolveTypHeadingSizeHost(
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
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" props=[' + keys.join(', ') + '] — no size key',
      );
      continue;
    }
    const main = await cand.getMainComponentAsync();
    const parent = main !== null ? main.parent : null;
    if (parent === null || parent.type !== 'COMPONENT_SET') {
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" main parent is ' +
          (parent !== null ? parent.type : 'null') + ', not COMPONENT_SET',
      );
      continue;
    }
    const defs = (parent as ComponentSetNode).componentPropertyDefinitions;
    const def = defs !== null && defs !== undefined ? defs[key] : undefined;
    if (def === undefined || def.type !== 'VARIANT' || !Array.isArray(def.variantOptions)) {
      debugLog(
        'copywrap-size',
        '  candidate "' + cand.name + '" def missing variantOptions for key "' +
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
    // component property, layered with a node-level read (below) so a
    // TypParagraph hidden directly on the canvas wins over a missing or
    // true property.
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
      if (paragraphVisible) {
        // Node-level read — mirrors the TypHeading legacy read above and
        // the apply-side fallback in title-description.ts: CopyWraps
        // without a showParagraph property (or with a stale true value)
        // carry visibility on the TypParagraph wrapper / Paragraph node
        // itself. Without this read the toggle reports ON for a hidden
        // paragraph and bounces back after every off-toggle.
        const typParagraph = copyWrap.findOne(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'TypParagraph';
        });
        if (typParagraph !== null && 'visible' in typParagraph) {
          paragraphVisible = (typParagraph as InstanceNode).visible !== false;
        } else {
          const paragraphTextNode = findTextByName(copyWrap, 'Paragraph');
          if (paragraphTextNode !== null) {
            paragraphVisible = paragraphTextNode.visible !== false;
          }
        }
      }
    }
    debugLog('scan', 'titleDescription', {
      slideId: slide.id,
      headingChars: heading.length,
      paragraph: paragraph === null ? null : paragraph.length,
      headingVisible: headingVisible,
      paragraphVisible: paragraphVisible,
      showParagraphProp: readBooleanProperty(copyWrap, 'showParagraph'),
    });

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
        debugLog(
          'copywrap-size',
          'options=[' + headingHost.options.join(', ') +
            '], current=' + headingHost.value,
        );
      } else {
        debugLog('copywrap-size', 'TypHeading + size property not resolved');
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
        debugLog(
          'badge-scan',
          'backfilled iconIntended="' + currentBadgeIcon + '" for ' + badge.id,
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
export async function findThemeCollectionsForSlide(slide: InstanceNode): Promise<VariableCollection[]> {
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
 * Slot-detectie via de shared findImageSlot (editors/_shared/node-finders.ts).
 * Returns null wanneer het slot leeg is of geen IMAGE-fill draagt.
 */
function readImageWrapHash(imageWrap: InstanceNode): string | null {
  var slot = findImageSlot(imageWrap, false);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  var fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (var i = 0; i < fills.length; i++) {
    if (fills[i].type === 'IMAGE') {
      return (fills[i] as ImagePaint).imageHash;
    }
  }
  return null;
}

/**
 * Best-effort detectie van de image-slot binnen een card.
 * Retourneert de huidige ImagePaint-hash wanneer de slot een IMAGE-fill
 * draagt, null wanneer de slot aanwezig is maar leeg, of undefined
 * wanneer de card geen slot heeft (de UI verbergt dan de upload-knop).
 * Slot-detectie via de shared findImageSlot (editors/_shared/node-finders.ts).
 */
function readCardVisualHash(card: SceneNode): string | null | undefined {
  const slot = findImageSlot(card, false);
  if (slot === null) return undefined;
  if (!('fills' in slot)) return undefined;

  const fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed) return null;
  if (!Array.isArray(fills)) return null;
  for (const f of fills) {
    if (f.type === 'IMAGE') {
      return (f as ImagePaint).imageHash;
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
        debugLog(
          'card-scan',
          'backfilled iconIntended="' + currentSlotIcon + '" for ' + card.id,
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
export function readCardTypeVariant(card: InstanceNode): string | null {
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
 * Extraheert InstructorCard-instances binnen een wrapper-scope. De
 * `Instructor` VARIANT + opties komen uit de component-set (designer-
 * beheerd, picker-bron in de UI); de list-item-teksten zijn de
 * bewerkbare content. Async vanwege getMainComponentAsync (opties) —
 * cards worden parallel gelezen (Promise.all).
 */
async function extractInstructorCards(scope: InstanceNode): Promise<InstructorCardItem[]> {
  if (!('findAll' in scope)) return [];
  const found = scope.findAll(function (n: SceneNode) {
    return n.type === 'INSTANCE' && n.name === INSTRUCTOR_CARD_NODE_NAME;
  });
  const reads: Array<Promise<InstructorCardItem | null>> = [];
  for (let i = 0; i < found.length; i++) {
    const node = found[i];
    if (node.type !== 'INSTANCE') continue;
    const card = node as InstanceNode;
    reads.push(
      (async function (): Promise<InstructorCardItem | null> {
        const instructor = readInstructorVariant(card);
        if (instructor === null) return null; // geen Instructor-variant: skip
        const options = await readInstructorOptions(card);
        const textNodes = findInstructorListTexts(card);
        const items: string[] = [];
        for (let t = 0; t < textNodes.length; t++) {
          items.push(textNodes[t].characters);
        }
        return {
          cardNodeId: card.id,
          instructor: instructor,
          instructorOptions: options,
          items: items,
          visible: card.visible !== false,
        };
      })(),
    );
  }
  const resolved = await Promise.all(reads);
  const out: InstructorCardItem[] = [];
  for (let r = 0; r < resolved.length; r++) {
    const item = resolved[r];
    if (item !== null) out.push(item);
  }
  return out;
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
async function scanContent(slide: InstanceNode): Promise<ContentItems | null> {
  const cardWrap = findCardWrap(slide);
  const timelineWrap = findTimelineWrap(slide);

  // Retourneer null wanneer geen van alle wrappers aanwezig is.
  if (cardWrap === null && timelineWrap === null) return null;

  const cards: CardItem[] = [];
  const instructorCards: InstructorCardItem[] = [];
  const timelineItems: TimelineItem[] = [];

  // CardWrap: Cards zijn directe children (Slide Machine-pattern); ook hier
  // gebruiken we extractCards zodat de helper consistent en testbaar blijft.
  // InstructorCards (Instructor-variant van de Card-slot) leven in dezelfde
  // CardWrap maar heten 'InstructorCard' — aparte extractie.
  if (cardWrap !== null) {
    const fromCardWrap = extractCards(cardWrap, slide);
    for (let i = 0; i < fromCardWrap.length; i++) {
      cards.push(fromCardWrap[i]);
    }
    const instructorsFromWrap = await extractInstructorCards(cardWrap);
    for (let k = 0; k < instructorsFromWrap.length; k++) {
      instructorCards.push(instructorsFromWrap[k]);
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
    debugLog('sandbox', 'timelineWrap scan', {
      slideId: slide.id,
      cards: fromTimeline.length,
      copyWrapItems: cwItems.length,
    });
  }

  if (cards.length === 0 && instructorCards.length === 0 && timelineItems.length === 0) {
    return null;
  }

  // `cardWrapId` blijft semantisch gebonden aan CardWrap wanneer aanwezig;
  // bij slide-met-alleen-TimelineWrap vallen we terug op de TimelineWrap-id.
  var wrapId: string;
  if (cardWrap !== null) {
    wrapId = cardWrap.id;
  } else if (timelineWrap !== null) {
    wrapId = (timelineWrap as InstanceNode).id;
  } else {
    wrapId = '';
  }

  return {
    cardWrapId: wrapId,
    cards: cards,
    instructorCards: instructorCards,
    timelineItems: timelineItems,
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
// Module-level: last-sent imageHash per imageWrapId — voorkomt re-posts op
// ongerelateerde documentchanges. Gedeeld met de upload-image handler in code.ts.
export var lastSentPreviewHash: Map<string, string> = new Map();

export async function postInitialSlidePreviews(slide: InstanceNode, scan: SlideScan): Promise<void> {
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
            const slot = findImageSlot(wrapNode as InstanceNode, true);
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
          const slot = findImageSlot(cardNode as InstanceNode, false);
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

export async function scanSlide(slide: InstanceNode): Promise<SlideScan> {
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
  const content = await scanContent(slide);
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
export async function refreshTablesOnSlide(slide: InstanceNode): Promise<void> {
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



