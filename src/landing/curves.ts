const NEWTON_STEPS = 8;
const NEWTON_EPSILON = 1e-6;

export const GLOW_PEAK_AT = 0.85;
export const GLOW_END_LEVEL = 0.7;
export const RESTING_SINK_EM = 0.015;
export const CREST_LIFT_EM = -0.055;
export const RESTING_SCALE = 0.97;
export const CREST_SWELL = 0.055;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(value: number): number {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

/**
 * Exact cubic-bezier solver matching ZH3 Marea's engine (`src/engine/curves.ts`).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < NEWTON_STEPS; i += 1) {
      const err = ((ax * t + bx) * t + cx) * t - x;
      const deriv = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(err) < NEWTON_EPSILON || Math.abs(deriv) < NEWTON_EPSILON) break;
      t -= err / deriv;
    }
    const u = clamp(t);
    return ((ay * u + by) * u + cy) * u;
  };
}

/** Signature ZH3 Marea syllable wipe curve: eases in/out at ~40% mean speed and passes ~1.4x mid-syllable. */
export const WIPE_EASING = cubicBezier(0.3, 0.12, 0.7, 0.88);

export interface SyllableMotionSample {
  readonly wipe: number;
  readonly liftEm: number;
  readonly scale: number;
  readonly glow: number;
}

/**
 * Evaluates ZH3 Marea's signature per-syllable wipe, vertical lift, scale swell, and glow envelope.
 * `rawProgress` covers [0..1] during the syllable; `tailProgress` in [0..1] fades the post-syllable glow tail.
 */
export function sampleSyllableMotion(
  rawProgress: number,
  tailProgress = 1,
  sustainFactor = 0,
): SyllableMotionSample {
  const p = clamp(rawProgress);
  const wipe = WIPE_EASING(p);

  let liftEm = 0;
  let scale = 1;
  if (p <= 0) {
    liftEm = RESTING_SINK_EM;
    scale = RESTING_SCALE;
  } else if (p < 1) {
    const bell = Math.sin(Math.PI * Math.pow(p, 0.82));
    const settle = smoothstep(p);
    const liftAmp = CREST_LIFT_EM * (1 + 0.35 * sustainFactor);
    const swellAmp = CREST_SWELL * (1 + 0.25 * sustainFactor);
    liftEm = RESTING_SINK_EM * (1 - settle) + liftAmp * bell;
    scale = RESTING_SCALE * (1 - settle) + settle + swellAmp * bell;
  }

  let glow = 0;
  if (p > 0 && p < 1) {
    if (p <= GLOW_PEAK_AT) {
      glow = smoothstep(p / GLOW_PEAK_AT);
    } else {
      const fallT = (p - GLOW_PEAK_AT) / (1 - GLOW_PEAK_AT);
      glow = 1 - (1 - GLOW_END_LEVEL) * smoothstep(fallT);
    }
  } else if (p >= 1 && tailProgress < 1) {
    glow = GLOW_END_LEVEL * (1 - smoothstep(clamp(tailProgress)));
  }

  return { wipe, liftEm, scale, glow };
}

/** Distance-scaled blur matching ZH3 Marea's layout policy (`blurLevel`). */
export function lineBlurPx(
  lineIndex: number,
  activeIndex: number,
  perLinePx = 1.05,
  maxBlurPx = 3.6,
): number {
  if (lineIndex === activeIndex) return 0;
  const dist = lineIndex < activeIndex ? activeIndex - lineIndex + 1 : lineIndex - activeIndex;
  return Math.min(maxBlurPx, Number(((0.6 + dist * 0.75) * perLinePx).toFixed(2)));
}
