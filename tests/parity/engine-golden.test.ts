import { describe, expect, it } from 'vitest';
import { compare, loadDemoLyrics, loadScenario, replay, type Mismatch } from './golden';

const SCENARIOS = [
  'dt64-seeks',
  'dt60-vibrato-warmup',
  'approx-lines',
  'reduced-credit',
  'custom-params',
] as const;

// The whole stepped state (springs, tweens, glow, per-character layer) agrees with the desktop to 1e-9 in every recorded frame:
// no per-quantity loosening was needed, so none is allowed. If a libm difference ever crosses a threshold (spring eps, glow > 0.01),
// widen the bound for that path only, with a comment naming the threshold.
const TOLERANCE = 1e-9;

describe('engine against desktop goldens', () => {
  const lyrics = loadDemoLyrics();

  for (const name of SCENARIOS) {
    it(`replays ${name}`, () => {
      const scenario = loadScenario(name);
      const mismatches: Mismatch[] = [];
      let compared = 0;
      replay(scenario, lyrics, (frame, expected, actual) => {
        compare(expected, { frame, ...actual }, `f${String(frame)}`, TOLERANCE, mismatches);
        compared += 1;
      });
      expect(compared).toBe(scenario.frames.length);
      expect(compared).toBeGreaterThan(10);
      expect(mismatches.slice(0, 8)).toEqual([]);
    });
  }
});
