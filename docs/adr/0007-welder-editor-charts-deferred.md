# ADR 0007 — welder-editor: chart editing deferred to a follow-up epic on the same plugin

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** Lars (user decision 2026-05-05), project-pm, figma-api-engineer

---

## Context

The external build `welder-slide-editor` v0.2.1 includes chart editing under the Graphs tab. The `ChartWrap` wrapper holds a mutable content-child used by the chart renderer. The chart types supported are:

| Chart type | Status in external build |
|---|---|
| `bar` | Production |
| `line` | Stub ("coming next release") |
| `pie` | Stub |
| `donut` | Stub |
| `progressbar` | Stub |
| `radial` | Stub |

The bar chart renderer exists and works in v0.2.1. The five other chart types are stubs with no functional implementation. The chart renderer was ported from `chart-builder` v0.3.0, which used declarative widget-JSX — the v0.2.1 port translates this to imperative Plugin API calls.

The key technical challenge for the rebuild is the **declarative widget-JSX → imperative plugin-API port pattern**. This transformation was done once for the table editor (the slot-based `TableWrap` renderer in `editors/table/renderer.ts`, 642 LOC) and serves as the reference implementation. The same pattern must be applied to chart types, which have more complex geometry (axis labels, bar stacks, SVG-equivalent shapes).

**User decision recorded 2026-05-05:**

> "Ship v0.1.0 in workable shape first, charts return as follow-up epic."

The user explicitly chose to defer charts rather than carry over a partial implementation (bar only, five stubs) into the rebuild. The reasoning: shipping a plugin with stub chart types creates a user-facing "coming next release" promise that must be delivered, adding scope pressure to every future sprint. Better to define a clean v0.1.0 scope (General + Content + Graphs with Table + Journey) and revisit charts with a focused epic once the foundation is solid.

---

## Decision

**Chart editing is deferred to a follow-up epic on `welder-editor` (same plugin, not a new plugin) after v0.1.0 ships.**

Specific consequences for the v0.1.0 codebase:

1. `code/wrappers/ChartWrap.ts` is **intentionally absent** in v0.1.0. No stub file, no placeholder detector, no `findChartWrap` export in `slide-machine.ts`.
2. The `slide-machine.ts` port does **not** include `findChartWrap`. The function existed in the external build (`slide-machine.ts` line 200) and is explicitly omitted here.
3. The `GraphItems` type in `shared/messages.ts` does **not** include chart instances. The `graphs` section of `slide-load:result` carries only `TableWrapModel | null` and `JourneyWrapModel | null`.
4. The Graphs tab in the ui hides chart-related controls. If a slide has a `ChartWrap` wrapper, the plugin ignores it silently. The Graphs tab renders only if the slide has a `TableWrap` or `JourneyWrap`.
5. No `'welder-chartwrap'` value appears in the `kind` pluginData enum for v0.1.0 wrappers.

**The follow-up epic unblocking conditions (must all be met before chart epic starts):**

1. v0.1.0 ships with `plugin-tester` `validation: pass`.
2. The declarative widget-JSX → imperative plugin-API port pattern is documented in `learnings/patterns/` (the table renderer port serves as the reference).
3. At minimum bar + line + pie chart types are implemented in the follow-up epic (no shipping with stub types again).

---

## Alternatives considered

### Port bar chart only, hide the five stub types

Carry forward the `bar` chart renderer from v0.2.1, expose bar editing in the Graphs tab, show no controls for line/pie/donut/progressbar/radial.

Rejected because:
- The bar renderer in v0.2.1 is production-grade but was originally written as widget-JSX and then imperatively ported — the port quality has not been tested in the monorepo context with typed tests and golden snapshots (R10 from the risk register).
- Adding bar chart editing to v0.1.0 increases the Sprint 4 scope (already the heaviest sprint) and adds a golden-snapshot test requirement.
- Users who have bar charts and then see "chart editing available" will expect the full suite. Shipping bar-only without clear UI labeling risks the "coming next release" problem again.

### Defer charts to a new separate plugin

Create `welder-chart-editor` as a standalone plugin.

Rejected because:
- The user explicitly confirmed 2026-05-05 that charts return as a follow-up epic on the **same plugin**, not a separate one.
- A separate plugin would duplicate the slide scanner, wrapper detection, manifest, and message-bus contract — all of which are already designed for the unified plugin.
- Figma Community would show two plugins to the same user for the same Welder workflow.

### Include a `ChartWrap` stub detector that returns a "deferred" telemetry signal

Add `findChartWrap` to `slide-machine.ts` but have it return a `{ deferred: true }` signal instead of null, allowing the code side to log telemetry about how many chart wrappers exist on user canvases.

Considered but rejected for v0.1.0:
- No telemetry infrastructure exists in v0.1.0 (no external logging domain in `allowedDomains`).
- The stub adds code surface that must be maintained and tested.
- A null return from the absent detector is equivalent — the Graphs tab simply does not render a chart section.

> **Project-pm review:** If usage measurement of chart wrappers in the wild is wanted before the follow-up epic, this could be implemented as a `clientStorage` counter (increment on every slide-load that finds a ChartWrap, read at plugin open to inform epic prioritization). This would require no external domain and no telemetry service. Worth considering as a Sprint 4 addition once the foundation is solid.

---

## Consequences

**Positive:**

- v0.1.0 scope is clean and testable. The Graphs tab has exactly two surfaces (Table + Journey), both production-grade in the external build.
- No "coming next release" stubs in the public release.
- Sprint 4 (Graphs tab) is already the heaviest sprint; removing chart editing scope makes the sprint achievable.
- The follow-up epic can be designed with full knowledge of v0.1.0's architecture rather than being squeezed into an early sprint.

**Negative:**

- Users who have `ChartWrap` instances in their Welder slides will not see a chart editor in v0.1.0. The plugin silently ignores those wrappers.
- The relaunch button (`setRelaunchData`) is not set on `ChartWrap` nodes — users cannot trigger the plugin from a chart wrapper in v0.1.0.

**Mitigation for users with chart wrappers:**

The plugin's Graphs tab shows a clear empty state when a slide has only a ChartWrap and no TableWrap/JourneyWrap. The empty state message (owned by ui-engineer) should explain that chart editing is coming. The exact copy is a ui-engineer decision.

---

## References

- Plan §"Confirmed scope decisions" — chart deferral user decision 2026-05-05
- Plan §"Carry-forward backlog" item 5 — "Charts (T35). Explicitly deferred to a follow-up epic on `welder-editor`..."
- `welder-slide-editor/spec.md` §"Graphs → Charts (bar)" — production status in external build
- `welder-slide-editor/widget-src/slide-machine.ts` line 200 — `findChartWrap` (present in external build, absent in v0.1.0 rebuild)
- Risk register R2 — bundle budget collision (removing chart renderer reduces the risk)
- `plugins/welder-editor/docs/api-spec/welder-editor.md` §"Wrapper detection inventory" — ChartWrap listed as intentionally absent
