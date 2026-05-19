// ============================================================
// editors/journey/renderer.ts
//
// Slot-based journey-renderer voor JourneyWrap-instances (T45.2, v2).
//
// T45.2 — library-component-instances i.p.v. from-scratch FRAMEs.
// JourneyItem (file kAZqxj4nxpafYjB5FhfOru, node 477:52042) wordt
// via importComponentByKeyAsync geïmporteerd. Elke pill = één
// JourneyItem-instance. Icon-swap via trySwapViaInstanceProperty
// (Card-patroon). Label via loadAllFontsForNode + characters-write.
//
// Public API (signatures ongewijzigd t.o.v. T45):
//   - scanJourneySlot(slot)        → JourneyWrapModel (item-structuur)
//   - applyJourney(slot, desired)  → full-state PUT (clear + rebuild)
//
// Bootstrap-strategie A+C:
//   1. Scan figma.root voor bestaande JourneyItem-INSTANCE → key cachen.
//   2. Fallback: hardcoded JOURNEYITEM_KEY_FALLBACK (markeer voor update
//      bij library-recreate — zie T45.3 TODO hieronder).
//   Als geen key gevonden EN fallback mislukt: console.error + skip render.
//
// Container-layout (X.1 — absolute):
//   container.layoutMode = 'NONE', FIXED width × height.
//   Items gepositioneerd via absolute x/y.
//   Pill-breedte = (endCol - startCol + 1) / totalCols × contentWidth.
//   x = (startCol - 1) / totalCols × contentWidth + JOURNEY_CONTAINER_PADDING.
//   y = JOURNEY_CONTAINER_PADDING + i * (PILL_HEIGHT + PILL_GAP).
//
// Theme-binding: JourneyItem gebruikt library-variables intern;
// geen handmatige setBoundVariableForPaint nodig.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// FIG-FONT-01: loadAllFontsForNode vóór characters-write.
// FIG-GUARD-01: type-checks vóór property-access.
// FIG-TRAVERSE-01: bounded traversal (maxDepth=6).
// ============================================================

import type { JourneyWrapModel, JourneyItemModel, JourneyColumnModel } from '../../types';
import {
  JOURNEY_WIDTH,
  JOURNEY_POS_MIN_PCT,
  JOURNEY_POS_MAX_PCT,
  JOURNEY_POS_MIN_SPAN,
  JOURNEY_CONTAINER_PADDING,
  JOURNEY_DEFAULT_COLUMN_COUNT,
  JOURNEY_DEFAULT_COLUMN,
  JOURNEY_MIN_COLUMNS,
  JOURNEY_MAX_COLUMNS,
  JOURNEY_HEADER_HEIGHT,
  JOURNEY_HEADER_FONT_PX,
  JOURNEY_SUBHEADER_FONT_PX,
  JOURNEY_DIVIDER_WEIGHT,
} from '../../constants';
import { trySwapViaInstanceProperty, swapComponentByName } from '../_shared/icon-swap';
import { replaceIconViaSlot } from '../_shared/icon-slot';
import { loadAllFontsForNode } from '../_shared/fonts';

// -------------------------------------------------------------------
// T45.3 TODO: update JOURNEYITEM_KEY_FALLBACK wanneer de library
// opnieuw gepubliceerd wordt. Zoek de key via:
//   Figma → Edit → Copy link to component → node-id → haal component.key
//   op via figma.importComponentByKeyAsync of Figma Plugin Inspector.
// -------------------------------------------------------------------

/**
 * Hardcoded fallback-key voor de JourneyItem-component
 * (file kAZqxj4nxpafYjB5FhfOru, node 477:52042).
 *
 * WAARSCHUWING: Component-keys zijn stabiel zolang de library-component
 * niet verwijderd/vervangen wordt. Bij library-recreate: update deze
 * constante (T45.3).
 *
 * Om de key te vinden: plaats een JourneyItem op een slide, run
 * `figma.root.findOne(n => n.type === 'INSTANCE' && n.name === 'JourneyItem')`
 * in de Figma Plugin Inspector, dan `instance.mainComponent.key`.
 */
const JOURNEYITEM_KEY_FALLBACK = ''; // T45.3: vul in na eerste bootstrap-run

/** Module-level cache: de component-key van JourneyItem. */
let cachedJourneyItemKey: string | null = null;

/** Module-level component-node cache: vermijdt dubbele importComponentByKeyAsync. */
let cachedJourneyItemComp: ComponentNode | null = null;

// -------------------------------------------------------------------
// Layout-constanten (gebaseerd op JourneyItem default-size 858×90)
// -------------------------------------------------------------------

/** Hoogte van een JourneyItem-instance in Figma-pixels. */
const PILL_HEIGHT = 90;

/** Verticale gap tussen pills. */
const PILL_GAP = 12;

// -------------------------------------------------------------------
// Bootstrap — zoek/cache JourneyItem-component-key (Strategie A+C)
// -------------------------------------------------------------------

/**
 * Zoekt de JourneyItem-component-key via:
 *   1. Module-level cache (hergebruik).
 *   2. figma.root.findOne — scan document voor bestaande JourneyItem-INSTANCE.
 *   3. Hardcoded JOURNEYITEM_KEY_FALLBACK (als die niet leeg is).
 *
 * Retourneert de key-string of null als geen strategie slaagde.
 */
