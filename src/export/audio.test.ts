import { describe, expect, it } from 'vitest';
import { applyAudioFadeOut, buildBeepAudio } from './audio';

describe('export audio helpers', () => {
  it('generates a 120 ms 1 kHz sine beep padded with silence', () => {
    const { left, right } = buildBeepAudio(500, 48_000);
    expect(left.length).toBe(24_000);
    expect(right.length).toBe(24_000);
    // Peak within the first 120 ms (5760 samples) should be near 0.8; trailing samples are silent.
    let earlyPeak = 0;
    for (let i = 0; i < 5760; i += 1) earlyPeak = Math.max(earlyPeak, Math.abs(left[i] ?? 0));
    expect(earlyPeak).toBeGreaterThan(0.75);
    expect(earlyPeak).toBeLessThanOrEqual(0.8001);
    expect(left[6000]).toBe(0);
    expect(right[23_999]).toBe(0);
  });

  it('applies a linear fade-out over the trailing window', () => {
    const left = new Float32Array(1000).fill(1);
    const right = new Float32Array(1000).fill(1);
    applyAudioFadeOut(left, right, 10, 10_000); // 100 samples
    expect(left[899]).toBe(1);
    expect(left[900]).toBe(1);
    expect(left[950]).toBeCloseTo(0.4949, 3);
    expect(left[999]).toBe(0);
    expect(right[999]).toBe(0);
  });
});
