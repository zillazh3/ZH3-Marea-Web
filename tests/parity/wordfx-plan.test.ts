import { describe, expect, it } from 'vitest';
import { planInterludeColor } from '@/engine/wordfx/planLookup';
import { demoLyrics } from '@/features/lyrics/demo';
import { loadBundledLibrary } from '@/features/wordfx/library';
import { buildFxPlan, trackKey } from '@/features/wordfx/plan';
import { classifyProfile } from '@/features/wordfx/profile';
import { loadBundledRules } from '@/features/wordfx/rules';
import fixture from '../fixtures/wordfx/plan.json';

describe('wordfx composer, profile, momentum & plan parity (T8.3)', () => {
  const lyrics = demoLyrics();
  const lib = loadBundledLibrary();
  const rules = loadBundledRules();
  const palette = fixture.palette.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] as const);
  const key = trackKey(lyrics, 'demo-track');
  const prof = classifyProfile(lyrics, lib, rules, null, key);
  const plan = buildFxPlan(lyrics, {
    lib,
    rules,
    intensity: 1.0,
    trackId: 'demo-track',
    palette,
    profile: prof,
  });

  it('matches desktop trackKey and SongProfile classification', () => {
    expect(key).toBe(fixture.trackKey);
    expect(prof.tags).toEqual(fixture.profile.tags);
    expect(prof.intensity).toBeCloseTo(fixture.profile.intensity, 6);
    expect(prof.arc.length).toBe(fixture.profile.arc.length);
    for (let i = 0; i < fixture.profile.arc.length; i += 1) {
      const a = prof.arc[i];
      const b = fixture.profile.arc[i];
      expect(a?.mood).toBe(b?.mood);
      expect(a?.start ?? 0).toBeCloseTo(b?.start ?? 0, 6);
      expect(a?.end ?? 0).toBeCloseTo(b?.end ?? 0, 6);
    }
  });

  it('matches desktop composed FxParams, background FX, ambient FX, and interlude colors', () => {
    expect(Object.keys(plan.words).sort()).toEqual(Object.keys(fixture.words).sort());
    for (const [k, exp] of Object.entries(fixture.words)) {
      const got = plan.words[k]?.params;
      expect(got).toBeDefined();
      if (!got) continue;
      expect(got.seed).toBe(exp.seed);
      expect(got.primitives).toEqual(exp.primitives);
      expect(got.colorFrom).toEqual(exp.colorFrom);
      expect(got.colorTo).toEqual(exp.colorTo);
      expect(got.oscColor).toEqual(exp.oscColor);
      expect(got.variant).toBe(exp.variant);
      expect(got.tier).toBe(exp.tier);
      expect(got.waveform).toBe(exp.waveform);
      expect(got.sigAxis).toBe(exp.sigAxis);
      expect(got.particles).toBe(exp.particles);
      expect(got.particleKind).toBe(exp.particleKind);
      expect(got.sparkle).toBe(exp.sparkle);
      expect(got.glow).toBeCloseTo(exp.glow, 6);
      expect(got.streak).toBeCloseTo(exp.streak, 6);
      expect(got.sigFreqHz).toBeCloseTo(exp.sigFreqHz, 6);
      expect(got.sigAmpEm).toBeCloseTo(exp.sigAmpEm, 6);
      expect(got.releaseS).toBeCloseTo(exp.releaseS, 6);
      expect(got.bleedDonorS).toBeCloseTo(exp.bleedDonorS, 6);
    }

    for (const [k, exp] of Object.entries(fixture.ambientSample)) {
      const got = plan.ambient[k]?.params;
      expect(got).toBeDefined();
      if (!got) continue;
      expect(got.seed).toBe(exp.seed);
      // Ambient momentum colors run through float32 NumPy storage on desktop, which can sit 1 LSB across round(.5).
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs((got.colorFrom[c] ?? 0) - (exp.colorFrom[c] ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((got.colorTo[c] ?? 0) - (exp.colorTo[c] ?? 0))).toBeLessThanOrEqual(1);
      }
      expect(got.sigAmpEm).toBeCloseTo(exp.sigAmpEm, 6);
    }

    expect(Object.keys(plan.bgWords).sort()).toEqual(Object.keys(fixture.bgWords).sort());
    for (const [tMs, expCol] of Object.entries(fixture.interludeColors)) {
      const gotCol = planInterludeColor(plan, Number(tMs) / 1000);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs((gotCol[c] ?? 0) - (expCol[c] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });
});
