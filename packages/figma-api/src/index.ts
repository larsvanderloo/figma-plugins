// @figma-plugins/figma-api — typed wrappers around figma.* + message-bus
// router. Owned by figma-api-engineer.
//
// Imports from this package are safe in either code/ or ui/ contexts —
// the package detects the runtime and exports the appropriate surface.

export * from './router';
export * from './selection';
export * from './mutate';
export * from './progress';
export * from './variables';
export * from './fonts';
export * from './manifest';
