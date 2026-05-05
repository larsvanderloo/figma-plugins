// wrappers/index.ts — barrel re-export for all seven wrapper modules.
//
// Consumers import from '@code/wrappers' rather than individual files.
// No ChartWrap — ADR-0007.
//
// Owner: figma-api-engineer

export * from './CopyWrap';
export * from './Badge';
export * from './ImageWrap';
export * from './CardWrap';
export * from './TimelineWrap';
export * from './TableWrap';
export * from './JourneyWrap';
