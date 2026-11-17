import type { Params } from '@/engine/params';
import type { FxPlanData, Rgb } from '@/engine/wordfx/fxtypes';
import type { ClockMode, WorkerRequest, WorkerResponse } from './preview.worker';
import type { LyricsWithCredit } from './scene';
import type { Style } from './style';

export interface PreviewPosition {
  readonly offsetMs: number;
  readonly durationMs: number;
  readonly p95DrawMs: number;
  readonly halfRate: boolean;
}

export interface PreviewCallbacks {
  onReady?: (gpu: boolean) => void;
  onError?: (message: string) => void;
  onPosition?: (pos: PreviewPosition) => void;
  onCoverPalette?: (palette: Rgb[]) => void;
}

export interface ConfigurePayload {
  readonly lyrics: LyricsWithCredit;
  readonly coverBytes: Uint8Array | null;
  readonly demoCoverLabel: boolean;
  readonly params: Params;
  readonly style: Style;
  readonly rangeStartMs: number;
  readonly rangeEndMs: number;
  readonly fxPlan?: FxPlanData | null;
  readonly fxDebug?: boolean;
}

export interface ThumbRequest {
  readonly id: string;
  readonly lyrics: LyricsWithCredit;
  readonly params: Params;
  readonly style: Style;
  readonly width: number;
  readonly height: number;
  readonly tMs: number;
}

/**
 * Main-thread client for the CanvasKit preview worker.
 */
export class PreviewClient {
  private readonly worker: Worker;
  private readonly callbacks: PreviewCallbacks;
  private readonly thumbWaiters = new Map<
    string,
    { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void }
  >();
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    callbacks: PreviewCallbacks,
  ) {
    this.callbacks = callbacks;
    this.worker = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleResponse(event.data);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      this.callbacks.onError?.(event.message || 'Worker error');
    };
    const offscreen = canvas.transferControlToOffscreen();
    this.post({ type: 'init', canvas: offscreen, width, height }, [offscreen]);
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []): void {
    if (this.disposed) return;
    this.worker.postMessage(msg, transfer);
  }

  private handleResponse(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        this.callbacks.onReady?.(msg.gpu);
        return;
      case 'error':
        this.callbacks.onError?.(msg.message);
        return;
      case 'palette':
        this.callbacks.onCoverPalette?.(msg.palette);
        return;
      case 'position':
        this.callbacks.onPosition?.({
          offsetMs: msg.offsetMs,
          durationMs: msg.durationMs,
          p95DrawMs: msg.p95DrawMs,
          halfRate: msg.halfRate,
        });
        return;
      case 'thumb': {
        const waiter = this.thumbWaiters.get(msg.id);
        if (waiter) {
          this.thumbWaiters.delete(msg.id);
          waiter.resolve(new Uint8Array(msg.pngBytes));
        }
        return;
      }
      case 'thumbError': {
        const waiter = this.thumbWaiters.get(msg.id);
        if (waiter) {
          this.thumbWaiters.delete(msg.id);
          waiter.reject(new Error(msg.message));
        }
        return;
      }
      case 'ended':
        return;
    }
  }

  configure(payload: ConfigurePayload): void {
    const coverBuf = payload.coverBytes ? payload.coverBytes.slice().buffer : null;
    this.post(
      {
        type: 'configure',
        lyrics: payload.lyrics,
        coverBytes: coverBuf,
        demoCoverLabel: payload.demoCoverLabel,
        params: payload.params,
        style: payload.style,
        rangeStartMs: payload.rangeStartMs,
        rangeEndMs: payload.rangeEndMs,
        fxPlan: payload.fxPlan ?? null,
        fxDebug: payload.fxDebug ?? false,
      },
      coverBuf ? [coverBuf] : [],
    );
  }

  setRange(rangeStartMs: number, rangeEndMs: number, seekToStart = true): void {
    this.post({ type: 'range', rangeStartMs, rangeEndMs, seekToStart });
  }

  seek(offsetMs: number): void {
    this.post({ type: 'seek', offsetMs });
  }

  setPlaying(playing: boolean, clockMode: ClockMode, offsetMs: number): void {
    this.post({ type: 'play', playing, clockMode, offsetMs });
  }

  sendAudioClock(offsetMs: number): void {
    this.post({ type: 'audioClock', offsetMs });
  }

  renderThumb(req: ThumbRequest): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('PreviewClient disposed'));
        return;
      }
      this.thumbWaiters.set(req.id, { resolve, reject });
      this.post({
        type: 'renderThumb',
        id: req.id,
        lyrics: req.lyrics,
        params: req.params,
        style: req.style,
        width: req.width,
        height: req.height,
        tMs: req.tMs,
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.post({ type: 'dispose' });
    this.disposed = true;
    for (const waiter of this.thumbWaiters.values()) {
      waiter.reject(new Error('PreviewClient disposed'));
    }
    this.thumbWaiters.clear();
    this.worker.terminate();
  }
}
