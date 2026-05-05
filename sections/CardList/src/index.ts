// sections/CardList/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { CardList } from '@figma-plugins/sections-card-list';
//   import type { CardListProps, CardListEmits, ContentItems, CardItem } from '@figma-plugins/sections-card-list';
//
// Owner: ui-engineer.

export { default as CardList } from './CardList.vue';
export type { CardListProps, CardListEmits } from './CardList.vue';
export type { ContentItems, CardItem, NodeId } from './types.js';
