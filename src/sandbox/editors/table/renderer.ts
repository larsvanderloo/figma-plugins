// ============================================================
// editors/table/renderer.ts
//
// Slot-based table-renderer voor TableWrap-instances.
//
// TableWrap is een library-INSTANCE met een `<Slot>` erin; binnen die
// Slot bouwt de plugin zelf FRAMEs + TEXT-nodes. SlotNodes accepteren
// `appendChild` / `remove` zonder de "inside an instance"-constraint
// (MCP-bevestigd 2026-04-24).
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
  computeNumericColumns,
  computeTableColumnSummaries,
  hasColumnCalculations,
  normalizeColumnCalculations,
  normalizeColumnEmphasis,
  normalizeColumnLabels,
} from '../../../shared/table-calculations';
import { findEnclosingSurface } from '../../slide-machine';
import { loadAccentVars, resolveColor, TEXT_DIMMER_RGB } from '../_shared/accent-vars';
import { findDeltaBadgeTemplate } from '../_shared/delta-badge-node';
import { computeColumnWidths } from './column-autofit';
import { createTextMeasurer } from './measure';
import { fitBodyFontSize, HARD_MIN_BODY } from './fit';
import { getFontSizes, computeRowPadding, computeTableLayoutMetrics } from './metrics';

// Upper bound for the fit-to-slot body fontSize. Larger than getFontSizes'
// own caps: on a sparse slide the table should grow text to fill the slot,
// bounded only by what actually fits (fit.ts) and this ceiling.
const TABLE_BODY_FONT_MAX = 40;
import {
  writeColumnCalculations,
  writeColumnCalculationEmphasis,
  writeColumnCalculationCurrency,
  writeColumnCalculationPercent,
  writeColumnCalculationLabel,
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
  readColumnCalculationLabel,
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
  container.primaryAxisSizingMode = 'FIXED'; // slot-FILL
  container.counterAxisSizingMode = 'FIXED';
  container.itemSpacing = 0;
  // Paddings synchroon met user-canvas-design.
  // - paddingLeft/Right = 32 — dividers krijgen 32px gap voor de
  //   container-borders. Caller MOET paddingTop conditioneel zetten op
  //   hasHeader (24 zonder, 17 met) om symmetrie met body's eigen
  //   padding te bewaren.
  container.paddingTop = 24; // default; caller overschrijft naar 17 als hasHeader
  container.paddingBottom = 24;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.cornerRadius = 55;
  // Clip body-cell-overflow zodat te lange wrappende text niet
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
 * Persisteer `hasColumnHeader` + migration-marker op pluginData.
 * Width/textSize-keys worden actief gewist — tabelbreedte volgt de actuele
 * Slot-breedte, fontSize wordt rendertime afgeleid uit slot.height + rowCount.
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
export async function applyTable(slot: SlotNode, desired: TableWrapModel): Promise<boolean> {
  // Returns true when the content overflows the slot (clipped at the bottom)
  // even after the fit shrank to the minimum font — the caller surfaces a
  // warning in the editor.
  let overflowed = false;
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
  const columnCalculationLabel = normalizeColumnLabels(
    desired.columnCalculationLabel,
    columnCount,
  );
  // Getallen-kolommen worden volledig rechts uitgelijnd
  // (Notion/Excel number-column-stijl): header, body én footer. De
  // detectie is content-driven via computeNumericColumns — '45' telt,
  // '45 mensen' niet — onafhankelijk van een som-toggle.
  const rightAlignColumns = computeNumericColumns(
    desired.rows,
    desired.hasColumnHeader && desired.rows.length > 0,
    columnCount,
  );

  const surface = findEnclosingSurface(slot);
  const surfaceName = surface !== null ? surface.name : null;
  const targetWidth = resolveTableRenderWidth(slot, surfaceName, columnCount);
  // Badge-template één keer per apply zoeken (zelfde bron als de chart
  // delta-badge); cellen met een delta clonen dit voor de styled pill.
  const badgeTemplate = surface !== null ? findDeltaBadgeTemplate(surface) : null;

  if (vars.text !== null && vars.dimmer !== null) {
    const textRGB = resolveColor(vars.text, slot, { r: 1, g: 0.957, b: 0.918 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);

    // Outer wrapper-frame met border + padding + rounded corners.
    // Rijen komen in de container, niet direct in de Slot.
    const container = buildTableContainer(vars.dimmer, dimmerRGB);
    slot.appendChild(container);

    // SlotNode host geen auto-layout-FILL-children — `layoutSizingVertical='FILL'`
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

    // Filter body-rijen die volledig leeg zijn (alle cells === '').
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

    // Body-fontSize-formule: alleen body-rijen krijgen FILL;
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

    // Eerste fontSize-schatting uit hoogte + rowCount; daarna fit-to-slot
    // (zie hieronder) zodat wrappende cellen niet overflowen maar de tabel de
    // slot-hoogte wél vult.
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
    const bodyRowPadding = computeRowPadding(bodyRowCount);
    // Extra top/bottom padding added to each body row to distribute leftover
    // vertical space so the table fills the slot (set by the fit-to-slot pass).
    let extraRowPad = 0;
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
      // Fit-to-slot: grow the body fontSize to the largest value whose measured
      // (wrapped) content height still fits the slot. headingScale mirrors the
      // ratio between getFontSizes' heading/body so emphasis text scales along.
      if (measurer !== null && colWidths.length > 0) {
        const headingScale = sizes.body > 0 ? sizes.heading / sizes.body : 1.2;
        const fitted = fitBodyFontSize({
          rows: effectiveRows,
          hasHeader: hasHeader,
          columnCount: columnCount,
          colWidths: colWidths,
          availableHeight: adjustedSlotHeight,
          rowPadding: bodyRowPadding,
          rowGap: metrics.rowGap,
          minBody: sizes.body,
          maxBody: TABLE_BODY_FONT_MAX,
          headingScale: headingScale,
          measureHeight: measurer.measureHeight,
        });
        // Apply the fitted size whether it grows (fill the slot) or shrinks
        // below the getFontSizes floor (dense content that would otherwise
        // overflow). Keep heading proportional.
        if (fitted.body !== sizes.body) {
          sizes.body = fitted.body;
          sizes.heading = Math.round(fitted.body * headingScale);
        }
        // Distribute leftover vertical space across the body rows as extra
        // padding so the table fills the slot exactly (no gap at the bottom).
        // Font granularity means the largest fitting size usually still leaves
        // slack; spreading it as padding keeps row-dividers even.
        if (fitted.bodyRowCount > 0 && fitted.contentHeight > 0) {
          const slack = adjustedSlotHeight - fitted.contentHeight;
          if (slack > 0) {
            // Split per row, then halve again (padding is applied top AND
            // bottom, so each side gets half the per-row share).
            extraRowPad = Math.floor(slack / fitted.bodyRowCount / 2);
          }
        }
      }
    } finally {
      if (measurer !== null) measurer.dispose();
    }
    debugLog('table', 'autofit', {
      colWidths: colWidths,
      budget: cellBudget,
      targetWidth: targetWidth,
      slotWidth: slot.width,
      measured: measured,
      bodyFont: sizes.body,
      headingFont: sizes.heading,
      gap: metrics.rowGap,
      rowPadX: metrics.rowPadX,
      containerPadX: metrics.containerPadX,
    });

    // Collect body-rows voor post-FILL truncation pass.
    const bodyRows: FrameNode[] = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      let rowFrame: FrameNode;
      if (hasHeader && i === 0) {
        rowFrame = buildHeaderRow(
          effectiveRows[i],
          sizes,
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
        // Header is HUG-vertical (compact, niet mee-rekken).
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
          /* silent */
        }
      } else {
        // Body row — bodyIndex zorgt dat eerste body-rij geen top-divider krijgt
        // (anders dubbel met de header's bottom-divider).
        const bodyIndex = hasHeader ? i - 1 : i;
        // Base padding + the fit-to-slot slack share so the rows fill the slot.
        const rowPadding = computeRowPadding(bodyRowCount) + extraRowPad;
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
          badgeTemplate,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
          /* silent */
        }
        // Rows HUG vertical — groeien mee met de hoogste (wrappende) cel
        // i.p.v. de container-hoogte gelijk te verdelen. Voorkomt dat lange
        // gewrapte cellen mid-regel clippen. Container vult de slot-hoogte
        // alsnog via SPACE_BETWEEN wanneer de rijen samen korter zijn.
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
          /* silent */
        }
        bodyRows.push(rowFrame);
      }
    }

    if (hasFooter) {
      const footerRow = buildFooterRow(
        footerSummaries,
        columnCalculationLabel,
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

    // Cell + text beide FILL-vertical → text fills exact cell-bounds,
    // textTruncation='ENDING' truncate't visueel. Geen analytische berekening
    // meer nodig; Figma doet de math native.
    applyBodyTruncation(bodyRows);

    // Post-build slack top-up. The fit/extraRowPad estimate uses measured text
    // heights, which drift from the real render — leaving a gap at the bottom.
    // Now that auto-layout has reflowed with REAL heights, measure the actual
    // content height and distribute any remaining slack as extra padding on the
    // body rows. Measurement-free: no estimate, so no drift.
    if (bodyRows.length > 0) {
      let actualContent = container.paddingTop + container.paddingBottom;
      for (let i = 0; i < container.children.length; i++) {
        actualContent += container.children[i].height;
        if (i > 0) actualContent += container.itemSpacing;
      }
      const remaining = slot.height - actualContent;
      if (remaining > 2) {
        const addPerSide = Math.floor(remaining / bodyRows.length / 2);
        if (addPerSide > 0) {
          for (let i = 0; i < bodyRows.length; i++) {
            bodyRows[i].paddingTop += addPerSide;
            bodyRows[i].paddingBottom += addPerSide;
          }
        }
      } else if (remaining < -2 && sizes.body <= HARD_MIN_BODY) {
        // Content overflows AND the fit already shrank to the minimum font —
        // it genuinely can't fit and clips at the bottom. Warn the user.
        // (A small overflow at a larger font is left silent: the fit's
        // estimate can drift a notch, and a false warning is worse than a few
        // clipped pixels the user can see and fix on canvas.)
        overflowed = true;
      }
    }
  } else {
    console.log('[welder-slide-editor] applyTable: library-vars missing, skipping rebuild');
  }

  // Stale width/textSize-keys actief wissen (lege string = delete).
  slot.setPluginData('width', '');
  slot.setPluginData('textSize', '');
  slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
  writeColumnCalculations(slot, columnCalculations, columnCount);
  writeColumnCalculationEmphasis(slot, columnCalculationEmphasis, columnCount);
  writeColumnCalculationCurrency(slot, columnCalculationCurrency, columnCount);
  writeColumnCalculationPercent(slot, columnCalculationPercent, columnCount);
  writeColumnCalculationLabel(slot, columnCalculationLabel, columnCount);
  slot.setPluginData('kind', 'welder-tablewrap');
  slot.setPluginData('v', '4');
  return overflowed;
}
