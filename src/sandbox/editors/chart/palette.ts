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

/** Blend van `a` richting `b` met factor t (0 = a, 1 = b). */
function blend(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/**
 * Ramp van `count` tinten op de accent-kaart, licht → dieper: start op de
 * Background-kleur (cream/licht per theme-mode) en blendt richting de
 * accent. Gecapt op 0.6 zodat het diepste segment leesbaar blijft tegen
 * de accent-kaart (zelfde taal als de Alt/_bgalt-tinten in de library).
 */
export function cardRamp(light: RGB, accent: RGB, count: number): RGB[] {
  const safe = count > 0 ? count : 1;
  const out: RGB[] = [];
  for (let i = 0; i < safe; i++) {
    const t = safe === 1 ? 0 : (i / (safe - 1)) * 0.6;
    out.push(blend(light, accent, t));
  }
  return out;
}

/** Subtiele track/gridline-tint op de accent-kaart: licht, lage dekking. */
export function trackPaint(light: RGB): SolidPaint {
  return { type: 'SOLID', color: light, opacity: 0.3 };
}
