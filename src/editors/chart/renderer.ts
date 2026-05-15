// ============================================================
// editors/chart/renderer.ts
//
// Dispatcher voor de imperatieve chart-renderer (T13). Roept de juiste
// per-type renderer aan op basis van `data.chartType`, loadt fonts, en
// bouwt een vers FrameNode dat op canvas kan worden ingevoegd.
//
// v0.1.0-scope (spec §9-T13, §11):
//   - bar    → volledige imperatieve implementatie (bar.ts)
//   - line   → stub-frame (placeholder + TODO-noot)
//   - pie    → stub-frame
//   - donut / progressbar / radial → stub-frame (expliciet uitgesteld)
//
// De dispatcher biedt óók een helper `replaceChartContent(wrap, fresh)`
// die de oude WelderChartContent-FrameNode binnen een ChartWrap vervangt
// door een nieuwe. Dat is het patroon uit spec §11 — ChartWrap zelf is
// een library-instance, we muteren alleen zijn content-child.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartData } from '../../types';
import { THEMES, FALLBACK_THEME } from '../../constants';
import { CHART_CONTENT_NAME, CHART_HEIGHT_PX, CHART_SIZE_PX } from './types';
import type { ChartRenderContext } from './types';
import { renderBar } from './bar';

// -------------------------------------------------------------------
// Theme + size resolution
// -------------------------------------------------------------------

function resolveTheme(id: ChartData['theme']): ChartRenderContext['theme'] {
  const tokens = THEMES[id];
  return tokens !== undefined ? tokens : FALLBACK_THEME;
}

function resolveWidth(size: ChartData['size']): number {
  if (size === 'small') return CHART_SIZE_PX.small;
  if (size === 'large') return CHART_SIZE_PX.large;
  if (size === 'fill') return CHART_SIZE_PX.fill;
  return CHART_SIZE_PX.medium;
}

// -------------------------------------------------------------------
// Fonts — preload alles wat een renderer mogelijk gebruikt.
// Caller (code.ts) laadt al bij plugin-start, maar we herlaten hier
// defensief zodat een freshly-opened plugin zonder eerdere load-cyclus
// niet crasht op de eerste text-node (FIG-FONT-01).
// -------------------------------------------------------------------

async function loadChartFonts(): Promise<void> {
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Instrument Sans', style: 'SemiBold' }),
  ]);
}

// -------------------------------------------------------------------
// Stub-renderer voor chart-types die v0.1.0 nog niet vol implementeert.
// Geeft een herkenbaar placeholder-frame terug zodat de user op canvas
// ziet dát de chart-type-switch is verwerkt — ook al mist de echte render.
// -------------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const h = hex.indexOf('#') === 0 ? hex.substring(1) : hex;
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function renderStub(data: ChartData, ctx: ChartRenderContext, typeLabel: string): FrameNode {
  const card = figma.createFrame();
  card.name = typeLabel + 'Chart';
  card.layoutMode = 'VERTICAL';
  card.primaryAxisAlignItems = 'CENTER';
  card.counterAxisAlignItems = 'CENTER';
  card.counterAxisSizingMode = 'FIXED';
  card.primaryAxisSizingMode = 'FIXED';
  card.resize(ctx.width, ctx.height);
  card.cornerRadius = 32;
  card.itemSpacing = 16;
  card.paddingTop = 48;
  card.paddingBottom = 48;
  card.paddingLeft = 48;
  card.paddingRight = 48;
  card.fills = [{ type: 'SOLID', color: hexToRgb(ctx.theme.background) }];
  card.strokes = [{ type: 'SOLID', color: hexToRgb(ctx.theme.accent) }];
  card.strokeWeight = 2;
  card.strokeAlign = 'INSIDE';
  card.dashPattern = [8, 6];

  const title = figma.createText();
  title.fontName = { family: 'Instrument Sans', style: 'SemiBold' };
  title.fontSize = 40;
  title.fills = [{ type: 'SOLID', color: hexToRgb(ctx.theme.foreground) }];
  title.textAlignHorizontal = 'CENTER';
  title.characters = data.title;
  title.textAutoResize = 'HEIGHT';
  card.appendChild(title);

  const note = figma.createText();
  note.fontName = { family: 'Inter', style: 'Regular' };
  note.fontSize = 20;
  note.fills = [{ type: 'SOLID', color: hexToRgb(ctx.theme.mutedText) }];
  note.textAlignHorizontal = 'CENTER';
  // TODO(post-v0.1.0): volledig imperatief implementeren (spec §11).
  note.characters =
    typeLabel +
    '-chart komt in een volgende release. ' +
    'Data (' +
    data.dataPoints.length +
    ' punten) is opgeslagen.';
  note.textAutoResize = 'HEIGHT';
  card.appendChild(note);

  return card;
}

