// ============================================================
// editors/_shared/delta-badge-node.ts
//
// Gedeelde delta-badge-bouwer voor charts én tabellen. Bouwt per delta
// een node via een keten met nette degradatie:
//
//   1. library-Badge-CLONE — het Badge-template van de slide wordt per
//      delta gecloond: hernoemen naar 'DeltaBadge-<i>' (VERPLICHT vóór al
//      het andere; namen die met 'Badge' beginnen worden gekaapt door de
//      Badge-editor en de startup-icon-reconciler), label-sync via de
//      TEXT-component-property, BOOLEAN-icon-prop best-effort uit,
//      Outline-variant, rescalen naar het label-korps.
//   2. TEKST-fallback — geen template / geen TEXT-property / clone faalt /
//      clone buiten budget → losse tekst-variant in Text Dimmer (▲/▼ zit
//      al in het label).
//
// Builders zijn synchroon: GEEN async font-loads — daarom is de
// TEXT-property-route de enige label-route op de clone, en moet de caller
// Inter Medium vooraf laden voor de tekst-fallback.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

/**
 * Zoekt het Badge-template binnen een slide ZONDER visibility-gates:
 * de Badge_wrap staat op de meeste slides verborgen terwijl de instance
 * prima als clone-template dient (de clone krijgt zelf visible=true).
 * Eigen DeltaBadge-clones matchen niet (naam begint niet met 'Badge').
 */
export function findDeltaBadgeTemplate(slide: SceneNode): InstanceNode | null {
  if (slide.type !== 'INSTANCE') return null;
  try {
    const found = (slide as InstanceNode).findOne(function (n: SceneNode): boolean {
      return n.type === 'INSTANCE' && n.name.indexOf('Badge') === 0;
    });
    return found !== null && found.type === 'INSTANCE' ? (found as InstanceNode) : null;
  } catch (e) {
    console.log('[delta-badge] template lookup failed: ' + String(e));
    return null;
  }
}

export interface DeltaBadgeOptions {
  /** Badge-template (één keer per apply gezocht); null → direct tekst-variant. */
  template: InstanceNode | null;
  /** Volledige badge-tekst, incl. ▲/▼-prefix. */
  label: string;
  /** Index voor de unieke clone-naam 'DeltaBadge-<index>'. */
  index: number;
  /** Korps waar de badge/tekst op schaalt (doelhoogte ~1.4× labelSize). */
  labelSize: number;
  /** Text Dimmer-binding voor de tekst-fallback. */
  dimmerVar: Variable;
  dimmerRGB: RGB;
  /** Optionele budgetten; een clone buiten budget degradeert naar tekst. */
  maxW?: number;
  maxH?: number;
}

/**
 * Bouwt de delta-node: badge-clone met tekst-fallback. Retourneert altijd
 * een node (de caller bepaalt of er überhaupt een delta is).
 */
export function buildDeltaBadgeNode(opts: DeltaBadgeOptions): SceneNode {
  const widthCap =
    typeof opts.maxW === 'number' && isFinite(opts.maxW) && opts.maxW > 0 ? opts.maxW : null;
  const heightCap =
    typeof opts.maxH === 'number' && isFinite(opts.maxH) && opts.maxH > 0 ? opts.maxH : null;
  if (opts.template !== null) {
    const badge = buildDeltaBadgeClone(
      opts.template,
      opts.label,
      opts.index,
      opts.labelSize,
      widthCap,
      heightCap,
    );
    if (badge !== null) return badge;
  }
  return buildDeltaBadgeText(opts.label, opts.labelSize, opts.dimmerVar, opts.dimmerRGB, widthCap);
}

/**
 * Clone-route: elke stap guarded; elke fout ruimt de partiële clone op en
 * retourneert null zodat de caller naar tekst degradeert.
 */
