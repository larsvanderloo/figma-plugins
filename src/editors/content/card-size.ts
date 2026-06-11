// ============================================================
// editors/content/card-size.ts
//
// Main-thread mutator voor de Kaartweergave-picker (NO_ICON/SM/LG):
// rebind't de gap-gebonden spacing-variabelen op elke Card, togglet de
// icon-zichtbaarheid en zet de heading-text-style. Geëxtraheerd uit de
// set-card-size handler in code.ts; de handler houdt slide-lookup,
// style-resolutie, commitUndo-discipline en de target-updated ack.
//
// FIG-GUARD-01: type-checks vóór property-access.
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { readCardTypeVariant } from '../../scan/slide-scan';
import { markSelfWrite } from '../../sandbox/bridge';
import { debugLog } from '../../debug';

export interface CardSizeOptions {
  /** Opgeloste text-style-id voor de card-heading (zie text-styles.ts). */
  styleId: string;
  iconSize: number;
  /** Mode-naam op de spacing-collection (bv. "4", "5", "6"). */
  gapModeName: string;
  /** false → icon-node binnen elke card-icon-slot wordt verborgen. */
  iconVisible: boolean;
}

export async function applyCardSize(
  slide: InstanceNode,
  opts: CardSizeOptions,
): Promise<void> {
    // Swap the bound variable on every Card's gap-relevant fields to the
    // named variable in the same Spacing collection. The collection holds
    // separate variables for each spacing step (named "1".."9", values
    // 4..36). We re-bind `itemSpacing` (and the other gap-shaped fields
    // if they're present) so the new spacing flows through Welder's
    // existing layout system.
    let targetSpacingVariable: Variable | null = null;
    let compactSidePaddingVariable: Variable | null = null;
    // Compact (= iconVisible AND gapModeName "4") is the only side-card
    // case that overrides the master padding — to variable "4" (16px).
    // Default and Text-only let the master's binding (variable "8" =
    // 32px) flow through unchanged.
    const wantsCompactSidePadding = opts.iconVisible === true && opts.gapModeName === '4';
    let firstSpacingFields: string[] = [];
    try {
      const firstCard = slide.findOne(function (n: SceneNode) {
        return n.type === 'INSTANCE' && n.name === 'Card';
      });
      if (firstCard !== null && firstCard.type === 'INSTANCE') {
        const bound = (firstCard as InstanceNode).boundVariables;
        debugLog(
          'set-card-size',
          'card.boundVariables keys=' +
            (bound !== null && bound !== undefined ? Object.keys(bound).join(',') : 'NONE'),
        );
        // Only true gap fields — paddings on the Card are bound to the
        // same Spacing collection but shouldn't follow the SM/LG picker.
        const GAP_FIELDS = ['itemSpacing', 'gridRowGap', 'gridColumnGap'];
        let templateAlias: VariableAlias | null = null;
        if (bound !== null && bound !== undefined) {
          for (let f = 0; f < GAP_FIELDS.length; f++) {
            const field = GAP_FIELDS[f];
            const raw = (bound as { [k: string]: unknown })[field];
            if (raw === undefined || raw === null) continue;
            const aliases = Array.isArray(raw) ? raw : [raw];
            for (let a = 0; a < aliases.length; a++) {
              const alias = aliases[a] as VariableAlias;
              if (alias.type === 'VARIABLE_ALIAS') {
                if (templateAlias === null) templateAlias = alias;
                if (firstSpacingFields.indexOf(field) < 0) firstSpacingFields.push(field);
                break;
              }
            }
          }
        }
        debugLog(
          'set-card-size',
          'spacing fields=[' + firstSpacingFields.join(', ') +
            '], template var=' + (templateAlias !== null ? templateAlias.id : 'NONE'),
        );

        if (templateAlias !== null) {
          const templateVar = await figma.variables.getVariableByIdAsync(templateAlias.id);
          if (templateVar !== null) {
            const collection = await figma.variables.getVariableCollectionByIdAsync(
              templateVar.variableCollectionId,
            );
            if (collection !== null) {
              // Resolve every variable in the collection in parallel.
              // Was a sequential `for await` loop — 9 round-trips in a
              // 9-variable Spacing collection meant ~450ms of latency
              // before any card got touched.
              const variables = await Promise.all(
                collection.variableIds.map(function (id) {
                  return figma.variables.getVariableByIdAsync(id);
                }),
              );
              const tried: string[] = [];
              for (let i = 0; i < variables.length; i++) {
                const v = variables[i];
                if (v === null) continue;
                tried.push(v.name);
                if (
                  targetSpacingVariable === null &&
                  (v.name === opts.gapModeName || v.name.endsWith('/' + opts.gapModeName))
                ) {
                  targetSpacingVariable = v;
                }
                if (
                  wantsCompactSidePadding &&
                  compactSidePaddingVariable === null &&
                  (v.name === '4' || v.name.endsWith('/4'))
                ) {
                  compactSidePaddingVariable = v;
                }
                if (
                  targetSpacingVariable !== null &&
                  (!wantsCompactSidePadding || compactSidePaddingVariable !== null)
                ) {
                  break;
                }
              }
              if (wantsCompactSidePadding && compactSidePaddingVariable === null) {
                debugLog(
                  'set-card-size',
                  'compact-side-padding variable "4" not found in collection "' +
                    collection.name + '"',
                );
              }
              if (targetSpacingVariable === null) {
                debugLog(
                  'set-card-size',
                  'variable "' + opts.gapModeName +
                    '" not found in collection "' + collection.name + '" — available: [' + tried.join(', ') + ']',
                );
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('[set-card-size] spacing-variable lookup failed: ' + String(e));
    }

    // One walk; resize icon-slot child, swap heading text style, and (when
    // we resolved a target spacing variable) re-bind every gap-shaped
    // field on each Card so the new spacing flows through.
    const cards = slide.findAll(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'Card';
    });

    // Cache for the per-card padding-mirror step. Without this each
    // card would `getMainComponentAsync` + up to 4 `getVariableByIdAsync`
    // calls, scaling to ~5N round-trips for N cards on the slide. Cards
    // typically share a master (same variant), so the cache collapses
    // it to one master fetch + a handful of variable fetches per call.
    type PaddingSource =
      | { kind: 'var'; variable: Variable }
      | { kind: 'literal'; value: number }
      | { kind: 'none' };
    interface PaddingMirror {
      paddingLeft: PaddingSource;
      paddingRight: PaddingSource;
      paddingTop: PaddingSource;
      paddingBottom: PaddingSource;
    }
    const paddingMirrorCache: { [masterId: string]: Promise<PaddingMirror> } = {};
    const PADDING_FIELDS: VariableBindableNodeField[] = [
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'paddingBottom',
    ];

    function resolvePaddingMirror(
      master: ComponentNode,
    ): Promise<PaddingMirror> {
      const cached = paddingMirrorCache[master.id];
      if (cached !== undefined) return cached;
      // Promise-keyed cache — concurrent cards sharing a master see a
      // cache hit immediately on the first call and await the same
      // in-flight resolution instead of each firing its own fetches.
      const p: Promise<PaddingMirror> = (async function () {
        const masterBound = master.boundVariables;
        const result: PaddingMirror = {
          paddingLeft: { kind: 'none' },
          paddingRight: { kind: 'none' },
          paddingTop: { kind: 'none' },
          paddingBottom: { kind: 'none' },
        };
        // Resolve all four variable aliases in parallel.
        const fieldFetches = PADDING_FIELDS.map(async function (field) {
          const alias =
            masterBound !== null && masterBound !== undefined
              ? (masterBound as { [k: string]: unknown })[field]
              : undefined;
          if (
            alias !== undefined &&
            alias !== null &&
            typeof alias === 'object' &&
            'id' in (alias as object)
          ) {
            try {
              const v = await figma.variables.getVariableByIdAsync(
                (alias as VariableAlias).id,
              );
              if (v !== null) {
                return { field, source: { kind: 'var' as const, variable: v } };
              }
            } catch (_e) {
              /* fall through */
            }
          }
          const literal = (master as unknown as { [k: string]: number })[field];
          if (typeof literal === 'number') {
            return { field, source: { kind: 'literal' as const, value: literal } };
          }
          return { field, source: { kind: 'none' as const } };
        });
        const resolved = await Promise.all(fieldFetches);
        for (let i = 0; i < resolved.length; i++) {
          (result as unknown as Record<string, PaddingSource>)[resolved[i].field] =
            resolved[i].source;
        }
        return result;
      })();
      paddingMirrorCache[master.id] = p;
      return p;
    }
    // Per-card work is independent — run them concurrently so a slide
    // with N cards finishes in roughly one card's worth of latency
    // instead of N × the per-card cost (was sequential setTextStyleId +
    // getMainComponent).
    await Promise.all(cards.map(async function (card) {
      if (card.type !== 'INSTANCE') return;
      const cardInst = card as InstanceNode;

      // Side-variant detection — read the canonical `Type` VARIANT
      // property on the Card instance. "Icon Side" is the only value
      // that gets side-specific treatment (smaller heading style,
      // horizontal-padding rebind, hide the icon-border-wrap in
      // text-only mode). All other Types (Stack Icon, Image, User)
      // stay on the master-defined padding/heading.
      const isSideVariant = readCardTypeVariant(cardInst) === 'Icon Side';
      const borderWrap = isSideVariant
        ? cardInst.findOne(function (n: SceneNode) {
            return n.name === 'icon-border-wrap';
          })
        : null;
      if (borderWrap !== null) {
        try {
          borderWrap.visible = opts.iconVisible;
        } catch (_e) {
          /* silent */
        }
      }

      // Card masters can carry multiple icon-slots (top vs side variant) —
      // walk all of them and prefer the one whose ancestor chain is visible.
      // Without this, side variants land on the hidden top slot and the
      // visibility/resize ops silently no-op on the wrong node.
      const slotMatches = cardInst.findAll(function (n: SceneNode) {
        return n.type === 'SLOT' && n.name === 'icon-slot';
      });
      let slotNode: SlotNode | null = null;
      for (let s = 0; s < slotMatches.length; s++) {
        const candidate = slotMatches[s];
        if (candidate.type !== 'SLOT') continue;
        let visible = true;
        let cursor: BaseNode | null = candidate;
        while (cursor !== null && cursor.id !== cardInst.id) {
          if ('visible' in cursor && (cursor as SceneNode).visible === false) {
            visible = false;
            break;
          }
          cursor = cursor.parent;
        }
        if (visible) {
          slotNode = candidate as SlotNode;
          break;
        }
      }
      if (slotNode === null && slotMatches.length > 0 && slotMatches[0].type === 'SLOT') {
        slotNode = slotMatches[0] as SlotNode;
      }
      if (slotNode !== null) {
        // Toggle the slot's own visibility — the entire icon area
        // collapses out of the auto-layout when hidden, giving the text
        // more room. The slot's child SVG stays put, so flipping back to
        // a visible mode restores the previously-picked icon.
        try {
          slotNode.visible = opts.iconVisible;
        } catch (_e) {
          /* silent */
        }
        if (opts.iconVisible && slotNode.children.length > 0) {
          const child = slotNode.children[0];
          if ('resize' in child) {
            try {
              child.resize(opts.iconSize, opts.iconSize);
            } catch (_e) {
              /* silent — auto-layout-locked slots may reject */
            }
          }
          // The slot's own geometric box is master-locked; calling
          // .resize() on it is silently rejected. The smaller icon
          // (e.g. 58 in Compact) sits inside the master-sized slot
          // (68), so center it manually rather than letting it stick
          // to (0,0). Master-side fix would be a Card `Size` variant
          // that defines a different slot size per mode.
          if (
            'x' in child &&
            'y' in child &&
            'width' in slotNode &&
            'height' in slotNode
          ) {
            const slotW = (slotNode as SceneNode & { width: number }).width;
            const slotH = (slotNode as SceneNode & { height: number }).height;
            try {
              (child as SceneNode & { x: number; y: number }).x =
                (slotW - opts.iconSize) / 2;
              (child as SceneNode & { x: number; y: number }).y =
                (slotH - opts.iconSize) / 2;
            } catch (_e) {
              /* silent — child may be locked by parent auto-layout */
            }
          }
        }
      }

      const headingNode = cardInst.findOne(function (n: SceneNode) {
        return n.type === 'TEXT' && n.name === 'Heading';
      });
      if (headingNode !== null && headingNode.type === 'TEXT') {
        try {
          await (headingNode as TextNode).setTextStyleIdAsync(opts.styleId);
        } catch (e) {
          console.log('[set-card-size] setTextStyleIdAsync failed: ' + String(e));
        }
      }

      if (targetSpacingVariable !== null) {
        for (let f = 0; f < firstSpacingFields.length; f++) {
          const field = firstSpacingFields[f] as VariableBindableNodeField;
          try {
            cardInst.setBoundVariable(field, targetSpacingVariable);
          } catch (e) {
            console.log(
              '[set-card-size] setBoundVariable ' + field + ' failed: ' + String(e),
            );
          }
        }
      }

      // Reset paddings to mirror the variant master exactly. Cached
      // resolution means we only pay for getMainComponentAsync +
      // variable fetches once per unique master, regardless of how
      // many cards we touch.
      try {
        const mainComp = await cardInst.getMainComponentAsync();
        if (mainComp !== null) {
          const mirror = await resolvePaddingMirror(mainComp as ComponentNode);
          for (let f = 0; f < PADDING_FIELDS.length; f++) {
            const field = PADDING_FIELDS[f];
            const src = (mirror as unknown as Record<string, PaddingSource>)[field];
            if (src.kind === 'var') {
              try {
                cardInst.setBoundVariable(field, src.variable);
              } catch (_e) {
                /* silent */
              }
            } else if (src.kind === 'literal') {
              try {
                cardInst.setBoundVariable(field, null);
              } catch (_e) {
                /* silent */
              }
              try {
                (cardInst as unknown as { [k: string]: number })[field] = src.value;
              } catch (_e) {
                /* silent */
              }
            }
          }
        }
      } catch (e) {
        console.log('[set-card-size] padding-reset failed: ' + String(e));
      }

      // Compact side variant override — after mirroring master (above),
      // rebind paddingLeft/Right to variable "4" (16px). Only applies
      // to Icon Side cards in Compact mode; Default and Text-only let
      // the master padding stand.
      if (isSideVariant && wantsCompactSidePadding && compactSidePaddingVariable !== null) {
        for (let f = 0; f < PADDING_FIELDS.length; f++) {
          const field = PADDING_FIELDS[f];
          try {
            cardInst.setBoundVariable(field, compactSidePaddingVariable);
          } catch (e) {
            console.log(
              '[set-card-size] compact side-padding rebind ' + field + ' failed: ' + String(e),
            );
          }
        }
      }
    }));

    markSelfWrite();
}