async function resolveJourneyItemKey(): Promise<string | null> {
  // Stap 1: al gecached.
  if (cachedJourneyItemKey !== null && cachedJourneyItemKey.length > 0) {
    return cachedJourneyItemKey;
  }

  // Stap 2: scan huidige page voor bestaande JourneyItem-INSTANCE.
  // T45.2.1: figma.root.findOne faalt onder documentAccess='dynamic-page'
  //          zonder figma.loadAllPagesAsync(). currentPage is loaded-by-default.
  // T45.2.2: permissieve match — name kan "JourneyItem", "JourneyItem 1",
  //          "JourneyItem (Copy)" etc. zijn na paste/duplicate. Fallback
  //          op mainComponent.name voor edge-cases (renamed instances).
  console.log('[journey-renderer] bootstrap: scanning currentPage for JourneyItem...');
  var allInstances = figma.currentPage.findAll(function (n: BaseNode): boolean {
    return n.type === 'INSTANCE';
  });
  console.log(
    '[journey-renderer] bootstrap: found ' +
      String(allInstances.length) +
      ' instances on currentPage',
  );

  // Pass 1: snelle naam-match (startsWith).
  for (var i = 0; i < allInstances.length; i++) {
    var inst1 = allInstances[i] as InstanceNode;
    if (inst1.name === 'JourneyItem' || inst1.name.indexOf('JourneyItem') === 0) {
      var main1: ComponentNode | null = null;
      try {
        main1 = await inst1.getMainComponentAsync();
      } catch (e) {
        console.log('[journey-renderer] getMainComponentAsync failed: ' + String(e));
      }
      if (main1 !== null) {
        cachedJourneyItemKey = main1.key;
        console.log(
          '[journey-renderer] bootstrap: key resolved via name-match "' +
            inst1.name +
            '": ' +
            main1.key,
        );
        return cachedJourneyItemKey;
      }
    }
  }

  // Pass 2: fallback via mainComponent.name — vangt renamed instances
  // (e.g. user noemde 'm "Marketing-pill"). Trager omdat we per-instance
  // getMainComponentAsync moeten roepen.
  // T45.2.3: ook permissieve partial-match (case-insensitive bevat "journeyitem")
  //          + diagnostische dump van alle instance-namen + mainComponent-namen
  //          zodat we zien wát er op de page staat.
  console.log('[journey-renderer] bootstrap: name-match miss, scanning via mainComponent.name...');
  var diagnostic: Array<{ instName: string; mainName: string }> = [];
  for (var j = 0; j < allInstances.length; j++) {
    var inst2 = allInstances[j] as InstanceNode;
    var main2: ComponentNode | null = null;
    try {
      main2 = await inst2.getMainComponentAsync();
    } catch (_e) {
      continue;
    }
    if (main2 === null) continue;
    diagnostic.push({ instName: inst2.name, mainName: main2.name });
    var mainNameLower = main2.name.toLowerCase();
    // Exact + permissieve match: bevat 'journeyitem' (case-insensitive,
    // ignoreert spaces/hyphens).
    var normalized = mainNameLower.replace(/[\s\-_]/g, '');
    if (main2.name === 'JourneyItem' || normalized.indexOf('journeyitem') >= 0) {
      cachedJourneyItemKey = main2.key;
      console.log(
        '[journey-renderer] bootstrap: key resolved via mainComponent.name "' +
          main2.name +
          '" (instance was named "' +
          inst2.name +
          '"): ' +
          main2.key,
      );
      return cachedJourneyItemKey;
    }
  }

  // Geen match — dump diagnostic data (alleen unieke mainComponent-namen
  // om de log overzichtelijk te houden).
  var uniqueMainNames: { [key: string]: number } = {};
  for (var k = 0; k < diagnostic.length; k++) {
    var n = diagnostic[k].mainName;
    uniqueMainNames[n] = (uniqueMainNames[n] || 0) + 1;
  }
  console.log(
    '[journey-renderer] bootstrap: ' +
      String(diagnostic.length) +
      ' instances scanned, unique mainComponent.names found:',
  );
  for (var key in uniqueMainNames) {
    if (Object.prototype.hasOwnProperty.call(uniqueMainNames, key)) {
      console.log('[journey-renderer]   - "' + key + '" (' + String(uniqueMainNames[key]) + 'x)');
    }
  }

  // Stap 3: hardcoded fallback.
  if (JOURNEYITEM_KEY_FALLBACK.length > 0) {
    cachedJourneyItemKey = JOURNEYITEM_KEY_FALLBACK;
    console.log('[journey-renderer] bootstrap: using hardcoded fallback key');
    return cachedJourneyItemKey;
  }

  console.error(
    '[journey-renderer] bootstrap FAILED: geen JourneyItem-instance gevonden op de huidige page.\n' +
      'Actie vereist: plaats eerst minimaal 1 JourneyItem-component (uit de Welder library) ' +
      'op de huidige slide, dan opnieuw plugin-action triggeren. De plugin gebruikt die instance ' +
      'om de component-key te bepalen.',
  );
  return null;
}

/**
 * Importeert + cached de JourneyItem ComponentNode.
 * Retourneert null wanneer key-bootstrap of import mislukt.
 */
async function getJourneyItemComponent(): Promise<ComponentNode | null> {
  if (cachedJourneyItemComp !== null) {
    return cachedJourneyItemComp;
  }

  var key = await resolveJourneyItemKey();
  if (key === null) return null;

  var comp: ComponentNode | null = null;
  try {
    comp = await figma.importComponentByKeyAsync(key);
  } catch (e) {
    console.log('[journey-renderer] importComponentByKeyAsync failed: ' + String(e));
    // Key may have been stale; clear cache so next call retries bootstrap.
    cachedJourneyItemKey = null;
    return null;
  }

  cachedJourneyItemComp = comp;
  console.log('[journey-renderer] JourneyItem component imported: ' + comp.name);
  return comp;
}

// -------------------------------------------------------------------
// Icon-swap helpers (mirror card.ts applyCardIconSwap)
// -------------------------------------------------------------------

/**
 * Zoekt het nested icon-INSTANCE in een JourneyItem-instance.
 * JourneyItem-structuur: parent → Icon-instance (62×62, node 305:6003).
 *
 * Primair: eerste INSTANCE-kind van de JourneyItem-instance.
 * Fallback: eerste INSTANCE-descendant (FIG-TRAVERSE-01, maxDepth=3).
 */
function findNestedIconInstance(item: InstanceNode): InstanceNode | null {
  // Primair: directe INSTANCE-kinderen.
  if ('children' in item) {
    var children = (item as ChildrenMixin).children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].type === 'INSTANCE') {
        return children[i] as InstanceNode;
      }
    }
  }

  // Fallback: findOne bounded (Figma's findOne gaat niet dieper dan de
  // subtree van `item`; voldoende begrensd voor FIG-TRAVERSE-01).
  if ('findOne' in item) {
    var nested = item.findOne(function (n: SceneNode): boolean {
      return n.type === 'INSTANCE';
    });
    if (nested !== null && nested.type === 'INSTANCE') {
      return nested as InstanceNode;
    }
  }

  return null;
}

/**
 * Best-effort icon-swap voor een JourneyItem-instance.
 * Strategieën (mirror card.ts):
 *   1. INSTANCE_SWAP-property op de item-instance zelf.
 *   2. INSTANCE_SWAP-property op de nested icon-INSTANCE.
 *   3. swapComponentByName op de nested icon-INSTANCE.
 */
/**
 * Vóór legacy INSTANCE_SWAP: probeer eerst de slot-based SVG-route.
 * Wanneer de pill een `icon-slot` SlotNode bevat én de iframe het svg-
 * document voor `iconName` meeleverde, doen we de in-place swap zonder
 * library-import. Bij geen slot of geen svg-string → return false zodat
 * de caller terugvalt op `applyJourneyIconSwap`.
 */
function trySlotIconSwap(
  item: InstanceNode,
  iconName: string,
  iconSvgs: { [name: string]: string } | undefined,
): boolean {
  if (iconSvgs === undefined) return false;
  const svg = iconSvgs[iconName];
  if (typeof svg !== 'string' || svg.length === 0) return false;
  return replaceIconViaSlot(item, iconName, svg);
}

