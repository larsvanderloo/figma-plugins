// Empty string is Figma's pluginData sentinel: setPluginData('') deletes the
// key and getPluginData returns '' for missing keys, so '' means "unset" here.

import type { TableColumnCalculationSetting } from '../../../shared/types';
import {
  hasColumnCalculations,
  hasColumnLabels,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
  normalizeColumnLabels,
} from '../../../shared/table-calculations';

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

export function readColumnCalculationPercent(slot: SlotNode, columnCount: number): boolean[] {
  const raw = slot.getPluginData('columnCalculationPercent');
  if (raw === '') return normalizeColumnEmphasis(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnEmphasis(undefined, columnCount);
    return normalizeColumnEmphasis(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnEmphasis(undefined, columnCount);
  }
}

export function writeColumnCalculationPercent(
  slot: SlotNode,
  percent: readonly boolean[],
  columnCount: number,
): void {
  const normalized = normalizeColumnEmphasis(percent, columnCount);
  if (!hasAnyEmphasis(normalized)) {
    slot.setPluginData('columnCalculationPercent', '');
    return;
  }
  slot.setPluginData('columnCalculationPercent', JSON.stringify(normalized));
}

export function readColumnCalculationLabel(slot: SlotNode, columnCount: number): string[] {
  const raw = slot.getPluginData('columnCalculationLabel');
  if (raw === '') return normalizeColumnLabels(undefined, columnCount);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return normalizeColumnLabels(undefined, columnCount);
    return normalizeColumnLabels(parsed, columnCount);
  } catch (_e) {
    return normalizeColumnLabels(undefined, columnCount);
  }
}

export function writeColumnCalculationLabel(
  slot: SlotNode,
  labels: readonly string[],
  columnCount: number,
): void {
  const normalized = normalizeColumnLabels(labels, columnCount);
  if (!hasColumnLabels(normalized)) {
    slot.setPluginData('columnCalculationLabel', '');
    return;
  }
  slot.setPluginData('columnCalculationLabel', JSON.stringify(normalized));
}
