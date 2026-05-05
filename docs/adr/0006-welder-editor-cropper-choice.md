# ADR 0006 — welder-editor: cropper choice for ImageEditor section (Sprint 2)

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** ui-engineer
**References:** ADR-0003 §ui-side reduction levers (lever #4); Plan §"Sprint 2 — General tab"; Risk register R3; `plugins/welder-editor/shared/messages.ts` GeneralSections.image type; `sections/ImageEditor/`

---

## Context

Sprint 2 introduces `sections/ImageEditor/` to implement T10 — the image edit panel that was dormant in the external build's `GeneralPanel.vue`. The image editor needs a crop UI: the user selects a crop region over the loaded slide visual, the plugin derives a `cropTransform` matrix, and the code side applies the transform via `fills` and `setBoundVariableForPaint` on the relevant canvas nodes.

The external build (`welder-slide-editor` v0.2.1) bundled cropperjs (via `vue-picture-cropper`) for this purpose but never shipped T10 — the image editor section was scaffolded but not wired. The dependency was included in the bundle and contributed to the 331 KB gzip baseline measured in ADR-0003.

Three implementation paths were evaluated.

---

## Options considered

### Option A — Wrap cropperjs (lazy-loaded async component)

`ImageEditor.vue` is an async component (`defineAsyncComponent`). cropperjs is imported inside it. On first panel open, Vite loads the async chunk containing cropperjs (~45 KB minified / ~25 KB gzip). Before the chunk loads, the panel shows a loading skeleton.

**Pros:**

- Known UX: cropperjs is battle-tested, handles rotation/zoom/touch out of the box.
- Shortest implementation path from the external build's `vue-picture-cropper` pattern.
- Lazy-load keeps the initial bundle unaffected; the ~25 KB cost is deferred until the user opens the image editor.

**Cons:**

- +25 KB gzip on first image-editor open. A cold-cache user pays the network cost every session.
- cropperjs ships its own opinionated CSS. The external build required overrides to match the plugin iframe's compact density and theming. Those overrides are a maintenance liability with every cropperjs upgrade.
- No native support for Welder's slide-specific aspect-ratio constraints (slide visual, card visual, badge icon each have different locked ratios). Encoding these requires monkey-patching cropperjs's aspect-lock API.
- The external build's cropperjs integration was never production-validated for this use case (T10 was dormant).

### Option B — Canvas-API replacement (custom cropper, zero deps)

Implement the crop UI from scratch in Vue 3 + Canvas API. A `CropperCanvas.vue` component renders the source image on a `<canvas>` element and draws crop handles over it. Drag interaction updates the crop rectangle. A `Transform` matrix is computed from the final crop rect and posted via the message bus.

**Pros:**

- Zero new runtime dependencies. Net bundle delta: ~3 KB gzip (the canvas component code itself — no external dep).
- Full UX control. Aspect-ratio constraints for slide visual, card visual, and badge icon can be encoded as first-class props, not workarounds.
- No CSS override maintenance burden. The component is fully themed via Tailwind and `components/tokens/`.
- Canvas API is universally available in Figma plugin iframes (Chromium rendering engine).

**Cons:**

- More upfront implementation work: crop handles, constrained drag, aspect-ratio lock, and a correct Transform matrix computation are approximately +3 SP versus lifting cropperjs. Rotation and zoom are out of scope for v0.1.0 and deferred.
- Risk of re-implementing edge cases that cropperjs already handles (clamped drag bounds, handle hit-target sizing, high-DPI canvas scaling). These are mitigable but must be explicitly tested.

### Option C — Lift the external build's exact pattern (cropperjs + vue-picture-cropper)

Import `vue-picture-cropper` as-is from the external build, with no lazy-load optimization. This is the most direct lift-and-shift path.

**Pros:**

- Lowest code-authoring risk: the external build's component pattern is a known quantity.

**Cons:**

- +25 KB gzip in the **initial** bundle (no lazy-load, matching the external build's regression). This alone exceeds the 250 KB ui-side budget constraint from ADR-0003 given the bundle's current composition.
- Inherits all of Option A's CSS override and aspect-ratio constraints.
- No lazy-load means every plugin open pays the cropperjs parse and execution cost, even for users who never open the image editor.

Option C is strictly dominated by Option A and is not a viable candidate.

---

## Decision

**Option B — Canvas-API replacement. Zero new runtime dependencies. Custom crop UI implemented in `sections/ImageEditor/`.**

---

## Rationale

**Bundle hygiene is the primary driver.** ADR-0003 establishes a 250 KB gzip budget for the ui-side bundle. The external build's baseline was 331 KB — already 32% over budget. The reduction strategy depends on eliminating large dependencies, not accumulating them. Option B saves ~22 KB gzip compared to Option A (B: +3 KB vs A: +25 KB lazy-loaded), representing approximately 9% of the remaining headroom to the 250 KB ceiling.

> **Project-pm review:** The ADR-0003 budget table names cropperjs lazy-load as lever #4 — "saves ~25 KB gzip from initial bundle." Choosing Option B over Option A means that lever is no longer needed as a lazy-load mitigation; the dep is eliminated rather than deferred. The budget arithmetic is updated accordingly: the stretch target of ≤ 200 KB gzip is more achievable, not less, because the canvas implementation contributes ~3 KB rather than ~25 KB.

**Full UX control over aspect-ratio constraints.** Welder slides have at least three visually distinct aspect-ratio zones (slide visual, card visual, badge icon). Encoding these as first-class props on a custom `CropperCanvas.vue` component is cleaner than patching cropperjs's `aspectRatio` option per panel type. The aspect-lock prop is configurable (`aspectRatio?: number | null`, defaulting to `null` for unlocked).

**Elimination of CSS override debt.** The external build's cropperjs CSS overrides were a known maintenance cost, called out explicitly in the codebase review. A custom canvas component has no third-party CSS surface at all.

**Acceptable sprint cost.** The additional ~3 SP for handles, drag interaction, and aspect-lock is within Sprint 2 capacity. v0.1.0 scopes to crop only; rotation and zoom are explicitly deferred to a follow-up sprint or ADR.

---

## Sprint 2 implementation surface

The `sections/ImageEditor/` module is the implementation target for task 2.7.

| Path                                     | Purpose                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sections/ImageEditor/ImageEditor.vue`   | Root section component. Receives image source URL and `aspectRatio` prop. Emits `crop` event with `Transform` payload.                       |
| `sections/ImageEditor/CropperCanvas.vue` | Canvas-based crop UI. Renders source image, overlays crop region, draws handles. Exposes `getCropTransform(): Transform` via `defineExpose`. |
| `sections/ImageEditor/handles/`          | Corner and edge drag-handle sub-components. Pointer-event driven. Accessible keyboard fallback (arrow keys move the active handle).          |

**Technology:** Pure Vue 3 (`<script setup>` + TypeScript strict) + Canvas API. No additional runtime dependency.

**Output contract:** The `crop` event payload is a `Transform` value matching the `cropTransform` field in `shared/messages.ts` `GeneralSections.image` type, as specified by `figma-api-engineer`.

**Aspect-ratio lock:** configurable via `aspectRatio?: number | null` prop (width / height ratio). Default: `null` (unlocked). Slide-visual, card-visual, and badge-icon callers pass the appropriate ratio.

**Async loading:** `ImageEditor.vue` is still registered as an async component at the plugin level (`defineAsyncComponent`) consistent with the lazy-load architecture in ADR-0003 §4. The async boundary means the canvas component code (~3 KB gzip) is only parsed on first image editor open, even though it is not a third-party dep.

---

## Trade-offs accepted

- More implementation work upfront versus lifting cropperjs. Estimated +3 SP relative to Option A, within Sprint 2 capacity.
- v0.1.0 ships with crop only. Rotation and zoom are not implemented and are explicitly out of scope. If user demand warrants them post-release, they are added in a follow-up sprint without requiring a new ADR (they are within the same canvas-based architecture).
- Edge cases that cropperjs already handles (clamped drag bounds, handle hit targets on high-DPI displays, pointer-capture for smooth drag) must be explicitly implemented and tested in `CropperCanvas.test.ts`. The testing cost is a known line item in Sprint 2.

---

## Revisit conditions

- If the canvas cropper accumulates more than 2 incidents in the External Feedback queue post-release that are attributable to edge-case crop interaction bugs (not feature requests for rotation/zoom), reconsider lifting cropperjs as a follow-up ADR. The lazy-load architecture (Option A) remains the fallback.
- If Welder feature scope expands to require filters, mask painting, or multi-region crop, the cropperjs ecosystem or a dedicated image-manipulation library may outweigh the bundle cost. File a new ADR at that point; do not retrofit Option B silently.

---

## Consequences

**Positive:**

- No new runtime dependency. The ui-side bundle is not materially larger than its pre-ImageEditor baseline.
- Bundle delta is ~3 KB gzip (canvas component code) versus ~25 KB gzip (cropperjs lazy-loaded). The 250 KB budget and the 200 KB stretch target both remain achievable.
- Aspect-ratio constraints for Welder's slide zones are encoded as first-class component props, not workarounds.
- No third-party CSS override surface. The component themes natively via Tailwind and `components/tokens/`.

**Negative:**

- Crop-specific edge cases must be manually implemented and tested; cropperjs's battle-tested behaviour is not available for free.
- Rotation and zoom are deferred. If a v0.1.0 user strongly expects rotation, that gap will surface in the External Feedback queue.

---

## References

- ADR-0003 §ui-side reduction levers, lever #4 — cropperjs lazy-load path (superseded by this decision; the dep is eliminated rather than deferred)
- ADR-0003 §"Follow-up items", item 3 — "ADR-0006 (cropper choice): Sprint 2 decision"
- Plan §"Sprint 2 — General tab" — T10 image edit panel
- Risk register R3 — silent fire-and-forget async; image fetch flows through `withTimeout` from `packages/figma-api/`
- `plugins/welder-editor/shared/messages.ts` — `GeneralSections.image` type and `cropTransform` field definition
