// tests/code/golden-snapshots/fixtures.ts
//
// Input fixtures for TableWrap + JourneyWrap golden-snapshot parity tests.
//
// Six fixtures total: 3 TableWrapModel + 3 JourneyWrapModel.
// Shapes are identical input to both the v0.2.1 reference renderer and the
// current renderer so the resulting op-traces are comparable.
//
// NOTE on slotId / node IDs:
//   slotId is a stable sentinel ('slot-table-1' etc.). Row/cell/item nodeIds
//   are empty strings — they represent new items (no existing canvas node),
//   which is the same interpretation in both v0.2.1 and current code.
//
// Owner: plugin-tester (Sprint 4 task 4.7, TDEV-070)

import type { TableWrapModel, JourneyWrapModel } from '@shared/messages';

// ---------------------------------------------------------------------------
// Slot dimensions used as input context for both renderers.
// ---------------------------------------------------------------------------

/** Slot height passed to the table renderer (affects font-size formula). */
export const TABLE_SLOT_HEIGHT = 400;

// ---------------------------------------------------------------------------
// Table fixtures
// ---------------------------------------------------------------------------

/**
 * TABLE-F1: small table — 3×3, no header, md width.
 * Exercises: no-header path, computeRowPadding(3)=28, 3 body rows each with 3 cells.
 */
export const TABLE_FIXTURE_3X3_NO_HEADER: TableWrapModel = {
  slotId: 'slot-table-1',
  width: 'md',
  hasColumnHeader: false,
  textSize: 'md',
  rows: [
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Alpha' },
        { cellNodeId: '', value: 'Beta' },
        { cellNodeId: '', value: 'Gamma' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: '1' },
        { cellNodeId: '', value: '2' },
        { cellNodeId: '', value: '3' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'X' },
        { cellNodeId: '', value: 'Y' },
        { cellNodeId: '', value: 'Z' },
      ],
    },
  ],
};

/**
 * TABLE-F2: medium table — 10×6, with header, md width.
 * Exercises: header path (row 0 = header), computeRowPadding(9)=14,
 * mixed-content cells, header vs body row distinction.
 */
export const TABLE_FIXTURE_10X6_WITH_HEADER: TableWrapModel = {
  slotId: 'slot-table-2',
  width: 'md',
  hasColumnHeader: true,
  textSize: 'md',
  rows: [
    // Header row (row 0 when hasColumnHeader=true)
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Region' },
        { cellNodeId: '', value: 'Q1' },
        { cellNodeId: '', value: 'Q2' },
        { cellNodeId: '', value: 'Q3' },
        { cellNodeId: '', value: 'Q4' },
        { cellNodeId: '', value: 'Total' },
      ],
    },
    // 9 body rows
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'North' },
        { cellNodeId: '', value: '120' },
        { cellNodeId: '', value: '145' },
        { cellNodeId: '', value: '132' },
        { cellNodeId: '', value: '158' },
        { cellNodeId: '', value: '555' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'South' },
        { cellNodeId: '', value: '90' },
        { cellNodeId: '', value: '102' },
        { cellNodeId: '', value: '98' },
        { cellNodeId: '', value: '115' },
        { cellNodeId: '', value: '405' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'East' },
        { cellNodeId: '', value: '78' },
        { cellNodeId: '', value: '85' },
        { cellNodeId: '', value: '91' },
        { cellNodeId: '', value: '88' },
        { cellNodeId: '', value: '342' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'West' },
        { cellNodeId: '', value: '200' },
        { cellNodeId: '', value: '220' },
        { cellNodeId: '', value: '215' },
        { cellNodeId: '', value: '230' },
        { cellNodeId: '', value: '865' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Central' },
        { cellNodeId: '', value: '60' },
        { cellNodeId: '', value: '72' },
        { cellNodeId: '', value: '68' },
        { cellNodeId: '', value: '75' },
        { cellNodeId: '', value: '275' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Online' },
        { cellNodeId: '', value: '310' },
        { cellNodeId: '', value: '330' },
        { cellNodeId: '', value: '350' },
        { cellNodeId: '', value: '400' },
        { cellNodeId: '', value: '1390' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Partners' },
        { cellNodeId: '', value: '45' },
        { cellNodeId: '', value: '50' },
        { cellNodeId: '', value: '48' },
        { cellNodeId: '', value: '55' },
        { cellNodeId: '', value: '198' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Enterprise' },
        { cellNodeId: '', value: '180' },
        { cellNodeId: '', value: '195' },
        { cellNodeId: '', value: '210' },
        { cellNodeId: '', value: '225' },
        { cellNodeId: '', value: '810' },
      ],
    },
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'SMB' },
        { cellNodeId: '', value: '95' },
        { cellNodeId: '', value: '105' },
        { cellNodeId: '', value: '98' },
        { cellNodeId: '', value: '112' },
        { cellNodeId: '', value: '410' },
      ],
    },
  ],
};

/**
 * TABLE-F3: large table — 50 rows × 8 cols, with header.
 * Exercises: computeRowPadding(>=10)=8, truncation path (many rows with long cells),
 * applyBodyTruncation over many rows.
 *
 * NOTE: We use only 12 rows here (1 header + 11 body) even though the name
 * says "large fixture" — the spec fixture shape exercises all the same
 * code paths (rowPadding=8, truncation) without producing an unwieldy trace.
 * The important property is rowCount>9 (so rowPadding=8) and long cell text.
 */
