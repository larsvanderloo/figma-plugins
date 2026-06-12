// ============================================================
// editors/chart/delta-badge.ts
//
// Delta-badge-engine (T50): bouwt per categorie een delta-node voor
// serie 0 via een keten met nette degradatie:
//
//   1. library-Badge-CLONE — het Badge-template van de slide wordt één
//      keer per apply gevonden (createDeltaContext → findBadge) en per
//      delta gecloond: hernoemen naar 'DeltaBadge-<i>' (VERPLICHT vóór
//      al het andere; namen die met 'Badge' beginnen worden gekaapt
//      door de Badge-editor en de startup-icon-reconciler), label sync
//      zetten via de TEXT-component-property, BOOLEAN-icon-prop
//      best-effort uit, rescalen naar chart-proporties.
//   2. TEKST-fallback — wanneer er geen template is, geen TEXT-property
//      bestaat, een clone-stap faalt (partiële node wordt dan
//      opgeruimd), of de clone na rescale buiten de door de caller
//      meegegeven maxW/maxH-budgetten valt (T52), valt de engine terug
//      op de losse tekst-variant (▲/▼ zit al in het label via
//      chartDeltaDisplay). De tekst-variant zelf wordt op maxW afgekapt.
//
// Builders zijn synchroon: GEEN async font-loads hier — daarom is de
// TEXT-property-route de enige label-route op de clone.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { ChartWrapModel } from '../../../shared/types';
import { chartDeltaDisplay } from '../../../shared/chart-calculations';
import type { ChartTheme } from './legend';

export interface DeltaBadgeContext {
  /** Omsluitende Slide-INSTANCE (mode-context + Badge-template-bron). */
  slide: SceneNode;
  model: ChartWrapModel;
  theme: ChartTheme;
  labelSize: number;
  /** Badge-template, één keer per apply gezocht; null → tekst-variant. */
  badgeTemplate: InstanceNode | null;
}

export function createDeltaContext(
  slide: SceneNode,
  model: ChartWrapModel,
  theme: ChartTheme,
  labelSize: number,
): DeltaBadgeContext {
  // T50: template één keer per apply zoeken — ZONDER visibility-gates:
  // findBadge eist zichtbaarheid, maar de Badge_wrap staat op de meeste
  // slides verborgen terwijl de instance prima als clone-template dient
  // (de clone krijgt zelf visible=true). Eigen DeltaBadge-clones matchen
  // niet (naam begint niet met 'Badge').
  let badgeTemplate: InstanceNode | null = null;
  if (slide.type === 'INSTANCE') {
    try {
      const found = (slide as InstanceNode).findOne(function (n: SceneNode): boolean {
        return n.type === 'INSTANCE' && n.name.indexOf('Badge') === 0;
      });
      badgeTemplate = found !== null && found.type === 'INSTANCE' ? (found as InstanceNode) : null;
    } catch (e) {
      console.log('[chart] delta: badge-template lookup failed: ' + String(e));
      badgeTemplate = null;
    }
  }
  return {
    slide: slide,
    model: model,
    theme: theme,
    labelSize: labelSize,
    badgeTemplate: badgeTemplate,
  };
}

/**
 * Delta-node voor categorie i (serie 0), of null wanneer er geen delta
 * is (eerste categorie zonder override, beide waarden 0, ...). De caller
 * appendt en positioneert; de node meet zichzelf (HUG/auto-resize).
 *
 * T52 — optionele budgetten: maxW (kolom-cap) en maxH (rij-cap). Een
 * badge-clone die er na rescale niet in past degradeert naar de
 * tekst-variant; de tekst-variant wordt op maxW afgekapt zodat de
 * geretourneerde node het budget NOOIT overschrijdt in de breedte.
 */
