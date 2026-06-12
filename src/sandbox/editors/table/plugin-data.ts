// ============================================================
// editors/table/plugin-data.ts
//
// PluginData read/write voor de TableWrap-Slot: header-flag (T40) en
// de per-kolom calculation-settings (som, emphasis, currency — T46).
// Lege string = key-delete; normalisatie loopt via de gedeelde
// helpers in `shared/table-calculations`.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableColumnCalculationSetting } from '../../../shared/types';
import {
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';

/** T40 — leest of de tabel een header-rij heeft. Default false. */
export function readHasColumnHeader(slot: SlotNode): boolean {
  return slot.getPluginData('hasColumnHeader') === '1';
}

export function readColumnCalculations(
  slot: SlotNode,
  columnCount: number,
): TableColumnCalculationSetting[] {
  const raw = slot.getPluginData('columnCalculations');
  if (raw === '') return normalizeColumnCalculations(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnCalculations(undefined, columnCount);
    return normalizeColumnCalculations(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnCalculations(undefined, columnCount);
  }
}

export function writeColumnCalculations(
  slot: SlotNode,
  settings: readonly TableColumnCalculationSetting[],
  columnCount: number,
): void {
  const normalized = normalizeColumnCalculations(settings, columnCount);
  if (!hasColumnCalculations(normalized)) {
    slot.setPluginData('columnCalculations', '');
    return;
  }
  slot.setPluginData('columnCalculations', JSON.stringify(normalized));
}

function hasAnyEmphasis(emphasis: readonly boolean[]): boolean {
  for (let i = 0; i < emphasis.length; i++) {
    if (emphasis[i] === true) return true;
  }
  return false;
}

export function readColumnCalculationEmphasis(slot: SlotNode, columnCount: number): boolean[] {
  const raw = slot.getPluginData('columnCalculationEmphasis');
  if (raw === '') return normalizeColumnEmphasis(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnEmphasis(undefined, columnCount);
    return normalizeColumnEmphasis(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnEmphasis(undefined, columnCount);
  }
}

export function writeColumnCalculationEmphasis(
  slot: SlotNode,
  emphasis: readonly boolean[],
  columnCount: number,
): void {
  const normalized = normalizeColumnEmphasis(emphasis, columnCount);
  if (!hasAnyEmphasis(normalized)) {
    slot.setPluginData('columnCalculationEmphasis', '');
    return;
  }
  slot.setPluginData('columnCalculationEmphasis', JSON.stringify(normalized));
}

export function readColumnCalculationCurrency(slot: SlotNode, columnCount: number): boolean[] {
  const raw = slot.getPluginData('columnCalculationCurrency');
  if (raw === '') return normalizeColumnEmphasis(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnEmphasis(undefined, columnCount);
    return normalizeColumnEmphasis(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnEmphasis(undefined, columnCount);
  }
}

export function writeColumnCalculationCurrency(
  slot: SlotNode,
  currency: readonly boolean[],
  columnCount: number,
): void {
  const normalized = normalizeColumnEmphasis(currency, columnCount);
  if (!hasAnyEmphasis(normalized)) {
    slot.setPluginData('columnCalculationCurrency', '');
    return;
  }
  slot.setPluginData('columnCalculationCurrency', JSON.stringify(normalized));
}
