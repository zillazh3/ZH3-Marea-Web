import { describe, expect, it } from 'vitest';
import { AUDIO_RATE, slicePaddedSegment, waveformPeaks, type DecodedAudio } from './local';

function sineAudio(durationSec: number, amplitude = 0.8): DecodedAudio {
  const len = Math.round(durationSec * AUDIO_RATE);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    left[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / AUDIO_RATE);
    right[i] = 0.5 * amplitude * Math.cos((2 * Math.PI * 440 * i) / AUDIO_RATE);
  }
  return {
    fileName: 'tone.wav',
    sampleRate: AUDIO_RATE,
    left,
    right,
    durationMs: durationSec * 1000,
  };
}

describe('audio waveform & slicing', () => {
  it('computes peaks inside bounds and zero-pads outside file bounds', () => {
    const audio = sineAudio(2, 0.8);
    const peaks = waveformPeaks(audio, -1000, 3000, 0, 4);
    expect(peaks.length).toBe(4);
    // [-1000..0] is silence, [0..1000] and [1000..2000] have audio, [2000..3000] is silence.
    expect(peaks[0]).toBe(0);
    expect(peaks[1]).toBeGreaterThan(0.79);
    expect(peaks[2]).toBeGreaterThan(0.79);
    expect(peaks[3]).toBe(0);
  });

  it('shifts waveform window by offsetMs (positive = file runs late)', () => {
    const len = AUDIO_RATE * 4;
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    // Impulse at t = 2.5 s in file.
    left[Math.round(2.5 * AUDIO_RATE)] = 0.9;
    const audio = { left, right };

    // With offsetMs = +500, lyric t = 2000 ms reads file t = 2500 ms.
    const peaks = waveformPeaks(audio, 1000, 3000, 500, 4);
    // Bins cover lyric [1000..1500], [1500..2000], [2000..2500], [2500..3000].
    expect(peaks[2]).toBeCloseTo(0.9, 5);
    expect(peaks[0]).toBe(0);
    expect(peaks[1]).toBe(0);
    expect(peaks[3]).toBe(0);
  });

  it('slices and applies symmetric fades with zero padding outside audio', () => {
    const len = AUDIO_RATE * 2;
    const left = new Float32Array(len).fill(1);
    const right = new Float32Array(len).fill(0.5);
    const seg = slicePaddedSegment({ left, right }, -500, 500, 0, 100);

    expect(seg.left.length).toBe(AUDIO_RATE);
    // First half (-500..0 ms) is zero-padded.
    expect(seg.left[0]).toBe(0);
    expect(seg.left[AUDIO_RATE / 2 - 1]).toBe(0);
    // Middle of second half is full amplitude.
    expect(seg.left[Math.floor(AUDIO_RATE * 0.75)]).toBe(1);
    expect(seg.right[Math.floor(AUDIO_RATE * 0.75)]).toBe(0.5);
    // Tail fades down to zero.
    expect(seg.left[AUDIO_RATE - 1]).toBe(0);
  });
});
