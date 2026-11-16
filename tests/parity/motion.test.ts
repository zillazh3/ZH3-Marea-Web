import { describe, expect, it } from 'vitest';
import type { Line } from '@/engine/lyrics';
import {
  MOTION_MODES,
  PROFILES,
  bump,
  enterDip,
  limit,
  pick,
  resolve,
  syllable,
  type ProfileName,
} from '@/engine/motion';
import motion from '../fixtures/engine/motion.json';

const TOL = 1e-9;

function close(actual: number, expected: number | undefined): void {
  expect(Math.abs(actual - (expected ?? NaN))).toBeLessThanOrEqual(TOL);
}

describe('automatic motion profile', () => {
  it('picks the same profile as the desktop for every demo line and the edge cases', () => {
    for (const c of motion.pick) {
      expect(pick(c.line as Line)).toBe(c.pick);
    }
  });
});

describe('motion kernel', () => {
  it('matches the bump shape with and without the elastic tail', () => {
    for (const [d, settle, expected] of motion.bump.cases as [number, number, number[]][]) {
      motion.bump.us.forEach((u, i) => {
        close(bump(u, d, settle), expected[i]);
      });
    }
  });

  it('limits the sum of syllable and layer softly', () => {
    for (const [wave, base, cap, expected] of motion.limit) {
      close(limit(wave ?? 0, base ?? 0, cap ?? 0), expected);
    }
  });

  it('sinks words in a cascade when a line activates', () => {
    for (const [name, t, word, expected] of motion.enterDip as [
      ProfileName,
      number,
      number,
      number,
    ][]) {
      close(enterDip(PROFILES[name], 1.2, t, 1, word), expected);
    }
  });

  it('moves every character of a syllable like the desktop', () => {
    expect(motion.syllable.length).toBeGreaterThan(100);
    for (const c of motion.syllable) {
      const out = syllable(
        PROFILES[c.profile as ProfileName],
        1,
        c.t,
        c.b,
        c.e,
        c.n,
        c.sus,
        c.dip,
        -0.01,
        0.02,
      );
      if (c.out === null) {
        expect(out).toBeNull();
      } else {
        expect(out).not.toBeNull();
        const [dy, ds] = c.out as [number[], number[]];
        dy.forEach((want, i) => {
          close(out?.dy[i] ?? NaN, want);
        });
        ds.forEach((want, i) => {
          close(out?.ds[i] ?? NaN, want);
        });
      }
    }
  });

  it('applies no layer for reduced motion or the classic mode', () => {
    expect(MOTION_MODES).toEqual(['auto', 'onda', 'rebote', 'respira', 'suave', 'clasico']);
    for (const [mode, reduce, auto, expected] of motion.resolve as [
      (typeof MOTION_MODES)[number],
      boolean,
      ProfileName,
      number[] | null,
    ][]) {
      const profile = resolve(mode, reduce, auto);
      expect(profile ? Object.values(profile) : null).toEqual(expected);
    }
  });
});
