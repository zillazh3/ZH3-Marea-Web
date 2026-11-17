import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import type { Params } from '@/engine/params';
import boldFontUrl from './fonts/InterTight-Bold.ttf?url';
import regularFontUrl from './fonts/InterTight-Regular.ttf?url';
import { CanvasKitRenderer, renderSnapshotPng, type SceneSpec } from './renderer';
import type { LyricsWithCredit } from './scene';
import type { Style } from './style';
import { Fonts } from './text';

const DT = 1 / 60;
const MAX_STEPS = 6;
const SETTLE_MS = 1500;
const P95_WINDOW = 60;
const P95_BUDGET_MS = 16.6;
const HALF_RATE_FLOOR_MS = 30;
const AUDIO_RESYNC_MS = 120;
const AUDIO_EXTRAPOLATE_MAX_MS = 80;

export type ClockMode = 'solo' | 'audio';

export type WorkerRequest =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number }
  | {
      type: 'configure';
      lyrics: LyricsWithCredit;
      coverBytes: ArrayBuffer | null;
      demoCoverLabel: boolean;
      params: Params;
      style: Style;
      rangeStartMs: number;
      rangeEndMs: number;
    }
  | { type: 'range'; rangeStartMs: number; rangeEndMs: number; seekToStart: boolean }
  | { type: 'seek'; offsetMs: number }
  | { type: 'play'; playing: boolean; clockMode: ClockMode; offsetMs: number }
  | { type: 'audioClock'; offsetMs: number }
  | {
      type: 'renderThumb';
      id: string;
      lyrics: LyricsWithCredit;
      params: Params;
      style: Style;
      width: number;
      height: number;
      tMs: number;
    }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready'; gpu: boolean }
  | { type: 'error'; message: string }
  | { type: 'position'; offsetMs: number; durationMs: number; p95DrawMs: number; halfRate: boolean }
  | { type: 'ended' }
  | { type: 'thumb'; id: string; pngBytes: ArrayBuffer }
  | { type: 'thumbError'; id: string; message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  requestAnimationFrame(cb: (ts: number) => void): number;
  cancelAnimationFrame(id: number): void;
}

const workerSelf = self as unknown as WorkerScope;

let ck: CanvasKit | null = null;
let fonts: Fonts | null = null;
let surface: Surface | null = null;
let renderer: CanvasKitRenderer | null = null;
let width = 540;
let height = 960;

let rangeStartMs = 0;
let rangeEndMs = 1000;
let playing = false;
let clockMode: ClockMode = 'solo';
let lastAudioSyncOffsetMs = 0;
let lastAudioSyncPerfMs = 0;
let settleRemainingMs = 0;
let rafId: number | null = null;
let lastTickPerfMs = 0;
let lastDrawPerfMs = 0;
let accS = 0;
let needsDraw = false;

let currentLyrics: LyricsWithCredit | null = null;
let currentCoverBytes: Uint8Array | null = null;
let currentDemoLabel = false;
let currentParams: Params | null = null;
let currentStyle: Style | null = null;

const drawSamples: number[] = [];
let halfRate = false;
let skipDraw = false;

function durationMs(): number {
  return Math.max(1, rangeEndMs - rangeStartMs);
}

function currentP95(): number {
  if (drawSamples.length === 0) return 0;
  const sorted = [...drawSamples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx] ?? 0;
}

function recordDrawMs(ms: number): number {
  drawSamples.push(ms);
  if (drawSamples.length > P95_WINDOW) drawSamples.shift();
  const p95 = currentP95();
  halfRate = drawSamples.length >= 15 && p95 > P95_BUDGET_MS;
  return p95;
}

