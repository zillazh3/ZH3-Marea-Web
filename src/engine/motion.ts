import { codePointLength, crc32Utf8, median } from '@/shared/pycompat';
import { WIPE_INV, smoothstep } from './curves';
import { lineText, type Line } from './lyrics';

// Per-character motion on top of the per-syllable animation: wave, bounce, breathing and line entrance.
//
// Everything is a pure function of `t` (no state), so pauses, seeks and rewinds need no invalidation. Effects do not stack as
// independent animations: each profile is ONE kernel (crest plus tail) with dy/ds coupled, and a soft limiter keeps the sum with
// what the syllable already does (held notes, jumps) under LIFT_CAP / SCALE_CAP. Per-character timing is an estimate spread by
// character count inside the syllable, not phonetic alignment. Units: dy in em (negative rises), ds in scale (added to 1.0).

/** Cap of the syllable plus layer sum (em / scale over 1.0). */
export const LIFT_CAP = 0.09;
const SCALE_CAP = 0.08;
/** Share of the wave window before / after the crest. */
const PRE = 0.35;
const POST = 0.65;
/** Window = SPREAD x time per character, clamped to [D_MIN, D_MAX] seconds. */
const SPREAD = 4;
const D_MIN = 0.16;
const D_MAX = 0.6;
/** Crests closer than 25 ms are indistinguishable at 60 fps: they open up to 2x around the centre. */
const STEP_MIN = 0.025;
const STRETCH_MAX = 2;
/** Seconds per character below SLOW_S get the minimum amplitude A_FLOOR; full amplitude from FAST_S. */
const SLOW_S = 0.025;
const FAST_S = 0.09;
const A_FLOOR = 0.4;
/** Bounce: elastic tail, its damping and period, and the quick fall before it (seconds). */
const TAIL = 0.35;
const TAIL_DECAY = 0.12;
const TAIL_PERIOD = 0.22;
const FALL_SETTLE = 0.14;
const BREATH_HZ = 1.3;
const BREATH_ATTACK = 0.25;
const BREATH_RELEASE = 0.2;
/** The whole line's entrance ends within 0.4 s. */
const ENTER_DUR = 0.2;
const ENTER_STEP = 0.035;
const ENTER_MAX_DELAY = 0.2;
/** Smooth onset from the syllable start so the wave never lifts before it. */
const ONSET_S = 0.03;
/** Past `e + POST_MARGIN` the wave is 0 in every profile. */
export const POST_MARGIN = 0.7;
/** `pick`: seconds per character of a "fast" line, and the duration of a "sustained" note. */
const FAST_LINE = 0.045;
const SUSTAIN_S = 0.9;
/** Below this the wave is invisible and the character counts as at rest. */
const REST_EPS = 1e-5;

export interface Profile {
  /** em the crest rises. */
  lift: number;
  /** Extra scale at the crest. */
  swell: number;
  /** Elastic rebound after the crest, as a fraction of the crest. */
  settle: number;
  /** Scale pulse on held notes. */
  breath: number;
  /** em each word sinks when the line activates. */
  enter: number;
}

// Mode names are stored in projects and presets (`editor.params.motion`), so they stay in Spanish like the desktop's.
export const PROFILES = {
  onda: { lift: 0.045, swell: 0.04, settle: 0, breath: 0.012, enter: 0.03 },
  rebote: { lift: 0.05, swell: 0.035, settle: 0.5, breath: 0.012, enter: 0.04 },
  respira: { lift: 0.03, swell: 0.02, settle: 0, breath: 0.03, enter: 0.02 },
  suave: { lift: 0.025, swell: 0.015, settle: 0, breath: 0, enter: 0.015 }, // line-level lyrics: spread timing, only a gentle lift
} as const satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;
export type MotionMode = 'auto' | ProfileName | 'clasico';
export const MOTION_MODES: readonly MotionMode[] = [
  'auto',
  'onda',
  'rebote',
  'respira',
  'suave',
  'clasico',
];

/**
 * Automatic profile of a line. It depends only on timing and text, so it is reproducible: repeated choruses move alike
 * (crc32, not a per-process hash).
 */
export function pick(line: Pick<Line, 'approx' | 'syllables'>): ProfileName {
  if (line.approx) return 'suave';
  const spacing = line.syllables
    .filter((s) => s.text.trim() !== '')
    .map((s) => (s.end - s.begin) / 1000 / codePointLength(s.text));
  if (spacing.length > 0 && median(spacing) < FAST_LINE) return 'onda'; // bounce at a fast tempo looks nervous
  if (line.syllables.some((s) => (s.end - s.begin) / 1000 >= SUSTAIN_S)) return 'respira';
  return crc32Utf8(lineText(line)) % 2 === 0 ? 'onda' : 'rebote';
}

