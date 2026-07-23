// Figma plugins have no DOM/canvas text measurement, so one offscreen TextNode
// is reused: `measure` reads intrinsic single-line width (column autofit),
// `measureHeight` reads wrapped height at a fixed width (fit-to-slot).

import type { MeasureTextWidth } from './column-autofit';

export type MeasureTextHeight = (
  text: string,
  font: FontName,
  fontSize: number,
  width: number,
) => number;

export interface TextMeasurer {
  measure: MeasureTextWidth;
  measureHeight: MeasureTextHeight;
  dispose: () => void;
}

function fontKey(font: FontName): string {
  return font.family + '|' + font.style;
}

function normalizeText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

export function createTextMeasurer(): TextMeasurer | null {
  try {
    const node = figma.createText();
    node.name = 'WelderTableTextMeasure';
    node.visible = false;
    node.x = -10000;
    node.y = -10000;
    node.textAutoResize = 'WIDTH_AND_HEIGHT';
    // Match the cap-height trim of the rendered cell text, or measureHeight
    // reads the untrimmed (taller) line-box and overestimates the fit.
    try {
      node.leadingTrim = 'CAP_HEIGHT';
    } catch (_e) {
      /* older Figma API without leadingTrim */
    }

    const cache: { [key: string]: number } = {};
    const heightCache: { [key: string]: number } = {};

    return {
      measure: function (text: string, font: FontName, fontSize: number): number {
        const clean = normalizeText(text);
        if (clean.length === 0) return 0;

        const key = fontKey(font) + '|' + String(fontSize) + '|' + clean;
        const cached = cache[key];
        if (typeof cached === 'number') return cached;

        try {
          node.fontName = font;
          node.fontSize = fontSize;
          node.characters = clean;
          node.textAutoResize = 'WIDTH_AND_HEIGHT';
          const width = node.width;
          cache[key] = width;
          return width;
        } catch (_e) {
          cache[key] = 0;
          return 0;
        }
      },
      measureHeight: function (
        text: string,
        font: FontName,
        fontSize: number,
        width: number,
      ): number {
        if (text.length === 0 || width <= 0) return 0;
        const key = fontKey(font) + '|' + String(fontSize) + '|' + String(Math.round(width)) + '|' + text;
        const cached = heightCache[key];
        if (typeof cached === 'number') return cached;

        try {
          node.fontName = font;
          node.fontSize = fontSize;
          // Fix the width and let the height grow with wrap-lines, mirroring how
          // the rendered cell behaves (FILL width + HEIGHT autoresize).
          node.textAutoResize = 'HEIGHT';
          node.characters = text;
          node.resize(width, node.height);
          const height = node.height;
          heightCache[key] = height;
          return height;
        } catch (_e) {
          heightCache[key] = 0;
          return 0;
        }
      },
      dispose: function (): void {
        try {
          node.remove();
        } catch (_e) {
          /* node may already be removed */
        }
      },
    };
  } catch (_e) {
    return null;
  }
}
