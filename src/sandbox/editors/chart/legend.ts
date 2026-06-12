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
  /** T47.3 — benadrukt datapunt: label in Instrument Sans SemiBold. */
  emphasis?: boolean;
  /** T50 — optionele delta-badge-node, ge-append na het label. */
  deltaNode?: SceneNode | null;
}

/** Theme-bundel: Variable + resolved RGB-hint, zoals de tabel-renderer. */
export interface ChartTheme {
  textVar: Variable;
  dimmerVar: Variable;
  textRGB: RGB;
  dimmerRGB: RGB;
  /** T50.5 — slide-level resolved accent (zelfde bron als de ramp). */
  accentRGB: RGB;
  /** T50.8 — contrast-kleur op de kaart: accent of light, wat het verst
   * van de werkelijke kaart-kleur af ligt (mode-flip-proof). */
  onCardRGB: RGB;
}

export function buildLegend(
  entries: LegendEntry[],
  theme: ChartTheme,
  fontSize: number,
  maxWidth?: number,
): FrameNode {
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

    const deltaNode = entries[i].deltaNode;
    if (deltaNode !== undefined && deltaNode !== null) {
      row.appendChild(deltaNode);
    }

    // T51.2 — width-budget: lange labels truncaten i.p.v. de kaart
    // uitlopen (zichtbaar op smalle wrappers).
    if (typeof maxWidth === 'number' && maxWidth > 0 && row.width > maxWidth) {
      const overshoot = row.width - maxWidth;
      const minLabelW = Math.round(fontSize * 3);
      const targetW = Math.max(minLabelW, t.width - overshoot);
      t.textTruncation = 'ENDING';
      t.textAutoResize = 'HEIGHT';
      t.resize(targetW, t.height);
    }

    legend.appendChild(row);
  }
  return legend;
}
