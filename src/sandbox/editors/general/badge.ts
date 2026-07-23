import { findBadge } from '../../slide-machine';
import {
  normalizeIconKey,
  trySwapViaInstanceProperty,
  swapComponentByName,
} from '../_shared/icon-swap';
import { replaceIconViaSlot } from '../_shared/icon-slot';
import { findNestedIconInstance, findTextByName } from '../_shared/node-finders';
import { readBadgeIcon } from '../../scan/readers';
import { setTextCharactersSafe } from '../_shared/fonts';
import { debugLog } from '../../../shared/debug';

import type { BadgePayload } from '../../../shared/types';

function findFirstText(scope: SceneNode): TextNode | null {
  if (!('findOne' in scope)) return null;
  const found = scope.findOne((n: SceneNode) => n.type === 'TEXT');
  if (found === null) return null;
  if (found.type !== 'TEXT') return null;
  return found as TextNode;
}

async function applyIconSwap(badge: InstanceNode, iconName: string): Promise<boolean> {
  if (await trySwapViaInstanceProperty(badge, iconName)) return true;

  const nestedIcon = findNestedIconInstance(badge);
  if (nestedIcon !== null) {
    if (await trySwapViaInstanceProperty(nestedIcon, iconName)) return true;
  }

  // Some badges nest a plain Lucide instance without an INSTANCE_SWAP property;
  // those need a direct component swap.
  if (nestedIcon !== null) {
    if (await swapComponentByName(nestedIcon, iconName)) return true;
  }

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

// Missing Badge or target nodes are a deliberate silent no-op; icon swap is best-effort.
export async function applyBadge(slide: InstanceNode, payload: BadgePayload): Promise<void> {
  const badge = findBadge(slide);
  if (badge === null) return;

  if (typeof payload.label === 'string') {
    // A component TEXT property is the most reliable path for library components.
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
    const desiredIconKey = normalizeIconKey(payload.icon);
    // The iframe resends the full payload (icon + iconSvg) on every label commit;
    // without this guard each label edit triggers a full slot teardown + SVG rebuild.
    // Compare the persisted plugin-data key AND the live slot content: a library
    // republish wipes the slot override but keeps plugin data, and the reconcile then
    // resends the same key — that re-apply must go through. First apply always runs.
    let appliedIconKey = '';
    try {
      appliedIconKey = badge.getSharedPluginData('welder', 'icon');
    } catch (e) {
      appliedIconKey = '';
    }
    const unchanged =
      typeof appliedIconKey === 'string' &&
      appliedIconKey.length > 0 &&
      normalizeIconKey(appliedIconKey) === desiredIconKey &&
      readBadgeIcon(badge) === desiredIconKey;
    if (unchanged) {
      debugLog('badge', 'icon unchanged ("' + desiredIconKey + '") — slot rebuild skipped');
    } else {
      let handled = false;
      if (typeof payload.iconSvg === 'string' && payload.iconSvg.length > 0) {
        handled = replaceIconViaSlot(badge, payload.icon, payload.iconSvg);
      }
      if (!handled) {
        await applyIconSwap(badge, payload.icon);
      }
      // Slot-child overrides do not survive a library-master republish; plugin data
      // does. The scan reads it and the iframe reconciles when the slot child diverges.
      try {
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
}