async function applyJourneyIconSwap(item: InstanceNode, iconName: string): Promise<boolean> {
  // Strategy 1: INSTANCE_SWAP op de item-instance zelf.
  console.log('[journey-icon] strategy 1: trySwapViaInstanceProperty on item "' + item.name + '"');
  if (await trySwapViaInstanceProperty(item, iconName)) {
    console.log('[journey-icon] strategy 1 hit for "' + iconName + '"');
    return true;
  }
  console.log('[journey-icon] strategy 1 miss for "' + iconName + '"');

  // Strategy 2 + 3: nested icon-INSTANCE.
  var nestedIcon = findNestedIconInstance(item);
  if (nestedIcon !== null) {
    console.log(
      '[journey-icon] strategy 2: trySwapViaInstanceProperty on nested "' + nestedIcon.name + '"',
    );
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) {
      console.log('[journey-icon] strategy 2 hit for "' + iconName + '"');
      return true;
    }
    console.log('[journey-icon] strategy 2 miss for "' + iconName + '"');

    console.log(
      '[journey-icon] strategy 3: swapComponentByName on nested "' + nestedIcon.name + '"',
    );
    if (await swapComponentByName(nestedIcon, iconName)) {
      console.log('[journey-icon] strategy 3 hit for "' + iconName + '"');
      return true;
    }
    console.log('[journey-icon] strategy 3 miss for "' + iconName + '"');
  } else {
    console.log('[journey-icon] no nested icon instance found in item "' + item.name + '"');
  }

  console.log(
    '[journey-icon] all strategies failed for "' + iconName + '" on item "' + item.name + '"',
  );
  return false;
}

// -------------------------------------------------------------------
// Scan — lees huidige Slot-content in een JourneyWrapModel
// -------------------------------------------------------------------

/**
 * T46.2 — Scan kolomheaders uit het WelderJourneyHeader-FRAME binnen
 * de slot. Backward-compat: geen FRAME → return JOURNEY_DEFAULT_COLUMN_COUNT
 * (= 6) lege kolommen.
 *
 * Naming-conventie voor cells (gezet door T46.3 renderer):
 *   WelderJourneyHeader/JourneyHeaderCell-{i}/JourneyHeader-h    → header-text
 *   WelderJourneyHeader/JourneyHeaderCell-{i}/JourneyHeader-sub  → subheader-text
 *
 * T46.6: body-veld verwijderd uit JourneyColumnModel. Eventuele oude
 * 'JourneyHeader-body' TEXT-nodes uit pre-T46.6 slides worden tijdens
 * render door renderHeaderTextNodes opgeruimd.
 *
 * Cells worden in volgorde gelezen (van links naar rechts via children-iteratie).
 */
function scanJourneyHeaderColumns(slot: SlotNode): JourneyColumnModel[] {
  // Zoek WelderJourneyHeader-FRAME als direct child van de slot.
  var headerFrame: FrameNode | null = null;
  for (var ci = 0; ci < slot.children.length; ci++) {
    var child = slot.children[ci];
    if (child.type === 'FRAME' && child.name === 'WelderJourneyHeader') {
      headerFrame = child as FrameNode;
      break;
    }
  }

  // Backward-compat: geen header-FRAME → default 6 lege kolommen.
  if (headerFrame === null) {
    var defaults: JourneyColumnModel[] = [];
    for (var di = 0; di < JOURNEY_DEFAULT_COLUMN_COUNT; di++) {
      defaults.push({
        header: JOURNEY_DEFAULT_COLUMN.header,
        subheader: JOURNEY_DEFAULT_COLUMN.subheader,
      });
    }
    return defaults;
  }

  // Lees per kolom-cell de twee text-velden (header + subheader).
  var columns: JourneyColumnModel[] = [];
  for (var hci = 0; hci < headerFrame.children.length; hci++) {
    var cell = headerFrame.children[hci];
    if (cell.type !== 'FRAME') continue;
    if (cell.name.indexOf('JourneyHeaderCell-') !== 0) continue;

    var col: JourneyColumnModel = {
      header: '',
      subheader: '',
    };

    // Find named child-text-nodes (one level deep).
    var cellFrame = cell as FrameNode;
    for (var ti = 0; ti < cellFrame.children.length; ti++) {
      var textNode = cellFrame.children[ti];
      if (textNode.type !== 'TEXT') continue;
      var tn = textNode as TextNode;
      if (tn.name === 'JourneyHeader-h') col.header = tn.characters;
      else if (tn.name === 'JourneyHeader-sub') col.subheader = tn.characters;
    }

    columns.push(col);
  }

  // Defensief: max-cap (geen min-cap meer in T46.8 — 0 kolommen is geldig).
  // Wanneer een marker-FRAME bestaat met 0 cells (T46.8), retourneren we []
  // — backward-compat-fallback (geen header-frame) blijft 6 lege defaults
  // teruggeven via de branch hierboven.
  if (columns.length > JOURNEY_MAX_COLUMNS) {
    columns = columns.slice(0, JOURNEY_MAX_COLUMNS);
  }

  return columns;
}

/**
 * Lees de huidige Slot-inhoud. T45.2: items zijn JourneyItem-INSTANCES;
 * backward-compat met T45-FRAME-items (namen 'JourneyItem-N').
 *
 * T45.3: kolom-grid-model verwijderd. Items hebben nu minWidth/maxWidth
 * als percentages. Backward-compat met T45.2 startCol/endCol-pluginData
 * door om te zetten naar percentages bij scan.
 *
 * Items zitten in de WelderJourneyContent-container of direct in de Slot.
 * Per item gelezen uit pluginData:
 *   - journey-icon
 *   - journey-min-width / journey-max-width (T45.3)
 *   - fallback: journey-startCol / journey-endCol (T45.2 → omzet)
 */
