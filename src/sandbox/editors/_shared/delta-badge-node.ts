// Builders are synchronous — no async font loads. That makes the TEXT
// component property the only label route on a clone, and the caller must
// preload Inter Medium before the text fallback writes .characters.

/**
 * No visibility gate on purpose: Badge_wrap is hidden on most slides but still
 * works as a clone template (the clone sets visible=true itself). Our own
 * DeltaBadge clones never match — their name doesn't start with 'Badge'.
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
  template: InstanceNode | null;
  /** Full badge text, including the ▲/▼ prefix. */
  label: string;
  index: number;
  labelSize: number;
  dimmerVar: Variable;
  dimmerRGB: RGB;
  maxW?: number;
  maxH?: number;
}

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

/** Any failure removes the partial clone and returns null → caller falls back to text. */
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
    console.log('[delta-badge] clone failed: ' + String(e));
    return null;
  }
  try {
    // Rename FIRST: findBadge matches name.indexOf('Badge') === 0, so a
    // 'Badge*' name would let the Badge editor / icon reconciler hijack this node.
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
        // Best-effort icon hide; if it fails the icon stays, which is
        // acceptable — the ▲/▼ is already in the label.
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
        // Outline is subtler than the filled default for deltas.
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
        // The Badge master hides its 'Label' text node and shows an icon slot,
        // so an untouched clone renders icon-only. Visibility overrides on
        // instance children are allowed synchronously.
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

    // Target height ~1.4× the label size; factor is normally ≪ 1 — never upscale.
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
      /* clone may already be removed/invalid */
    }
    return null;
  }
}

function buildDeltaBadgeText(
  label: string,
  labelSize: number,
  dimmerVar: Variable,
  dimmerRGB: RGB,
  maxW: number | null,
): TextNode {
  const t = figma.createText();
  t.name = 'DeltaText';
  t.fontName = { family: 'Inter', style: 'Medium' };
  // 10px floor: labelSize may already be shrunk on small cards, and 70% of
  // that would drop below practical readability.
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
