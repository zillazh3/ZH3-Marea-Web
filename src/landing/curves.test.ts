import { describe, expect, it } from 'vitest';
import {
  GLOW_END_LEVEL,
  GLOW_PEAK_AT,
  lineBlurPx,
  RESTING_SCALE,
  RESTING_SINK_EM,
  sampleSyllableMotion,
  WIPE_EASING,
} from './curves';

describe('landing animation curves (ZH3 Marea fidelity)', () => {
  it('applies non-linear WIPE easing passing faster through the middle of a syllable', () => {
    expect(WIPE_EASING(0)).toBe(0);
    expect(WIPE_EASING(1)).toBe(1);
    expect(WIPE_EASING(0.5)).toBeCloseTo(0.5, 4);
    expect(WIPE_EASING(0.15)).toBeLessThan(0.15);
    expect(WIPE_EASING(0.85)).toBeGreaterThan(0.85);
  });

  it('produces lift, scale swell, and decaying post-syllable glow envelope', () => {
    const idle = sampleSyllableMotion(0);
    expect(idle.wipe).toBe(0);
    expect(idle.liftEm).toBe(RESTING_SINK_EM);
    expect(idle.scale).toBe(RESTING_SCALE);
    expect(idle.glow).toBe(0);

    const mid = sampleSyllableMotion(0.55, 0, 0.5);
    expect(mid.liftEm).toBeLessThan(0);
    expect(mid.scale).toBeGreaterThan(1);
    expect(mid.glow).toBeGreaterThan(0.5);

    const peak = sampleSyllableMotion(GLOW_PEAK_AT);
    expect(peak.glow).toBeCloseTo(1, 5);

    const tailStart = sampleSyllableMotion(1, 0);
    expect(tailStart.wipe).toBe(1);
    expect(tailStart.liftEm).toBe(0);
    expect(tailStart.scale).toBe(1);
    expect(tailStart.glow).toBeCloseTo(GLOW_END_LEVEL, 5);

    const tailMid = sampleSyllableMotion(1, 0.5);
    expect(tailMid.glow).toBeGreaterThan(0);
    expect(tailMid.glow).toBeLessThan(GLOW_END_LEVEL);

    const settled = sampleSyllableMotion(1, 1);
    expect(settled.glow).toBe(0);
  });

  it('scales inactive line blur by distance from the active line', () => {
    expect(lineBlurPx(2, 2)).toBe(0);
    expect(lineBlurPx(1, 2)).toBeGreaterThan(lineBlurPx(3, 2));
    expect(lineBlurPx(5, 0)).toBeGreaterThan(lineBlurPx(1, 0));
  });
});