function drawAndReport(tickNow: number): void {
  if (!renderer || !surface) return;
  const t0 = performance.now();
  renderer.drawFrame(surface);
  const drawMs = performance.now() - t0;
  lastDrawPerfMs = tickNow;
  const p95 = playing ? recordDrawMs(drawMs) : currentP95();
  const offsetMs = Math.max(0, Math.min(durationMs(), renderer.currentTimeMs() - rangeStartMs));
  workerSelf.postMessage({
    type: 'position',
    offsetMs,
    durationMs: durationMs(),
    p95DrawMs: p95,
    halfRate,
  });
}

function startLoop(): void {
  if (rafId !== null) return;
  // Seed the clock only when starting from idle so render time inside onTick is never discarded.
  lastTickPerfMs = performance.now();
  rafId = workerSelf.requestAnimationFrame(onTick);
}

function continueLoop(): void {
  if (rafId !== null) return;
  rafId = workerSelf.requestAnimationFrame(onTick);
}

function stopTick(): void {
  if (rafId !== null) {
    workerSelf.cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function wake(): void {
  settleRemainingMs = SETTLE_MS;
  startLoop();
}

function onTick(): void {
  rafId = null;
  if (!renderer || !surface) return;

  const tickNow = performance.now();
  const elapsedS = Math.min(0.25, Math.max(0, (tickNow - lastTickPerfMs) / 1000));
  lastTickPerfMs = tickNow;
  let steps = 0;

  if (playing && clockMode === 'audio') {
    const sinceSyncMs = Math.min(
      AUDIO_EXTRAPOLATE_MAX_MS,
      Math.max(0, tickNow - lastAudioSyncPerfMs),
    );
    const targetMs = rangeStartMs + Math.min(durationMs(), lastAudioSyncOffsetMs + sinceSyncMs);
    const currentMs = renderer.currentTimeMs();
    if (Math.abs(targetMs - currentMs) > AUDIO_RESYNC_MS) {
      renderer.seek(targetMs);
      drawAndReport(tickNow);
      continueLoop();
      return;
    }
    const targetS = targetMs / 1000;
    while (renderer.currentTimeMs() / 1000 + DT * 0.5 < targetS && steps < MAX_STEPS) {
      renderer.step(DT, true);
      steps += 1;
    }
  } else {
    accS += elapsedS;
    while (accS >= DT && steps < MAX_STEPS) {
      renderer.step(DT, playing);
      accS -= DT;
      steps += 1;
    }
    accS = Math.min(accS, DT);
  }

  if (steps > 0 || needsDraw) {
    needsDraw = false;
    if (playing && clockMode === 'solo' && renderer.currentTimeMs() >= rangeEndMs) {
      renderer.seek(rangeStartMs);
      drawAndReport(tickNow);
      continueLoop();
      return;
    }

    if (!playing) settleRemainingMs -= steps * DT * 1000;

    let shouldDraw = true;
    // Only drop every other frame when callbacks arrive near 60 Hz; never throttle a 30 Hz device down to 15 FPS.
    if (playing && halfRate && tickNow - lastDrawPerfMs < HALF_RATE_FLOOR_MS) {
      skipDraw = !skipDraw;
      shouldDraw = !skipDraw;
    } else {
      skipDraw = false;
    }
    if (shouldDraw) drawAndReport(tickNow);
  }

  if (playing || (settleRemainingMs > 0 && !renderer.isSettled())) {
    continueLoop();
  } else {
    stopTick();
  }
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${String(res.status)}`);
  return res.arrayBuffer();
}

async function handleInit(canvas: OffscreenCanvas, w: number, h: number): Promise<void> {
  width = w;
  height = h;
  const [instance, boldBuf, regularBuf] = await Promise.all([
    CanvasKitInit({ locateFile: () => wasmUrl }),
    fetchBuffer(boldFontUrl),
    fetchBuffer(regularFontUrl),
  ]);
  ck = instance;
  fonts = new Fonts(ck, boldBuf, regularBuf);
  const webglSurface = ck.MakeWebGLCanvasSurface(canvas);
  const gpu = webglSurface !== null;
  surface = webglSurface ?? ck.MakeSWCanvasSurface(canvas);
  if (!surface) throw new Error('CanvasKit could not create a canvas surface.');
  renderer = new CanvasKitRenderer(ck, fonts);
  workerSelf.postMessage({ type: 'ready', gpu });
}

function applyConfigure(seekToMs: number | null): void {
  if (!renderer || !currentLyrics || !currentParams || !currentStyle) return;
  const spec: SceneSpec = {
    lyrics: currentLyrics,
    coverBytes: currentCoverBytes,
    demoCoverLabel: currentDemoLabel,
    width,
    height,
    params: currentParams,
    style: currentStyle,
    clipStartMs: rangeStartMs,
  };
  renderer.configure(spec);
  if (seekToMs !== null) renderer.seek(seekToMs);
  needsDraw = true;
  wake();
}

function handleMessage(msg: WorkerRequest): void {
  switch (msg.type) {
    case 'init': {
      void handleInit(msg.canvas, msg.width, msg.height).catch((err: unknown) => {
        workerSelf.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }
    case 'configure': {
      const firstInit = currentLyrics === null;
      currentLyrics = msg.lyrics;
      currentCoverBytes = msg.coverBytes ? new Uint8Array(msg.coverBytes) : null;
      currentDemoLabel = msg.demoCoverLabel;
      currentParams = msg.params;
      currentStyle = msg.style;
      rangeStartMs = msg.rangeStartMs;
      rangeEndMs = Math.max(msg.rangeStartMs + 1, msg.rangeEndMs);
      if (firstInit) {
        drawSamples.length = 0;
        halfRate = false;
        skipDraw = false;
      }
      applyConfigure(firstInit ? rangeStartMs : null);
      return;
    }
    case 'range': {
      rangeStartMs = msg.rangeStartMs;
      rangeEndMs = Math.max(msg.rangeStartMs + 1, msg.rangeEndMs);
      applyConfigure(msg.seekToStart ? rangeStartMs : null);
      return;
    }
    case 'seek': {
      if (!renderer) return;
      const clamped = Math.max(0, Math.min(durationMs(), msg.offsetMs));
      const now = performance.now();
      lastAudioSyncOffsetMs = clamped;
      lastAudioSyncPerfMs = now;
      lastTickPerfMs = now;
      accS = 0;
      renderer.seek(rangeStartMs + clamped);
      needsDraw = true;
      wake();
      return;
    }
    case 'play': {
      playing = msg.playing;
      clockMode = msg.clockMode;
      const now = performance.now();
      lastAudioSyncOffsetMs = msg.offsetMs;
      lastAudioSyncPerfMs = now;
      lastTickPerfMs = now;
      accS = 0;
      skipDraw = false;
      if (playing) startLoop();
      else wake();
      return;
    }
    case 'audioClock': {
      lastAudioSyncOffsetMs = msg.offsetMs;
      lastAudioSyncPerfMs = performance.now();
      return;
    }
    case 'renderThumb': {
      if (!ck || !fonts) {
        workerSelf.postMessage({ type: 'thumbError', id: msg.id, message: 'Renderer not ready' });
        return;
      }
      try {
        const png = renderSnapshotPng(
          ck,
          fonts,
          {
            lyrics: msg.lyrics,
            coverBytes: null,
            demoCoverLabel: true,
            width: msg.width,
            height: msg.height,
            params: msg.params,
            style: msg.style,
            clipStartMs: null,
          },
          msg.tMs,
        );
        const copy = png.slice().buffer;
        workerSelf.postMessage({ type: 'thumb', id: msg.id, pngBytes: copy }, [copy]);
      } catch (err) {
        workerSelf.postMessage({
          type: 'thumbError',
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    case 'dispose': {
      stopTick();
      renderer?.dispose();
      renderer = null;
      surface?.dispose();
      surface = null;
      fonts?.dispose();
      fonts = null;
      ck = null;
    }
  }
}

workerSelf.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handleMessage(event.data);
};