export function scanJourneySlot(slot: SlotNode): JourneyWrapModel {
  var items: JourneyItemModel[] = [];

  // Items zitten in de WelderJourneyContent-container óf direct in de Slot.
  var rowParent: SlotNode | FrameNode = slot;
  for (var ci = 0; ci < slot.children.length; ci++) {
    var child = slot.children[ci];
    if (child.type === 'FRAME' && child.name === 'WelderJourneyContent') {
      rowParent = child as FrameNode;
      break;
    }
  }

  for (var i = 0; i < rowParent.children.length; i++) {
    var rowNode = rowParent.children[i];

    // T45.2: JourneyItem-instances (nieuw format).
    var isInstance = rowNode.type === 'INSTANCE' && rowNode.name === 'JourneyItem';
    // T45 backward-compat: JourneyItem-N FRAMEs (oud format).
    var isLegacyFrame = rowNode.type === 'FRAME' && rowNode.name.indexOf('JourneyItem-') === 0;

    if (!isInstance && !isLegacyFrame) continue;

    var rowFrame = rowNode as InstanceNode | FrameNode;

    var icon = rowFrame.getPluginData('journey-icon');
    if (icon === '') icon = 'star';

    // T45.6: lees startPct met fallback-cascade naar T45.5/T45.4 (startPct alleen),
    // T45.3 (min-width = startPct), T45.2 (startCol → percentage).
    var startPct = 0;
    var startPctRaw = rowFrame.getPluginData('journey-start-pct');
    if (startPctRaw !== '') {
      var ps = parseFloat(startPctRaw);
      if (!isNaN(ps)) startPct = ps;
    } else {
      // T45.3-fallback: min-width als start-position (best effort).
      var minWidthRaw = rowFrame.getPluginData('journey-min-width');
      if (minWidthRaw !== '') {
        var pn = parseFloat(minWidthRaw);
        if (!isNaN(pn)) startPct = 0; // pills waren left-aligned → 0
      } else {
        // T45.2-fallback: startCol → percentage (assume 6-col grid).
        var startColRaw = rowFrame.getPluginData('journey-startCol');
        if (startColRaw !== '') {
          var sc = parseInt(startColRaw, 10);
          if (!isNaN(sc)) startPct = ((sc - 1) / 6) * 100;
        }
      }
    }
    // Clamp.
    if (startPct < JOURNEY_POS_MIN_PCT) startPct = JOURNEY_POS_MIN_PCT;
    if (startPct > JOURNEY_POS_MAX_PCT) startPct = JOURNEY_POS_MAX_PCT;

    // T45.6: lees endPct met fallback-cascade. Geen v=5-data heeft endPct,
    // dus we synthetiseren default = startPct + 30 (geclamped binnen
    // [startPct + JOURNEY_POS_MIN_SPAN, JOURNEY_POS_MAX_PCT]).
    var endPct = 0;
    var endPctRaw = rowFrame.getPluginData('journey-end-pct');
    if (endPctRaw !== '') {
      var pe = parseFloat(endPctRaw);
      if (!isNaN(pe)) endPct = pe;
    } else {
      // v=5-fallback: synthesize default-eind = startPct + 30.
      endPct = startPct + 30;
    }
    // Clamp endPct: minstens startPct + JOURNEY_POS_MIN_SPAN, maximaal MAX_PCT.
    var minEnd = startPct + JOURNEY_POS_MIN_SPAN;
    if (endPct < minEnd) endPct = minEnd;
    if (endPct > JOURNEY_POS_MAX_PCT) endPct = JOURNEY_POS_MAX_PCT;

    // Label: lees uit de eerste TEXT-descendant.
    var label = '';
    var textNode = rowFrame.findOne(function (n: SceneNode): boolean {
      return n.type === 'TEXT';
    });
    if (textNode !== null && textNode.type === 'TEXT') {
      label = (textNode as TextNode).characters;
    }

    items.push({
      itemNodeId: rowFrame.id,
      icon: icon,
      label: label,
      startPct: startPct,
      endPct: endPct,
    });
  }

  return {
    slotId: slot.id,
    columns: scanJourneyHeaderColumns(slot),
    items: items,
  };
}

// -------------------------------------------------------------------
// Apply — full-state PUT binnen de Slot
// -------------------------------------------------------------------

/**
 * T45.13: Diff-based update — hergebruik bestaande WelderJourneyContent
 * container en bestaande JourneyItem-instances per index. Alleen werkelijk
 * veranderde velden (icon, label, positie, breedte) worden aangepast. Bij
 * slider-drag → alleen resize+position; bij label-typen → alleen
 * characters-write+resize. Geen onnodige icon-swap of font-load. Off-tree
 * build (T45.11) niet meer nodig — diff vermijdt full-rebuild. ~5-10×
 * sneller voor typische edits.
 *
 * Container-layout (X.1 — absolute):
 *   - WelderJourneyContent = FRAME, layoutMode='NONE', FIXED width × height.
 *   - Elke JourneyItem-instance absoluut gepositioneerd via x/y.
 *   - Pill-breedte = (endCol - startCol + 1) / totalCols × contentWidth.
 *   - x = JOURNEY_CONTAINER_PADDING + (startCol - 1) / totalCols × contentWidth.
 *   - y = JOURNEY_CONTAINER_PADDING + i × (PILL_HEIGHT + PILL_GAP).
 *
 * Bootstrap-fout (geen JourneyItem-component beschikbaar):
 *   - console.error met user-instructie
 *   - render fallback-FRAME met instructietekst
 *   - pluginData-markers worden wel geschreven
 *
 * Width-strategie (spiegel TableWrap):
 *   Probeer parent-chain te resizen naar JOURNEY_WIDTH.
 */
export async function applyJourney(
  slot: SlotNode,
  desired: JourneyWrapModel,
  iconSvgs?: { [name: string]: string },
): Promise<void> {
  // Vind bestaande WelderJourneyContent-container of maak een nieuwe.
  var container: FrameNode | null = null;
  for (var ci = 0; ci < slot.children.length; ci++) {
    var existingChild = slot.children[ci];
    if (existingChild.type === 'FRAME' && existingChild.name === 'WelderJourneyContent') {
      container = existingChild as FrameNode;
      break;
    }
  }
  // Verwijder alle andere children (legacy / fout type).
  for (var ci2 = slot.children.length - 1; ci2 >= 0; ci2--) {
    var ch = slot.children[ci2];
    if (ch !== container) {
      try {
        ch.remove();
      } catch (_e) {
        /* silent */
      }
    }
  }

  // Persisteer pluginData markers (ook bij bootstrap-fout — model is geldig).
  // T46.3: v=7 (model-wijziging — kolom-headers + dividers boven pills).
  slot.setPluginData('kind', 'welder-journeywrap');
  slot.setPluginData('v', '7');

  // Probeer parent-chain te resizen (spiegel TableWrap).
  var slotParent = slot.parent;
  if (slotParent !== null && 'resize' in slotParent) {
    try {
      var p = slotParent as FrameNode | InstanceNode;
      p.resize(JOURNEY_WIDTH, p.height);
    } catch (e) {
      /* silent — JourneyWrap kan locked zijn in auto-layout */
    }
  }
  try {
    slot.resize(JOURNEY_WIDTH, slot.height);
  } catch (e) {
    /* silent */
  }

  // Bootstrap: haal de JourneyItem-component op.
  var journeyItemComp = await getJourneyItemComponent();

  if (journeyItemComp === null) {
    // Bootstrap mislukt — verwijder evt. bestaande container en render fallback.
    if (container !== null) {
      try {
        container.remove();
      } catch (_e) {
        /* silent */
      }
    }
    await renderBootstrapError(slot);
    return;
  }

  // T46.8: header-sectie is optioneel — bij 0 kolommen verdwijnt de
  // visuele header (cells + dividers + horizontale divider). Een 1px-hoge
  // marker-FRAME blijft wel staan voor persistence (scan-disambiguation).
  var hasHeader = desired.columns.length > 0;
  var headerOffset = hasHeader ? JOURNEY_HEADER_HEIGHT : 0;

  // Container-hoogte berekenen — T46.3 includes JOURNEY_HEADER_HEIGHT op top
  // (alleen wanneer er kolomheaders zijn; T46.8).
  var containerH =
    headerOffset +
    JOURNEY_CONTAINER_PADDING * 2 +
    desired.items.length * PILL_HEIGHT +
    (desired.items.length > 1 ? (desired.items.length - 1) * PILL_GAP : 0);
  var safeContainerH =
    containerH > 0 ? containerH : headerOffset + PILL_HEIGHT + JOURNEY_CONTAINER_PADDING * 2;

  // Pill-Y-basis: padding zonder header-offset bij 0 kolommen.
  var pillYBase = JOURNEY_CONTAINER_PADDING + headerOffset;

  if (container === null) {
    // Geen bestaande container — maak nieuwe (off-tree build, append at end).
    container = figma.createFrame();
    container.name = 'WelderJourneyContent';
    container.layoutMode = 'NONE';
    container.fills = [];
    container.strokes = [];
    container.clipsContent = false;
    try {
      container.resize(JOURNEY_WIDTH, safeContainerH);
    } catch (_e) {
      /* silent */
    }
  } else {
    // Hergebruik bestaande container — resize naar nieuwe hoogte.
    try {
      container.resize(JOURNEY_WIDTH, safeContainerH);
    } catch (_e) {
      /* silent */
    }
  }

  // contentWidth = container-breedte minus horizontale paddings.
  var contentWidth = JOURNEY_WIDTH - JOURNEY_CONTAINER_PADDING * 2;
  var safeContentWidth = contentWidth > 0 ? contentWidth : JOURNEY_WIDTH;

  // T46.3: render kolom-headers + dividers VÓÓR de items-loop zodat z-order
  // klopt (dividers achter, header-cells in eigen sub-FRAME, pills voor).
  await applyJourneyHeader(container, desired.columns, safeContentWidth, safeContainerH);

  // Verzamel bestaande JourneyItem-instances in container.
  var existingItems: InstanceNode[] = [];
  for (var ei = 0; ei < container.children.length; ei++) {
    var c = container.children[ei];
    if (c.type === 'INSTANCE' && c.name === 'JourneyItem') {
      existingItems.push(c as InstanceNode);
    }
  }

  // Match-by-index: update bestaand of create nieuw.
  for (var i = 0; i < desired.items.length; i++) {
    if (i < existingItems.length) {
      await updateJourneyItem(
        existingItems[i],
        desired.items[i],
        i,
        safeContentWidth,
        pillYBase,
        iconSvgs,
      );
    } else {
      await renderJourneyItem(
        container,
        desired.items[i],
        i,
        safeContentWidth,
        journeyItemComp,
        pillYBase,
        iconSvgs,
      );
    }
  }

  // Verwijder excess instances (als desired korter is dan existing).
  for (var rmI = existingItems.length - 1; rmI >= desired.items.length; rmI--) {
    try {
      existingItems[rmI].remove();
    } catch (_e) {
      /* silent */
    }
  }

  // T46.7 — enforce z-order: pills ALTIJD bovenop dividers + header.
  // Bij column-add komen nieuwe RECT-dividers aan het einde van
  // container.children (via appendChild), wat ze visueel bovenop pills zou
  // plaatsen. Door alle JourneyItem-instances opnieuw te appenden,
  // verplaatsen ze naar het einde (= top z-order).
  var pillsToFront: SceneNode[] = [];
  for (var pfi = 0; pfi < container.children.length; pfi++) {
    var pfch = container.children[pfi];
    if (pfch.type === 'INSTANCE' && pfch.name === 'JourneyItem') {
      pillsToFront.push(pfch);
    }
  }
  for (var pfm = 0; pfm < pillsToFront.length; pfm++) {
    container.appendChild(pillsToFront[pfm] as InstanceNode);
  }

  // Append container ALS hij nieuw was (anders zit hij al in slot).
  if (container.parent !== slot) {
    slot.appendChild(container);
  }
}

