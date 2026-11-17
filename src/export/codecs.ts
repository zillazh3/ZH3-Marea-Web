import {
  Mp4OutputFormat,
  Quality,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { EXPORT_AUDIO_RATE, EXPORT_FPS } from './presets';

export type HardwarePreference = 'no-preference' | 'prefer-hardware' | 'prefer-software';

export interface CodecProbeResult {
  readonly supported: boolean;
  readonly videoCodec: 'avc' | null;
  readonly fullVideoCodec: string | undefined;
  readonly hardwareAcceleration: HardwarePreference;
  readonly audioCodec: 'aac' | 'opus' | null;
}

export function webCodecsAvailable(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioEncoder !== 'undefined'
  );
}

/** Picks minimum H.264 level hex supporting both macroblock count and macroblocks/sec at `fps`. */
function minAvcLevelHex(width: number, height: number, fps: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbsPerSec = mbs * Math.max(1, fps);
  // Level 4.2 covers up to 8704 MB and 522,240 MB/s (1080x1920 @ 60 fps = 8160 MB, 489,600 MB/s).
  if (mbs <= 8192 && mbsPerSec <= 245_760) return '28';
  if (mbs <= 8704 && mbsPerSec <= 522_240) return '2a';
  if (mbs <= 22_080 && mbsPerSec <= 589_824) return '32';
  return '33';
}

function buildAvcCandidates(
  width: number,
  height: number,
  fps: number,
): readonly (string | undefined)[] {
  const lvl = minAvcLevelHex(width, height, fps);
  // Some mobile hardware encoders reject High Profile (6400) or lower 60 fps levels; fall back to Main & Baseline.
  return [`avc1.6400${lvl}`, `avc1.4d00${lvl}`, `avc1.42e0${lvl}`, `avc1.4200${lvl}`, undefined];
}

function canConfigureAvcEncoder(
  codecString: string,
  width: number,
  height: number,
  fps: number,
  hardwareAcceleration: HardwarePreference,
): boolean {
  const encoder = new VideoEncoder({
    output: () => undefined,
    error: () => undefined,
  });
  try {
    encoder.configure({
      codec: codecString,
      width,
      height,
      framerate: fps,
      hardwareAcceleration,
    });
    return encoder.state === 'configured';
  } catch {
    return false;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/** Probes WebCodecs H.264 video (across profiles & SW fallback) and AAC/Opus audio encoding inside MP4. */
export async function probeExportCodecs(
  width: number,
  height: number,
  fps = EXPORT_FPS,
): Promise<CodecProbeResult> {
  if (!webCodecsAvailable()) {
    return {
      supported: false,
      videoCodec: null,
      fullVideoCodec: undefined,
      hardwareAcceleration: 'no-preference',
      audioCodec: null,
    };
  }

  const format = new Mp4OutputFormat();
  const hasAvc = format.getSupportedVideoCodecs().includes('avc');
  const quality = new Quality('high');
  let matchedFullCodec: string | undefined;
  let matchedHw: HardwarePreference = 'no-preference';
  let videoSupported = false;

  if (hasAvc) {
    const accelModes: readonly HardwarePreference[] = ['no-preference', 'prefer-software'];
    const candidates = buildAvcCandidates(width, height, fps);
    outer: for (const hardwareAcceleration of accelModes) {
      for (const fullCodecString of candidates) {
        const ok = await canEncodeVideo('avc', {
          width,
          height,
          frameRate: fps,
          quality,
          hardwareAcceleration,
          ...(fullCodecString ? { fullCodecString } : {}),
        });
        if (!ok) continue;
        // Verify synchronous configure() on explicit codecs so mobile MediaCodec rejections fall back early.
        if (
          fullCodecString &&
          !canConfigureAvcEncoder(fullCodecString, width, height, fps, hardwareAcceleration)
        ) {
          continue;
        }
        videoSupported = true;
        matchedFullCodec = fullCodecString;
        matchedHw = hardwareAcceleration;
        break outer;
      }
    }
    if (!videoSupported) {
      const auto = await getFirstEncodableVideoCodec(['avc'], { width, height, quality });
      videoSupported = auto === 'avc';
    }
  }

  const audioCandidates = format
    .getSupportedAudioCodecs()
    .filter((c): c is 'aac' | 'opus' => c === 'aac' || c === 'opus');
  // Prefer AAC over Opus when available for broadest MP4 playback compatibility (ADR 0004).
  const orderedAudio: ('aac' | 'opus')[] = [
    ...audioCandidates.filter((c) => c === 'aac'),
    ...audioCandidates.filter((c) => c === 'opus'),
  ];
  const audio =
    orderedAudio.length > 0
      ? await getFirstEncodableAudioCodec(orderedAudio, {
          numberOfChannels: 2,
          sampleRate: EXPORT_AUDIO_RATE,
        })
      : null;
  const audioTyped = audio === 'aac' || audio === 'opus' ? audio : null;

  return {
    supported: videoSupported,
    videoCodec: videoSupported ? 'avc' : null,
    fullVideoCodec: matchedFullCodec,
    hardwareAcceleration: matchedHw,
    audioCodec: audioTyped,
  };
}
