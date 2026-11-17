import type {
  ExportWorkerErrorCode,
  ExportWorkerJob,
  ExportWorkerRequest,
  ExportWorkerResponse,
} from './types';

export interface ExportRunResult {
  readonly kind: 'done' | 'cancelled';
  readonly opfsName: string | null;
  readonly mp4Bytes: ArrayBuffer | null;
  readonly sizeBytes: number;
  readonly audioCodec: 'aac' | 'opus' | null;
  readonly thumbPng: ArrayBuffer | null;
  readonly frameHashes: Record<number, string>;
}

export class ExportWorkerError extends Error {
  readonly code: ExportWorkerErrorCode;

  constructor(code: ExportWorkerErrorCode, message: string) {
    super(message);
    this.name = 'ExportWorkerError';
    this.code = code;
  }
}

export interface ActiveExportHandle {
  readonly promise: Promise<ExportRunResult>;
  cancel(): void;
}

const CANCEL_GRACE_MS = 1500;

/** Runs a single export job in an isolated worker so cancellation cleanly drops WebGL/WebCodecs state. */
export function runExportWorker(
  job: ExportWorkerJob,
  onProgress: (doneFrames: number, totalFrames: number, etaSeconds: number | null) => void,
): ActiveExportHandle {
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let cancelTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveRun!: (result: ExportRunResult) => void;
  let rejectRun!: (error: Error) => void;

  const cleanup = (): void => {
    if (cancelTimer !== null) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }
    worker.terminate();
  };

  const promise = new Promise<ExportRunResult>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });

  worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
    if (settled) return;
    const msg = event.data;
    switch (msg.type) {
      case 'progress':
        onProgress(msg.doneFrames, msg.totalFrames, msg.etaSeconds);
        return;
      case 'done':
        settled = true;
        cleanup();
        resolveRun({
          kind: 'done',
          opfsName: msg.opfsName,
          mp4Bytes: msg.mp4Bytes,
          sizeBytes: msg.sizeBytes,
          audioCodec: msg.audioCodec,
          thumbPng: msg.thumbPng,
          frameHashes: msg.frameHashes,
        });
        return;
      case 'cancelled':
        settled = true;
        cleanup();
        resolveRun({
          kind: 'cancelled',
          opfsName: null,
          mp4Bytes: null,
          sizeBytes: 0,
          audioCodec: null,
          thumbPng: null,
          frameHashes: {},
        });
        return;
      case 'error':
        settled = true;
        cleanup();
        rejectRun(new ExportWorkerError(msg.code, msg.detail));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectRun(new ExportWorkerError('encodeFailed', event.message || 'Export worker failed'));
  };

  const transfers: Transferable[] = [];
  if (job.coverBytes) transfers.push(job.coverBytes);
  if (job.audioLeft) transfers.push(job.audioLeft);
  if (job.audioRight) transfers.push(job.audioRight);
  const req: ExportWorkerRequest = { type: 'start', job };
  worker.postMessage(req, transfers);

  return {
    promise,
    cancel(): void {
      if (settled) return;
      const cancelMsg: ExportWorkerRequest = { type: 'cancel' };
      worker.postMessage(cancelMsg);
      cancelTimer ??= setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolveRun({
          kind: 'cancelled',
          opfsName: null,
          mp4Bytes: null,
          sizeBytes: 0,
          audioCodec: null,
          thumbPng: null,
          frameHashes: {},
        });
      }, CANCEL_GRACE_MS);
    },
  };
}
