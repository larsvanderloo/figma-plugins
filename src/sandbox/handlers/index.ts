// ============================================================
// sandbox/handlers/index.ts
//
// Handler-registry: message-type → handler-functie. De map is gemapt
// over de volledige `UIToPluginMessage['type']`-union, dus een nieuw
// message-type zonder handler is een compile-error (exhaustiveness-
// garantie, sterker dan de oude if-chain in code.ts).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import type { UIToPluginMessage } from '../../shared/types';
import {
  handleClose,
  handleResizeUi,
  handleSetIconRecents,
  handleSetOnboardingSeen,
  handleUiReady,
} from './lifecycle';
import {
  handleSetCopywrapSize,
  handleSetTypographyVisibility,
  handleUpdateAccent,
  handleUpdateGeneral,
} from './general';
import {
  handleSetCardSize,
  handleUpdateCard,
  handleUpdateInstructorCard,
  handleUpdateTimelineItem,
} from './content';
import { handleImportCsv, handleUpdateTable } from './table';
import { handleUpdateChart, handleImportChartCsv } from './chart';
import { handleUploadImage } from './image';
import { handleSetSlideSkipped, handleSetSlideTheme, handleTriggerUndo } from './slide';
import { handleExportDocument } from './export';

/** Handler voor één message-type, getypeerd op de genarrowde union-arm. */
type MessageHandler<K extends UIToPluginMessage['type']> = (
  msg: Extract<UIToPluginMessage, { type: K }>,
) => void | Promise<void>;

export const messageHandlers: { [K in UIToPluginMessage['type']]: MessageHandler<K> } = {
  // lifecycle
  'ui-ready': handleUiReady,
  'set-icon-recents': handleSetIconRecents,
  'set-onboarding-seen': handleSetOnboardingSeen,
  'resize-ui': handleResizeUi,
  close: handleClose,
  // general-tab
  'update-general': handleUpdateGeneral,
  'update-accent': handleUpdateAccent,
  'set-typography-visibility': handleSetTypographyVisibility,
  'set-copywrap-size': handleSetCopywrapSize,
  // content-tab
  'update-card': handleUpdateCard,
  'update-instructor-card': handleUpdateInstructorCard,
  'set-card-size': handleSetCardSize,
  'update-timeline-item': handleUpdateTimelineItem,
  // tables
  'update-table': handleUpdateTable,
  'update-chart': handleUpdateChart,
  'import-chart-csv': handleImportChartCsv,
  'import-csv': handleImportCsv,
  // images
  'upload-image': handleUploadImage,
  // slide-level
  'set-slide-theme': handleSetSlideTheme,
  'set-slide-skipped': handleSetSlideSkipped,
  'trigger-undo': handleTriggerUndo,
  // export
  'export-document': handleExportDocument,
};