/** Profile to apply for the settings; null means no layer (reduced motion or "clasico"). */
export function resolve(mode: MotionMode, reduce: boolean, auto: ProfileName): Profile | null {
  if (reduce || mode === 'clasico') return null;
  return PROFILES[mode === 'auto' ? auto : mode];
}

function copySign(magnitude: number, sign: number): number {
  return sign < 0 ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/** `wave` compressed (tanh) so base + wave does not pass `cap` in its direction; 0 when base is already at the cap. */
export function limit(wave: number, base: number, cap: number): number {
  const room = cap - (base > 0 === wave > 0 ? Math.abs(base) : 0);
  return wave !== 0 && room > 1e-9 ? copySign(room * Math.tanh(Math.abs(wave) / room), wave) : 0;
}

/**
 * Shape of the wave with `u` = t - crest time: rises over PRE*d and falls over POST*d, both with zero tangent. With `settle`
 * the fall is short and dips below the base: a damped elastic tail that closes exactly at 0. Bounded support.
 */
export function bump(u: number, d: number, settle: number): number {
  const fall = settle ? Math.min(POST * d, FALL_SETTLE) : POST * d;
  if (u <= -PRE * d || u >= fall + (settle ? TAIL : 0)) return 0;
  if (u < 0) return smoothstep(1 + u / (PRE * d));
  let v = smoothstep(1 - u / fall);
  if (settle && u > fall) {
    const tau = u - fall;
    v -=
      settle *
      Math.exp(-tau / TAIL_DECAY) *
      Math.sin((2 * Math.PI * tau) / TAIL_PERIOD) *
      smoothstep(tau / 0.04) *
      smoothstep((TAIL - tau) / 0.1);
  }
  return v;
}

/** Sinking (em, positive) of word `word` of the line that activates at `ta`; cascaded, 0 before and after. */
export function enterDip(pf: Profile, amt: number, t: number, ta: number, word: number): number {
  const x = (t - ta - Math.min(word * ENTER_STEP, ENTER_MAX_DELAY)) / ENTER_DUR;
  return x > 0 && x < 1 ? pf.enter * amt * Math.sin(Math.PI * x) ** 2 : 0;
}

export interface CharMotion {
  dy: number[];
  ds: number[];
}

/**
 * Per-character (dy, ds) of the `n` characters of a syllable sounding in [b, e], or null when all are at rest.
 * `dip`: entrance sinking of its word. `baseY` / `baseS`: what the syllable already does, so the cap is not exceeded.
 */
export function syllable(
  pf: Profile,
  amt: number,
  t: number,
  b: number,
  e: number,
  n: number,
  sus: number,
  dip: number,
  baseY: number,
  baseS: number,
): CharMotion | null {
  if (n < 1 || !((b < t && t <= e + POST_MARGIN) || dip !== 0)) return null;
  const spacing = (e - b) / n;
  const stretch =
    spacing > 0 ? Math.min(STRETCH_MAX, Math.max(1, STEP_MIN / spacing)) : STRETCH_MAX;
  const d = Math.min(D_MAX, Math.max(D_MIN, SPREAD * spacing));
  const k = A_FLOOR + (1 - A_FLOOR) * smoothstep((spacing - SLOW_S) / (FAST_S - SLOW_S));
  const mid = (b + e) / 2;
  const gate = t > b ? smoothstep((t - b) / ONSET_S) : 0;
  const dy: number[] = [];
  const ds: number[] = [];
  for (let j = 0; j < n; j += 1) {
    const tc = b + (e - b) * WIPE_INV((j + 0.5) / n); // the crest passes when the wipe edge crosses the letter
    const v = gate !== 0 ? bump(t - (mid + (tc - mid) * stretch), d, pf.settle) * k * gate : 0;
    let dyj = -pf.lift * amt * v;
    let dsj = pf.swell * amt * v;
    if (sus > 0 && pf.breath !== 0 && b <= t) {
      // breathing: the held note pulses and the wave runs through it
      const env =
        smoothstep((t - b) / BREATH_ATTACK) *
        (t > e ? smoothstep(1 - (t - e) / BREATH_RELEASE) : 1);
      const pulse =
        pf.breath * amt * sus * env * Math.sin(2 * Math.PI * BREATH_HZ * (t - b) - 0.5 * j);
      dsj += pulse;
      dyj -= 0.4 * pulse;
    }
    dy.push(limit(dyj + dip, baseY, LIFT_CAP));
    ds.push(limit(dsj, baseS, SCALE_CAP));
  }
  return [...dy, ...ds].some((x) => Math.abs(x) > REST_EPS) ? { dy, ds } : null;
}
