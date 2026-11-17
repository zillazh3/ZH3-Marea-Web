import { pyRound } from '@/shared/pycompat';
import { AudioError } from './errors';

export const AUDIO_RATE = 48_000;
export const AUDIO_MAX_BYTES = 256 * 1024 * 1024;
export const LOCAL_OFFSET_RANGE: readonly [number, number] = [-15_000, 15_000];

export interface DecodedAudio {
  readonly fileName: string;
  readonly sampleRate: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly durationMs: number;
}

function bufferToStereo(buf: AudioBuffer, fileName: string): DecodedAudio {
  const left = new Float32Array(buf.getChannelData(0));
  const right =
    buf.numberOfChannels > 1 ? new Float32Array(buf.getChannelData(1)) : new Float32Array(left);
  return {
    fileName,
    sampleRate: buf.sampleRate,
    left,
    right,
    durationMs: (left.length / buf.sampleRate) * 1000,
  };
}

/** Decodes an audio file with Web Audio and resamples it to 48 kHz stereo float32. */
export async function decodeAudioBytes(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<DecodedAudio> {
  if (arrayBuffer.byteLength > AUDIO_MAX_BYTES) throw new AudioError('fileTooLarge');

  const AudioCtx = globalThis.AudioContext as typeof AudioContext | undefined;
  if (!AudioCtx) throw new AudioError('decodeFailed');

  const ctx = new AudioCtx({ sampleRate: AUDIO_RATE });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new AudioError('decodeFailed');
  } finally {
    await ctx.close().catch(() => undefined);
  }

  if (decoded.length === 0 || decoded.duration <= 0) throw new AudioError('emptyAudio');

  if (decoded.sampleRate === AUDIO_RATE) {
    return bufferToStereo(decoded, fileName);
  }

  const targetFrames = Math.max(1, Math.ceil(decoded.duration * AUDIO_RATE));
  const offline = new OfflineAudioContext(2, targetFrames, AUDIO_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const resampled = await offline.startRendering();
  return bufferToStereo(resampled, fileName);
}

/**
 * Computes per-bin peak amplitudes (0..1) over `[viewStartMs, viewEndMs]` shifted by `offsetMs`.
 * Positive `offsetMs` means the audio in the file is late relative to the lyrics.
 */
export function waveformPeaks(
  audio: Pick<DecodedAudio, 'left' | 'right'>,
  viewStartMs: number,
  viewEndMs: number,
  offsetMs: number,
  bins: number,
): Float32Array {
  if (bins <= 0) return new Float32Array(0);
  const out = new Float32Array(bins);
  const a = pyRound(((viewStartMs + offsetMs) / 1000) * AUDIO_RATE);
  const b = pyRound(((viewEndMs + offsetMs) / 1000) * AUDIO_RATE);
  const n = b - a;
  const total = audio.left.length;
  if (n <= 0 || total === 0) return out;

  for (let i = 0; i < bins; i += 1) {
    const s0 = Math.trunc((i * n) / bins);
    const s1 = Math.trunc(((i + 1) * n) / bins);
    const lo = Math.max(a + s0, 0);
    const hi = Math.min(a + s1, total);
    let peak = 0;
    for (let k = lo; k < hi; k += 1) {
      const al = Math.abs(audio.left[k] ?? 0);
      const ar = Math.abs(audio.right[k] ?? 0);
      if (al > peak) peak = al;
      if (ar > peak) peak = ar;
    }
    out[i] = Math.min(1, peak);
  }
  return out;
}

/** Cuts `[startMs, endMs]` shifted by `offsetMs`, zero-padding out-of-range regions and applying symmetric fades. */
export function slicePaddedSegment(
  audio: Pick<DecodedAudio, 'left' | 'right'>,
  startMs: number,
  endMs: number,
  offsetMs = 0,
  fadeMs = 150,
): { left: Float32Array; right: Float32Array } {
  const startSample = pyRound(((startMs + offsetMs) / 1000) * AUDIO_RATE);
  const nSamples = Math.max(0, pyRound(((endMs - startMs) / 1000) * AUDIO_RATE));
  const left = new Float32Array(nSamples);
  const right = new Float32Array(nSamples);

  const lo = Math.max(startSample, 0);
  const hi = Math.min(startSample + nSamples, audio.left.length);
  if (hi > lo) {
    left.set(audio.left.subarray(lo, hi), lo - startSample);
    right.set(audio.right.subarray(lo, hi), lo - startSample);
  }

  const fadeSamples = Math.min(pyRound((fadeMs / 1000) * AUDIO_RATE), Math.floor(nSamples / 2));
  if (fadeSamples > 0) {
    const denom = Math.max(1, fadeSamples - 1);
    for (let i = 0; i < fadeSamples; i += 1) {
      const gain = fadeSamples === 1 ? 0 : i / denom;
      left[i] = (left[i] ?? 0) * gain;
      right[i] = (right[i] ?? 0) * gain;
      const tail = nSamples - 1 - i;
      left[tail] = (left[tail] ?? 0) * gain;
      right[tail] = (right[tail] ?? 0) * gain;
    }
  }

  return { left, right };
}
