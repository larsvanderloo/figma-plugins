// validation/fixtures/slide-machine/copy-wrap-only.fixture.ts
//
// Fixture: a Welder slide with only CopyWrap present.
//
// Intended for tests that exercise the General tab path (CopyWrap only) and
// verify that all other wrappers are absent / not detected.
//
// Detection contract (per validation/fixtures/README.md §2):
//   node.type === 'INSTANCE'
//   node.name === 'Slide'
//   node.width === 1920 && node.height === 1080
//
// Owner: plugin-tester (conventions)

import type { FigmaNodeStub } from '../figma-mock/types';

export const copyWrapOnlySlide: FigmaNodeStub = {
  id: 'fixture:slide-copy-wrap-only',
  type: 'INSTANCE',
  name: 'Slide',
  width: 1920,
  height: 1080,
  visible: true,
  parent: null,
  children: [
    {
      id: 'fixture:copy-wrap-solo',
      type: 'INSTANCE',
      name: 'CopyWrap',
      visible: true,
      children: [],
    },
  ],
};
