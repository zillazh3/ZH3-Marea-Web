import type { Params } from '@/engine/params';
import type { FxPlanData } from '@/engine/wordfx/fxtypes';
import type { LyricsWithCredit } from '@/render/scene';
import type { Style } from '@/render/style';
import type { ExportMarker } from './presets';

export type ExportWorkerErrorCode =
  | 'insecureContext'
  | 'webcodecsUnsupported'
  | 'noVideoEncoder'
  | 'noAudioEncoder'
  | 'opfsFailed'
  | 'encodeFailed';

export interface ExportWorkerJob {
  readonly id: string;
  readonly lyrics: LyricsWithCredit;
  readonly coverBytes: ArrayBuffer | null;
  readonly demoCoverLabel: boolean;
  readonly params: Params;
  readonly style: Style;
  readonly startMs: number;
  readonly endMs: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly marker: ExportMarker;
  readonly hasAudio: boolean;
  readonly audioLeft: ArrayBuffer | null;
  readonly audioRight: ArrayBuffer | null;
  readonly audioSampleRate: number;
  readonly fxPlan?: FxPlanData | null;
  readonly opfsName: string | null;
  /** Optional pre-encode frame indices to FNV-hash (determinism test). */
  readonly hashFrameIndices?: readonly number[];
  /** When true, skips WebCodecs encoding and only computes frame hashes (headless CI without H.264). */
  readonly hashOnly?: boolean;
}

export type ExportWorkerRequest = { type: 'start'; job: ExportWorkerJob } | { type: 'cancel' };

export type ExportWorkerResponse =
  | { type: 'progress'; doneFrames: number; totalFrames: number; etaSeconds: number | null }
  | {
      type: 'done';
      opfsName: string | null;
      mp4Bytes: ArrayBuffer | null;
      sizeBytes: number;
      audioCodec: 'aac' | 'opus' | null;
      thumbPng: ArrayBuffer | null;
      frameHashes: Record<number, string>;
    }
  | { type: 'cancelled' }
  | { type: 'error'; code: ExportWorkerErrorCode; detail: string };
