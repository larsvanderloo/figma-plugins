// ============================================================
// editors/general/badge.ts
//
// Main-thread mutator voor de General → Badge-sectie (spec §9-T9).
// Zoekt binnen de slide de Badge-instance (spec §7.2) en muteert:
//   1. Het label — descendant text-node met name 'Label'
//      (fallback: eerste text-node binnen de badge).
//   2. Het icon — drie strategieën in prioriteitsvolgorde:
//
//        (a) PRIMARY — INSTANCE_SWAP-property op badge-level
//            (preferredValues + setProperties).
//        (b) FALLBACK — INSTANCE_SWAP-property op een nested icon-child
//            (bv. via een icon_wrapper frame).
//        (c) LAST RESORT — Text-node met name 'Icon' (icon-font-pattern).
//
// FIG-FONT-01: text-mutaties gaan door loadFontAsync.
// FIG-GUARD-01: alle node-type-checks vóór type-specifieke properties.
// FIG-TRAVERSE-01: traversal bounded via findChild / findOne.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { findBadge } from '../../slide-machine';
import {
  normalizeIconKey,
  trySwapViaInstanceProperty,
  swapComponentByName,
} from '../_shared/icon-swap';
import { replaceIconViaSlot } from '../_shared/icon-slot';
import { findNestedIconInstance, findTextByName } from '../_shared/node-finders';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../debug';

import type { BadgePayload } from '../../types';

// ============================================================
// Text helpers  (label + icon-font fallback)
// ============================================================

function findFirstText(scope: SceneNode): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => n.type === 'TEXT');
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found as TextNode;
}

// ============================================================
// applyIconSwap — orchestratie
// ============================================================

/**
 * Best-effort icon-swap. Probeert in volgorde:
 *   1. INSTANCE_SWAP-property op badge-level (primary).
 *   2. INSTANCE_SWAP-property op de nested icon-child (fallback
 *      wanneer de badge zelf geen icon-property heeft maar wél een
 *      icon_wrapper met een geneste icon-instance).
 *   3. Text-node met name 'Icon' (icon-font-pattern, last resort).
 *
 * Retourneert true als een van de strategieën slaagde.
 */
async function applyIconSwap(badge: InstanceNode, iconName: string): Promise<boolean> {
  // --- Strategy 1: INSTANCE_SWAP property on badge itself ---
  if (await trySwapViaInstanceProperty(badge, iconName)) return true;

  // --- Strategy 2: INSTANCE_SWAP property on nested icon-child ---
  const nestedIcon = findNestedIconInstance(badge);
  if (nestedIcon !== null) {
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) return true;
  }

  // --- Strategy 2.5: swapComponent via prefValueCache on nested icon ---
  // For badges whose icon_wrapper child is a plain Lucide INSTANCE (no
  // INSTANCE_SWAP property), we swap the component directly.
  if (nestedIcon !== null) {
    if (await swapComponentByName(nestedIcon, iconName)) return true;
  }

  // --- Strategy 3: Text-node icon-font pattern ---
  const iconTextNode = findTextByName(badge, 'Icon');
  if (iconTextNode !== null) {
    await setTextCharactersSafe(iconTextNode, iconName);
    debugLog('badge', 'icon swapped → ' + iconName + ' (via Icon text-node)');
    return true;
  }

  console.log(
    '[welder-slide-editor] icon-swap failed for "' +
      iconName +
      '": no matching strategy on badge "' +
      badge.name +
      '"',
  );
  return false;
}

// ============================================================
// Public API
// ============================================================

/**
 * Past een Badge-payload toe op de Badge-instance van `slide`.
 * Resolveert zonder error wanneer de Badge of target-nodes ontbreken
 * (silent skip, FIG-GUARD-01). Icon-swap is best-effort.
 */
export async function applyBadge(slide: InstanceNode, payload: BadgePayload): Promise<void> {
  const badge = findBadge(slide);
  if (badge === null) return;

  if (typeof payload.label === 'string') {
    // Primary: try component TEXT property (most reliable for library components).
    var labelSet = false;
    var badgeProps = badge.componentProperties;
    if (badgeProps !== null && badgeProps !== undefined) {
      var propKeys = Object.keys(badgeProps);
      for (var pi = 0; pi < propKeys.length; pi++) {
        var propKey = propKeys[pi];
        var prop = badgeProps[propKey];
        if (prop.type === 'TEXT') {
          var patch: { [k: string]: string } = {};
          patch[propKey] = payload.label;
          try {
            badge.setProperties(patch);
            labelSet = true;
            debugLog('badge', 'label set via TEXT property "' + propKey + '"');
            break;
          } catch (e) {
            console.log(
              '[badge] setProperties failed for TEXT prop "' + propKey + '": ' + String(e),
            );
          }
        }
      }
    }
    // Fallback: direct text node mutation.
    if (!labelSet) {
      var labelNode = findTextByName(badge, 'Label');
      if (labelNode === null) {
        labelNode = findFirstText(badge);
      }
      if (labelNode !== null) {
        await setTextCharactersSafe(labelNode, payload.label);
        debugLog('badge', 'label set via text node');
      }
    }
  }

  if (typeof payload.icon === 'string' && payload.icon.length > 0) {
    let handled = false;
    if (typeof payload.iconSvg === 'string' && payload.iconSvg.length > 0) {
      handled = replaceIconViaSlot(badge, payload.icon, payload.iconSvg);
    }
    if (!handled) {
      await applyIconSwap(badge, payload.icon);
    }
    // Persist the picked icon as plugin data on the Badge instance —
    // mirrors the Card-side fix. Slot-child overrides do NOT survive
    // a library-master republish; plugin data does. Scan side reads it
    // and the iframe auto-reconciles if slot.child.name diverges.
    try {
      const desiredIconKey = normalizeIconKey(payload.icon);
      badge.setSharedPluginData('welder', 'icon', desiredIconKey);
      debugLog(
        'badge',
        'persisted icon="' + desiredIconKey + '" to plugin data on ' + badge.id,
      );
    } catch (e) {
      console.log('[badge] setSharedPluginData failed: ' + String(e));
    }
  }
}
