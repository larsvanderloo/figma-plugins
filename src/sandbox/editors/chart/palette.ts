// ============================================================
// editors/chart/palette.ts
//
// Chart-kleurenpalet afgeleid van de theme-accent (`Text`-variable).
// De library levert alleen `Text` + `Text Dimmer`; segment-tinten
// worden rendertime berekend als blends van de accent-kleur richting
// wit — zelfde ramp als het referentie-dashboard (donker → licht).
// Op de witte kaart blijven alle tinten leesbaar en theme-volgend:
// een theme-switch + re-render herberekent de ramp automatisch.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

/** Witte kaart-achtergrond; vast per design ("white card"). */
export const CHART_CARD_RGB: RGB = { r: 1, g: 1, b: 1 };

/** Blend `color` richting wit met factor t (0 = color, 1 = wit). */
function towardWhite(color: RGB, t: number): RGB {
  return {
    r: color.r + (1 - color.r) * t,
    g: color.g + (1 - color.g) * t,
    b: color.b + (1 - color.b) * t,
  };
}

/**
 * Ramp van `count` tinten van de accent-kleur, donker → licht.
 * count 1 → [accent]; count 5 → accent, +20%, +40%, +60%, +80% wit.
 */
export function accentRamp(accent: RGB, count: number): RGB[] {
  const safe = count > 0 ? count : 1;
  const out: RGB[] = [];
  for (let i = 0; i < safe; i++) {
    const t = safe === 1 ? 0 : (i / safe) * 0.85;
    out.push(towardWhite(accent, t));
  }
  return out;
}

/** Subtiele track/gridline-tint: accent heel licht (85% richting wit). */
export function trackTint(accent: RGB): RGB {
  return towardWhite(accent, 0.88);
}

/** Donkere tekst op de witte kaart: accent-kleur licht verdonkerd. */
export function cardTextColor(accent: RGB): RGB {
  return {
    r: accent.r * 0.55,
    g: accent.g * 0.55,
    b: accent.b * 0.55,
  };
}