// -------------------------------------------------------------------
// Public API — renderChart (dispatcher)
// -------------------------------------------------------------------

/**
 * Bouwt een vers FrameNode voor de opgegeven ChartData. Caller krijgt
 * het frame retour en is verantwoordelijk voor `parent.appendChild` of
 * `replaceChartContent` — deze helper plaatst niets op canvas.
 *
 * Async: fonts worden defensief preloaded (FIG-FONT-01).
 */
export async function renderChart(data: ChartData): Promise<FrameNode> {
  await loadChartFonts();

  const ctx: ChartRenderContext = {
    theme: resolveTheme(data.theme),
    width: resolveWidth(data.size),
    height: CHART_HEIGHT_PX,
  };

  const type = data.chartType;
  if (type === 'bar') {
    const frame = renderBar(data, ctx);
    frame.name = CHART_CONTENT_NAME;
    return frame;
  }
  if (type === 'line') {
    const frame = renderStub(data, ctx, 'Line');
    frame.name = CHART_CONTENT_NAME;
    return frame;
  }
  if (type === 'pie') {
    const frame = renderStub(data, ctx, 'Pie');
    frame.name = CHART_CONTENT_NAME;
    return frame;
  }
  if (type === 'donut') {
    const frame = renderStub(data, ctx, 'Donut');
    frame.name = CHART_CONTENT_NAME;
    return frame;
  }
  if (type === 'progressbar') {
    const frame = renderStub(data, ctx, 'Progressbar');
    frame.name = CHART_CONTENT_NAME;
    return frame;
  }
  // radial (of onbekend) → stub.
  const fallback = renderStub(data, ctx, 'Radial');
  fallback.name = CHART_CONTENT_NAME;
  return fallback;
}

/**
 * Vervangt het chart-content-frame binnen een ChartWrap door `fresh`.
 *
 * ChartWrap is typisch een library-INSTANCE of een FRAME (spec §11).
 * We verwijderen alleen kinderen die eerder door deze plugin zijn
 * gezet (name === CHART_CONTENT_NAME) — zo laten we de master-children
 * van de library-instance met rust en blijft de wrapper-layout intact.
 *
 * Retourneert `true` bij succes; `false` wanneer de wrapper geen
 * children accepteert (bv. een locked instance). Caller kan dan een
 * fallback-pad kiezen (bv. naast de wrapper renderen).
 */
export function replaceChartContent(wrap: SceneNode, fresh: FrameNode): boolean {
  if (!('children' in wrap)) return false;
  if (!('appendChild' in wrap)) return false;

  // Verwijder bestaande WelderChartContent-kinderen. We iterate op een
  // snapshot omdat remove() de live children-array muteert.
  const existing: SceneNode[] = [];
  for (const child of wrap.children) {
    if (child.name === CHART_CONTENT_NAME) existing.push(child);
  }
  for (const node of existing) {
    try {
      node.remove();
    } catch (_err) {
      // Master-child van een instance kan read-only zijn; silent skip.
    }
  }

  try {
    (wrap as FrameNode | InstanceNode | GroupNode | ComponentNode).appendChild(fresh);
    return true;
  } catch (_err) {
    // Instance staat geen appendChild toe (locked master). Fallback: de
    // caller beslist wat te doen — we ruimen `fresh` niet op, die zit
    // nog in de orphan-state en kan door de caller worden opgeruimd of
    // naast de wrapper geplaatst.
    return false;
  }
}
