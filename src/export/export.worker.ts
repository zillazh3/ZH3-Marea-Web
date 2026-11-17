import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit } from 'canvaskit-wasm';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import {
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
} from 'mediabunny';
import boldFontUrl from '@/render/fonts/InterTight-Bold.ttf?url';
import regularFontUrl from '@/render/fonts/InterTight-Regular.ttf?url';
import { CanvasKitRenderer, type SceneSpec } from '@/render/renderer';
import { Fonts } from '@/render/text';
import { pyRound } from '@/shared/pycompat';
import { buildBeepAudio, feedAudioSamples } from './audio';
import { probeExportCodecs, type HardwarePreference } from './codecs';
import { captureSurfaceRgbaHash, captureThumbnailPng } from './snapshot';
import type { ExportWorkerJob, ExportWorkerRequest, ExportWorkerResponse } from './types';

const AUDIO_CHUNK_FRAMES = 4096;
const PROGRESS_INTERVAL_MS = 150;
const ETA_WINDOW = 48;

interface WorkerScope {
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
  postMessage(message: ExportWorkerResponse, transfer?: Transferable[]): void;
}

const workerSelf = self as unknown as WorkerScope;

const runState = { cancelled: false };
let ckPromise: Promise<{ ck: CanvasKit; fonts: Fonts }> | null = null;

