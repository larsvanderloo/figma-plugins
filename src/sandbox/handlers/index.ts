// Mapped over the full UIToPluginMessage['type'] union, so a new
// message type without a handler is a compile error.

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
import {
  handleSetSlideSkipped,
  handleSetSlideTheme,
  handleSetSlideConfidential,
  handleTriggerUndo,
} from './slide';
import { handleExportDocument } from './export';

type MessageHandler<K extends UIToPluginMessage['type']> = (
  msg: Extract<UIToPluginMessage, { type: K }>,
) => void | Promise<void>;

export const messageHandlers: { [K in UIToPluginMessage['type']]: MessageHandler<K> } = {
  'ui-ready': handleUiReady,
  'set-icon-recents': handleSetIconRecents,
  'set-onboarding-seen': handleSetOnboardingSeen,
  'resize-ui': handleResizeUi,
  close: handleClose,
  'update-general': handleUpdateGeneral,
  'update-accent': handleUpdateAccent,
  'set-typography-visibility': handleSetTypographyVisibility,
  'set-copywrap-size': handleSetCopywrapSize,
  'update-card': handleUpdateCard,
  'update-instructor-card': handleUpdateInstructorCard,
  'set-card-size': handleSetCardSize,
  'update-timeline-item': handleUpdateTimelineItem,
  'update-table': handleUpdateTable,
  'update-chart': handleUpdateChart,
  'import-chart-csv': handleImportChartCsv,
  'import-csv': handleImportCsv,
  'upload-image': handleUploadImage,
  'set-slide-theme': handleSetSlideTheme,
  'set-slide-skipped': handleSetSlideSkipped,
  'set-slide-confidential': handleSetSlideConfidential,
  'trigger-undo': handleTriggerUndo,
  'export-document': handleExportDocument,
};
