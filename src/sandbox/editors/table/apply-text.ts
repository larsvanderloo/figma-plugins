// ============================================================
// editors/table/apply-text.ts
//
// In-place fast-path for table updates. A full applyTable() clears the Slot
// and rebuilds ~30 nodes (createFrame/createText + variable binds) — ~210ms,
// which makes typing lag. The common edit while typing only changes a cell's
// text, not the table structure. This path detects that case and writes the
// new value straight onto the existing TEXT nodes, skipping the rebuild.
//
// It deliberately handles ONLY value/bullet changes (plus the footer-sums
// those values drive). ANY other difference — row/column count, header flag,
// emphasis, delta text, calc/label/footer-styling — returns false so the
// caller falls back to the full applyTable(). The preflight must compare
// CONTENT, not presence: everything the fast path can't write but lets
// through would otherwise be silently dropped until the next full render.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableWrapModel, TableRowModel } from '../../../shared/types';
import {
  columnCalculationsEqual,
  columnEmphasisEqual,
  columnLabelsEqual,
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';
import { tableDeltaDisplay } from '../../../shared/table-delta';
import { applyCellText, CELL_VALUE_NAME } from './build-rows';
import { footerCanvasText } from './footer';
import {
  readHasColumnHeader,
  readColumnCalculations,
  readColumnCalculationEmphasis,
  readColumnCalculationCurrency,
  readColumnCalculationPercent,
  readColumnCalculationLabel,
} from './plugin-data';

function findContentContainer(slot: SlotNode): FrameNode | null {
  for (let i = 0; i < slot.children.length; i++) {
    const child = slot.children[i];
    if (child.type === 'FRAME' && child.name === 'WelderTableContent') return child as FrameNode;
  }
  return null;
}

function isRowFrame(node: SceneNode): boolean {
  return (
    node.type === 'FRAME' &&
    (node.name.indexOf('TableRow') === 0 || node.name.indexOf('TableHeaderRow') === 0)
  );
}

function cellTextNode(cellFrame: FrameNode): TextNode | null {
  let t = cellFrame.findOne(function (n: SceneNode): boolean {
    return n.type === 'TEXT' && n.name === CELL_VALUE_NAME;
  });
  if (t === null) {
    t = cellFrame.findOne(function (n: SceneNode): boolean {
      return n.type === 'TEXT';
    });
  }
  return t !== null && t.type === 'TEXT' ? (t as TextNode) : null;
}

// A cell qualifies for the fast path only when its non-text attributes are
// unchanged: same emphasis (font), same delta/badge/check content (node
// structure). Any such change needs the full rebuild.
function cellStructureMatches(
  cellFrame: FrameNode,
  desiredCell: { emphasis?: boolean; delta?: string; check?: boolean; badge?: string },
): boolean {
  const curEmphasis = cellFrame.getPluginData('emphasis') === '1';
  if (curEmphasis !== (desiredCell.emphasis === true)) return false;
  const curDelta = cellFrame.getPluginData('delta');
  const wantDelta = tableDeltaDisplay(desiredCell.delta);
  // Vergelijk de delta-TEKST, niet alleen presence: de fast-path schrijft de
  // badge-label niet, dus élk delta-verschil ('▲ 12%'→'▲ 15%') moet naar de
  // full render — presence-only zou zo'n edit stil droppen.
  if (curDelta !== (wantDelta !== null ? wantDelta : '')) return false;
  // Zelfde content-vergelijking voor vinkje en nummer-badge: de fast-path
  // schrijft alleen CellValue-tekst, dus elk verschil hier → full render.
  const curCheck = cellFrame.getPluginData('check');
  const wantCheck =
    desiredCell.check === true ? '1' : desiredCell.check === false ? '0' : '';
  if (curCheck !== wantCheck) return false;
  const curBadge = cellFrame.getPluginData('badge');
  const wantBadge =
    typeof desiredCell.badge === 'string' && desiredCell.badge.trim() !== ''
      ? desiredCell.badge.trim()
      : '';
  if (curBadge !== wantBadge) return false;
  return true;
}

// De volledige calc-state moet EXACT overeenkomen — niet alleen footer-
// presence. Een som die van kolom wisselt, een footer-label-edit of een
// emphasis/currency/percent-toggle verandert de footer-rij, en die styling
// schrijft de fast-path niet; zonder content-vergelijking zou zo'n edit stil
// gedropt worden tot de volgende full render. Alles komt uit pluginData
// (goedkoop) i.p.v. een full slot-scan.
function calcStateMatches(slot: SlotNode, desired: TableWrapModel, columnCount: number): boolean {
  if (
    !columnCalculationsEqual(
      desired.columnCalculations,
      readColumnCalculations(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationEmphasis,
      readColumnCalculationEmphasis(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationCurrency,
      readColumnCalculationCurrency(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      desired.columnCalculationPercent,
      readColumnCalculationPercent(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  if (
    !columnLabelsEqual(
      desired.columnCalculationLabel,
      readColumnCalculationLabel(slot, columnCount),
      columnCount,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Try to apply `desired` by writing cell text in place. Returns true on
 * success (no rebuild needed), false when a structural difference means the
 * caller must fall back to the full applyTable().
 *
 * NOTE: this updates text only — it does NOT re-fit the font size or column
 * widths. Those are stable across a same-structure text edit in the common
 * case; the next full apply (on blur / structural change / scan) reconciles
 * any drift. Skipping the measure+fit+build is the whole point of the path.
 */
export function applyTableTextOnly(slot: SlotNode, desired: TableWrapModel): boolean {
  const container = findContentContainer(slot);
  if (container === null) return false;

  // Alleen tabellen op de huidige canvas-schemaversie mogen in-place worden
  // bijgeschreven. Oudere tabellen (v<5, vóór de leadingTrim/clipsContent-
  // typografie) nemen zo één keer de full-rebuild-route en zien de nieuwe
  // stijl direct — daarna geldt de fast-path weer.
  if (slot.getPluginData('v') !== '5') return false;

  // Header flag / volledige calc-state moeten matchen (row-set + footer-
  // styling). Alles komt uit pluginData — veel goedkoper dan een slot-scan.
  if (readHasColumnHeader(slot) !== desired.hasColumnHeader) return false;
  let columnCount = 0;
  for (let i = 0; i < desired.rows.length; i++) {
    if (desired.rows[i].cells.length > columnCount) columnCount = desired.rows[i].cells.length;
  }
  if (!calcStateMatches(slot, desired, columnCount)) return false;

  // Collect current row frames in order.
  const rowFrames: FrameNode[] = [];
  for (let i = 0; i < container.children.length; i++) {
    const node = container.children[i];
    if (isRowFrame(node)) rowFrames.push(node as FrameNode);
  }

  // Desired rows after the renderer's empty-body-row filter: the canvas only
  // holds the header + non-empty body rows, so compare against that set.
  const hasHeader = desired.hasColumnHeader && desired.rows.length > 0;
  const effective: TableRowModel[] = [];
  for (let i = 0; i < desired.rows.length; i++) {
    if (hasHeader && i === 0) {
      effective.push(desired.rows[i]);
      continue;
    }
    let hasContent = false;
    for (let j = 0; j < desired.rows[i].cells.length; j++) {
      if (desired.rows[i].cells[j].value !== '') {
        hasContent = true;
        break;
      }
    }
    if (hasContent) effective.push(desired.rows[i]);
  }

  // Row-count mismatch → structure changed (row added/removed or an empty row
  // appeared/disappeared, which shifts dividers) → full rebuild.
  if (rowFrames.length !== effective.length) return false;

  // First pass: verify every cell matches structurally before mutating, so we
  // never leave a half-updated table when bailing to the full path.
  for (let r = 0; r < rowFrames.length; r++) {
    const cellFrames: FrameNode[] = [];
    for (let c = 0; c < rowFrames[r].children.length; c++) {
      const node = rowFrames[r].children[c];
      if (
        node.type === 'FRAME' &&
        (node.name.indexOf('TableItem') === 0 || node.name.indexOf('TableHeaderItem') === 0)
      ) {
        cellFrames.push(node as FrameNode);
      }
    }
    const desiredCells = effective[r].cells;
    if (cellFrames.length !== desiredCells.length) return false;
    const isHeaderRow = hasHeader && r === 0;
    for (let c = 0; c < cellFrames.length; c++) {
      // Header cells carry no emphasis/delta; only body cells need the check.
      if (!isHeaderRow && !cellStructureMatches(cellFrames[c], desiredCells[c])) return false;
      if (cellTextNode(cellFrames[c]) === null) return false;
    }
  }

  // Record each row's height before the write so we can detect whether the
  // edit changed how a row wraps (and thus its height).
  const heightsBefore: number[] = [];
  for (let r = 0; r < rowFrames.length; r++) heightsBefore.push(rowFrames[r].height);

  // Second pass: structure verified — write the text in place.
  for (let r = 0; r < rowFrames.length; r++) {
    const cellFrames: FrameNode[] = [];
    for (let c = 0; c < rowFrames[r].children.length; c++) {
      const node = rowFrames[r].children[c];
      if (
        node.type === 'FRAME' &&
        (node.name.indexOf('TableItem') === 0 || node.name.indexOf('TableHeaderItem') === 0)
      ) {
        cellFrames.push(node as FrameNode);
      }
    }
    const desiredCells = effective[r].cells;
    const isHeaderRow = hasHeader && r === 0;
    for (let c = 0; c < cellFrames.length; c++) {
      const t = cellTextNode(cellFrames[c]);
      if (t === null) continue;
      // Koprij-cellen renderen '- ' letterlijk (buildHeaderCell parseert geen
      // bullets) — schrijf raw zodat fast-path en full render identiek zijn.
      if (isHeaderRow) {
        t.characters = desiredCells[c].value;
      } else {
        applyCellText(t, desiredCells[c].value);
      }
    }
  }

  // Footer-sommen in place bijwerken: cel-waarden bepalen de som, dus een
  // tekst-edit verandert de footer-waarde terwijl de calc-state gelijk blijft
  // (hierboven bewezen door calcStateMatches) — styling/font is dus
  // ongewijzigd en alleen `.characters` hoeft mee. maxLines=1 houdt de
  // footer-hoogte stabiel, dus de height-check hieronder blijft geldig.
  const calcs = normalizeColumnCalculations(desired.columnCalculations, columnCount);
  if (hasColumnCalculations(calcs)) {
    const summaries = computeTableColumnSummaries(
      desired.rows,
      hasHeader,
      calcs,
      columnCount,
      normalizeColumnEmphasis(desired.columnCalculationEmphasis, columnCount),
      normalizeColumnEmphasis(desired.columnCalculationCurrency, columnCount),
      normalizeColumnEmphasis(desired.columnCalculationPercent, columnCount),
    );
    let footerRow: FrameNode | null = null;
    for (let i = 0; i < container.children.length; i++) {
      const node = container.children[i];
      if (node.type === 'FRAME' && node.name === 'TableFooterRow') {
        footerRow = node as FrameNode;
        break;
      }
    }
    // Sommen gewenst maar geen footer-rij op canvas → structuur wijkt af.
    if (footerRow === null) return false;
    for (let c = 0; c < footerRow.children.length; c++) {
      const cell = footerRow.children[c];
      if (cell.type !== 'FRAME' || cell.name.indexOf('TableFooterItem-c') !== 0) continue;
      const j = parseInt(cell.name.slice('TableFooterItem-c'.length), 10);
      if (!(j >= 0) || j >= summaries.length) continue;
      const summary = summaries[j];
      // Label-kolommen (summary null) zijn tekstueel ongewijzigd bewezen.
      if (summary === null) continue;
      const t = (cell as FrameNode).findOne(function (n: SceneNode): boolean {
        return n.type === 'TEXT';
      });
      if (t !== null && t.type === 'TEXT') {
        (t as TextNode).characters = footerCanvasText(summary);
      }
    }
  }

  // The in-place write keeps the existing font size and per-row padding (the
  // speed win). That's only valid when the edit DIDN'T change any row's height
  // — i.e. it stayed on the same number of wrap-lines. If a row grew or shrank
  // (auto-layout has already reflowed synchronously), the table needs the full
  // applyTable() to re-fit the font and re-distribute the fill across rows, so
  // one row doesn't end up tall while the rest stay short. Bail in that case.
  const HEIGHT_EPSILON = 1;
  for (let r = 0; r < rowFrames.length; r++) {
    if (Math.abs(rowFrames[r].height - heightsBefore[r]) > HEIGHT_EPSILON) return false;
  }

  return true;
}
