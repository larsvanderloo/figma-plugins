// ============================================================
// editors/table/renderer.ts
//
// Slot-based table-renderer voor TableWrap-instances (T34.2, v0.2.0).
//
// TableWrap is een library-INSTANCE met een `<Slot>` erin; binnen die
// Slot bouwt de plugin zelf FRAMEs + TEXT-nodes. SlotNodes accepteren
// `appendChild` / `remove` zonder de "inside an instance"-constraint
// (T34-research §3.2, MCP-bevestigd 2026-04-24).
//
// Public API:
//   - scanTableSlot(slot)       → TableWrapModel (rij/kolom-structuur)
//   - applyTable(slot, desired) → full-state PUT (clear + rebuild)
//
// CSV-import zit in `./csv.ts` (split om de 200-LOC-budget te halen).
// Idem voor de overige concerns: `./metrics.ts` (layout-metrics),
// `./plugin-data.ts` (pluginData read/write), `./scan.ts` (slot-scan),
// `./build-rows.ts` (body/header-rows), `./footer.ts` (footer-rij) en
// `./sizing.ts` (width/autofit/truncation). Dit bestand is de composer;
// de read-API wordt hieronder ge-re-exporteerd zodat importers
// `./renderer` blijven zien.
//
// Theme-binding: cell-kleuren + row-dividers via `setBoundVariableForPaint`
// op de library-variables `Text` + `Text Dimmer`. Theme-switching werkt
// automatisch via Figma's variable-modes.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { TableWrapModel, TableRowModel } from '../../../shared/types';
import {
  TABLE_AUTOFIT_MIN_COL,
  TABLE_AUTOFIT_MAX_COL_FRACTION,
} from '../../../shared/constants';
import { debugLog } from '../../../shared/debug';
import {
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
} from '../../../shared/table-calculations';
import { findEnclosingSurfaceName } from '../../slide-machine';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from '../_shared/accent-vars';
import { computeColumnWidths } from './column-autofit';
import { createTextMeasurer } from './measure';
import { getFontSizes, computeRowPadding, computeTableLayoutMetrics } from './metrics';
import {
  writeColumnCalculations,
  writeColumnCalculationEmphasis,
  writeColumnCalculationCurrency,
  writeColumnCalculationPercent,
} from './plugin-data';
import { buildRow, buildHeaderRow } from './build-rows';
import { buildFooterRow } from './footer';
import {
  buildColumnSpecs,
  applyColumnSizing,
  tableCellBudget,
  applyBodyTruncation,
  resolveTableRenderWidth,
} from './sizing';

export { scanTableSlot } from './scan';
export {
  readColumnCalculations,
  readColumnCalculationEmphasis,
  readColumnCalculationCurrency,
  readColumnCalculationPercent,
} from './plugin-data';

// -------------------------------------------------------------------
// Apply — full-state PUT binnen de Slot
// -------------------------------------------------------------------

/**
 * Bouwt de outer wrapper-FRAME waar alle rijen in komen.
 * Styling conform design-reference (Figma MCP node 91:3175):
 * - 2px border bound aan Text Dimmer
 * - 32px corner radius
 * - 32px horizontaal + 24px verticaal padding
 * Caller roept `container.resize(targetWidth, targetHeight)` NA appendChild
 * aan de Slot, zodat de container de actuele Slot-afmetingen volgt.
 */
function buildTableContainer(dimmerVar: Variable, dimmerRGB: RGB): FrameNode {
  const container = figma.createFrame();
  container.name = 'WelderTableContent';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'FIXED'; // T39: slot-FILL
  container.counterAxisSizingMode = 'FIXED';
  container.itemSpacing = 0;
  // T41.10: paddings synchroon met user-canvas-design.
  // - paddingLeft/Right = 32 (was 0 in T41.6) — dividers krijgen weer
  //   32px gap voor de container-borders. Caller MOET paddingTop
  //   conditioneel zetten op hasHeader (24 zonder, 17 met) om symmetrie
  //   met body's eigen padding te bewaren.
  container.paddingTop = 24; // default; caller overschrijft naar 17 als hasHeader
  container.paddingBottom = 24;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.cornerRadius = 55;
  // T42.5: clip body-cell-overflow zodat te lange wrappende text niet
  // visueel uitloopt naar andere rijen of de header-area.
  container.clipsContent = true;
  container.fills = [];
  container.strokes = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: dimmerRGB },
      'color',
      dimmerVar,
    ),
  ];
  container.strokeWeight = 2;
  container.strokeAlign = 'INSIDE';
  return container;
}

