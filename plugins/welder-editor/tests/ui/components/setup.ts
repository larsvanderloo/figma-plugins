// plugins/welder-editor/tests/ui/components/setup.ts
//
// Per-directory setup for component tests (tests/ui/components/).
//
// ADR-0015: Previously per-section vi.mock() calls for @figma-plugins/sections-*
// and @figma-plugins/components live here. Those packages are eliminated;
// components now import each other via relative paths within ui/components/.
//
// Global cleanup (afterEach(cleanup), Pinia bootstrap, localStorage shim,
// ResizeObserver shim) is handled by the plugin-level tests/setup.ts registered
// in vitest.config.ts setupFiles.
//
// This file is intentionally minimal — no vi.mock() needed because components
// no longer cross package boundaries.
//
// Owner: figma-api-engineer (ADR-0015 consolidation).
