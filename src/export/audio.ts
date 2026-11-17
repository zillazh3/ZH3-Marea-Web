import { AudioSample } from 'mediabunny';
import { pyRound } from '@/shared/pycompat';
import { EXPORT_AUDIO_RATE } from './presets';

const BEEP_DURATION_MS = 120;
const BEEP_HZ = 1000;
const BEEP_GAIN = 0.8;
const AUDIO_CHUNK_FRAMES = 4096;

export interface StereoSamples {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/** Generates a 120 ms 1 kHz sine marker padded with silence to `durationMs` (matches ffmpeg `beep`). */
export function buildBeepAudio(durationMs: number, sampleRate = EXPORT_AUDIO_RATE): StereoSamples {
  const totalSamples = Math.max(1, pyRound((Math.max(0, durationMs) / 1000) * sampleRate));
  const beepSamples = Math.min(totalSamples, pyRound((BEEP_DURATION_MS / 1000) * sampleRate));
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  for (let i = 0; i < beepSamples; i += 1) {
    const val = BEEP_GAIN * Math.sin((2 * Math.PI * BEEP_HZ * i) / sampleRate);
    left[i] = val;
    right[i] = val;
  }
  return { left, right };
}

/** Applies a linear outro fade-out over the trailing `fadeOutMs` ms, matching desktop `queue.py`. */
export function applyAudioFadeOut(
  left: Float32Array,
  right: Float32Array,
  fadeOutMs: number,
  sampleRate = EXPORT_AUDIO_RATE,
): void {
  const n = Math.min(pyRound((Math.max(0, fadeOutMs) / 1000) * sampleRate), left.length);
  if (n <= 0) return;
  const start = left.length - n;
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i += 1) {
    const gain = n === 1 ? 0 : 1 - i / denom;
    const idx = start + i;
    left[idx] = (left[idx] ?? 0) * gain;
    right[idx] = (right[idx] ?? 0) * gain;
  }
}

/** Feeds planar float32 stereo buffers into a consumer as closed-on-return `AudioSample` chunks. */
export async function feedAudioSamples(
  samples: StereoSamples,
  sampleRate: number,
  onChunk: (sample: AudioSample) => Promise<void>,
  shouldCancel?: () => boolean,
  baseTimestampSec = 0,
): Promise<void> {
  const total = Math.min(samples.left.length, samples.right.length);
  for (let offset = 0; offset < total; offset += AUDIO_CHUNK_FRAMES) {
    if (shouldCancel?.()) return;
    const frames = Math.min(AUDIO_CHUNK_FRAMES, total - offset);
    const planar = new Float32Array(frames * 2);
    planar.set(samples.left.subarray(offset, offset + frames), 0);
    planar.set(samples.right.subarray(offset, offset + frames), frames);
    const sample = new AudioSample({
      data: planar,
      format: 'f32-planar',
      numberOfChannels: 2,
      sampleRate,
      timestamp: baseTimestampSec + offset / sampleRate,
    });
    try {
      await onChunk(sample);
    } finally {
      sample.close();
    }
  }
}
