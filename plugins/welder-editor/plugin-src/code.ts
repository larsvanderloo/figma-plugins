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
import {
  findSlidesOnPage,
  slideSummary,
  findCopyWrap,
  findBadge,
  findImageWrap,
  findCardWrap,
  findChartWrap,
  findTableWrap,
  findTableSlot,
  findTimelineWrap,
  findJourneyWrap,
  findJourneySlot,
  isSlide,
  isEffectivelyVisible,
} from './slide-machine';
import {
  applyTitleDescription,
  TitleDescriptionPayload,
} from './editors/general/title-description';
import { applyBadge, BadgePayload } from './editors/general/badge';
import { applyImage, findImageSlot } from './editors/general/image';
import { applyCard, applyCardVisual } from './editors/content/card';
import { normalizeIconKey, LUCIDE_SLUG_RE, primeIconCache } from './editors/shared/icon-swap';
import { renderChart, replaceChartContent } from './editors/chart/renderer';
import { applyTable, scanTableSlot } from './editors/table/renderer';
import { applyJourney, scanJourneySlot } from './editors/journey/renderer';
import { importCSV } from './editors/table/csv';
import { loadAllFontsForNode, setTextCharactersSafe } from './editors/_shared/fonts';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from './editors/_shared/accent-vars';
import type {
  SlideSummary,
  GeneralSections,
  ThemeMode,
  ContentItems,
  GraphItems,
  CardItem,
  TimelineItem,
  ChartData,
  TableWrapModel,
  JourneyWrapModel,
  UIToPluginMessage,
  PluginToUIMessage,
} from './types';

// ============================================================
// Bootstrap
// ============================================================

figma.showUI(uiHtml, { width: 520, height: 760, themeColors: true });

// ============================================================
// Accent (Text Dimmer) — library-variable helpers (spec §13 T30)
//
// T34.2: `loadAccentVars`, `resolveColor`, `TEXT_KEY`, `TEXT_DIMMER_KEY`,
// `TEXT_DIMMER_RGB` zijn verhuisd naar `editors/_shared/accent-vars.ts`
// zodat zowel deze accent-range-writer (T28.2 heading-dim) als de
// Slot-based table-renderer (T34.2) dezelfde single-source-of-truth
// gebruiken.
// ============================================================

const DIMMER_HEX_TOLERANCE = 0.01;

/**
 * True wanneer een fill een SOLID-paint is bound aan de gegeven variable-id,
 * óf raw SOLID met een kleur die ≈ #ffc78f matcht (binnen tolerance).
 * Dekt beide read-gevallen: variable-bound accent + raw-hex accent
 * (migreert bij eerste write naar variable-binding).
 */
function isDimmedFill(fill: Paint, dimmerId: string | null): boolean {
  if (fill.type !== 'SOLID') return false;
  const solid = fill as SolidPaint;
  if (dimmerId !== null && solid.boundVariables !== undefined && solid.boundVariables !== null) {
    const bound = solid.boundVariables.color;
    if (bound !== undefined && bound !== null && bound.id === dimmerId) {
      return true;
    }
  }
  const c = solid.color;
  if (
    Math.abs(c.r - TEXT_DIMMER_RGB.r) <= DIMMER_HEX_TOLERANCE &&
    Math.abs(c.g - TEXT_DIMMER_RGB.g) <= DIMMER_HEX_TOLERANCE &&
    Math.abs(c.b - TEXT_DIMMER_RGB.b) <= DIMMER_HEX_TOLERANCE
  ) {
    return true;
  }
  return false;
}

/**
 * Leest dim-ranges van een TextNode via `getStyledTextSegments`.
 *
 * - `null` → library-variables niet bereikbaar (UI verbergt het accent-blok).
 * - `[]`   → library OK maar geen dim-range aanwezig.
 * - gevuld → aaneengesloten dim-segmenten samengevoegd tot canonical ranges.
 */
async function readDimRanges(node: TextNode): Promise<Array<[number, number]> | null> {
  const vars = await loadAccentVars();
  if (vars.text === null && vars.dimmer === null) {
    return null;
  }
  const dimmerId = vars.dimmer !== null ? vars.dimmer.id : null;
  const segments = node.getStyledTextSegments(['fills']);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const fills = seg.fills;
    if (!Array.isArray(fills) || fills.length === 0) continue;
    let dimmed = false;
    for (let j = 0; j < fills.length; j++) {
      if (isDimmedFill(fills[j], dimmerId)) {
        dimmed = true;
        break;
      }
    }
    if (!dimmed) continue;
    const last = ranges.length > 0 ? ranges[ranges.length - 1] : null;
    if (last !== null && last[1] === seg.start) {
      last[1] = seg.end;
    } else {
      ranges.push([seg.start, seg.end]);
    }
  }
  return ranges;
}

