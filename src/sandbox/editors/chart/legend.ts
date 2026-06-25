// ============================================================
// editors/chart/legend.ts
//
// Gedeelde legenda-builder: verticale kolom van swatch + label,
// gebruikt door donut/pie (categorie-legenda) en bar/line
// (serie-legenda). Swatches volgen de accent-ramp-tinten.
//
// Fit-discipline (harde invariant: nooit buiten de content-frame):
//   * breedte-budget per rij: label single-line ellipsen (maxLines 1,
//     geen wrap-groei), daarna delta-suffix laten vallen, daarna hard
//     clampen — Highcharts' allowOverlap=false-gedachte: wat niet past
//     verdwijnt vóór het clipt;
//   * optioneel hoogte-budget met degradatie-ladder: korps verkleinen
//     tot de 12px-vloer (ONS small-multiples), delta's droppen (de
//     badge-hoogte domineert de rijhoogte en schaalt niet mee), rijen
//     cappen met een '+N meer'-rij (paging-equivalent van Highcharts
//     legend.maxHeight);
//   * optionele WRAP-modus: horizontale rijen die binnen maxWidth
//     wikkelen (Carbon: legenda horizontaal vóór verbergen) — gebruikt
//     door de gestapelde donut/pie-layout.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

export interface LegendEntry {
  label: string;
  color: RGB;
  /** Benadrukt datapunt: label in Instrument Sans SemiBold. */
  emphasis?: boolean;
  /** Optionele delta-badge-node, ge-append na het label. */
  deltaNode?: SceneNode | null;
}

/** Theme-bundel: Variable + resolved RGB-hint, zoals de tabel-renderer. */
export interface ChartTheme {
  textVar: Variable;
  dimmerVar: Variable;
  textRGB: RGB;
  dimmerRGB: RGB;
  /** Slide-level resolved accent (zelfde bron als de ramp). */
  accentRGB: RGB;
  /** Contrast-kleur op de kaart: accent of light, wat het verst
   * van de werkelijke kaart-kleur af ligt (mode-flip-proof). */
  onCardRGB: RGB;
}

/**
 * Single-line ellipsis op vaste breedte. maxLines=1 +
 * textAutoResize HEIGHT: de hoogte blijft het korps volgen (geen
 * wrap-groei zoals bij de oude HEIGHT-zonder-maxLines-route, die liet
 * lange labels naar meerdere regels wikkelen en blies zo het
 * verticale budget op).
 */
export function truncateToWidth(t: TextNode, width: number): void {
  if (width < 8) width = 8;
  t.textTruncation = 'ENDING';
  t.maxLines = 1;
  t.textAutoResize = 'HEIGHT';
  t.resize(width, t.height);
}

/**
 * Breedte-budget per legenda-rij, in drie degradatie-stappen:
 * label ellipsen → delta-suffix droppen → harde clamp. Garandeert
 * row.width ≤ budget zolang budget > swatch + spacing + 8px.
 */
function fitRowToWidth(
  row: FrameNode,
  label: TextNode,
  deltaNode: SceneNode | null,
  budget: number,
  fontSize: number,
): void {
  if (!(budget > 0) || row.width <= budget) return;
  // Stap 1 — label single-line ellipsen binnen het rest-budget.
  const minLabelW = Math.round(fontSize * 3);
  let target = budget - (row.width - label.width);
  if (target < minLabelW) target = minLabelW;
  if (target < label.width) truncateToWidth(label, target);
  if (row.width <= budget) return;
  // Stap 2 — delta-suffix laten vallen: het waarde/delta-detail is
  // expendabeler dan het categorie-label zelf (R1-drop-volgorde).
  if (deltaNode !== null && deltaNode.parent !== null) deltaNode.remove();
  if (row.width <= budget) return;
  // Stap 3 — harde clamp onder de minimum-labelbreedte: de invariant
  // (geen overflow) gaat boven leesbaarheids-esthetiek.
  target = budget - (row.width - label.width);
  truncateToWidth(label, target);
}

/** Korps + afgeleide maten (swatch, spacings) in één keer zetten,
 * zodat de hoogte-ladder per stap consistent meet. */
function applyLegendFont(
  legend: FrameNode,
  rows: FrameNode[],
  labels: TextNode[],
  swatches: RectangleNode[],
  f: number,
  isWrap: boolean,
): void {
  legend.itemSpacing = isWrap ? Math.round(f * 1.4) : Math.round(f * 0.9);
  if (isWrap) legend.counterAxisSpacing = Math.round(f * 0.6);
  for (let i = 0; i < rows.length; i++) {
    rows[i].itemSpacing = Math.round(f * 0.6);
  }
  for (let i = 0; i < swatches.length; i++) {
    const s = Math.round(f * 0.8);
    swatches[i].resize(s, s);
    swatches[i].cornerRadius = Math.max(3, Math.round(s * 0.28));
  }
  for (let i = 0; i < labels.length; i++) {
    labels[i].fontSize = f;
  }
}