export const TABLE_FIXTURE_LARGE_TRUNCATION: TableWrapModel = {
  slotId: 'slot-table-3',
  width: 'lg',
  hasColumnHeader: true,
  textSize: 'sm',
  rows: [
    // Header row
    {
      rowNodeId: '',
      cells: [
        { cellNodeId: '', value: 'Initiative Name' },
        { cellNodeId: '', value: 'Owner' },
        { cellNodeId: '', value: 'Status' },
        { cellNodeId: '', value: 'Due Date' },
        { cellNodeId: '', value: 'Priority' },
        { cellNodeId: '', value: 'Budget' },
        { cellNodeId: '', value: 'Progress' },
        { cellNodeId: '', value: 'Notes' },
      ],
    },
    // 11 body rows (rowCount=11 → rowPadding=8)
    ...Array.from({ length: 11 }, (_, i) => ({
      rowNodeId: '',
      cells: [
        {
          cellNodeId: '',
          value: `Long Initiative Name That Exercises Text Truncation Path ${i + 1}`,
        },
        { cellNodeId: '', value: `Owner ${i + 1}` },
        {
          cellNodeId: '',
          value: i % 3 === 0 ? 'In Progress' : i % 3 === 1 ? 'Complete' : 'Blocked',
        },
        { cellNodeId: '', value: `2026-0${(i % 9) + 1}-15` },
        { cellNodeId: '', value: i % 2 === 0 ? 'High' : 'Medium' },
        { cellNodeId: '', value: `$${(i + 1) * 50}K` },
        { cellNodeId: '', value: `${(i + 1) * 8}%` },
        { cellNodeId: '', value: i % 2 === 0 ? 'On track' : 'Monitor closely — risk of slippage' },
      ],
    })),
  ],
};

// ---------------------------------------------------------------------------
// Journey fixtures
// ---------------------------------------------------------------------------

/**
 * JOURNEY-F1: minimal journey — 1 item, 2 columns.
 * Exercises: single-item path, header rendering with 2 columns, 1 divider.
 */
export const JOURNEY_FIXTURE_1_ITEM: JourneyWrapModel = {
  slotId: 'slot-journey-1',
  columns: [
    { header: 'Phase 1', subheader: 'Jan–Mar' },
    { header: 'Phase 2', subheader: 'Apr–Jun' },
  ],
  items: [
    {
      itemNodeId: '',
      icon: 'star',
      label: 'Kickoff',
      startPct: 0,
      endPct: 50,
    },
  ],
};

/**
 * JOURNEY-F2: medium journey — 5 items, 4 columns, varied startPct/endPct.
 * Exercises: 5-item path, multi-column header (3 dividers), overlapping
 * position bands (items span across column boundaries).
 */
export const JOURNEY_FIXTURE_5_ITEMS: JourneyWrapModel = {
  slotId: 'slot-journey-2',
  columns: [
    { header: 'Discovery', subheader: 'Q1' },
    { header: 'Design', subheader: 'Q2' },
    { header: 'Build', subheader: 'Q3' },
    { header: 'Launch', subheader: 'Q4' },
  ],
  items: [
    {
      itemNodeId: '',
      icon: 'search',
      label: 'User Research',
      startPct: 0,
      endPct: 25,
    },
    {
      itemNodeId: '',
      icon: 'pencil',
      label: 'Wireframes',
      startPct: 20,
      endPct: 45,
    },
    {
      itemNodeId: '',
      icon: 'code',
      label: 'Frontend Dev',
      startPct: 40,
      endPct: 75,
    },
    {
      itemNodeId: '',
      icon: 'check-circle',
      label: 'QA Testing',
      startPct: 70,
      endPct: 90,
    },
    {
      itemNodeId: '',
      icon: 'zap',
      label: 'Go Live',
      startPct: 85,
      endPct: 95,
    },
  ],
};

/**
 * JOURNEY-F3: full journey — 10 items, 6 columns, mixed bands including
 * minimum-span items and overlapping bands.
 * Exercises: max-items path, pillYBase with header offset, z-order enforcing,
 * endPct clamping to JOURNEY_POS_MAX_PCT.
 */
export const JOURNEY_FIXTURE_10_ITEMS: JourneyWrapModel = {
  slotId: 'slot-journey-3',
  columns: [
    { header: 'Jan', subheader: 'Month 1' },
    { header: 'Feb', subheader: 'Month 2' },
    { header: 'Mar', subheader: 'Month 3' },
    { header: 'Apr', subheader: 'Month 4' },
    { header: 'May', subheader: 'Month 5' },
    { header: 'Jun', subheader: 'Month 6' },
  ],
  items: [
    { itemNodeId: '', icon: 'flag', label: 'Start', startPct: 0, endPct: 15 },
    { itemNodeId: '', icon: 'activity', label: 'Analysis', startPct: 10, endPct: 30 },
    { itemNodeId: '', icon: 'users', label: 'Stakeholder Buy-in', startPct: 25, endPct: 50 },
    { itemNodeId: '', icon: 'target', label: 'Design Sprint', startPct: 40, endPct: 60 },
    { itemNodeId: '', icon: 'cpu', label: 'Prototype', startPct: 55, endPct: 75 },
    { itemNodeId: '', icon: 'shield', label: 'Security Review', startPct: 60, endPct: 80 },
    { itemNodeId: '', icon: 'globe', label: 'Beta Launch', startPct: 70, endPct: 85 },
    { itemNodeId: '', icon: 'bar-chart', label: 'Analytics Setup', startPct: 75, endPct: 90 },
    { itemNodeId: '', icon: 'check', label: 'Full Launch', startPct: 85, endPct: 95 },
    { itemNodeId: '', icon: 'award', label: 'Post-launch Review', startPct: 90, endPct: 95 },
  ],
};