// -------------------------------------------------------------------
// Per-item render
// -------------------------------------------------------------------

/**
 * Maakt één JourneyItem-instance aan, positioneert hem absoluut,
 * swapt het icon, en schrijft het label.
 *
 * T45.10: Gantt-style pill — directe resize op (endPct - startPct) ×
 * contentWidth. UI's dynamische slider-cap (T45.8) garandeert dat
 * targetWidth ≥ natural content-breedte, dus geen HUG-measure-cyclus
 * nodig. Lange labels worden via textTruncation='ENDING' afgekapt
 * (gebeurt automatisch — Figma's default voor FILL-children in fixed-
 * width auto-layout-parent met te lange content).
 *
 * T45.14: textTruncation='ENDING' + maxLines=1 op label-node als safety-net
 * tegen mid-word breaking. UI-cap (T45.8) met 1.3× safety-factor is primaire
 * defense; truncation vangt edge-cases waar canvas-meting iets afwijkt van
 * Figma's daadwerkelijke font-rendering.
 *
 *   x      = (startPct/100) × contentWidth + JOURNEY_CONTAINER_PADDING
 *   y      = JOURNEY_CONTAINER_PADDING + index × (PILL_HEIGHT + PILL_GAP)
 *   width  = (endPct - startPct) / 100 × contentWidth
 */
async function renderJourneyItem(
  container: FrameNode,
  item: JourneyItemModel,
  index: number,
  contentWidth: number,
  comp: ComponentNode,
  pillYBase: number,
  iconSvgs?: { [name: string]: string },
): Promise<void> {
  var instance = comp.createInstance();
  instance.name = 'JourneyItem';
  container.appendChild(instance);

  // Clamp percentages voor robustness.
  var startPct = item.startPct;
  if (startPct < JOURNEY_POS_MIN_PCT) startPct = JOURNEY_POS_MIN_PCT;
  if (startPct > JOURNEY_POS_MAX_PCT) startPct = JOURNEY_POS_MAX_PCT;

  var endPct = item.endPct;
  var minEnd = startPct + JOURNEY_POS_MIN_SPAN;
  if (endPct < minEnd) endPct = minEnd;
  if (endPct > JOURNEY_POS_MAX_PCT) endPct = JOURNEY_POS_MAX_PCT;

  var pillX = JOURNEY_CONTAINER_PADDING + (startPct / 100) * contentWidth;
  // T46.8: pillYBase = JOURNEY_CONTAINER_PADDING + (hasHeader ? JOURNEY_HEADER_HEIGHT : 0).
  var pillY = pillYBase + index * (PILL_HEIGHT + PILL_GAP);

  // Sla startPct + endPct op zodat scan ze terug kan lezen.
  instance.setPluginData('journey-icon', item.icon);
  instance.setPluginData('journey-start-pct', String(item.startPct));
  instance.setPluginData('journey-end-pct', String(item.endPct));

  // Icon-swap. Preferred: slot-based SVG via shared helper (no library
  // import). Fallback: legacy INSTANCE_SWAP (3-strategy pattern) when
  // the pill component doesn't expose an `icon-slot` SlotNode yet.
  if (item.icon.length > 0) {
    if (!trySlotIconSwap(instance, item.icon, iconSvgs)) {
      await applyJourneyIconSwap(instance, item.icon);
    }
  }

  // Label-text: vind de eerste TEXT-descendant en schrijf.
  var textNode = instance.findOne(function (n: SceneNode): boolean {
    return n.type === 'TEXT';
  });
  if (textNode !== null && textNode.type === 'TEXT') {
    var tn = textNode as TextNode;

    // T45.14: zet truncation-props altijd (idempotent), maar alleen als ze nog niet goed staan.
    if (tn.textTruncation !== 'ENDING') {
      try {
        tn.textTruncation = 'ENDING';
      } catch (_e) {
        /* silent */
      }
    }
    if (tn.maxLines !== 1) {
      try {
        tn.maxLines = 1;
      } catch (_e) {
        /* sommige nodes accepteren maxLines niet — silent skip */
      }
    }

    // Label content: alleen schrijven als veranderd (no-op bij fresh creates omdat default leeg is).
    if (tn.characters !== item.label) {
      try {
        await loadAllFontsForNode(tn);
        tn.characters = item.label;
      } catch (e) {
        console.log(
          '[journey-renderer] label write failed for item ' + String(index) + ': ' + String(e),
        );
      }
    }
  }

  // T45.10: directe resize naar targetWidth — geen HUG-measure cycle meer.
  // De UI-side dynamische slider-cap (T45.8, met 1.1× safety-factor) zorgt
  // dat de gebruiker nooit een range kiest die smaller is dan het label
  // visueel nodig heeft, dus de T45.7 floor is overbodig overhead.
  var targetWidth = ((endPct - startPct) / 100) * contentWidth;
  if (targetWidth < 1) targetWidth = 1; // safety — Figma weigert resize ≤ 0
  try {
    instance.resize(targetWidth, instance.height);
  } catch (e) {
    console.log(
      '[journey-renderer] instance.resize failed for item ' + String(index) + ': ' + String(e),
    );
  }

  // Positie (absolute) — na resize zodat x niet door auto-layout wordt overschreven.
  instance.x = pillX;
  instance.y = pillY;
}

