import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  echoes,
  wordLetterStates,
  wordParticles,
  type LetterState,
  type Particle,
} from '@/engine/wordfx/anim';
import type {
  CarrierLetter,
  FxDurationMode,
  FxParams,
  FxSigAxis,
  FxTier,
  FxTintSpread,
  FxWaveform,
} from '@/engine/wordfx/fxtypes';

interface RawParams {
  seed: string;
  vector: number[];
  primitives: string[];
  bleed: number;
  bleed_from: string;
  repeat_n: number;
  hold_s: number;
  color_from: [number, number, number];
  color_to: [number, number, number];
  drift_em: number;
  jitter_em: number;
  jitter_hz: number;
  wave_em: number;
  wave_hz: number;
  spacing_em: number;
  scale_amp: number;
  scale_period_s: number;
  rotation_deg: number;
  stagger_ms: number;
  letter_offset_em: number;
  opacity_min: number;
  blur_em: number;
  glow: number;
  grain: number;
  chromatic_em: number;
  trail: number;
  erode: number;
  vanish_s: number;
  particles: number;
  fracture: number;
  sparkle: number;
  flash: number;
  audio_gain: number;
  osc_hz: number;
  osc_color: [number, number, number];
  osc_phase: number;
  osc_jitter_em: number;
  note: string;
  strain_gain: number;
  release_s: number;
  residue_level: number;
  zeta: number;
  is_hero: boolean;
  is_bg: boolean;
  tier: FxTier;
  bleed_donor_s: number;
  bleed_donor_end_s: number;
  handoff_overlap_s: number;
  duration_mode: FxDurationMode;
  waveform: FxWaveform;
  sig_freq_hz: number;
  sig_axis: FxSigAxis;
  sig_amp_em: number;
  fill_tint: number;
  fill_edge_softness: number;
  glow_spread: number;
  glow_color: [number, number, number] | null;
  particle_kind: string;
  sparkle_style: string;
  motif: string;
  tint_spread: FxTintSpread;
  scatter_em: number;
  glitch: number;
  shimmer: number;
  glow_gain: number;
  streak: number;
  variant: string;
}

interface RawCarrierLetter {
  fill_p: number;
  onset_s: number;
  y_em: number;
  scale: number;
  glow_a: number;
  glow_r: number;
  x_em: number;
}

interface AnimFixture {
  beginS: number;
  endS: number;
  onsets: number[];
  lettersX: number[];
  lettersW: number[];
  carrierLetters: RawCarrierLetter[];
  cases: {
    name: string;
    params: RawParams;
    samples: {
      t: number;
      carrierStates: LetterState[];
      plainStates: LetterState[];
      reducedStates: LetterState[];
      particles: Particle[];
      echoes: [number, number, number][];
    }[];
  }[];
}

function toFxParams(r: RawParams): FxParams {
  return {
    seed: r.seed,
    vector: r.vector,
    primitives: r.primitives,
    bleed: r.bleed,
    bleedFrom: r.bleed_from,
    repeatN: r.repeat_n,
    holdS: r.hold_s,
    colorFrom: r.color_from,
    colorTo: r.color_to,
    driftEm: r.drift_em,
    jitterEm: r.jitter_em,
    jitterHz: r.jitter_hz,
    waveEm: r.wave_em,
    waveHz: r.wave_hz,
    spacingEm: r.spacing_em,
    scaleAmp: r.scale_amp,
    scalePeriodS: r.scale_period_s,
    rotationDeg: r.rotation_deg,
    staggerMs: r.stagger_ms,
    letterOffsetEm: r.letter_offset_em,
    opacityMin: r.opacity_min,
    blurEm: r.blur_em,
    glow: r.glow,
    grain: r.grain,
    chromaticEm: r.chromatic_em,
    trail: r.trail,
    erode: r.erode,
    vanishS: r.vanish_s,
    particles: r.particles,
    fracture: r.fracture,
    sparkle: r.sparkle,
    flash: r.flash,
    audioGain: r.audio_gain,
    oscHz: r.osc_hz,
    oscColor: r.osc_color,
    oscPhase: r.osc_phase,
    oscJitterEm: r.osc_jitter_em,
    note: r.note,
    strainGain: r.strain_gain,
    releaseS: r.release_s,
    residueLevel: r.residue_level,
    zeta: r.zeta,
    isHero: r.is_hero,
    isBg: r.is_bg,
    tier: r.tier,
    bleedDonorS: r.bleed_donor_s,
    bleedDonorEndS: r.bleed_donor_end_s,
    handoffOverlapS: r.handoff_overlap_s,
    durationMode: r.duration_mode,
    waveform: r.waveform,
    sigFreqHz: r.sig_freq_hz,
    sigAxis: r.sig_axis,
    sigAmpEm: r.sig_amp_em,
    fillTint: r.fill_tint,
    fillEdgeSoftness: r.fill_edge_softness,
    glowSpread: r.glow_spread,
    glowColor: r.glow_color,
    particleKind: r.particle_kind,
    sparkleStyle: r.sparkle_style,
    motif: r.motif,
    tintSpread: r.tint_spread,
    scatterEm: r.scatter_em,
    glitch: r.glitch,
    shimmer: r.shimmer,
    glowGain: r.glow_gain,
    streak: r.streak,
    variant: r.variant,
  };
}

