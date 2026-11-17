import type { ExportWorkerErrorCode } from '@/export/types';

export type ExportErrorCode = ExportWorkerErrorCode | 'noAudioLoaded' | 'missingExportFile';

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExportError';
    this.code = code;
  }
}