export function buildDeltaBadgeClone(
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
    console.log('[delta-badge] clone failed: ' + String(e));
    return null;
  }
  try {
    // VERPLICHT vóór alles: nooit een 'Badge*'-naam laten bestaan —
    // findBadge matcht name.indexOf('Badge') === 0 en de Badge-editor /
    // icon-reconciler zouden de delta-node anders kapen.
    clone.name = 'DeltaBadge-' + String(i);
    clone.visible = true;

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
        // in het label, dus dat is acceptabel).
        for (let b = 0; b < keys.length; b++) {
          const bKey = keys[b];
          if (props[bKey].type === 'BOOLEAN' && bKey.toLowerCase().indexOf('icon') !== -1) {
            try {
              const boolPatch: { [name: string]: boolean } = {};
              boolPatch[bKey] = false;
              clone.setProperties(boolPatch);
            } catch (eIcon) {
              console.log('[delta-badge] icon-prop hide failed: ' + String(eIcon));
            }
            break;
          }
        }
      }
      if (labelSet) {
        // Outline-variant voor delta-badges (subtieler dan de gevulde
        // default). Ongeldige waarde gooit en wordt geslikt.
        for (let v = 0; v < keys.length; v++) {
          const vKey = keys[v];
          if (props[vKey].type === 'VARIANT') {
            try {
              const variantPatch: { [name: string]: string } = {};
              variantPatch[vKey] = 'Outline';
              clone.setProperties(variantPatch);
            } catch (eVariant) {
              console.log('[delta-badge] outline-variant failed: ' + String(eVariant));
            }
            break;
          }
        }
      }
      if (labelSet) {
        // De Badge-master draagt een VERBORGEN 'Label'-node + zichtbare
        // icon-slot — de clone erft dat en rendert dan icon-only.
        // Visibility-overrides op instance-children zijn sync toegestaan.
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
            if (
              child.type === 'SLOT' ||
              (child.type === 'INSTANCE' && child.name !== 'Text_wrapper')
            ) {
              child.visible = false;
            }
          }
        } catch (eVis) {
          console.log('[delta-badge] label/icon visibility fix failed: ' + String(eVis));
        }
      }
    }
    if (!labelSet) {
      clone.remove();
      return null;
    }

    // Rescale van slide-schaal naar het label-korps; doelhoogte ~1.4× het
    // label-korps; factor is normaal ≪ 1, nooit opschalen.
    const targetH = labelSize * 1.4;
    if (clone.height > 0) {
      const factor = targetH / clone.height;
      if (factor > 0 && factor <= 1) {
        try {
          clone.rescale(factor);
        } catch (eScale) {
          console.log('[delta-badge] rescale failed: ' + String(eScale));
        }
      }
    }

    // Harde sanity-check NA rescale: een clone die breder is dan de cap,
    // hoger dan het budget, of wild van de doelhoogte afwijkt wordt
    // opgeruimd → tekst-fallback.
    const cloneH = clone.height;
    const cloneW = clone.width;
    const deviates = cloneH <= 0 || cloneH > targetH * 1.5 || cloneH < targetH * 0.5;
    const tooWide = maxW !== null && cloneW > maxW;
    const tooTall = maxH !== null && cloneH > maxH;
    if (deviates || tooWide || tooTall) {
      console.log(
        '[delta-badge] clone outside budget (w=' +
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
    console.log('[delta-badge] badge route failed, falling back to text: ' + String(e));
    try {
      clone.remove();
    } catch (eRemove) {
      /* clone kan al verwijderd/invalide zijn */
    }
    return null;
  }
}

/** Tekst-variant: Inter Medium ~70% labelSize in Text Dimmer-binding. */
export function buildDeltaBadgeText(
  label: string,
  labelSize: number,
  dimmerVar: Variable,
  dimmerRGB: RGB,
  maxW: number | null,
): TextNode {
  const t = figma.createText();
  t.name = 'DeltaText';
  t.fontName = { family: 'Inter', style: 'Medium' };
  // 10px-vloer: het korps kan op kleine kaarten al gekrompen zijn; 70%
  // daarvan zou onder de praktische leesbaarheids-ondergrens duiken.
  t.fontSize = Math.max(10, Math.round(labelSize * 0.7));
  t.characters = label;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.fills = [
    figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: dimmerRGB }, 'color', dimmerVar),
  ];
  if (maxW !== null && t.width > maxW) {
    t.textTruncation = 'ENDING';
    t.maxLines = 1;
    t.textAutoResize = 'HEIGHT';
    t.resize(maxW, t.height);
  }
  return t;
}