function toCarrier(c: RawCarrierLetter): CarrierLetter {
  return {
    fillP: c.fill_p,
    onsetS: c.onset_s,
    yEm: c.y_em,
    scale: c.scale,
    glowA: c.glow_a,
    glowR: c.glow_r,
    xEm: c.x_em,
  };
}

function expectCloseStates(actual: readonly LetterState[], expected: readonly LetterState[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    const a = actual[i];
    const e = expected[i];
    expect(a).toBeDefined();
    expect(e).toBeDefined();
    if (!a || !e) continue;
    expect(a.dx).toBeCloseTo(e.dx, 9);
    expect(a.dy).toBeCloseTo(e.dy, 9);
    expect(a.scale).toBeCloseTo(e.scale, 9);
    expect(a.rotDeg).toBeCloseTo(e.rotDeg, 9);
    expect(a.alpha).toBeCloseTo(e.alpha, 9);
    expect(a.color).toEqual(e.color);
    expect(a.blurEm).toBeCloseTo(e.blurEm, 9);
    expect(a.glow).toBeCloseTo(e.glow, 9);
    expect(a.stretch).toBeCloseTo(e.stretch, 9);
  }
}

describe('wordfx anim parity', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/wordfx/anim.json'), 'utf-8'),
  ) as AnimFixture;
  const cLetters = fixture.carrierLetters.map(toCarrier);
  const n = fixture.lettersX.length;

  it('matches letter states (carrier, plain, reduced), echoes, and particles', () => {
    for (const c of fixture.cases) {
      const p = toFxParams(c.params);
      for (const s of c.samples) {
        const car = wordLetterStates(p, n, s.t, fixture.beginS, fixture.endS, {
          rms: 0.72,
          reduce: false,
          strain: 0.65,
          onsets: fixture.onsets,
          cLetters,
          lineAct: 0.92,
          lineEndS: 12.4,
          beatPhase: 0.35,
        });
        expectCloseStates(car, s.carrierStates);

        const plain = wordLetterStates(p, n, s.t, fixture.beginS, fixture.endS, {
          rms: 0.72,
          reduce: false,
          strain: 0.65,
          onsets: fixture.onsets,
        });
        expectCloseStates(plain, s.plainStates);

        const red = wordLetterStates(p, n, s.t, fixture.beginS, fixture.endS, {
          rms: 0.72,
          reduce: true,
          strain: 0.65,
          onsets: fixture.onsets,
          cLetters,
          lineAct: 0.92,
          lineEndS: 12.4,
          beatPhase: 0.35,
        });
        expectCloseStates(red, s.reducedStates);

        const pts = wordParticles(
          p,
          fixture.lettersX,
          fixture.lettersW,
          s.t,
          fixture.beginS,
          fixture.endS,
          {
            reduce: false,
            onsets: fixture.onsets,
            fillFrontU: 0.68,
          },
        );
        expect(pts.length).toBe(s.particles.length);
        for (let idx = 0; idx < pts.length; idx += 1) {
          const a = pts[idx];
          const e = s.particles[idx];
          expect(a).toBeDefined();
          expect(e).toBeDefined();
          if (!a || !e) continue;
          expect(a.kind).toBe(e.kind);
          expect(a.style).toBe(e.style);
          expect(a.xEm).toBeCloseTo(e.xEm, 9);
          expect(a.yEm).toBeCloseTo(e.yEm, 9);
          expect(a.rEm).toBeCloseTo(e.rEm, 9);
          expect(a.alpha).toBeCloseTo(e.alpha, 9);
          expect(a.rotDeg).toBeCloseTo(e.rotDeg, 9);
          expect(a.lifeU).toBeCloseTo(e.lifeU, 9);
          expect(a.vxEm).toBeCloseTo(e.vxEm, 9);
          expect(a.vyEm).toBeCloseTo(e.vyEm, 9);
          expect(a.color).toEqual(e.color);
          expect(a.coreColor).toEqual(e.coreColor);
        }

        const ech = echoes(p, s.t, false);
        expect(ech.length).toBe(s.echoes.length);
        for (let idx = 0; idx < ech.length; idx += 1) {
          const a = ech[idx];
          const e = s.echoes[idx];
          expect(a).toBeDefined();
          expect(e).toBeDefined();
          if (!a || !e) continue;
          expect(a.dxEm).toBeCloseTo(e[0], 9);
          expect(a.dyEm).toBeCloseTo(e[1], 9);
          expect(a.alphaFactor).toBeCloseTo(e[2], 9);
        }
      }
    }
  });
});
