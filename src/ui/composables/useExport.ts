import { reactive } from 'vue';
import { usePluginBridge } from './usePluginBridge';

export type ExportFormat = 'PDF' | 'PNG';

export function useExport() {
  const bridge = usePluginBridge();

  function exportSlide(slideId: string, format: ExportFormat): void {
    bridge.post({
      type: 'export-document',
      target: 'slide',
      format: format,
      slideId: slideId,
    });
  }

  function exportPresentation(format: ExportFormat): void {
    bridge.post({
      type: 'export-document',
      target: 'presentation',
      format: format,
    });
  }

  return reactive({ exportSlide, exportPresentation });
}
