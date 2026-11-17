export type ExportState =
  | { kind: 'queued' }
  | {
      kind: 'rendering';
      progress: number;
      etaSeconds: number | null;
      doneFrames?: number;
      totalFrames?: number;
    }
  | { kind: 'done' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' };

export interface ExportJob {
  id: string;
  title: string;
  artist: string;
  state: ExportState;
  label?: string;
  fileName?: string;
  opfsName?: string | null;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  audioCodec?: 'aac' | 'opus' | null;
  thumbUrl?: string | null;
  mp4Bytes?: ArrayBuffer | null;
  createdAt?: number;
}

export interface QueueSummary {
  /** Jobs still to finish: queued plus rendering. */
  pending: number;
  /** Progress 0..1 of the job being rendered, or null when nothing is rendering. */
  progress: number | null;
}

export function summarizeQueue(jobs: readonly ExportJob[]): QueueSummary {
  let pending = 0;
  let progress: number | null = null;
  for (const { state } of jobs) {
    if (state.kind === 'queued') pending += 1;
    if (state.kind === 'rendering') {
      pending += 1;
      progress ??= Math.min(1, Math.max(0, state.progress));
    }
  }
  return { pending, progress };
}