/**
 * T45.13: Update een bestaande JourneyItem-instance — alleen velden die
 * werkelijk veranderd zijn worden aangepast. Skip icon-swap als icon
 * gelijk is, skip label-rewrite als label gelijk is, skip resize als
 * positie/breedte ongewijzigd. Dit is de hot-path bij slider-drags en
 * label-edits — onmisbaar voor responsief UX.
 *
 * T45.14: textTruncation='ENDING' + maxLines=1 op label-node als safety-net
 * tegen mid-word breaking. UI-cap (T45.8) met 1.3× safety-factor is primaire
 * defense; truncation vangt edge-cases waar canvas-meting iets afwijkt van
 * Figma's daadwerkelijke font-rendering. Idempotent gezet ook bij first-load
 * van bestaande slides (v=6 pluginData maar truncation-props nog niet gezet).
 */
async function updateJourneyItem(
  instance: InstanceNode,
  item: JourneyItemModel,
  index: number,
  contentWidth: number,
  pillYBase: number,
  iconSvgs?: { [name: string]: string },
): Promise<void> {
  // Clamp percentages (zelfde logica als renderJourneyItem).
  var startPct = item.startPct;
  if (startPct < JOURNEY_POS_MIN_PCT) startPct = JOURNEY_POS_MIN_PCT;
  if (startPct > JOURNEY_POS_MAX_PCT) startPct = JOURNEY_POS_MAX_PCT;

  var endPct = item.endPct;
  var minEnd = startPct + JOURNEY_POS_MIN_SPAN;
  if (endPct < minEnd) endPct = minEnd;
  if (endPct > JOURNEY_POS_MAX_PCT) endPct = JOURNEY_POS_MAX_PCT;

  var pillX = JOURNEY_CONTAINER_PADDING + (startPct / 100) * contentWidth;
  // T46.8: pillYBase = JOURNEY_CONTAINER_PADDING + (hasHeader ? JOURNEY_HEADER_HEIGHT : 0).
  var pillY = pillYBase + index * (PILL_HEIGHT + PILL_GAP);
  var targetWidth = ((endPct - startPct) / 100) * contentWidth;
  if (targetWidth < 1) targetWidth = 1;

  // ─── Icon-swap: alleen als veranderd ───
  var currentIcon = instance.getPluginData('journey-icon');
  if (currentIcon !== item.icon && item.icon.length > 0) {
    if (!trySlotIconSwap(instance, item.icon, iconSvgs)) {
      await applyJourneyIconSwap(instance, item.icon);
    }
    instance.setPluginData('journey-icon', item.icon);
  }

  // ─── Label: alleen als veranderd ───
  var textNode = instance.findOne(function (n: SceneNode): boolean {
    return n.type === 'TEXT';
  });
  if (textNode !== null && textNode.type === 'TEXT') {
    var tn = textNode as TextNode;

    // T45.14: zet truncation-props altijd (idempotent), maar alleen als ze nog niet goed staan.
    // Buiten de characters-equality check zodat first-load van bestaande slides
    // (v=6 pluginData maar truncation-props nog niet gezet) ook gefixt wordt.
    if (tn.textTruncation !== 'ENDING') {
      try {
        tn.textTruncation = 'ENDING';
      } catch (_e) {
        /* silent */
      }
    }
    if (tn.maxLines !== 1) {
      try {
        tn.maxLines = 1;
      } catch (_e) {
        /* sommige nodes accepteren maxLines niet — silent skip */
      }
    }

    // Label content: alleen schrijven als veranderd.
    if (tn.characters !== item.label) {
      try {
        await loadAllFontsForNode(tn);
        tn.characters = item.label;
      } catch (e) {
        console.log(
          '[journey-renderer] label update failed for item ' + String(index) + ': ' + String(e),
        );
      }
    }
  }

  // ─── Resize: alleen als breedte veranderd ───
  if (Math.abs(instance.width - targetWidth) > 0.5) {
    try {
      instance.resize(targetWidth, instance.height);
    } catch (e) {
      console.log('[journey-renderer] resize failed for item ' + String(index) + ': ' + String(e));
    }
  }

  // ─── Positie: alleen als veranderd ───
  if (Math.abs(instance.x - pillX) > 0.5) {
    instance.x = pillX;
  }
  if (Math.abs(instance.y - pillY) > 0.5) {
    instance.y = pillY;
  }

  // ─── pluginData voor scan ───
  var currentStart = instance.getPluginData('journey-start-pct');
  if (currentStart !== String(item.startPct)) {
    instance.setPluginData('journey-start-pct', String(item.startPct));
  }
  var currentEnd = instance.getPluginData('journey-end-pct');
  if (currentEnd !== String(item.endPct)) {
    instance.setPluginData('journey-end-pct', String(item.endPct));
  }
}

// -------------------------------------------------------------------
// Bootstrap-error fallback
// -------------------------------------------------------------------

/**
 * Rendert een duidelijk instructie-FRAME wanneer het JourneyItem-component
 * niet geïmporteerd kan worden.
 */
async function renderBootstrapError(slot: SlotNode): Promise<void> {
  var errorFrame = figma.createFrame();
  errorFrame.name = 'JourneyBootstrapError';
  errorFrame.layoutMode = 'HORIZONTAL';
  errorFrame.primaryAxisAlignItems = 'CENTER';
  errorFrame.counterAxisAlignItems = 'CENTER';
  errorFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.85 } }];
  errorFrame.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.47, b: 0 } }];
  errorFrame.strokeWeight = 2;
  errorFrame.strokeAlign = 'INSIDE';
  errorFrame.cornerRadius = 16;
  try {
    errorFrame.resize(JOURNEY_WIDTH, 120);
  } catch (e) {
    /* silent */
  }

  var msg = figma.createText();
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    msg.fontName = { family: 'Inter', style: 'Regular' };
    msg.fontSize = 24;
    msg.characters =
      'JourneyItem-bootstrap vereist: plaats eerst 1 JourneyItem uit de Welder-library ' +
      'op een slide, sla dan opnieuw op.';
    msg.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.25, b: 0 } }];
    msg.textAutoResize = 'WIDTH_AND_HEIGHT';
  } catch (e) {
    console.log('[journey-renderer] bootstrap error text write failed: ' + String(e));
  }

  errorFrame.appendChild(msg);
  try {
    msg.layoutSizingHorizontal = 'FILL';
  } catch (e) {
    /* silent */
  }

  slot.appendChild(errorFrame);
}

