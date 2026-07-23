// The library only ships `Text` + `Text Dimmer`, so chart segment tints are
// computed at render time as blends of the theme accent; a theme switch plus
// re-render rebuilds the ramp automatically.

function blend(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

// Light → accent ramp, capped at t=0.6 so the deepest segment stays readable
// against the accent card.
export function cardRamp(light: RGB, accent: RGB, count: number): RGB[] {
  const safe = count > 0 ? count : 1;
  const out: RGB[] = [];
  for (let i = 0; i < safe; i++) {
    const t = safe === 1 ? 0 : (i / (safe - 1)) * 0.6;
    out.push(blend(light, accent, t));
  }
  return out;
}

export function trackPaint(light: RGB): SolidPaint {
  return { type: 'SOLID', color: light, opacity: 0.3 };
}

export function cellTint(light: RGB, accent: RGB, t: number): RGB {
  let clamped = t;
  if (clamped < 0) clamped = 0;
  if (clamped > 1) clamped = 1;
  // Blend from near-white, not the cream card color — cream makes light
  // cells muddy. Scaled by 0.92 so the darkest cell stays readable.
  const near = { r: 0.99, g: 0.97, b: 0.95 };
  return blend(near, accent, clamped * 0.92);
}