function isCancelled(): boolean {
  return runState.cancelled;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${String(res.status)}`);
  return res.arrayBuffer();
}

function loadCanvasKit(): Promise<{ ck: CanvasKit; fonts: Fonts }> {
  ckPromise ??= Promise.all([
    CanvasKitInit({ locateFile: () => wasmUrl }),
    fetchBuffer(boldFontUrl),
    fetchBuffer(regularFontUrl),
  ]).then(([ck, boldBuf, regularBuf]) => ({
    ck,
    fonts: new Fonts(ck, boldBuf, regularBuf),
  }));
  return ckPromise;
}

async function openOpfsHandle(name: string): Promise<{
  dir: FileSystemDirectoryHandle;
  writable: FileSystemWritableFileStream;
}> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('exports', { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  return { dir, writable };
}

async function removeOpfsQuietly(
  dir: FileSystemDirectoryHandle | null,
  name: string | null,
): Promise<void> {
  if (!dir || !name) return;
  await dir.removeEntry(name).catch(() => undefined);
}

async function runExport(job: ExportWorkerJob): Promise<void> {
  runState.cancelled = false;
  const totalFrames = Math.max(1, pyRound(((job.endMs - job.startMs) / 1000) * job.fps));
  const dt = 1 / job.fps;
  const hashSet = new Set(job.hashFrameIndices ?? []);
  const frameHashes: Record<number, string> = {};

  const hasBeep = !job.hasAudio && job.marker === 'beep';
  const wantsAudioTrack = job.hasAudio || hasBeep;

  let videoCodec: 'avc' | null = null;
  let fullVideoCodec: string | undefined;
  let hardwareAcceleration: HardwarePreference = 'no-preference';
  let audioCodec: 'aac' | 'opus' | null = null;
  if (!job.hashOnly) {
    if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
      workerSelf.postMessage({
        type: 'error',
        code: 'insecureContext',
        detail: 'Requires HTTPS or localhost',
      });
      return;
    }
    const probe = await probeExportCodecs(job.width, job.height, job.fps);
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      workerSelf.postMessage({
        type: 'error',
        code: 'webcodecsUnsupported',
        detail: 'No WebCodecs',
      });
      return;
    }
    if (!probe.supported || !probe.videoCodec) {
      workerSelf.postMessage({ type: 'error', code: 'noVideoEncoder', detail: 'No H.264 encoder' });
      return;
    }
    if (wantsAudioTrack && !probe.audioCodec) {
      workerSelf.postMessage({
        type: 'error',
        code: 'noAudioEncoder',
        detail: 'No AAC or Opus audio encoder',
      });
      return;
    }
    videoCodec = probe.videoCodec;
    fullVideoCodec = probe.fullVideoCodec;
    hardwareAcceleration = probe.hardwareAcceleration;
    audioCodec = wantsAudioTrack ? probe.audioCodec : null;
  }

  const { ck, fonts } = await loadCanvasKit();
  if (isCancelled()) {
    workerSelf.postMessage({ type: 'cancelled' });
    return;
  }

  const canvas = new OffscreenCanvas(job.width, job.height);
  const surface = ck.MakeWebGLCanvasSurface(canvas) ?? ck.MakeSWCanvasSurface(canvas);
  if (!surface) {
    workerSelf.postMessage({
      type: 'error',
      code: 'encodeFailed',
      detail: 'CanvasKit could not create export surface',
    });
    return;
  }

  const renderer = new CanvasKitRenderer(ck, fonts);
  const spec: SceneSpec = {
    lyrics: job.lyrics,
    coverBytes: job.coverBytes ? new Uint8Array(job.coverBytes) : null,
    demoCoverLabel: job.demoCoverLabel,
    width: job.width,
    height: job.height,
    params: job.params,
    style: job.style,
    clipStartMs: job.startMs,
    fxPlan: job.fxPlan ?? null,
    fxDebug: false,
  };
  renderer.configure(spec);
  renderer.seek(job.startMs);

  let opfsDir: FileSystemDirectoryHandle | null = null;
  let opfsUsedName: string | null = null;
  let bufferTarget: BufferTarget | null = null;
  let output: Output | null = null;
  let videoSource: CanvasSource | null = null;
  let audioSource: AudioSampleSource | null = null;

  try {
    if (!job.hashOnly && videoCodec) {
      let target: StreamTarget | BufferTarget;
      if (job.opfsName && typeof navigator !== 'undefined' && 'storage' in navigator) {
        try {
          const opened = await openOpfsHandle(job.opfsName);
          opfsDir = opened.dir;
          opfsUsedName = job.opfsName;
          target = new StreamTarget(opened.writable, { chunked: true, chunkSize: 1024 * 1024 });
        } catch {
          // Incognito or restricted mobile webviews refuse OPFS handles; fall back to in-memory buffer.
          opfsDir = null;
          opfsUsedName = null;
          bufferTarget = new BufferTarget();
          target = bufferTarget;
        }
      } else {
        bufferTarget = new BufferTarget();
        target = bufferTarget;
      }

      output = new Output({
        format: new Mp4OutputFormat({ fastStart: false }),
        target,
      });

      videoSource = new CanvasSource(canvas, {
        codec: videoCodec,
        quality: new Quality('high'),
        hardwareAcceleration,
        ...(fullVideoCodec ? { fullCodecString: fullVideoCodec } : {}),
        keyFrameInterval: 2,
        onEncodedPacket: (_packet, meta) => {
          if (meta?.decoderConfig) {
            meta.decoderConfig.colorSpace ??= {
              primaries: 'bt709',
              transfer: 'bt709',
              matrix: 'bt709',
              fullRange: false,
            };
          }
        },
      });
      output.addVideoTrack(videoSource, { frameRate: job.fps });

      if (audioCodec) {
        audioSource = new AudioSampleSource({
          codec: audioCodec,
          quality: new Quality('high'),
        });
        output.addAudioTrack(audioSource);
      }

      await output.start();
    }

    const stereo = hasBeep
      ? buildBeepAudio((totalFrames / job.fps) * 1000, job.audioSampleRate)
      : job.hasAudio && job.audioLeft && job.audioRight
        ? {
            left: new Float32Array(job.audioLeft),
            right: new Float32Array(job.audioRight),
          }
        : null;

    const totalAudioFrames = stereo ? Math.min(stereo.left.length, stereo.right.length) : 0;
    let audioCursor = 0;

    const thumbFrameIdx = Math.min(totalFrames - 1, pyRound(job.fps));
    let thumbPng: ArrayBuffer | null = null;
    const t0 = performance.now();
    const recentTimes: number[] = [t0];
    let lastReport = 0;

    for (let i = 0; i < totalFrames; i += 1) {
      if (isCancelled()) {
        if (output) await output.cancel().catch(() => undefined);
        await removeOpfsQuietly(opfsDir, opfsUsedName);
        workerSelf.postMessage({ type: 'cancelled' });
        return;
      }

      if (i > 0) renderer.step(dt, true);
      renderer.drawFrame(surface);
      if (i === 0 && job.marker === 'flash') {
        surface.getCanvas().clear(ck.Color4f(1, 1, 1, 1));
        surface.flush();
      }

      if (hashSet.has(i)) {
        frameHashes[i] = captureSurfaceRgbaHash(ck, surface, job.width, job.height);
      }
      if (i === thumbFrameIdx && !thumbPng) {
        thumbPng = captureThumbnailPng(ck, surface, job.width, job.height);
      }

      const timestampSec = i * dt;
      if (videoSource) {
        await videoSource.add(timestampSec, dt);
      }

      if (audioSource && stereo) {
        const videoEndSec = (i + 1) * dt;
        while (audioCursor < totalAudioFrames && audioCursor / job.audioSampleRate <= videoEndSec) {
          if (isCancelled()) break;
          const chunkLen = Math.min(AUDIO_CHUNK_FRAMES, totalAudioFrames - audioCursor);
          const chunk = {
            left: stereo.left.subarray(audioCursor, audioCursor + chunkLen),
            right: stereo.right.subarray(audioCursor, audioCursor + chunkLen),
          };
          const baseOffset = audioCursor;
          await feedAudioSamples(
            chunk,
            job.audioSampleRate,
            async (sample) => {
              await audioSource?.add(sample);
            },
            isCancelled,
            baseOffset / job.audioSampleRate,
          );
          audioCursor += chunkLen;
        }
      }

      const now = performance.now();
      recentTimes.push(now);
      if (recentTimes.length > ETA_WINDOW) recentTimes.shift();
      const doneFrames = i + 1;
      if (now - lastReport >= PROGRESS_INTERVAL_MS || doneFrames === totalFrames) {
        lastReport = now;
        const firstRecent = recentTimes[0] ?? t0;
        const secPerFrame =
          recentTimes.length >= 4
            ? (now - firstRecent) / 1000 / (recentTimes.length - 1)
            : (now - t0) / 1000 / doneFrames;
        const etaSeconds = secPerFrame * (totalFrames - doneFrames);
        workerSelf.postMessage({
          type: 'progress',
          doneFrames,
          totalFrames,
          etaSeconds: Number.isFinite(etaSeconds) ? etaSeconds : null,
        });
      }
    }

    if (isCancelled()) {
      if (output) await output.cancel().catch(() => undefined);
      await removeOpfsQuietly(opfsDir, opfsUsedName);
      workerSelf.postMessage({ type: 'cancelled' });
      return;
    }

    if (audioSource && stereo && audioCursor < totalAudioFrames) {
      const rem = {
        left: stereo.left.subarray(audioCursor, totalAudioFrames),
        right: stereo.right.subarray(audioCursor, totalAudioFrames),
      };
      const baseOffset = audioCursor;
      await feedAudioSamples(
        rem,
        job.audioSampleRate,
        async (sample) => {
          await audioSource?.add(sample);
        },
        isCancelled,
        baseOffset / job.audioSampleRate,
      );
    }

    videoSource?.close();
    audioSource?.close();
    if (output) {
      await output.finalize();
    }

    let sizeBytes = 0;
    let mp4Bytes: ArrayBuffer | null = null;
    if (opfsDir && opfsUsedName) {
      const file = await (await opfsDir.getFileHandle(opfsUsedName)).getFile();
      sizeBytes = file.size;
    } else if (bufferTarget?.buffer) {
      mp4Bytes = bufferTarget.buffer;
      sizeBytes = mp4Bytes.byteLength;
    }

    const transfers: Transferable[] = [];
    if (mp4Bytes) transfers.push(mp4Bytes);
    if (thumbPng) transfers.push(thumbPng);

    workerSelf.postMessage(
      {
        type: 'done',
        opfsName: opfsUsedName,
        mp4Bytes,
        sizeBytes,
        audioCodec,
        thumbPng,
        frameHashes,
      },
      transfers,
    );
  } catch (err) {
    if (output) await output.cancel().catch(() => undefined);
    await removeOpfsQuietly(opfsDir, opfsUsedName);
    if (isCancelled()) {
      workerSelf.postMessage({ type: 'cancelled' });
      return;
    }
    workerSelf.postMessage({
      type: 'error',
      code: 'encodeFailed',
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    renderer.dispose();
    surface.dispose();
  }
}

workerSelf.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    runState.cancelled = true;
    return;
  }
  void runExport(msg.job);
};
