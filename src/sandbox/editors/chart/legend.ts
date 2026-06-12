// ============================================================
// editors/chart/legend.ts
//
// Gedeelde legenda-builder: verticale kolom van swatch + label,
// gebruikt door donut/pie (categorie-legenda) en bar/line
// (serie-legenda). Swatches volgen de accent-ramp-tinten.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

export interface LegendEntry {
  label: string;
  color: RGB;
}

export function buildLegend(entries: LegendEntry[], textRGB: RGB, fontSize: number): FrameNode {
  const legend = figma.createFrame();
  legend.name = 'ChartLegend';
  legend.layoutMode = 'VERTICAL';
  legend.primaryAxisSizingMode = 'AUTO';
  legend.counterAxisSizingMode = 'AUTO';
  legend.itemSpacing = Math.round(fontSize * 0.9);
  legend.fills = [];

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
    t.fontName = { family: 'Inter', style: 'Regular' };
    t.fontSize = fontSize;
    t.characters = entries[i].label;
    t.fills = [{ type: 'SOLID', color: textRGB }];
    row.appendChild(t);

    legend.appendChild(row);
  }
  return legend;
}
