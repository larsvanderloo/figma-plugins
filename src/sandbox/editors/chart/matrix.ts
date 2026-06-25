// ============================================================
// editors/chart/matrix.ts
//
// Grid-box / 9-box performance-matrix: rijen = categorieën,
// kolommen = series; elke cel toont de waarde op dat snijpunt en wordt
// getint van licht → accent o.b.v. de relatieve waarde (9-box talent-
// grid, veralgemeniseerd naar elke N×M). Auto-layout, dus responsief
// binnen de kaart; kolom-koppen (serienamen) boven, rij-labels links.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import {
  chartMaxValue,
  chartValueLabel,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../shared/chart-calculations';
import { cellTint } from './palette';
import type { ChartTheme } from './legend';

export function buildMatrix(
  model: ChartWrapModel,
  contentW: number,
  contentH: number,
  light: RGB,
  accent: RGB,
  theme: ChartTheme,
  labelSize: number,
): FrameNode {
  const rows = model.categories.length; // rijen
  const cols = model.series.length; // kolommen
  const max = Math.max(1, chartMaxValue(model));

  const root = figma.createFrame();
  root.name = 'ChartMatrix';
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'FIXED';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = Math.max(4, Math.round(labelSize * 0.4));
  root.fills = [];
  root.resize(contentW, contentH);

  // Label-kolom links (rij-labels) en kop-rij boven (serienamen).
  const rowLabelW = Math.round(contentW * 0.2);
  const headerH = Math.round(labelSize * 1.6);
  const gap = Math.max(4, Math.round(labelSize * 0.4));
  const gridW = contentW - rowLabelW - gap;
  const gridH = contentH - headerH - root.itemSpacing;
  const cellW = cols > 0 ? Math.floor((gridW - gap * (cols - 1)) / cols) : gridW;
  const cellH = rows > 0 ? Math.floor((gridH - gap * (rows - 1)) / rows) : gridH;
  const cellRadius = Math.min(14, Math.round(Math.min(cellW, cellH) * 0.1));

  // ── Kop-rij: lege hoek + serienamen ──
  const header = figma.createFrame();
  header.name = 'MatrixHeader';
  header.layoutMode = 'HORIZONTAL';
  header.primaryAxisSizingMode = 'FIXED';
  header.counterAxisSizingMode = 'FIXED';
  header.itemSpacing = gap;
  header.fills = [];
  header.resize(contentW, headerH);

  const corner = figma.createFrame();
  corner.name = 'Corner';
  corner.fills = [];
  header.appendChild(corner);
  corner.resize(rowLabelW, headerH);

  for (let c = 0; c < cols; c++) {
    const colLabel = figma.createFrame();
    colLabel.name = 'ColLabel-' + String(c);
    colLabel.layoutMode = 'HORIZONTAL';
    colLabel.primaryAxisSizingMode = 'FIXED';
    colLabel.counterAxisSizingMode = 'FIXED';
    colLabel.primaryAxisAlignItems = 'CENTER';
    colLabel.counterAxisAlignItems = 'CENTER';
    colLabel.fills = [];
    const t = figma.createText();
    t.fontName = { family: 'Inter', style: 'Medium' };
    t.fontSize = labelSize;
    t.characters =
      model.series[c].name !== '' ? model.series[c].name : 'Serie ' + String(c + 1);
    t.textAlignHorizontal = 'CENTER';
    t.textAutoResize = 'HEIGHT';
    t.textTruncation = 'ENDING';
    t.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    colLabel.appendChild(t);
    header.appendChild(colLabel);
    colLabel.resize(cellW, headerH);
    try {
      t.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }
  root.appendChild(header);
  try {
    header.layoutSizingHorizontal = 'FILL';
  } catch (_e) {
    /* silent */
  }

  // ── Data-rijen: rij-label + cellen ──
  for (let r = 0; r < rows; r++) {
    const row = figma.createFrame();
    row.name = 'MatrixRow-' + String(r);
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    row.counterAxisSizingMode = 'FIXED';
    row.counterAxisAlignItems = 'CENTER';
    row.itemSpacing = gap;
    row.fills = [];
    row.resize(contentW, cellH);

    const rowLabel = figma.createText();
    rowLabel.fontName = isCategoryEmphasized(model, r)
      ? { family: 'Instrument Sans', style: 'SemiBold' }
      : { family: 'Inter', style: 'Medium' };
    rowLabel.fontSize = labelSize;
    rowLabel.characters =
      model.categories[r] !== '' ? model.categories[r] : 'Categorie ' + String(r + 1);
    rowLabel.textAutoResize = 'HEIGHT';
    rowLabel.textTruncation = 'ENDING';
    rowLabel.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    row.appendChild(rowLabel);
    rowLabel.resize(rowLabelW, rowLabel.height);

    for (let c = 0; c < cols; c++) {
      const value = model.series[c].values[r];
      const tint = cellTint(light, accent, value / max);
      const cell = figma.createFrame();
      cell.name = 'Cell-' + String(r) + '-' + String(c);
      cell.layoutMode = 'HORIZONTAL';
      cell.primaryAxisSizingMode = 'FIXED';
      cell.counterAxisSizingMode = 'FIXED';
      cell.primaryAxisAlignItems = 'CENTER';
      cell.counterAxisAlignItems = 'CENTER';
      cell.cornerRadius = cellRadius;
      cell.fills = [{ type: 'SOLID', color: tint }];
      cell.resize(cellW, cellH);

      if (model.showValues) {
        // Tekst in-theme: donkere accent-tekst op lichte cellen,
        // wit op verzadigde cellen. Kies o.b.v. luminantie-AFSTAND zodat
        // mid-tone cellen niet de verkeerde (te bleke = grijs ogende)
        // kleur krijgen.
        const lum = 0.299 * tint.r + 0.587 * tint.g + 0.114 * tint.b;
        const darkAccent = { r: accent.r * 0.45, g: accent.g * 0.45, b: accent.b * 0.45 };
        const darkLum = 0.299 * darkAccent.r + 0.587 * darkAccent.g + 0.114 * darkAccent.b;
        // wit (lum 1) vs darkAccent: kies de grootste luminantie-afstand.
        const textColor = 1 - lum > lum - darkLum ? { r: 1, g: 1, b: 1 } : darkAccent;
        const emphasized = isPointEmphasized(model.series[c], r);
        const vText = figma.createText();
        vText.fontName = emphasized
          ? { family: 'Instrument Sans', style: 'SemiBold' }
          : { family: 'Inter', style: 'Medium' };
        vText.fontSize = Math.min(labelSize + 4, Math.round(cellH * 0.32));
        vText.characters = chartValueLabel(model.series[c], value);
        vText.textAutoResize = 'WIDTH_AND_HEIGHT';
        vText.fills = [{ type: 'SOLID', color: textColor }];
        cell.appendChild(vText);
      }
      row.appendChild(cell);
    }
    root.appendChild(row);
    try {
      row.layoutSizingHorizontal = 'FILL';
    } catch (_e) {
      /* silent */
    }
  }

  return root;
}
