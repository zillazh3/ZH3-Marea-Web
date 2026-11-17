import { describe, expect, it } from 'vitest';
import { getRfftPlan, hanningWindow, percentile, rfftSpectrum, rfftfreq } from './fft';

function directDftMagSq(input: Float32Array): Float64Array {
  const n = input.length;
  const bins = (n >> 1) + 1;
  const out = new Float64Array(bins);
  for (let k = 0; k < bins; k += 1) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const ang = (-2 * Math.PI * k * t) / n;
      const x = input[t] ?? 0;
      re += x * Math.cos(ang);
      im += x * Math.sin(ang);
    }
    out[k] = re * re + im * im;
  }
  return out;
}

describe('rfft', () => {
  it('matches direct DFT for power-of-two lengths (128)', () => {
    const n = 128;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i += 1) x[i] = Math.sin(i * 0.27) + 0.5 * Math.cos(i * 0.91);
    const plan = getRfftPlan(n);
    const got = new Float64Array(plan.bins);
    rfftSpectrum(x, got, plan, true);
    const want = directDftMagSq(x);
    for (let k = 0; k < plan.bins; k += 1) {
      expect(got[k] ?? 0).toBeCloseTo(want[k] ?? 0, 8);
    }
  });

  it('matches direct DFT for composite non-power-of-two lengths (640)', () => {
    const n = 640;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i += 1) x[i] = Math.sin(i * 0.19) + 0.4 * Math.cos(i * 1.13);
    const plan = getRfftPlan(n);
    const got = new Float64Array(plan.bins);
    rfftSpectrum(x, got, plan, true);
    const want = directDftMagSq(x);
    for (let k = 0; k < plan.bins; k += 1) {
      expect(got[k] ?? 0).toBeCloseTo(want[k] ?? 0, 6);
    }
  });

  it('matches numpy percentile, hanningWindow, and rfftfreq', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBeCloseTo(25, 12);
    expect(percentile([10, 20, 30, 40], 95)).toBeCloseTo(38.5, 12);
    const w = hanningWindow(5);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[2]).toBeCloseTo(1, 6);
    const f = rfftfreq(640, 1 / 16000);
    expect(f.length).toBe(321);
    expect(f[320]).toBeCloseTo(8000, 9);
  });
});