export function buildDeltaNode(
  ctx: DeltaBadgeContext,
  i: number,
  maxW?: number,
  maxH?: number,
): SceneNode | null {
  const label = chartDeltaDisplay(ctx.model, i);
  if (label === null) return null;
  const widthCap = typeof maxW === 'number' && isFinite(maxW) && maxW > 0 ? maxW : null;
  const heightCap = typeof maxH === 'number' && isFinite(maxH) && maxH > 0 ? maxH : null;
  if (ctx.badgeTemplate !== null) {
    const badge = buildDeltaBadgeClone(
      ctx.badgeTemplate,
      label,
      i,
      ctx.labelSize,
      widthCap,
      heightCap,
    );
    if (badge !== null) return badge;
  }
  return buildDeltaText(ctx, label, widthCap);
}

/**
 * Clone-route (T50): elke stap guarded; elke fout ruimt de partiële
 * clone op en retourneert null zodat de caller naar tekst degradeert.
 */
function buildDeltaBadgeClone(
  template: InstanceNode,
  label: string,
  i: number,
  labelSize: number,
  maxW: number | null,
  maxH: number | null,
): InstanceNode | null {
  let clone: InstanceNode;
  try {
    clone = template.clone();
  } catch (e) {
    console.log('[chart] delta: badge clone failed: ' + String(e));
    return null;
  }
  try {
    // VERPLICHT vóór alles: nooit een 'Badge*'-naam laten bestaan —
    // findBadge matcht name.indexOf('Badge') === 0 en de Badge-editor /
    // icon-reconciler zouden de delta-node anders kapen.
    clone.name = 'DeltaBadge-' + String(i);
    // Template kan via Badge_wrap verborgen zijn; de clone zelf kan
    // visible=false meedragen.
    clone.visible = true;

    // Label SYNC via de TEXT-component-property (zelfde route als
    // editors/general/badge.ts); zonder TEXT-property is er geen
    // synchrone label-route → clone weg en tekst-fallback.
    let labelSet = false;
    const props = clone.componentProperties;
    if (props !== null && props !== undefined) {
      const keys = Object.keys(props);
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        if (props[key].type === 'TEXT') {
          const patch: { [name: string]: string } = {};
          patch[key] = label;
          clone.setProperties(patch);
          labelSet = true;
          break;
        }
      }
      if (labelSet) {
        // Best-effort, zonder async: BOOLEAN-property die naar het icon
        // verwijst uitzetten; anders blijft het icon staan (▲/▼ zit al
        // in het label, dus dat is acceptabel als v1).
        for (let b = 0; b < keys.length; b++) {
          const bKey = keys[b];
          if (props[bKey].type === 'BOOLEAN' && bKey.toLowerCase().indexOf('icon') !== -1) {
            try {
              const boolPatch: { [name: string]: boolean } = {};
              boolPatch[bKey] = false;
              clone.setProperties(boolPatch);
            } catch (eIcon) {
              console.log('[chart] delta: icon-prop hide failed: ' + String(eIcon));
            }
            break;
          }
        }
      }
      if (labelSet) {
        // T50.2 — Outline-variant voor delta-badges (subtieler dan de
        // gevulde default). Sync poging op de eerste VARIANT-property;
        // ongeldige waarde gooit en wordt geslikt (default blijft staan).
        for (let v = 0; v < keys.length; v++) {
          const vKey = keys[v];
          if (props[vKey].type === 'VARIANT') {
            try {
              const variantPatch: { [name: string]: string } = {};
              variantPatch[vKey] = 'Outline';
              clone.setProperties(variantPatch);
            } catch (eVariant) {
              console.log('[chart] delta: outline-variant failed: ' + String(eVariant));
            }
            break;
          }
        }
      }
      if (labelSet) {
        // MCP-geverifieerd (T50.1): de Badge-master draagt een VERBORGEN
        // 'Label'-node + zichtbare icon-slot — de clone erft dat en
        // rendert dan icon-only. Visibility-overrides op instance-
        // children zijn sync toegestaan: label-keten aan, iconen uit.
        try {
          const labelNode = clone.findOne(function (n: SceneNode): boolean {
            return n.type === 'TEXT';
          });
          if (labelNode !== null) {
            labelNode.visible = true;
            let parent: BaseNode | null = labelNode.parent;
            while (parent !== null && parent.id !== clone.id) {
              if ('visible' in parent) (parent as SceneNode).visible = true;
              parent = parent.parent;
            }
          }
          const children = clone.children;
          for (let c = 0; c < children.length; c++) {
            const child = children[c];
            if (child.type === 'SLOT' || (child.type === 'INSTANCE' && child.name !== 'Text_wrapper')) {
              child.visible = false;
            }
          }
        } catch (eVis) {
          console.log('[chart] delta: label/icon visibility fix failed: ' + String(eVis));
        }
      }
    }
    if (!labelSet) {
      clone.remove();
      return null;
    }

    // Rescale van slide-schaal naar chart-proporties: doelhoogte
    // ~1.4× het label-korps; factor is normaal ≪ 1, nooit opschalen.
    const targetH = labelSize * 1.4;
    if (clone.height > 0) {
      const factor = targetH / clone.height;
      if (factor > 0 && factor <= 1) {
        try {
          clone.rescale(factor);
        } catch (eScale) {
          console.log('[chart] delta: rescale failed: ' + String(eScale));
        }
      }
    }

    // T52 — harde sanity-check NA rescale: een clone die breder is dan
    // de kolom-cap, hoger dan het rij-budget, of wild van de doelhoogte
    // afwijkt (rescale geskipt/mislukt, vreemd template) wordt
    // opgeruimd → tekst-fallback. Liever een compacte tekst dan een
    // badge die de content-frame uit clipt.
    const cloneH = clone.height;
    const cloneW = clone.width;
    const deviates = cloneH <= 0 || cloneH > targetH * 1.5 || cloneH < targetH * 0.5;
    const tooWide = maxW !== null && cloneW > maxW;
    const tooTall = maxH !== null && cloneH > maxH;
    if (deviates || tooWide || tooTall) {
      console.log(
        '[chart] delta: badge clone outside budget (w=' +
          String(Math.round(cloneW)) +
          ', h=' +
          String(Math.round(cloneH)) +
          ', targetH=' +
          String(Math.round(targetH)) +
          '), falling back to text',
      );
      clone.remove();
      return null;
    }
    return clone;
  } catch (e) {
    console.log('[chart] delta: badge route failed, falling back to text: ' + String(e));
    try {
      clone.remove();
    } catch (eRemove) {
      /* clone kan al verwijderd/invalide zijn */
    }
    return null;
  }
}

/** Tekst-variant: Inter Medium ~70% labelSize in Text Dimmer-binding. */
function buildDeltaText(ctx: DeltaBadgeContext, label: string, maxW: number | null): TextNode {
  const t = figma.createText();
  t.name = 'DeltaText';
  t.fontName = { family: 'Inter', style: 'Medium' };
  // T52 — 10px-vloer: het korps kan op kleine kaarten al gekrompen
  // zijn (progress geeft een band-gekrompen labelSize door); 70% daarvan
  // zou onder de praktische leesbaarheids-ondergrens duiken.
  t.fontSize = Math.max(10, Math.round(ctx.labelSize * 0.7));
  t.characters = label;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.fills = [
    figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: ctx.theme.dimmerRGB },
      'color',
      ctx.theme.dimmerVar,
    ),
  ];
  // T52 — kolom-cap: liever een afgekapte override-tekst dan een delta
  // die de kolom (en daarmee de content-frame) uit loopt.
  if (maxW !== null && t.width > maxW) {
    t.textTruncation = 'ENDING';
    t.maxLines = 1;
    t.textAutoResize = 'HEIGHT';
    t.resize(maxW, t.height);
  }
  return t;
}
