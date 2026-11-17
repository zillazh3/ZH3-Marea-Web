import { clamp, lerpRgb } from '@/shared/color';
import type { FxPlanData, FxWordEntry, Rgb } from './fxtypes';

export const MAX_AMBIENT_AMP = 0.15;
export const MAX_INTERLUDE_TINT = 0.2;

const WARM_POS: Rgb = [255, 198, 128];
const COOL_POS: Rgb = [164, 224, 255];
const WARM_NEG: Rgb = [232, 134, 152];
const COOL_NEG: Rgb = [122, 168, 238];

export function ambientVectorColor(vec: readonly number[]): Rgb {
  const v = vec[0] ?? 0;
  const a = vec[1] ?? 0;
  const t = vec[3] ?? 0;
  const wu = clamp(0.5 + 0.5 * t, 0, 1);
  const vu = clamp(0.5 + 0.5 * v, 0, 1);
  const neg = lerpRgb(COOL_NEG, WARM_NEG, wu);
  const pos = lerpRgb(COOL_POS, WARM_POS, wu);
  const base = lerpRgb(neg, pos, vu);
  return lerpRgb(base, [255, 244, 228], clamp(0.15 * Math.max(0, a), 0, 0.15));
}

export function planWordFx(
  plan: FxPlanData | null | undefined,
  line: number,
  word: number,
  isBg = false,
): FxWordEntry | null {
  if (!plan) return null;
  const key = `${String(line)}:${String(word)}`;
  if (isBg) return plan.bgWords[key] ?? plan.ambient[key] ?? null;
  return plan.words[key] ?? plan.ambient[key] ?? null;
}

export function planRmsAt(plan: FxPlanData | null | undefined, tS: number): number {
  if (!plan || plan.rms.length === 0) return 0.5;
  const tAud = tS + plan.audioOffsetMs / 1000;
  const idx = Math.min(Math.max(Math.trunc(tAud * plan.rmsRate), 0), plan.rms.length - 1);
  return plan.rms[idx] ?? 0.5;
}

export function planStrainAt(plan: FxPlanData | null | undefined, tS: number): number {
  if (!plan || plan.strain.length === 0) return 0;
  const tAud = tS + plan.audioOffsetMs / 1000;
  const idx = Math.min(Math.max(Math.trunc(tAud * plan.strainRate), 0), plan.strain.length - 1);
  return plan.strain[idx] ?? 0;
}

export function momentumVectorAt(
  samples: readonly number[],
  rateHz: number,
  tS: number,
): readonly [number, number, number, number, number, number] {
  const n = Math.floor(samples.length / 6);
  if (n === 0) return [0, 0, 0, 0, 0, 0];
  const pos = clamp(tS * rateHz, 0, n - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(n - 1, i0 + 1);
  const u = pos - i0;
  const b0 = i0 * 6;
  const b1 = i1 * 6;
  const axis = (k: number): number => {
    const v0 = samples[b0 + k] ?? 0;
    const v1 = samples[b1 + k] ?? 0;
    return v0 + (v1 - v0) * u;
  };
  return [axis(0), axis(1), axis(2), axis(3), axis(4), axis(5)];
}

export function planInterludeColor(plan: FxPlanData | null | undefined, tS: number): Rgb {
  if (!plan || plan.momentumSamples.length === 0 || plan.intensity <= 0) {
    return [255, 255, 255];
  }
  const vec = momentumVectorAt(plan.momentumSamples, plan.momentumRateHz, tS);
  const mag = Math.min(1, Math.sqrt(vec.reduce((acc, x) => acc + x * x, 0) / 3));
  const w = clamp(
    MAX_INTERLUDE_TINT * (0.4 + 0.6 * mag) * Math.min(1, Math.max(0, plan.intensity)),
    0,
    MAX_INTERLUDE_TINT,
  );
  return lerpRgb([255, 255, 255], ambientVectorColor(vec), w);
}
