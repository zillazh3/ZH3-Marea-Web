import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { EXPORT_FPS, type ExportMarker } from '@/export/presets';
import { ExportWorkerError, runExportWorker, type ActiveExportHandle } from '@/export/exportClient';
import type { ExportWorkerJob } from '@/export/types';
import type { Params } from '@/engine/params';
import type { FxPlanData } from '@/engine/wordfx/fxtypes';
import { ExportError } from '@/features/exports/errors';
import { summarizeQueue, type ExportJob } from '@/features/exports/queue';
import type { ExportClipRecord } from '@/features/storage/db';
import { exportHistoryStore } from '@/features/storage/exports';
import { opfsAvailable } from '@/features/storage/opfs';
import type { LyricsWithCredit } from '@/render/scene';
import type { Style } from '@/render/style';
import { describeError } from '../errors';
import { downloadBlob } from '../files';
import { i18n } from '../i18n.svelte';
import { notifications } from './toasts.svelte';

export interface EnqueueExportInput {
  readonly title: string;
  readonly artist: string;
  readonly label: string;
  readonly fileName: string;
  readonly lyrics: LyricsWithCredit;
  readonly coverBytes: Uint8Array | null;
  readonly demoCoverLabel: boolean;
  readonly params: Params;
  readonly style: Style;
  readonly startMs: number;
  readonly endMs: number;
  readonly width: number;
  readonly height: number;
  readonly marker: ExportMarker;
  readonly audioSamples: { readonly left: Float32Array; readonly right: Float32Array } | null;
  readonly audioSampleRate: number;
  readonly fxPlan?: FxPlanData | null;
}

let jobs = $state<ExportJob[]>([]);
let loaded = $state(false);
const summary = $derived(summarizeQueue(jobs));

const pendingSpecs = new SvelteMap<string, EnqueueExportInput>();
let activeId: string | null = null;
let activeHandle: ActiveExportHandle | null = null;
let opusNotified = false;

function nextJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `exp-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Strips Svelte `$state` proxies before `postMessage` to the export worker. */
function snapshotPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeThumbUrl(bytes: Uint8Array | ArrayBuffer | null | undefined): string | null {
  if (!bytes) return null;
  const copy = bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.slice().buffer;
  if (copy.byteLength === 0) return null;
  return URL.createObjectURL(new Blob([copy], { type: 'image/png' }));
}

function revokeThumb(job: ExportJob | undefined): void {
  if (job?.thumbUrl) URL.revokeObjectURL(job.thumbUrl);
}

function updateJob(id: string, patch: Partial<ExportJob>): void {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
}

function recordToJob(record: ExportClipRecord): ExportJob {
  const thumbUrl = makeThumbUrl(record.thumbPng);
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    state: { kind: 'done' },
    label: record.label,
    fileName: record.fileName,
    opfsName: record.opfsName,
    sizeBytes: record.sizeBytes,
    durationMs: record.durationMs,
    width: record.width,
    height: record.height,
    audioCodec: record.audioCodec,
    thumbUrl,
    mp4Bytes: null,
    createdAt: record.createdAt,
  };
}

function toWorkerJob(
  id: string,
  input: EnqueueExportInput,
  opfsName: string | null,
): ExportWorkerJob {
  return {
    id,
    lyrics: snapshotPlain(input.lyrics),
    coverBytes: input.coverBytes ? input.coverBytes.slice().buffer : null,
    demoCoverLabel: input.demoCoverLabel,
    params: snapshotPlain(input.params),
    style: snapshotPlain(input.style),
    startMs: input.startMs,
    endMs: input.endMs,
    width: input.width,
    height: input.height,
    fps: EXPORT_FPS,
    marker: input.marker,
    hasAudio: input.audioSamples !== null,
    audioLeft: input.audioSamples ? input.audioSamples.left.slice().buffer : null,
    audioRight: input.audioSamples ? input.audioSamples.right.slice().buffer : null,
    audioSampleRate: input.audioSampleRate,
    fxPlan: input.fxPlan ? snapshotPlain(input.fxPlan) : null,
    opfsName,
  };
}

function pumpQueue(): void {
  if (activeId !== null) return;
  const next = [...jobs].reverse().find((job) => job.state.kind === 'queued');
  if (!next) return;
  const spec = pendingSpecs.get(next.id);
  if (!spec) {
    updateJob(next.id, { state: { kind: 'failed', message: i18n.m.errors.unknown } });
    pumpQueue();
    return;
  }

  pendingSpecs.delete(next.id);
  activeId = next.id;
  const opfsName = next.opfsName ?? null;
  updateJob(next.id, { state: { kind: 'rendering', progress: 0, etaSeconds: null } });

  const handle = runExportWorker(
    toWorkerJob(next.id, spec, opfsName),
    (done, total, etaSeconds) => {
      const progress = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
      updateJob(next.id, {
        state: {
          kind: 'rendering',
          progress,
          etaSeconds,
          doneFrames: done,
          totalFrames: total,
        },
      });
    },
  );
  activeHandle = handle;

  void handle.promise
    .then(async (result) => {
      if (result.kind === 'cancelled') {
        updateJob(next.id, { state: { kind: 'cancelled' } });
        notifications.show(i18n.m.exports.cancelledToast, 'info');
        return;
      }

      const thumbPng = result.thumbPng ? new Uint8Array(result.thumbPng) : null;
      const thumbUrl = makeThumbUrl(thumbPng);
      const record: ExportClipRecord = {
        id: next.id,
        title: spec.title,
        artist: spec.artist,
        label: spec.label,
        fileName: spec.fileName,
        opfsName: result.opfsName,
        sizeBytes: result.sizeBytes,
        durationMs: Math.max(1, spec.endMs - spec.startMs),
        width: spec.width,
        height: spec.height,
        audioCodec: result.audioCodec,
        createdAt: next.createdAt ?? Date.now(),
        thumbPng,
      };
      if (result.opfsName) {
        try {
          await exportHistoryStore.put(record);
        } catch {
          // Quota or private-browsing IndexedDB refusal still leaves the clip available for immediate download.
        }
      }

      updateJob(next.id, {
        state: { kind: 'done' },
        opfsName: result.opfsName,
        mp4Bytes: result.mp4Bytes,
        sizeBytes: result.sizeBytes,
        audioCodec: result.audioCodec,
        thumbUrl,
      });
      notifications.show(
        i18n.m.editor.exportBar.doneToast(spec.title || i18n.m.editor.untitled),
        'ok',
      );
      if (result.audioCodec === 'opus' && !opusNotified) {
        opusNotified = true;
        notifications.show(i18n.m.editor.exportBar.opusNote, 'info');
      }
    })
    .catch((error: unknown) => {
      let mapped = i18n.m.errors.unknown;
      if (error instanceof ExportWorkerError) {
        const base = describeError(i18n.m, new ExportError(error.code, error.message));
        mapped =
          error.code === 'encodeFailed' && error.message ? `${base} (${error.message})` : base;
      }
      updateJob(next.id, { state: { kind: 'failed', message: mapped } });
      notifications.show(
        i18n.m.editor.exportBar.failedToast(spec.title || i18n.m.editor.untitled),
        'error',
      );
    })
    .finally(() => {
      if (activeId === next.id) {
        activeId = null;
        activeHandle = null;
      }
      pumpQueue();
    });
}

async function resolveClipBlob(job: ExportJob): Promise<Blob | null> {
  if (job.mp4Bytes) {
    return new Blob([job.mp4Bytes.slice(0)], { type: 'video/mp4' });
  }
  if (job.opfsName) {
    return exportHistoryStore.readClipBlob(job.opfsName);
  }
  return null;
}

export const exportQueue = {
  get jobs(): readonly ExportJob[] {
    return jobs;
  },
  get loaded(): boolean {
    return loaded;
  },
  get pending(): number {
    return summary.pending;
  },
  get progress(): number | null {
    return summary.progress;
  },

  async init(): Promise<void> {
    try {
      const records = await exportHistoryStore.list();
      const seen = new SvelteSet(jobs.map((job) => job.id));
      const restored = records.filter((rec) => !seen.has(rec.id)).map(recordToJob);
      if (restored.length > 0) {
        jobs = [...jobs, ...restored];
      }
    } catch {
      // IndexedDB unavailable (private mode): history starts empty.
    }
    loaded = true;
  },

  replace(next: ExportJob[]): void {
    jobs = next;
  },

  enqueue(input: EnqueueExportInput): string {
    const id = nextJobId();
    const useOpfs = opfsAvailable();
    const coverThumb = makeThumbUrl(input.coverBytes);
    const job: ExportJob = {
      id,
      title: input.title,
      artist: input.artist,
      state: { kind: 'queued' },
      label: input.label,
      fileName: input.fileName,
      opfsName: useOpfs ? `${id}.mp4` : null,
      durationMs: Math.max(1, input.endMs - input.startMs),
      width: input.width,
      height: input.height,
      thumbUrl: coverThumb,
      mp4Bytes: null,
      createdAt: Date.now(),
    };
    pendingSpecs.set(id, input);
    jobs = [job, ...jobs];
    notifications.show(
      i18n.m.editor.exportBar.queuedToast(input.title || i18n.m.editor.untitled),
      'info',
    );
    pumpQueue();
    return id;
  },

  cancel(id: string): void {
    const job = jobs.find((item) => item.id === id);
    if (!job) return;
    if (job.state.kind === 'queued') {
      pendingSpecs.delete(id);
      updateJob(id, { state: { kind: 'cancelled' } });
      notifications.show(i18n.m.exports.cancelledToast, 'info');
      return;
    }
    if (job.state.kind === 'rendering' && activeId === id && activeHandle) {
      activeHandle.cancel();
    }
  },

  async remove(id: string): Promise<void> {
    const existing = jobs.find((item) => item.id === id);
    if (existing && (existing.state.kind === 'queued' || existing.state.kind === 'rendering')) {
      return;
    }
    pendingSpecs.delete(id);
    revokeThumb(existing);
    jobs = jobs.filter((item) => item.id !== id);
    try {
      await exportHistoryStore.remove(id);
    } catch {
      // Nothing to delete when running purely in-memory.
    }
  },

  async clearFinished(): Promise<void> {
    const kept: ExportJob[] = [];
    const removedIds: string[] = [];
    for (const job of jobs) {
      if (job.state.kind === 'queued' || job.state.kind === 'rendering') {
        kept.push(job);
      } else {
        revokeThumb(job);
        removedIds.push(job.id);
      }
    }
    jobs = kept;
    for (const id of removedIds) {
      try {
        await exportHistoryStore.remove(id);
      } catch {
        // Ignore OPFS/IDB removal failure for orphaned items.
      }
    }
  },

  async download(id: string): Promise<void> {
    const job = jobs.find((item) => item.id === id);
    if (!job) return;
    const blob = await resolveClipBlob(job);
    if (!blob) {
      notifications.show(describeError(i18n.m, new ExportError('missingExportFile')), 'error');
      return;
    }
    downloadBlob(job.fileName ?? `${job.title || 'clip'}.mp4`, blob);
  },

  canShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  },

  async share(id: string): Promise<void> {
    const job = jobs.find((item) => item.id === id);
    if (!job || !this.canShare()) return;
    const blob = await resolveClipBlob(job);
    if (!blob) {
      notifications.show(describeError(i18n.m, new ExportError('missingExportFile')), 'error');
      return;
    }
    const file = new File([blob], job.fileName ?? 'clip.mp4', { type: 'video/mp4' });
    const canShareFiles =
      typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
    if (!canShareFiles) {
      downloadBlob(file.name, blob);
      return;
    }
    try {
      await navigator.share({ files: [file], title: job.title || file.name });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notifications.show(i18n.m.errors.unknown, 'error');
    }
  },
};
