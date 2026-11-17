import { clamp, smoothstepRange } from '@/shared/color';
import { TUNING } from '../tuning';
import { FX } from './config';
import type { FxDurationMode } from './fxtypes';
import { CachedSpringCurve } from './springs';

export type EnvelopePhase =
  'idle' | 'anticipation' | 'attack' | 'sustain' | 'release' | 'residue' | 'fade';

export interface EnvelopeSample {
  readonly phase: EnvelopePhase;
  readonly motionAmp: number;
  readonly tintAmp: number;
  readonly mode: FxDurationMode;
  readonly heldFactor: number;
}

const MAX_ENVELOPE_CURVES = 4096;
const ENVELOPE_CURVES = new Map<string, CachedSpringCurve>();

export function durationMode(durS: number): { mode: FxDurationMode; peak: number } {
  if (durS < FX.accentMaxS) return { mode: 'accent', peak: FX.accentAmp };
  if (durS <= FX.heldMinS) return { mode: 'normal', peak: 1 };
  const heldScale = Math.min(FX.heldAmpCap, 1 + 0.45 * Math.log1p((durS - FX.heldMinS) / 0.5));
  return { mode: 'held', peak: heldScale };
}

function rawTarget(
  t: number,
  b0: number,
  b1: number,
  onT: number,
  peak: number,
  isHero: boolean,
  anticipationS: number,
  releaseS: number,
  residue: number,
  lineEndS: number,
  fadeS: number,
): number {
  const antiStart = b0 - anticipationS;
  if (t < antiStart) return 0;
  if (t < onT) {
    if (!isHero || anticipationS <= 0) return 0;
    return FX.anticipationAmp * smoothstepRange(antiStart, b0, t);
  }
  if (t <= b1) return peak;
  const relEnd = b1 + releaseS;
  if (t <= relEnd) return peak + (residue - peak) * smoothstepRange(b1, relEnd, t);
  if (t <= lineEndS) return residue;
  return residue * (1 - smoothstepRange(lineEndS, lineEndS + Math.max(0.05, fadeS), t));
}

export interface SampleEnvelopeOpts {
  readonly letterOnT?: number;
  readonly isHero?: boolean;
  readonly releaseS?: number;
  readonly residueLevel?: number;
  readonly lineEndS?: number;
  readonly lineAct?: number;
  readonly anticipationS?: number;
  readonly fadeS?: number;
  readonly zeta?: number;
  readonly freqHz?: number;
  readonly reduce?: boolean;
}

function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function sampleEnvelope(
  t: number,
  b0: number,
  b1: number,
  opts: SampleEnvelopeOpts = {},
): EnvelopeSample {
  const {
    letterOnT,
    isHero = false,
    releaseS = 0.65,
    residueLevel = 0.16,
    lineEndS,
    lineAct,
    anticipationS = TUNING.anticipationS,
    fadeS = 0.45,
    zeta = 1,
    freqHz = 3.2,
    reduce = false,
  } = opts;

  const dur = Math.max(0.05, b1 - b0);
  const b1Eff = b0 + dur;
  const { mode, peak } = durationMode(dur);
  const onT =
    letterOnT === undefined ? b0 : letterOnT < b0 ? b0 : letterOnT > b1Eff ? b1Eff : letterOnT;
  const relS = clamp(releaseS, FX.minReleaseS, FX.maxReleaseS);
  const res = clamp(residueLevel, FX.minResidue, FX.maxResidue) * FX.residueGain;
  const antiS = isHero ? clamp(anticipationS, 0, 0.25) : 0;
  const lEnd = lineEndS === undefined ? b1Eff + relS + 1.5 : lineEndS < b1Eff ? b1Eff : lineEndS;

  const tOrigin = b0 - antiS - 0.05;
  if (t <= tOrigin) {
    return {
      phase: 'idle',
      motionAmp: 0,
      tintAmp: 0,
      mode,
      heldFactor: mode === 'held' ? peak : 1,
    };
  }

  let amp: number;
  if (reduce) {
    amp = Math.max(0, rawTarget(t, b0, b1Eff, onT, peak, isHero, antiS, relS, res, lEnd, fadeS));
  } else {
    const qDur = r3(dur);
    const relOn = r3(onT - b0);
    const qPeak = r3(peak);
    const relLEnd = r2(lEnd - b0);
    const key = [
      qDur,
      relOn,
      qPeak,
      isHero ? 1 : 0,
      antiS,
      relS,
      res,
      relLEnd,
      fadeS,
      zeta,
      freqHz,
      FX.anticipationAmp,
    ]
      .map(String)
      .join('|');
    let curve = ENVELOPE_CURVES.get(key);
    if (!curve) {
      curve = new CachedSpringCurve(
        (tau) => rawTarget(tau, 0, qDur, relOn, qPeak, isHero, antiS, relS, res, relLEnd, fadeS),
        -antiS - 0.05,
        0,
        freqHz,
        zeta,
        2400,
        relLEnd + Math.max(0.05, fadeS),
        0,
      );
      if (ENVELOPE_CURVES.size >= MAX_ENVELOPE_CURVES) {
        const oldest = ENVELOPE_CURVES.keys().next().value;
        if (oldest !== undefined) ENVELOPE_CURVES.delete(oldest);
      }
      ENVELOPE_CURVES.set(key, curve);
    } else if (ENVELOPE_CURVES.size >= MAX_ENVELOPE_CURVES / 2) {
      ENVELOPE_CURVES.delete(key);
      ENVELOPE_CURVES.set(key, curve);
    }
    const [val] = curve.eval(t - b0);
    amp = Math.max(0, val);
  }

  let phase: EnvelopePhase;
  if (t < b0) phase = isHero && t >= b0 - antiS ? 'anticipation' : 'idle';
  else if (t < onT) phase = isHero ? 'anticipation' : 'idle';
  else if (t <= Math.min(b1Eff, onT + 0.18)) phase = 'attack';
  else if (t <= b1Eff) phase = 'sustain';
  else if (t <= b1Eff + relS) phase = 'release';
  else if ((lineAct !== undefined && lineAct >= 0.5) || (lineAct === undefined && t <= lEnd)) {
    phase = 'residue';
  } else phase = 'fade';

  let tint: number;
  if (phase === 'fade') {
    tint = Math.max(FX.pastLineTint * Math.min(1, peak), amp);
  } else if (lineAct !== undefined && t > b1Eff + relS) {
    const act = clamp(lineAct, 0, 1);
    amp *= act;
    tint = Math.max(FX.pastLineTint, amp);
  } else {
    tint = amp;
  }

  return {
    phase,
    motionAmp: amp,
    tintAmp: tint,
    mode,
    heldFactor: mode === 'held' ? peak : 1,
  };
}
