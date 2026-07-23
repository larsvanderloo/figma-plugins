// Slot-based table renderer for TableWrap instances. TableWrap is a library
// INSTANCE with a <Slot> inside; SlotNodes accept appendChild/remove without
// the "inside an instance" constraint, so the plugin builds frames directly.

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
import {
  getFontSizes,
  computeRowPadding,
  computeTableLayoutMetrics,
  TABLE_ROW_PAD_EM,
} from './metrics';

// Upper bound for the fit-to-slot body fontSize, deliberately above
// getFontSizes' own caps: on a sparse slide text grows to fill the slot.
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

/**
 * Caller must resize() the container AFTER appendChild to the Slot so it
 * tracks the actual slot dimensions.
 */
function buildTableContainer(dimmerVar: Variable, dimmerRGB: RGB): FrameNode {
  const container = figma.createFrame();
  container.name = 'WelderTableContent';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'FIXED';
  container.counterAxisSizingMode = 'FIXED';
  container.itemSpacing = 0;
  container.paddingTop = 24; // default; applyTable overrides based on hasHeader
  container.paddingBottom = 24;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.cornerRadius = 55;
  // Clip so overlong wrapped cell text cannot bleed into other rows.
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
 * Full-state PUT: clear the Slot and rebuild from `desired`. Width follows
 * the live slot width (surface presets are only a legacy fallback) — the
 * renderer no longer pushes TableWrap/Slot back to the surface width, so
 * narrower future slot variants are tracked automatically. If library vars
 * fail to load, pluginData is still written but the content rebuild skips.
 */
export async function applyTable(slot: SlotNode, desired: TableWrapModel): Promise<boolean> {
  // Return value: true when content still overflows after the fit shrank to
  // the minimum font — the caller surfaces a warning in the editor.
  let overflowed = false;
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
  const vars = await loadAccentVars();

  // Removing children is allowed inside a SlotNode (unlike in an instance).
  const snapshot: SceneNode[] = [];
  for (let i = 0; i < slot.children.length; i++) snapshot.push(slot.children[i]);
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i].remove();
    } catch (_e) {
    }
  }

  // Pad ragged rows (CSV import may deliver short rows) to a rectangle —
  // FIXED column widths must not vary per row.
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
  // Numeric columns right-align header, body and footer. Detection is
  // content-driven ('45' counts, '45 people' does not), independent of the
  // sum toggle.
  const rightAlignColumns = computeNumericColumns(
    desired.rows,
    desired.hasColumnHeader && desired.rows.length > 0,
    columnCount,
  );

  const surface = findEnclosingSurface(slot);
  const surfaceName = surface !== null ? surface.name : null;
  const targetWidth = resolveTableRenderWidth(slot, surfaceName, columnCount);
  const badgeTemplate = surface !== null ? findDeltaBadgeTemplate(surface) : null;

  if (vars.text !== null && vars.dimmer !== null) {
    const textRGB = resolveColor(vars.text, slot, { r: 1, g: 0.957, b: 0.918 });
    const dimmerRGB = resolveColor(vars.dimmer, slot, TEXT_DIMMER_RGB);

    const container = buildTableContainer(vars.dimmer, dimmerRGB);
    slot.appendChild(container);

    // layoutSizing 'FILL' fails silently for SlotNode children — resize
    // explicitly to the measured slot width/height instead.
    const targetHeight = slot.height > 0 ? slot.height : container.height;
    try {
      container.resize(targetWidth, targetHeight);
    } catch (_e) {
      /* slot/container may be resize-locked */
    }
    container.counterAxisSizingMode = 'FIXED';
    container.primaryAxisSizingMode = 'FIXED';

    // Fully empty body rows stay in the UI data; only canvas rendering skips
    // them (the header row always renders). TableEditor's echo-guard keeps
    // the post-apply scan from clobbering the user's in-progress structure
    // after this filter shrinks the rendered set.
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

    // Header reserves ~50px of slot height (text area + 16+16 padding).
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

    // First fontSize estimate from height + rowCount; the fit-to-slot pass
    // below refines it so wrapped cells neither overflow nor underfill.
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
      // Grow body fontSize to the largest value whose measured wrapped height
      // still fits the slot; headingScale keeps emphasis text proportional.
      if (measurer !== null && colWidths.length > 0) {
        const headingScale = sizes.body > 0 ? sizes.heading / sizes.body : 1.2;
        const estimateBody = sizes.body;
        const runFit = function (widths: number[]) {
          return fitBodyFontSize({
            rows: effectiveRows,
            hasHeader: hasHeader,
            columnCount: columnCount,
            colWidths: widths,
            availableHeight: adjustedSlotHeight,
            rowPadding: bodyRowPadding,
            rowGap: metrics.rowGap,
            minBody: estimateBody,
            maxBody: TABLE_BODY_FONT_MAX,
            headingScale: headingScale,
            measureHeight: measurer.measureHeight,
          });
        };
        let fitted = runFit(colWidths);
        // Apply the fitted size even below the getFontSizes floor — dense
        // content would otherwise overflow. Slack is distributed ONLY in the
        // post-build pass with real node heights: estimate-based padding here
        // overfilled the slot (the fit misses header/container padding,
        // footer height, delta badges) and the add-only pass never recovers.
        if (fitted.body !== sizes.body) {
          sizes.body = fitted.body;
          sizes.heading = Math.round(fitted.body * headingScale);
          // Column widths were computed at the first font estimate; hug
          // columns fit their text exactly, so a large fit-growth would make
          // labels wrap. One recompute at the final size + one re-fit converges.
          const refitSpecs = buildColumnSpecs(
            effectiveRows,
            hasHeader,
            sizes,
            columnCount,
            footerSummaries,
          );
          const refitWidths = computeColumnWidths(
            refitSpecs,
            {
              totalWidth: cellBudget,
              minColWidth: TABLE_AUTOFIT_MIN_COL,
              maxColFraction: TABLE_AUTOFIT_MAX_COL_FRACTION,
            },
            measurer.measure,
          );
          if (refitWidths.length === colWidths.length) {
            colWidths = refitWidths;
            fitted = runFit(refitWidths);
            if (fitted.body !== sizes.body) {
              sizes.body = fitted.body;
              sizes.heading = Math.round(fitted.body * headingScale);
            }
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

    // Same padding formula the fit used (rowCount base + em part), evaluated
    // now that sizes.body is final — no estimate drift.
    const rowPadding = bodyRowPadding + Math.round(sizes.body * TABLE_ROW_PAD_EM);

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
        }
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
        }
      } else {
        // bodyIndex keeps the first body row's top divider off — it would
        // double the header's bottom divider.
        const bodyIndex = hasHeader ? i - 1 : i;
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
          colWidths,
        );
        applyColumnSizing(rowFrame, colWidths);
        container.appendChild(rowFrame);
        try {
          rowFrame.layoutSizingHorizontal = 'FILL';
        } catch (_e) {
        }
        // Rows HUG vertical so they grow with their tallest wrapping cell —
        // splitting container height equally would clip wrapped cells mid-line.
        try {
          rowFrame.layoutSizingVertical = 'HUG';
        } catch (_e) {
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
        rowPadding,
        metrics,
      );
      applyColumnSizing(footerRow, colWidths);
      container.appendChild(footerRow);
      try {
        footerRow.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
      }
      try {
        footerRow.layoutSizingVertical = 'HUG';
      } catch (_e) {
      }
    }

    // Cell + text both FILL vertical, so textTruncation='ENDING' clips
    // natively — no analytical truncation math needed.
    applyBodyTruncation(bodyRows);

    // The ONLY place that fills the table to slot height. Auto-layout has
    // reflowed with real heights (header/footer padding, delta badges the fit
    // cannot estimate), so the remaining space is exact. Add-only: estimates
    // can never overfill this path.
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
        // Genuinely cannot fit: already at the minimum font, so warn. A small
        // overflow at a larger font stays silent — the fit estimate can drift
        // a notch and a false warning is worse than a few visible clipped pixels.
        overflowed = true;
      }
    }
  } else {
    console.log('[welder-slide-editor] applyTable: library-vars missing, skipping rebuild');
  }

  // Empty string deletes a pluginData key — actively wipe stale width/textSize.
  slot.setPluginData('width', '');
  slot.setPluginData('textSize', '');
  slot.setPluginData('hasColumnHeader', desired.hasColumnHeader ? '1' : '0');
  writeColumnCalculations(slot, columnCalculations, columnCount);
  writeColumnCalculationEmphasis(slot, columnCalculationEmphasis, columnCount);
  writeColumnCalculationCurrency(slot, columnCalculationCurrency, columnCount);
  writeColumnCalculationPercent(slot, columnCalculationPercent, columnCount);
  writeColumnCalculationLabel(slot, columnCalculationLabel, columnCount);
  slot.setPluginData('kind', 'welder-tablewrap');
  // The fast path (apply-text.ts) requires v=5 and thereby forces one full
  // rebuild for older tables, so the current typography lands immediately
  // instead of only after a structural edit.
  slot.setPluginData('v', '5');
  return overflowed;
}