/**
 * Past accent-ranges toe op een text-node: dim-fill op `dimRanges`,
 * text-fill op het complement. Characters blijven ongemoeid.
 * T28.2-patroon: all-fonts-preflight, resolveForConsumer-pre-resolve,
 * setBoundVariableForPaint, visible-toggle render-cache-flush.
 */
async function applyAccentRanges(
  node: TextNode,
  dimRanges: Array<[number, number]>,
): Promise<void> {
  const vars = await loadAccentVars();
  if (vars.text === null || vars.dimmer === null) {
    console.log('[welder-slide-editor] applyAccentRanges skipped — library vars not available.');
    return;
  }
  await loadAllFontsForNode(node);

  const textColor = resolveColor(vars.text, node, { r: 1, g: 0.957, b: 0.918 });
  const dimColor = resolveColor(vars.dimmer, node, {
    r: TEXT_DIMMER_RGB.r,
    g: TEXT_DIMMER_RGB.g,
    b: TEXT_DIMMER_RGB.b,
  });

  const textFill = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: textColor },
    'color',
    vars.text,
  );
  const dimFill = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: dimColor },
    'color',
    vars.dimmer,
  );

  const len = node.characters.length;
  if (len === 0) return;

  try {
    node.setRangeFills(0, len, [textFill]);
    for (let i = 0; i < dimRanges.length; i++) {
      const r = dimRanges[i];
      const start = Math.max(0, r[0]);
      const end = Math.min(len, r[1]);
      if (end <= start) continue;
      node.setRangeFills(start, end, [dimFill]);
    }
  } catch (err: unknown) {
    console.log('[welder-slide-editor] setRangeFills failed:', err);
  }

  // T28.2 belt-and-suspenders render-cache-flush.
  try {
    const prev = node.visible;
    node.visible = !prev;
    node.visible = prev;
  } catch (err: unknown) {
    console.log('[welder-slide-editor] visible-toggle flush failed:', err);
  }
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
  if (!('findChild' in badge)) return '';
  const wrapper = badge.findChild((n: SceneNode) => n.name === 'icon_wrapper');
  if (wrapper === null || !('children' in wrapper)) return '';
  const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
  for (let i = 0; i < wrapperNode.children.length; i++) {
    const child = wrapperNode.children[i];
    if (child.type === 'INSTANCE') {
      return normalizeIconKey(child.name);
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
  // Strategy A: directe INSTANCE-children
  if ('children' in card) {
    const children = (card as FrameNode | GroupNode | InstanceNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type !== 'INSTANCE') continue;
      const normalized = normalizeIconKey(child.name);
      if (LUCIDE_SLUG_RE.test(normalized)) {
        return isEffectivelyVisible(child, slide) ? normalized : null;
      }
    }
  }

  // Strategy B: icon_wrapper → eerste INSTANCE-kind
  if ('findChild' in card) {
    const wrapper = (card as InstanceNode).findChild((n: SceneNode) => n.name === 'icon_wrapper');
    if (wrapper !== null && 'children' in wrapper) {
      const wrapperNode = wrapper as FrameNode | GroupNode | InstanceNode;
      for (let i = 0; i < wrapperNode.children.length; i++) {
        const child = wrapperNode.children[i];
        if (child.type === 'INSTANCE') {
          return isEffectivelyVisible(child, slide) ? normalizeIconKey(child.name) : null;
        }
      }
    }
  }

  // Strategy C: findOne descendant — eerste INSTANCE met Lucide-slug-naam
  if ('findOne' in card) {
    const found = (card as InstanceNode).findOne((n: SceneNode) => {
      if (n.type !== 'INSTANCE') return false;
      return LUCIDE_SLUG_RE.test(normalizeIconKey(n.name));
    });
    if (found !== null && found.type === 'INSTANCE') {
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

async function scanGeneral(slide: InstanceNode): Promise<GeneralSections | null> {
  const copyWrap = findCopyWrap(slide);
  const badge = findBadge(slide);
  const imageWrap = findImageWrap(slide);

  // Secties opbouwen; elke null wanneer de wrapper niet bestaat.
  let titleDescription: GeneralSections['titleDescription'] = null;
  if (copyWrap !== null) {
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    const paragraphNode = findVisibleTextNodeByName(copyWrap, 'Paragraph', slide);
    const heading =
      headingNode !== null ? headingNode.characters : readTextByName(copyWrap, 'Heading') || '';
    const paragraph = paragraphNode !== null ? paragraphNode.characters : null;

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

    titleDescription = {
      copyWrapId: copyWrap.id,
      heading: heading,
      paragraph: paragraph,
      headingDim: headingDim,
    };
  }

  const badgeSection =
    badge === null
      ? null
      : {
          badgeNodeId: badge.id,
          label: readTextByName(badge, 'Label') || badge.name,
          icon: readBadgeIcon(badge),
        };

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
  const result: VariableCollection[] = [];
  for (const id of ids) {
    try {
      const c = await figma.variables.getVariableCollectionByIdAsync(id);
      if (c !== null && c.name === 'Theme') result.push(c);
    } catch (err: unknown) {
      // ignore — collection may have been removed
    }
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
  const colorVars: Variable[] = [];
  for (let i = 0; i < collection.variableIds.length && colorVars.length < 2; i++) {
    const v = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (v !== null && v.resolvedType === 'COLOR') colorVars.push(v);
  }

  const modes: ThemeMode[] = [];
  for (let i = 0; i < collection.modes.length; i++) {
    const m = collection.modes[i];
    const primary =
      colorVars.length >= 1
        ? await resolveColorAsHex(colorVars[0].valuesByMode[m.modeId], m.modeId)
        : null;
    const secondary =
      colorVars.length >= 2
        ? await resolveColorAsHex(colorVars[1].valuesByMode[m.modeId], m.modeId)
        : null;
    modes.push({
      id: m.modeId,
      name: m.name,
      swatchPrimary: primary,
      swatchSecondary: secondary,
    });
  }

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

    items.push({
      cardNodeId: card.id,
      heading: heading,
      paragraph: readTextByName(card, 'Paragraph') || '',
      // Icon picker shows iff the variant carries an icon. On unknown
      // variants we fall back to the scan (cardType === null).
      icon: isImageType ? null : readCardIcon(card, slide),
      // Image picker shows iff the variant carries an image. On
      // unknown variants we fall back to the scan.
      visualHash: isIconType ? undefined : readCardVisualHash(card),
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

/**
 * Leest persisterende model-data uit `node.getPluginData('model')` (spec §6).
 * Retourneert null wanneer de wrapper nog geen pluginData draagt (nieuwe
 * instance) of wanneer de JSON corrupt is — editor valt dan terug op zijn
 * DEFAULT_*_DATA uit {chart,table}-core/constants.
 *
 * Werkt voor zowel ChartWrap als TableWrap (zelfde pluginData-conventie).
 */
function readModelData(wrap: InstanceNode): unknown | null {
  const raw = wrap.getPluginData('model');
  if (raw === '' || raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function scanGraphs(slide: InstanceNode): GraphItems | null {
  // v0.1.0 wrapper-finders geven de eerste hit; in de praktijk heeft een
  // Slide-template precies één ChartWrap en één TableWrap. De instance-
  // selector in GraphsPanel kan hier later groeien wanneer we meerdere
  // charts per slide toestaan (out of scope v0.1.0).
  const chartWrap = findChartWrap(slide);
  const tableWrap = findTableWrap(slide);

  const instances: GraphItems['instances'] = [];

  if (chartWrap !== null) {
    instances.push({
      nodeId: chartWrap.id,
      type: 'chart',
      label: 'Chart — ' + chartWrap.name,
      chartData: readModelData(chartWrap) as ChartData | null,
    });
  }
  if (tableWrap !== null) {
    // T34.2: lees nu via findTableSlot + scanTableSlot; `tableData` (legacy)
    // blijft null zodat de UI-stub niet crasht. T34.3 leest `tableModel`.
    const slot = findTableSlot(slide);
    const tableModel: TableWrapModel | null = slot !== null ? scanTableSlot(slot) : null;
    // Wanneer de TableWrap een Slot heeft, gebruiken we het Slot-id als
    // nodeId zodat `update-table` en `import-csv` direct naar de Slot kunnen.
    const nodeId = slot !== null ? slot.id : tableWrap.id;
    instances.push({
      nodeId: nodeId,
      type: 'table',
      label: 'Table — ' + tableWrap.name,
      tableData: null,
      tableModel: tableModel,
    });
  }

  if (instances.length === 0) return null;

  return {
    instances: instances,
    selectedGraphId: instances[0].nodeId,
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
    const cards = scan.content.cards;
    for (let i = 0; i < cards.length; i++) {
      const ci = cards[i];
      if (typeof ci.visualHash !== 'string') continue;
      try {
        const cardNode = await figma.getNodeByIdAsync(ci.cardNodeId);
        if (cardNode === null || cardNode.type !== 'INSTANCE') continue;
        const slot = findCardVisualSlot(cardNode as InstanceNode);
        if (slot === null) continue;
        const fills = (slot as GeometryMixin).fills;
        if (fills === figma.mixed || !Array.isArray(fills)) continue;
        let imageHash: string | null = null;
        for (let f = 0; f < fills.length; f++) {
          if (fills[f].type === 'IMAGE') {
            imageHash = (fills[f] as ImagePaint).imageHash;
            break;
          }
        }
        if (imageHash === null) continue;
        const img = figma.getImageByHash(imageHash);
        if (img === null) continue;
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
    }
  }
}

async function scanSlide(slide: InstanceNode): Promise<SlideScan> {
  const visibilityChanged = await normalizeCopyWrapVisibility(slide);
  if (visibilityChanged) {
    await refreshTablesOnSlide(slide);
  }
  const general = await scanGeneral(slide);
  return {
    general: general,
    content: scanContent(slide),
    graphs: scanGraphs(slide),
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

function buildSlideList(): { summaries: SlideSummary[]; nodes: InstanceNode[] } {
  const nodes = findSlidesOnPage();
  const summaries: SlideSummary[] = [];
  for (let i = 0; i < nodes.length; i++) {
    summaries.push(slideSummary(nodes[i], i + 1));
  }
  return { summaries: summaries, nodes: nodes };
}

function findSlideById(id: string): InstanceNode | null {
  const nodes = findSlidesOnPage();
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
  figma.ui.postMessage(msg);
}

// ============================================================
// Live slide-list refresh — debounced postSlideList
// ============================================================

/**
 * Debounce-handle voor pending slide-list-updates. Wanneer meerdere
 * documentchanges binnen 200ms binnenkomen (bv. bulk-delete of een
 * snelle add+rename), coalesce we naar één buildSlideList-call.
 *
 * Type `number` i.p.v. `ReturnType<typeof setTimeout>` om mismatches
 * tussen node-/dom-typings in de Figma-sandbox te vermijden — de eerdere
 * crash-poging (commit 35298c4) leed hier mogelijk onder.
 */
let pendingSlideListUpdate: number | null = null;

/**
 * Signature van de laatst geposte slide-list. Dedupliceert updates
 * wanneer burst-events snel achter elkaar binnenkomen.
 */
let lastSlideListSignature: string = '';

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

function postSlideContent(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideContentUpdate !== null) {
    clearTimeout(pendingSlideContentUpdate);
  }
  pendingSlideContentUpdate = setTimeout(() => {
    pendingSlideContentUpdate = null;
    if (lastDisplayedSlideId === null) return;
    void (async function () {
      try {
        const slide = findSlideById(lastDisplayedSlideId!);
        if (slide === null) return;
        const scan = await scanSlide(slide);
        // Cheap signature: stringify the general/content/graphs payload.
        // If it matches the last sent, skip the post (avoids spamming
        // the bridge on documentchanges that didn't actually change
        // editable state — e.g. selection-only events).
        const sig = JSON.stringify({
          g: scan.general,
          c: scan.content,
          h: scan.graphs,
        });
        if (sig === lastSentSlideContentSignature) return;
        lastSentSlideContentSignature = sig;
        postToUI({
          type: 'slide-loaded',
          slideId: slide.id,
          general: scan.general,
          content: scan.content,
          graphs: scan.graphs,
        });
      } catch (err: unknown) {
        console.log('[welder-slide-editor] postSlideContent failed:', err);
      }
    })();
  }, 200) as unknown as number;
}

/**
 * Bouwt een stabiele string die alleen wijzigt als de slide-list
 * inhoudelijk veranderde. Combineert id + number + name + isSkipped —
 * wijziging van één van deze triggert een refresh richting de UI.
 *
 * `isSkipped` hoort in de signature omdat Figma's native skip-toggle
 * (oogje in de left-panel thumbnail) via `PROPERTY_CHANGE` binnenkomt;
 * zonder deze component zou de signature ongewijzigd blijven en de
 * UI-sync met `SlideNode.isSkippedSlide` verloren gaan.
 */
function slideListSignature(summaries: SlideSummary[]): string {
  const parts: string[] = [];
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    parts.push(s.id + '|' + String(s.number) + '|' + s.name + '|' + String(s.isSkipped));
  }
  return String(summaries.length) + '#' + parts.join(';');
}

function postSlideList(): void {
  if (pendingSlideListUpdate !== null) {
    clearTimeout(pendingSlideListUpdate);
  }
  pendingSlideListUpdate = setTimeout(() => {
    pendingSlideListUpdate = null;
    try {
      const list = buildSlideList();
      const sig = slideListSignature(list.summaries);
      // Skip if nothing changed since last post — voorkomt redundante updates
      // bij burst-events (bv. bulk-delete of snelle rename-sequenties).
      if (sig === lastSlideListSignature) return;
      lastSlideListSignature = sig;
      postToUI({ type: 'page-changed', slides: list.summaries });
    } catch (err: unknown) {
      console.log('[welder-slide-editor] postSlideList failed:', err);
    }
  }, 200) as unknown as number;
}

// ============================================================
// Bridge-message-loop (spec §5)
// ============================================================

async function handleMessage(msg: UIToPluginMessage): Promise<void> {
  if (msg.type === 'ui-ready') {
    const list = buildSlideList();
    // Seed de dedup-signature zodat de eerste poll-tick na init geen
    // duplicaat `page-changed` post met dezelfde content als `init`.
    lastSlideListSignature = slideListSignature(list.summaries);
    const initialSlideId = list.summaries.length > 0 ? list.summaries[0].id : null;

    // Pre-scan the initial slide so init + slide-loaded can be posted
    // back-to-back. The iframe stays on its splash screen until init
    // arrives, so awaiting the scan here moves the "first slide switch"
    // latency into the splash window. Scan failures fall through; the
    // iframe will hide the splash on init and the first user pick re-
    // does the work.
    let initialScan: SlideScan | null = null;
    let initialSlide: InstanceNode | null = null;
    if (initialSlideId !== null) {
      initialSlide = findSlideById(initialSlideId);
      if (initialSlide !== null) {
        try {
          initialScan = await scanSlide(initialSlide);
          lastDisplayedSlideId = initialSlideId;
          lastSentSlideContentSignature = JSON.stringify({
            g: initialScan.general,
            c: initialScan.content,
            h: initialScan.graphs,
          });
        } catch (err: unknown) {
          console.log('[welder-slide-editor] initial scanSlide failed:', err);
          initialScan = null;
        }
      }
    }

    postToUI({
      type: 'init',
      slides: list.summaries,
      initialSlideId: initialSlideId,
    });
    if (initialSlide !== null && initialScan !== null) {
      postToUI({
        type: 'slide-loaded',
        slideId: initialSlide.id,
        general: initialScan.general,
        content: initialScan.content,
        graphs: initialScan.graphs,
      });
      // Fire-and-forget image-preview + card-visual-preview for the
      // initial slide — same pattern as the pick-slide handler. Don't
      // block init on these; the iframe renders a fallback until they
      // arrive.
      void postInitialSlidePreviews(initialSlide, initialScan);
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

  if (msg.type === 'refresh-slides') {
    // Iframe regained focus — re-scan and post the current list.
    // Closes the gap during the loadAllPagesAsync window when
    // `documentchange` is not yet registered.
    postSlideList();
    return;
  }

  if (msg.type === 'pick-slide') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    // Track which slide the iframe is showing so documentchange-driven
    // mutations (native Cmd+Z, externally-triggered edits) can re-emit
    // slide-loaded for the right target via postSlideContent.
    lastDisplayedSlideId = msg.slideId;
    lastSentSlideContentSignature = '';
    figma.viewport.scrollAndZoomIntoView([slide]);
    const scan = await scanSlide(slide);
    postToUI({
      type: 'slide-loaded',
      slideId: slide.id,
      general: scan.general,
      content: scan.content,
      graphs: scan.graphs,
    });

    // Image-preview bytes — fire-and-forget; post PNG/JPG bytes for the
    // current ImagePaint so the UI can render a live preview. Geen dedup
    // meer op pick-slide: de UI gooit preview-bytes weg bij pickSlide
    // (general → null), dus bij terug-navigatie naar een eerder bezochte
    // slide moet main ze opnieuw sturen. lastSentPreviewHash wordt nog
    // steeds gevuld zodat upload-image de dedup-cache kan bijwerken.
    // Async IIFE — fire-and-forget; faalt stil.
    (async function () {
      if (scan.general === null) return;
      if (scan.general.image === null) return;
      if (scan.general.image.imageHash === null) return;
      var imageWrapId = scan.general.image.imageWrapId;
      var imageHash = scan.general.image.imageHash;
      var img = figma.getImageByHash(imageHash);
      if (img === null) return;

      // Haal slot-dimensies op zodat de UI-preview dezelfde aspect-ratio
      // kan tonen als het Figma image-slot (T28a-fix).
      var fillW = 0;
      var fillH = 0;
      try {
        var wrapNode = await figma.getNodeByIdAsync(imageWrapId);
        if (wrapNode !== null && wrapNode.type === 'INSTANCE') {
          var slot = findImageSlot(wrapNode as InstanceNode);
          if (slot !== null && 'width' in slot && 'height' in slot) {
            var slotW = (slot as LayoutMixin).width;
            var slotH = (slot as LayoutMixin).height;
            if (slotW > 0 && slotH > 0) {
              fillW = slotW;
              fillH = slotH;
            }
          }
        }
      } catch (_e) {
        // Fallback: laat fillW/fillH op 0 staan; UI toont h-36 fallback.
      }

      var bytes: Uint8Array;
      try {
        bytes = await img.getBytesAsync();
      } catch (_e) {
        return;
      }
      postToUI({
        type: 'image-preview',
        imageWrapId: imageWrapId,
        bytes: bytes,
        fillW: fillW,
        fillH: fillH,
      });
      lastSentPreviewHash.set(imageWrapId, imageHash);
    })().catch(function (_e) {});

    // Card visual previews — same fire-and-forget pattern as the slide-
    // level image-preview above, but per Type=Image / Type=User card.
    // The iframe's CardItemEditor renders the bytes as a thumbnail so
    // the user sees the current visual instead of just a "Visual
    // ingesteld"-status string.
    (async function () {
      if (scan.content === null) return;
      const cards = scan.content.cards;
      for (let i = 0; i < cards.length; i++) {
        const ci = cards[i];
        if (typeof ci.visualHash !== 'string') continue; // null or undefined → no visual
        try {
          const cardNode = await figma.getNodeByIdAsync(ci.cardNodeId);
          if (cardNode === null || cardNode.type !== 'INSTANCE') continue;
          const slot = findCardVisualSlot(cardNode as InstanceNode);
          if (slot === null) continue;
          const fills = (slot as GeometryMixin).fills;
          if (fills === figma.mixed || !Array.isArray(fills)) continue;
          let imageHash: string | null = null;
          for (let f = 0; f < fills.length; f++) {
            if (fills[f].type === 'IMAGE') {
              imageHash = (fills[f] as ImagePaint).imageHash;
              break;
            }
          }
          if (imageHash === null) continue;
          const img = figma.getImageByHash(imageHash);
          if (img === null) continue;
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
          // Per-card failure is silent — other cards still post.
        }
      }
    })().catch(function (_e) {});

    // Prime icon cache in background using first card/badge found.
    // Async IIFE — fire-and-forget; errors caught so UI never gets stuck.
    (async function () {
      var cardNodeId: string | null = null;
      if (scan.content !== null && scan.content.cards.length > 0) {
        cardNodeId = scan.content.cards[0].cardNodeId;
      }
      var targetNode: InstanceNode | null = null;
      if (cardNodeId !== null) {
        try {
          var n = await figma.getNodeByIdAsync(cardNodeId);
          if (n !== null && n.type === 'INSTANCE') {
            targetNode = n as InstanceNode;
          }
        } catch (e) {
          /* node not found — skip */
        }
      }
      if (targetNode !== null) {
        primeIconCache(targetNode)
          .then(function () {
            postToUI({ type: 'icons-ready' });
          })
          .catch(function () {
            postToUI({ type: 'icons-ready' });
          });
      } else {
        // No suitable node — send icons-ready immediately so UI isn't stuck.
        postToUI({ type: 'icons-ready' });
      }
    })();

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
      await applyTitleDescription(slide, payload);
      await refreshTablesOnSlide(slide); // T39.3: re-render tables na CopyWrap-edit
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
      await applyBadge(slide, payload);
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
      postToUI({ type: 'target-updated', ok: false, error: 'Slide not found: ' + msg.slideId });
      return;
    }
    const copyWrap = findCopyWrap(slide);
    if (copyWrap === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'CopyWrap not found on slide: ' + msg.slideId,
      });
      return;
    }
    const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
    if (headingNode === null) {
      postToUI({ type: 'target-updated', ok: false, error: 'Heading node not found' });
      return;
    }
    figma.commitUndo();
    await applyAccentRanges(headingNode, msg.dimRanges);
    await refreshTablesOnSlide(slide); // T39.3: heading-fill mutatie kan line-wrap reflowen
    postToUI({ type: 'target-updated', ok: true, targetId: headingNode.id });
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
    await applyCard(slide, {
      cardNodeId: msg.cardNodeId,
      heading: msg.payload.heading,
      paragraph: msg.payload.paragraph,
      icon: msg.payload.icon,
    });
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.cardNodeId,
    });
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

  if (msg.type === 'update-graph') {
    // T12: persisteer ChartData op de ChartWrap (`pluginData.model` +
    // `kind: 'welder-chartwrap'`), plus een relaunch-knop zodat de user
    // de editor direct kan heropenen vanaf de canvas-selection.
    //
    // Canvas-rendering volgt in T13 (editors/chart/renderer.ts); voor
    // v0.1.0-T12 volstaat persistentie + ACK zodat de UI een save-state
    // kan tonen en T13 alleen nog de render-call hoeft toe te voegen.
    const target = await figma.getNodeByIdAsync(msg.chartWrapId);
    if (target === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'ChartWrap not found: ' + msg.chartWrapId,
      });
      return;
    }
    if (target.type !== 'INSTANCE' && target.type !== 'FRAME') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Target is not a wrapper node: ' + msg.chartWrapId,
      });
      return;
    }
    figma.commitUndo();
    const scene = target as SceneNode;
    scene.setPluginData('kind', 'welder-chartwrap');
    scene.setPluginData('v', '1');
    scene.setPluginData('model', JSON.stringify(msg.data));
    if ('setRelaunchData' in scene) {
      (
        scene as SceneNode & { setRelaunchData: (data: { [k: string]: string }) => void }
      ).setRelaunchData({
        open: 'Bewerk met Slide Editor',
      });
    }

    // T13: render een vers chart-frame en vervang ChartWrap's content.
    // Fallback-pad: wanneer de wrapper geen appendChild toestaat (locked
    // library-instance), plaatsen we het frame naast de wrapper in zijn
    // parent op dezelfde x/y — de user kan dan handmatig herplaatsen.
    const fresh = await renderChart(msg.data);
    const swapped = replaceChartContent(scene, fresh);
    if (!swapped) {
      // Remove any previously-placed fallback frame to prevent accumulation.
      const prevId = scene.getPluginData('fallbackFrameId');
      if (prevId !== '' && prevId !== null) {
        const prevNode = await figma.getNodeByIdAsync(prevId);
        if (prevNode !== null && 'remove' in prevNode) {
          try {
            (prevNode as SceneNode).remove();
          } catch (_e) {}
        }
      }
      // T33: in Slide Machine zit de wrapper-parent óók binnen een Slide-
      // INSTANCE. Een kale `parentFrame.appendChild(fresh)` throws dan
      // `Cannot move node. New parent is an instance or is inside of an
      // instance` en crasht de hele handler. We proberen eerst de parent,
      // maar vangen de failure op en vallen door naar currentPage.
      const parent = 'parent' in scene ? (scene as SceneNode).parent : null;
      let placed = false;
      if (parent !== null && parent !== undefined && 'appendChild' in parent) {
        const parentFrame = parent as FrameNode | PageNode | GroupNode;
        if ('x' in scene && 'y' in scene) {
          fresh.x = (scene as LayoutMixin).x;
          fresh.y = (scene as LayoutMixin).y;
        }
        try {
          parentFrame.appendChild(fresh);
          placed = true;
        } catch (_err) {
          // Parent zit ook binnen een INSTANCE — fall through naar
          // currentPage-drop hieronder.
        }
      }
      if (!placed) {
        // Laatste redmiddel: op de current page droppen zodat het frame
        // niet gewoon verdwijnt. User kan het handmatig naar de goede
        // plek slepen.
        try {
          figma.currentPage.appendChild(fresh);
        } catch (_err) {
          // Zeer onwaarschijnlijk (bv. tijdens page-switch), maar we
          // kiezen liever een stille log dan een crash-toast.
          console.log('[welder-slide-editor] could not place chart fallback frame');
        }
      }
      // Track fresh frame so next render can clean it up.
      try {
        scene.setPluginData('fallbackFrameId', fresh.id);
      } catch (_e) {}
    }

    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.chartWrapId,
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
    await applyJourney(journeySlotNode as SlotNode, msg.desired);
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
    try {
      for (let i = 0; i < collections.length; i++) {
        const c = collections[i];
        if (msg.modeId === null) {
          // Clear: slide inherits the page-level mode for this collection.
          themeSlide.setExplicitVariableModeForCollection(c, null);
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
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    var skipParent: BaseNode | null = skipSlide.parent;
    if (skipParent === null || skipParent.type !== 'SLIDE') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide has no SlideNode parent (requires Figma Slides editor)',
      });
      return;
    }
    figma.commitUndo();
    (skipParent as SlideNode).isSkippedSlide = msg.skipped;
    // Re-build slide-list zodat elke SlideSummary een verse `isSkipped` meekrijgt.
    // `page-changed` draagt de volledige lijst en gaat ongededuped uit — we
    // resetten de signature zodat postSlideList niet als duplicaat-skip wordt afgedaan.
    lastSlideListSignature = '';
    var refreshed = buildSlideList();
    lastSlideListSignature = slideListSignature(refreshed.summaries);
    postToUI({ type: 'page-changed', slides: refreshed.summaries });
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: skipSlide.id,
    });
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
            slideId: undoSlide.id,
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
    // Resolve the export target. Single slide → the SLIDE node by id.
    // Presentation → currentPage, which on a Figma Slides file
    // produces a multi-page PDF (or one wide PNG).
    let target: BaseNode | null = null;
    let baseName = '';
    if (msg.target === 'slide') {
      if (typeof msg.slideId !== 'string' || msg.slideId.length === 0) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'No slide selected to export.',
        });
        return;
      }
      const slide = findSlideById(msg.slideId);
      if (slide === null) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'Slide not found: ' + msg.slideId,
        });
        return;
      }
      target = slide;
      // Prefer the slide's heading text for the filename; fall back to
      // the SLIDE-parent node's name (Figma's user-visible slide name)
      // or "slide".
      const heading = readTextByName(slide, 'Heading');
      baseName = heading !== null && heading.length > 0 ? heading : slide.name;
      if (slide.parent !== null && slide.parent.type === 'SLIDE') {
        baseName = (slide.parent as SlideNode).name || baseName;
      }
    } else {
      target = figma.currentPage;
      baseName = figma.currentPage.name || 'presentation';
    }

    const ext = msg.format === 'PNG' ? '.png' : '.pdf';
    const filename = sanitizeBaseFilename(baseName) + ext;

    let bytes: Uint8Array;
    try {
      bytes = await (target as ExportMixin).exportAsync({ format: msg.format });
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
      target: msg.target,
      format: msg.format,
      bytes: bytes,
      filename: filename,
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
  (async function () {
    try {
      const slides = findSlidesOnPage();
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

  figma.ui.onmessage = (raw: unknown) => {
    const msg = raw as UIToPluginMessage;
    handleMessage(msg).catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err);
      figma.notify('Slide editor error: ' + text, { error: true });
      postToUI({ type: 'target-updated', ok: false, error: text });
    });
  };

  figma.on('currentpagechange', () => {
    try {
      postSlideList();
    } catch (err: unknown) {
      console.log('[welder-slide-editor] currentpagechange handler failed:', err);
    }
  });

  // documentchange-registratie: in dynamic-page mode vereist Figma dat
  // loadAllPagesAsync gedraaid heeft voordat we kunnen subscribe'n.
  // We doen die load in de achtergrond (non-blocking) zodat de plugin
  // direct openbaar is. De `refresh-slides`-handler hieronder vangt de
  // gap af tussen plugin-open en het moment dat documentchange live is
  // (typisch <1s op kleine docs, 10-30s op grote docs).
  figma
    .loadAllPagesAsync()
    .then(() => {
      try {
        figma.on('documentchange', (event: DocumentChangeEvent) => {
          try {
            const relevant = event.documentChanges.some((change) => {
              if (change.type === 'CREATE') return true;
              if (change.type === 'DELETE') return true;
              // Native skip-toggle in Figma's left-panel thumbnail muteert
              // SlideNode.isSkippedSlide → PROPERTY_CHANGE op het SLIDE-node.
              // Slide-rename komt ook binnen als PROPERTY_CHANGE op SLIDE.
              if (change.type === 'PROPERTY_CHANGE' && change.node.type === 'SLIDE') return true;
              // Picker-titel komt uit findSlideHeadingText (Heading-TEXT
              // binnen CopyWrap) — niet uit slide.name. Edits aan een
              // Heading-text-node moeten dus ook een refresh triggeren.
              // Een Welder-slide bevat meerdere TEXT-nodes met name
              // 'Heading' (CopyWrap + Card-instances + verborgen badge-
              // varianten); we filteren ze hier niet op ancestry omdat
              // postSlideList signature-dedup'd is — over-trigger is gratis.
              if (
                change.type === 'PROPERTY_CHANGE' &&
                change.node.type === 'TEXT' &&
                change.node.name === 'Heading'
              ) {
                return true;
              }
              return false;
            });
            if (relevant) postSlideList();
            // postSlideContent runs on EVERY documentchange — including
            // INSTANCE PROPERTY_CHANGE (icon swaps via setProperties)
            // and other in-slide mutations that the slide-list filter
            // intentionally ignores. It's debounced (200ms) and signature-
            // deduped, so no-op events don't reach the bridge. This is
            // what catches native Cmd+Z and any external state change
            // that affects pickers in the currently-displayed slide.
            postSlideContent();
          } catch (err: unknown) {
            console.log('[welder-slide-editor] documentchange handler failed:', err);
          }
        });
      } catch (err: unknown) {
        console.log('[welder-slide-editor] documentchange registration failed:', err);
      }
    })
    .catch((err: unknown) => {
      console.log('[welder-slide-editor] loadAllPagesAsync failed:', err);
    });

  // Auto-follow: when user navigates slides in Figma (Slides navigator click
  // or selecting content in a slide in Design), signal the UI to switch.
  // Full try/catch — crashing this would re-introduce the earlier "plugin
  // opent niet meer" bug; silent skip is fine since polling keeps list fresh.
  try {
    figma.on('selectionchange', () => {
      try {
        const focused = findFocusedWelderSlide();
        if (focused === null) return;
        postToUI({ type: 'slide-focused', slideId: focused.id });
      } catch (err: unknown) {
        console.log('[welder-slide-editor] selectionchange handler failed:', err);
      }
    });
  } catch (err: unknown) {
    console.log('[welder-slide-editor] selectionchange not available:', err);
  }

  figma.on('close', () => {
    // Cleanup hook — Figma ruimt listeners automatisch op. FIG-CLOSE-01.
    if (pendingSlideListUpdate !== null) {
      clearTimeout(pendingSlideListUpdate);
      pendingSlideListUpdate = null;
    }
  });
}

main().catch((err: unknown) => {
  const text = err instanceof Error ? err.message : String(err);
  figma.notify('Slide editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
