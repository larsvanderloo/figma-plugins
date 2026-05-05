# Performance budgets

Owned by `figma-api-engineer`. One file per perf-relevant module or feature.

Required content:

- **Bundle size budget** — minified+gzipped, for `code` and `ui` bundles separately. Must match `plugin.toml`'s `code_bundle_kb_budget` / `ui_bundle_kb_budget`.
- **Latency budgets** — init / first paint / per-operation. Match `plugin.toml`'s `init_paint_ms_budget`.
- **Adversarial test cases** — large documents, deeply-nested instances, slow networks.
- **Optimization log** — what was tried, what worked, what was rejected.