// -------------------------------------------------------------------
// T46.3 — Header-render helpers (kolom-cells + dividers)
// -------------------------------------------------------------------

/**
 * T46.3 — Render of update de WelderJourneyHeader-FRAME met N kolom-cells
 * + verticale dividers (full container-height) + horizontale divider
 * onderlangs de header-sectie. Z-order:
 *   1. Verticale dividers (RECTs, full-height) — achterlaag
 *   2. WelderJourneyHeader-FRAME met N JourneyHeaderCell children
 *   3. Horizontale divider — onderlangs header-sectie (scheidsteken naar pills)
 * (Pills komen daarna via items-loop, bovenop alles.)
 *
 * T46.6: body-veld verwijderd uit JourneyColumnModel; horizontale divider
 * is verplaatst van tussen subheader/body naar onderlangs de header-sectie.
 *
 * Diff-friendly: vindt bestaande header-FRAME of maakt een nieuwe.
 * Cells worden via match-by-index hergebruikt (alleen veranderde text-content
 * geüpdatet), zelfde patroon als T45.13 voor pills.
 */
async function applyJourneyHeader(
  container: FrameNode,
  columns: JourneyColumnModel[],
  contentWidth: number,
  containerH: number,
): Promise<void> {
  var n = columns.length;
  if (n < JOURNEY_MIN_COLUMNS) n = JOURNEY_MIN_COLUMNS;
  if (n > JOURNEY_MAX_COLUMNS) n = JOURNEY_MAX_COLUMNS;

  // T46.8: handle 0 columns — header section is collapsed.
  // Verwijder bestaande verticale dividers, hergebruik/maak een 1px-marker-FRAME
  // (persistence: scan vindt 'm en weet dat user 0 kolommen heeft gekozen — anders
  // defaultet scan naar 6).
  if (n === 0) {
    // Verwijder bestaande verticale dividers.
    for (var rmDi = container.children.length - 1; rmDi >= 0; rmDi--) {
      var rmDch = container.children[rmDi];
      if (rmDch.type === 'RECTANGLE' && rmDch.name.indexOf('JourneyVDivider-') === 0) {
        try {
          rmDch.remove();
        } catch (_e) {}
      }
    }
    // Hergebruik of maak een 1px-hoge marker-FRAME (Figma weigert resize tot 0).
    var markerFrame: FrameNode | null = null;
    for (var mci = 0; mci < container.children.length; mci++) {
      var mch = container.children[mci];
      if (mch.type === 'FRAME' && mch.name === 'WelderJourneyHeader') {
        markerFrame = mch as FrameNode;
        break;
      }
    }
    if (markerFrame === null) {
      markerFrame = figma.createFrame();
      markerFrame.name = 'WelderJourneyHeader';
      markerFrame.layoutMode = 'NONE';
      markerFrame.fills = [];
      markerFrame.strokes = [];
      markerFrame.clipsContent = false;
      container.appendChild(markerFrame);
    }
    try {
      markerFrame.resize(contentWidth, 1);
    } catch (_e) {}
    markerFrame.x = JOURNEY_CONTAINER_PADDING;
    markerFrame.y = JOURNEY_CONTAINER_PADDING;
    // Verwijder alle children van markerFrame (cells + hDivider).
    for (var rmCi = markerFrame.children.length - 1; rmCi >= 0; rmCi--) {
      try {
        markerFrame.children[rmCi].remove();
      } catch (_e) {}
    }
    return;
  }

  // Truncate of pad columns to N (defensive)
  var safeColumns: JourneyColumnModel[] = [];
  for (var ic = 0; ic < n; ic++) {
    if (ic < columns.length) {
      safeColumns.push(columns[ic]);
    } else {
      safeColumns.push({ header: '', subheader: '' });
    }
  }

  var colWidth = contentWidth / n;

  // ─── 1. Verticale dividers (N-1 stuks) ───
  // Hergebruik bestaande RECT-children met name 'JourneyVDivider-{i}'.
  // Voor diff-friendly: maak/update/remove naar N-1 stuks.
  // Y is JOURNEY_CONTAINER_PADDING (relatief aan container, full-height).
  // Height = containerH - 2 × padding (zodat divider niet tegen rand zit).
  var dividerHeight = containerH - JOURNEY_CONTAINER_PADDING * 2;
  if (dividerHeight < 1) dividerHeight = 1;

  // Verzamel bestaande verticale dividers.
  var existingVDividers: RectangleNode[] = [];
  for (var ec = 0; ec < container.children.length; ec++) {
    var ech = container.children[ec];
    if (ech.type === 'RECTANGLE' && ech.name.indexOf('JourneyVDivider-') === 0) {
      existingVDividers.push(ech as RectangleNode);
    }
  }

  for (var di = 0; di < n - 1; di++) {
    var divX = JOURNEY_CONTAINER_PADDING + (di + 1) * colWidth - JOURNEY_DIVIDER_WEIGHT / 2;
    var divider: RectangleNode;
    if (di < existingVDividers.length) {
      divider = existingVDividers[di];
    } else {
      divider = figma.createRectangle();
      divider.name = 'JourneyVDivider-' + String(di);
      // Subtle gray fill — geen theme-binding hier (zou kunnen via Text Dimmer).
      divider.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.7, b: 0.85 }, opacity: 0.5 }];
      container.appendChild(divider);
    }
    try {
      divider.resize(JOURNEY_DIVIDER_WEIGHT, dividerHeight);
    } catch (_e) {}
    divider.x = divX;
    divider.y = JOURNEY_CONTAINER_PADDING;
  }
  // Verwijder excess dividers.
  for (var rmI = existingVDividers.length - 1; rmI >= n - 1; rmI--) {
    try {
      existingVDividers[rmI].remove();
    } catch (_e) {}
  }

  // ─── 2. WelderJourneyHeader-FRAME met cells ───
  // Vind bestaande of maak nieuwe.
  var headerFrame: FrameNode | null = null;
  for (var hci = 0; hci < container.children.length; hci++) {
    var hch = container.children[hci];
    if (hch.type === 'FRAME' && hch.name === 'WelderJourneyHeader') {
      headerFrame = hch as FrameNode;
      break;
    }
  }
  if (headerFrame === null) {
    headerFrame = figma.createFrame();
    headerFrame.name = 'WelderJourneyHeader';
    headerFrame.layoutMode = 'NONE';
    headerFrame.fills = [];
    headerFrame.strokes = [];
    headerFrame.clipsContent = false;
    container.appendChild(headerFrame);
  }
  try {
    headerFrame.resize(contentWidth, JOURNEY_HEADER_HEIGHT);
  } catch (_e) {}
  headerFrame.x = JOURNEY_CONTAINER_PADDING;
  headerFrame.y = JOURNEY_CONTAINER_PADDING;

  // Render of update cells per kolom.
  await applyHeaderCells(headerFrame, safeColumns, colWidth);

  // ─── 3. Horizontale divider onderlangs de header-sectie ───
  // T46.6: body-veld verwijderd, dus divider zit nu niet meer tussen
  // subheader-row en body-row maar tussen de header-sectie en de pills
  // (visueel scheidsteken onderlangs de header). Y-positie: net boven
  // de onderkant van de header-frame zodat divider zichtbaar is.
  var hDividerY = JOURNEY_HEADER_HEIGHT - JOURNEY_DIVIDER_WEIGHT; // binnen headerFrame
  var hDivider: RectangleNode | null = null;
  for (var hdi = 0; hdi < headerFrame.children.length; hdi++) {
    var hdch = headerFrame.children[hdi];
    if (hdch.type === 'RECTANGLE' && hdch.name === 'JourneyHDivider') {
      hDivider = hdch as RectangleNode;
      break;
    }
  }
  if (hDivider === null) {
    hDivider = figma.createRectangle();
    hDivider.name = 'JourneyHDivider';
    hDivider.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.7, b: 0.85 }, opacity: 0.5 }];
    headerFrame.appendChild(hDivider);
  }
  try {
    hDivider.resize(contentWidth, JOURNEY_DIVIDER_WEIGHT);
  } catch (_e) {}
  hDivider.x = 0;
  hDivider.y = hDividerY;
}