export function buildLegend(
  entries: LegendEntry[],
  theme: ChartTheme,
  fontSize: number,
  maxWidth?: number,
  maxHeight?: number,
  wrap?: boolean,
): FrameNode {
  // WRAP-modus alleen met een geldig breedte-budget (de wikkel
  // heeft een FIXED primary-as nodig).
  const wrapWidth = wrap === true && typeof maxWidth === 'number' && maxWidth > 0 ? maxWidth : 0;
  const isWrap = wrapWidth > 0;

  const legend = figma.createFrame();
  legend.name = 'ChartLegend';
  legend.layoutMode = isWrap ? 'HORIZONTAL' : 'VERTICAL';
  if (isWrap) {
    legend.layoutWrap = 'WRAP';
    legend.primaryAxisSizingMode = 'FIXED';
    legend.counterAxisSizingMode = 'AUTO';
    legend.primaryAxisAlignItems = 'CENTER';
    legend.itemSpacing = Math.round(fontSize * 1.4);
    legend.counterAxisSpacing = Math.round(fontSize * 0.6);
  } else {
    legend.primaryAxisSizingMode = 'AUTO';
    legend.counterAxisSizingMode = 'AUTO';
    legend.itemSpacing = Math.round(fontSize * 0.9);
  }
  legend.fills = [];

  const rows: FrameNode[] = [];
  const labels: TextNode[] = [];
  const swatches: RectangleNode[] = [];
  const deltas: SceneNode[] = [];

  for (let i = 0; i < entries.length; i++) {
    const row = figma.createFrame();
    row.name = 'LegendItem';
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.counterAxisAlignItems = 'CENTER';
    row.itemSpacing = Math.round(fontSize * 0.6);
    row.fills = [];

    const swatch = figma.createRectangle();
    swatch.name = 'Swatch';
    const swatchSize = Math.round(fontSize * 0.8);
    swatch.resize(swatchSize, swatchSize);
    swatch.cornerRadius = Math.max(3, Math.round(swatchSize * 0.28));
    swatch.fills = [{ type: 'SOLID', color: entries[i].color }];
    row.appendChild(swatch);

    const t = figma.createText();
    t.fontName =
      entries[i].emphasis === true
        ? { family: 'Instrument Sans', style: 'SemiBold' }
        : { family: 'Inter', style: 'Regular' };
    t.fontSize = fontSize;
    t.characters = entries[i].label;
    t.fills = [
      figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: theme.textRGB },
        'color',
        theme.textVar,
      ),
    ];
    row.appendChild(t);

    const entryDelta = entries[i].deltaNode;
    const deltaNode = entryDelta !== undefined && entryDelta !== null ? entryDelta : null;
    if (deltaNode !== null) {
      row.appendChild(deltaNode);
      deltas.push(deltaNode);
    }

    // Width-budget: lange labels (incl. waarde/delta-suffix)
    // truncaten i.p.v. de kaart uitlopen.
    if (typeof maxWidth === 'number' && maxWidth > 0) {
      fitRowToWidth(row, t, deltaNode, maxWidth, fontSize);
    }

    legend.appendChild(row);
    rows.push(row);
    labels.push(t);
    swatches.push(swatch);
  }

  if (isWrap) {
    // FIXED primary-as: de wikkel-breedte vastzetten; hoogte hugt (AUTO).
    legend.resize(wrapWidth, Math.max(1, legend.height));
  }

  // Hoogte-budget met degradatie-ladder (meet-dan-reserveer:
  // de caller geeft de plot de rest, dus de legenda MOET ≤ maxHeight).
  if (typeof maxHeight === 'number' && maxHeight > 0 && legend.height > maxHeight) {
    // Stap 1 — korps verkleinen tot de 12px-vloer (ONS: 12px is de
    // ondergrens voor small-multiples-tekst; 14px de norm).
    let f = fontSize;
    while (legend.height > maxHeight && f > 12) {
      f = f - 1;
      applyLegendFont(legend, rows, labels, swatches, f, isWrap);
    }
    // Stap 2 — delta-suffixen droppen: de badge (±labelSize×1.4 hoog)
    // schaalt niet mee met het korps en houdt de rijhoogte hoog.
    if (legend.height > maxHeight) {
      for (let d = 0; d < deltas.length; d++) {
        if (deltas[d].parent !== null) deltas[d].remove();
      }
    }
    // Stap 3 — rijen cappen met een '+N meer'-indicator (paging-
    // equivalent van Highcharts legend.maxHeight): liever expliciet
    // samenvatten dan clippen. Minimaal één item blijft staan.
    if (legend.height > maxHeight && rows.length > 1) {
      const more = figma.createText();
      more.name = 'LegendMore';
      more.fontName = { family: 'Inter', style: 'Regular' };
      more.fontSize = f;
      more.characters = '+1 meer';
      more.textAutoResize = 'WIDTH_AND_HEIGHT';
      more.fills = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: theme.textRGB },
          'color',
          theme.textVar,
        ),
      ];
      legend.appendChild(more);
      let hidden = 0;
      for (let r = rows.length - 1; r > 0 && legend.height > maxHeight; r--) {
        rows[r].remove();
        hidden = hidden + 1;
      }
      more.characters = '+' + String(hidden) + ' meer';
    }
  }

  return legend;
}