/**
 * Full-state PUT: clear alle Slot-children en bouw opnieuw uit `desired`.
 * Persisteer `hasColumnHeader` + migration-marker op pluginData. (T44:
 * width/textSize-keys worden actief gewist — tabelbreedte volgt de actuele
 * Slot-breedte, fontSize wordt rendertime afgeleid uit slot.height + rowCount.)
 *
 * Width-strategie:
 * - Container rendert full-width binnen de actuele Slot-breedte.
 * - Surface presets zijn alleen fallback voor legacy/invalid slots.
 * - De renderer pusht TableWrap/Slot niet meer terug naar de surface-width,
 *   zodat toekomstige smallere slot-varianten automatisch gevolgd worden.
 *
 * Silent-fallback wanneer library-vars niet geladen kunnen worden:
 * pluginData wordt nog steeds geschreven, alleen de content-rebuild
 * skipt (user ziet lege Slot + log-melding).
 */
export async function applyTable(slot: SlotNode, desired: TableWrapModel): Promise<void> {
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  const vars = await loadAccentVars();

  // Clear existing children (toegestaan binnen SlotNode).
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slot.children.length; i++) snapshot.push(slot.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
      /* silent */
    }
  }

  // Pad ragged rows (CSV-import kan rijen met minder cellen leveren) tot een
  // rechthoek — FIXED kolom-breedtes mogen niet per rij verspringen.
  let columnCount = 0;
  for (let i = 0; i < desired.rows.length; i++) {
    if (desired.rows[i].cells.length > columnCount) columnCount = desired.rows[i].cells.length;
  }
  for (let i = 0; i < desired.rows.length; i++) {
    const cells = desired.rows[i].cells;
    while (cells.length < columnCount) cells.push({ cellNodeId: '', value: '' });
  }
  const columnCalculations = normalizeColumnCalculations(desired.columnCalculations, columnCount);
  const columnCalculationEmphasis = normalizeColumnEmphasis(
    desired.columnCalculationEmphasis,
    columnCount,
  );
  const columnCalculationCurrency = normalizeColumnEmphasis(
    desired.columnCalculationCurrency,
    columnCount,
  );
  const columnCalculationPercent = normalizeColumnEmphasis(
    desired.columnCalculationPercent,
    columnCount,
  );
  // T46.1 — kolommen met een (numerieke) som-berekening worden volledig
  // rechts uitgelijnd (Notion number-column-stijl): header, body én footer.
  const rightAlignColumns: boolean[] = [];
  for (let j = 0; j < columnCount; j++) rightAlignColumns.push(columnCalculations[j] === 'sum');

  const surfaceName = findEnclosingSurfaceName(slot);
  const targetWidth = resolveTableRenderWidth(slot, surfaceName, columnCount);

  if (vars.text !== null && vars.dimmer !== null) {
    const textRGB = resolveColor(vars.text, slot, { r: 1, g: 0.957, b: 0.918 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);

    // Outer wrapper-frame met border + padding + rounded corners.
    // Rijen komen in de container, niet direct in de Slot.
    const container = buildTableContainer(vars.dimmer, dimmerRGB);
    slot.appendChild(container);

    // T39.1.1: SlotNode host geen auto-layout-FILL-children — `layoutSizingVertical='FILL'`
    // faalt silent voor slot-kinderen. Gebruik EXPLICIETE resize naar slot.height,
    // en naar de gemeten slot.width zodat content met toekomstige
    // smallere slot-varianten meebeweegt.
    // Container blijft FIXED in beide assen (al ingesteld in buildTableContainer).
    const targetHeight = slot.height > 0 ? slot.height : container.height;
    try {
      container.resize(targetWidth, targetHeight);
    } catch (_e) {
      /* silent — slot/container kan resize-locked zijn */
    }
    container.counterAxisSizingMode = 'FIXED';
    container.primaryAxisSizingMode = 'FIXED';

    // T41.2 — filter body-rijen die volledig leeg zijn (alle cells === '').
    // Header rij (rij 0 wanneer hasHeader) blijft altijd staan ongeacht inhoud.
    // Lege rijen blijven in de UI/data, alleen de canvas-rendering skipt ze.
    // De round-trip (scan → iframe-watch) wordt afgevangen door TableEditor's
    // echo-guard zodat de user's in-progress structure niet geclobberd wordt
    // door de canvas-truth scan na een filter-shrink (zie 2026-05-07 fix).
    const hasHeader = desired.hasColumnHeader && desired.rows.length > 0;

    const effectiveRows: TableRowModel[] = [];
    for (let i = 0; i < desired.rows.length; i++) {
      if (hasHeader && i === 0) {
        effectiveRows.push(desired.rows[i]);
        continue;
      }
      let hasContent = false;
      for (let j = 0; j < desired.rows[i].cells.length; j++) {
        if (desired.rows[i].cells[j].value !== '') {
          hasContent = true;
          break;
        }
      }
      if (hasContent) effectiveRows.push(desired.rows[i]);
    }

    // T40 — body-fontSize-formule: alleen body-rijen krijgen FILL;
    // header reserveert ~50px van de slot-hoogte (text-area + 16+16 padding).
    const HEADER_HEIGHT_ESTIMATE = 50;
    const FOOTER_HEIGHT_ESTIMATE = 40;
    const bodyRowCount = hasHeader ? effectiveRows.length - 1 : effectiveRows.length;
    const hasFooter = hasColumnCalculations(columnCalculations);
    const footerSummaries = computeTableColumnSummaries(
      desired.rows,
      hasHeader,
      columnCalculations,
      columnCount,
      columnCalculationEmphasis,
      columnCalculationCurrency,
      columnCalculationPercent,
    );
    const adjustedSlotHeight =
      slot.height - (hasHeader ? HEADER_HEIGHT_ESTIMATE : 0) - (hasFooter ? FOOTER_HEIGHT_ESTIMATE : 0);
    const metrics = computeTableLayoutMetrics(columnCount, bodyRowCount);
    container.paddingLeft = metrics.containerPadX;
    container.paddingRight = metrics.containerPadX;
    container.paddingTop = hasHeader ? metrics.headerPadTop + 3 : metrics.headerPadBottom;
    container.paddingBottom = metrics.headerPadBottom;

    // T44: fontSize volledig automatisch uit hoogte + rowCount.
    const sizes = getFontSizes(adjustedSlotHeight, bodyRowCount > 0 ? bodyRowCount : 1);

    const cellBudget = tableCellBudget(targetWidth, columnCount, metrics);
    const columnSpecs = buildColumnSpecs(
      effectiveRows,
      hasHeader,
      sizes,
      columnCount,
      footerSummaries,
    );
    const measurer = createTextMeasurer();
    const measured = measurer !== null;
    let colWidths: number[] = [];
    try {
      colWidths = computeColumnWidths(
        columnSpecs,
        {
          totalWidth: cellBudget,
          minColWidth: TABLE_AUTOFIT_MIN_COL,
          maxColFraction: TABLE_AUTOFIT_MAX_COL_FRACTION,
        },
        measurer !== null ? measurer.measure : null,
      );
    } finally {
      if (measurer !== null) measurer.dispose();
    }
    debugLog('table', 'autofit', {
      colWidths: colWidths,
      budget: cellBudget,
      targetWidth: targetWidth,
      slotWidth: slot.width,
      measured: measured,
      gap: metrics.rowGap,
      rowPadX: metrics.rowPadX,
      containerPadX: metrics.containerPadX,
    });

    // T42.16: collect body-rows voor post-FILL truncation pass.
    const bodyRows: FrameNode[] = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      let rowFrame: FrameNode;
      if (hasHeader && i === 0) {
        rowFrame = buildHeaderRow(
          effectiveRows[i],
          vars.text,
          vars.dimmer,
          textRGB,
          dimmerRGB,
          rightAlignColumns,
          metrics,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          /* silent */
        }
        // T40: header is HUG-vertical (compact, niet mee-rekken).
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
          /* silent */
        }
      } else {
        // Body row — bodyIndex zorgt dat eerste body-rij geen top-divider krijgt
        // (anders dubbel met de header's bottom-divider).
        const bodyIndex = hasHeader ? i - 1 : i;
        const rowPadding = computeRowPadding(bodyRowCount);
        rowFrame = buildRow(
          effectiveRows[i],
          bodyIndex,
          sizes,
          vars.text,
          vars.dimmer,
          textRGB,
          dimmerRGB,
          rowPadding,
          rightAlignColumns,
          metrics,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          /* silent */
        }
        // T39: rows FILL vertical (was HUG) — verdelen container-hoogte gelijk.
        try {
          rowFrame.layoutSizingVertical = 'FILL';
        } catch (_e) {
          /* silent */
        }
        bodyRows.push(rowFrame);
      }
    }

    if (hasFooter) {
      const footerRow = buildFooterRow(
        footerSummaries,
        sizes,
        vars.text,
        textRGB,
        vars.dimmer,
        dimmerRGB,
        computeRowPadding(bodyRowCount),
        metrics,
      );
      applyColumnSizing(footerRow, colWidths);
      container.appendChild(footerRow);
      try {
        footerRow.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* silent */
      }
      try {
        footerRow.layoutSizingVertical = 'HUG';
      } catch (_e) {
        /* silent */
      }
    }

    // T42.18: cell + text beide FILL-vertical → text fills exact cell-bounds,
    // textTruncation='ENDING' truncate't visueel. Geen analytische berekening
    // meer nodig; Figma doet de math native.
    applyBodyTruncation(bodyRows);
  } else {
    console.log('[welder-slide-editor] applyTable: library-vars missing, skipping rebuild');
  }

  // T44: stale width/textSize-keys actief wissen (lege string = delete).
  slot.setPluginData('width', '');
  slot.setPluginData('textSize', '');
  slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
  writeColumnCalculations(slot, columnCalculations, columnCount);
  writeColumnCalculationEmphasis(slot, columnCalculationEmphasis, columnCount);
  writeColumnCalculationCurrency(slot, columnCalculationCurrency, columnCount);
  writeColumnCalculationPercent(slot, columnCalculationPercent, columnCount);
  slot.setPluginData('kind', 'welder-tablewrap');
  slot.setPluginData('v', '4');
}