/**
 * Render of update de N JourneyHeaderCell-FRAMEs binnen WelderJourneyHeader.
 * Match-by-index: bestaande cells worden hergebruikt en alleen text-content
 * + positie/size gewijzigd. Excess cells worden verwijderd.
 *
 * Per cell: 2 text-nodes (header, subheader) absoluut gepositioneerd
 * binnen de cell-FRAME. Theme-color via fontName-binding (Welder gebruikt
 * library-variables; we pakken default theme-color als solid-fill).
 * T46.6: body-text-node verwijderd uit cell-layout.
 */
async function applyHeaderCells(
  headerFrame: FrameNode,
  columns: JourneyColumnModel[],
  colWidth: number,
): Promise<void> {
  // Verzamel bestaande cells.
  var existingCells: FrameNode[] = [];
  for (var ec = 0; ec < headerFrame.children.length; ec++) {
    var ech = headerFrame.children[ec];
    if (ech.type === 'FRAME' && ech.name.indexOf('JourneyHeaderCell-') === 0) {
      existingCells.push(ech as FrameNode);
    }
  }

  // Match-by-index: update of create.
  for (var ci = 0; ci < columns.length; ci++) {
    var col = columns[ci];
    var cellName = 'JourneyHeaderCell-' + String(ci);
    var cell: FrameNode;
    if (ci < existingCells.length) {
      cell = existingCells[ci];
      cell.name = cellName; // re-name for safety na column-add/remove
    } else {
      cell = figma.createFrame();
      cell.name = cellName;
      cell.layoutMode = 'NONE';
      cell.fills = [];
      cell.strokes = [];
      cell.clipsContent = false;
      headerFrame.appendChild(cell);
    }
    try {
      cell.resize(colWidth, JOURNEY_HEADER_HEIGHT);
    } catch (_e) {}
    cell.x = ci * colWidth;
    cell.y = 0;

    await renderHeaderTextNodes(cell, col, colWidth);
  }

  // Verwijder excess cells.
  for (var rmI = existingCells.length - 1; rmI >= columns.length; rmI--) {
    try {
      existingCells[rmI].remove();
    } catch (_e) {}
  }
}

/**
 * Render of update de twee TEXT-nodes binnen een JourneyHeaderCell.
 * Naming voor scan-roundtrip:
 *   - JourneyHeader-h    (header, font 32, centered)
 *   - JourneyHeader-sub  (subheader, font 20, centered)
 *
 * T46.6: body-TEXT-node verwijderd uit model. Cleanup-loop hieronder
 * verwijdert eventuele oude 'JourneyHeader-body' nodes uit pre-T46.6
 * slides (legacy v=7 content waar body-veld nog bestond).
 *
 * Diff-friendly: skip characters-write als gelijk.
 */
async function renderHeaderTextNodes(
  cell: FrameNode,
  col: JourneyColumnModel,
  colWidth: number,
): Promise<void> {
  // Helper om bestaande named text-node te vinden of nieuwe te maken.
  // (Inline om dependencies klein te houden.)
  async function ensureTextNode(
    name: string,
    chars: string,
    fontPx: number,
    align: 'CENTER' | 'LEFT',
    yPos: number,
    height: number,
  ): Promise<void> {
    var existing: TextNode | null = null;
    for (var ti = 0; ti < cell.children.length; ti++) {
      var ch = cell.children[ti];
      if (ch.type === 'TEXT' && ch.name === name) {
        existing = ch as TextNode;
        break;
      }
    }
    var tn: TextNode;
    if (existing !== null) {
      tn = existing;
    } else {
      tn = figma.createText();
      tn.name = name;
      cell.appendChild(tn);
    }
    try {
      // T46.6: alleen header + subheader — beide Inter Medium.
      var font = { family: 'Inter', style: 'Medium' };
      await figma.loadFontAsync(font);
      tn.fontName = font;
      tn.fontSize = fontPx;
      tn.textAlignHorizontal = align;
      tn.textAlignVertical = 'TOP';
      // Theme-color als simple solid (placeholder — kan later via library-variable).
      tn.fills = [{ type: 'SOLID', color: { r: 0.17, g: 0.5, b: 1.0 } }]; // #2B7FFF (blue theme)
      if (tn.characters !== chars) {
        tn.characters = chars;
      }
      // textAutoResize HEIGHT zodat tekst wrapt in de cell.
      tn.textAutoResize = 'HEIGHT';
    } catch (e) {
      console.log('[journey-renderer] header text update failed for ' + name + ': ' + String(e));
    }
    try {
      tn.resize(colWidth, height);
    } catch (_e) {}
    tn.x = 0;
    tn.y = yPos;
  }

  // Layout binnen cell (T46.6: body verwijderd, sectie-hoogte 140):
  //   y=0    header (height ~50)
  //   y=60   subheader (height ~30)
  //   y=139  hDivider (rendered by parent-helper, onderlangs header-sectie)
  await ensureTextNode('JourneyHeader-h', col.header, JOURNEY_HEADER_FONT_PX, 'CENTER', 0, 50);
  await ensureTextNode(
    'JourneyHeader-sub',
    col.subheader,
    JOURNEY_SUBHEADER_FONT_PX,
    'CENTER',
    60,
    30,
  );

  // T46.6 cleanup: verwijder eventuele oude JourneyHeader-body TEXT-nodes
  // (legacy van pre-T46.6 slides waar body-veld nog bestond).
  for (var ci = cell.children.length - 1; ci >= 0; ci--) {
    var ch = cell.children[ci];
    if (ch.type === 'TEXT' && ch.name === 'JourneyHeader-body') {
      try {
        ch.remove();
      } catch (_e) {}
    }
  }
}
