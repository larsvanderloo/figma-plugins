// validation/fixtures/slide-machine/all-wrappers.fixture.ts
//
// Fixture: a Welder slide with every supported wrapper present.
//
// Wrapper set (Sprint 1, ADR-0007 — ChartWrap intentionally absent):
//   CopyWrap, Badge, ImageWrap, CardWrap, TimelineWrap, JourneyWrap, TableWrap
//
// Detection contract (per validation/fixtures/README.md §2):
//   node.type === 'INSTANCE'
//   node.name === 'Slide'
//   node.width === 1920 && node.height === 1080
//
// Owner: plugin-tester (conventions)

import type { FigmaNodeStub } from '../figma-mock/types';

const wrapperChild = (id: string, name: string): FigmaNodeStub => ({
  id,
  type: 'INSTANCE',
  name,
  visible: true,
  children: [],
});

export const allWrappersSlide: FigmaNodeStub = {
  id: 'fixture:slide-all-wrappers',
  type: 'INSTANCE',
  name: 'Slide',
  width: 1920,
  height: 1080,
  visible: true,
  parent: null,
  children: [
    wrapperChild('fixture:copy-wrap', 'CopyWrap'),
    wrapperChild('fixture:badge', 'Badge'),
    wrapperChild('fixture:image-wrap', 'ImageWrap'),
    wrapperChild('fixture:card-wrap', 'CardWrap'),
    wrapperChild('fixture:timeline-wrap', 'TimelineWrap'),
    wrapperChild('fixture:journey-wrap', 'JourneyWrap'),
    wrapperChild('fixture:table-wrap', 'TableWrap'),
  ],
};
