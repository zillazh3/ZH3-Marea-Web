import { bezier, clamp01 } from './curves';

// Three-dot interlude (AMLL interlude-dots), in ms from the start of the gap.

const LIGHTING = bezier(0.56, 0.01, 0.45, 1);
const ENTER_FADE = bezier(0.59, 0.02, 0.07, 1);
const EXIT_P1 = bezier(0.14, 0.06, 0.25, 1);
const EXIT_P2 = bezier(0.29, 0.03, 1, 0.38);
const EXIT_FADE = bezier(0.43, 0.08, 0.83, 0.31);

/** Stagger between the entrance of consecutive dots, and the entrance time of one dot. */
const DOT_STAGGER_MS = 80;
const DOT_ENTER_MS = 750;
const ENTER_FADE_MS = 180;
const EXIT_MS = 1000;
const HOLD_BELOW_MS = 3000;
const BREATHE_CYCLE_MS = 4000;

type Dots = readonly [number, number, number];

export interface Plan {
  total: number;
  delayEnd: number;
  body: number;
  bodyEnd: number;
  mode: 'hold' | 'breathe';
  dot3Target: number;
  period: number;
  seg: number;
  dot3Dur: number;
}

export type InterludePhase = 'hidden' | 'waiting' | 'exit' | 'hold' | 'breathe';

export interface InterludeSnap {
  groupOpacity: number;
  groupScale: number;
  dotOpacity: Dots;
  phase: InterludePhase;
  dotFill: Dots;
}

export const HIDDEN: InterludeSnap = {
  groupOpacity: 0,
  groupScale: 1,
  dotOpacity: [0, 0, 0],
  phase: 'hidden',
  dotFill: [0, 0, 0],
};

export function planInterlude(totalMs: number, delayEnd: number): Plan | null {
  const body = totalMs - delayEnd - EXIT_MS;
  if (body < 2 * DOT_STAGGER_MS + DOT_ENTER_MS) return null;
  const common = { total: totalMs, delayEnd, body, bodyEnd: delayEnd + body };
  if (body < HOLD_BELOW_MS) {
    return { ...common, mode: 'hold', dot3Target: 1, period: 0, seg: 0, dot3Dur: 0 };
  }
  const cycles = Math.max(1, Math.floor(body / BREATHE_CYCLE_MS));
  const seg = Math.floor((body + DOT_ENTER_MS) / 3 + 0.5); // Math.round, not Python's round()
  const dot3Dur = body - seg * 2;
  return {
    ...common,
    mode: 'breathe',
    dot3Target: dot3Dur / seg,
    period: body / cycles,
    seg,
    dot3Dur,
  };
}

export function breathing(t: number): number {
  const a = 4 * Math.PI * t;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return t - 0.084 * s + 0.008 * (1 - c) + 0.0046 * s * (c - s);
}

export function dotOp(f: number): number {
  return 0.2 + 0.7 * clamp01(f);
}

export function dotEnter(i: number, ms: number): number {
  const x = clamp01((ms - i * DOT_STAGGER_MS) / DOT_ENTER_MS);
  return x * x;
}

function frac(start: number, dur: number, ms: number, target: number): number {
  return ms <= start ? 0 : LIGHTING(clamp01((ms - start) / dur)) * target;
}

/** State of the dot group `el` ms after the gap starts. */
export function interludeSnap(plan: Plan | null, el: number): InterludeSnap {
  if (!plan || el >= plan.total || el < 0) return HIDDEN;
  if (el < plan.delayEnd) {
    return { ...HIDDEN, phase: 'waiting' };
  }
  const ms = el - plan.delayEnd;
  const enterOp = ENTER_FADE(clamp01(ms / ENTER_FADE_MS));

  const dots = (fill: Dots): Pick<InterludeSnap, 'dotOpacity' | 'dotFill'> => ({
    dotOpacity: [
      dotOp(fill[0]) * dotEnter(0, ms),
      dotOp(fill[1]) * dotEnter(1, ms),
      dotOp(fill[2]) * dotEnter(2, ms),
    ],
    dotFill: [
      clamp01(fill[0]) * dotEnter(0, ms),
      clamp01(fill[1]) * dotEnter(1, ms),
      clamp01(fill[2]) * dotEnter(2, ms),
    ],
  });

  if (el >= plan.bodyEnd) {
    const x = el - plan.bodyEnd;
    const fadeT = clamp01((x - DOT_ENTER_MS) / 250);
    const scale =
      x < DOT_ENTER_MS
        ? 1 + EXIT_P1(x / DOT_ENTER_MS) * 0.25
        : 1.25 - EXIT_P2(clamp01((x - DOT_ENTER_MS) / 250)) * 0.85;
    const tr = clamp01(x / DOT_ENTER_MS);
    return {
      groupOpacity: enterOp * (1 - EXIT_FADE(fadeT)),
      groupScale: scale,
      phase: 'exit',
      ...dots([1, 1, plan.dot3Target + (1 - plan.dot3Target) * tr]),
    };
  }
  if (plan.mode === 'hold') {
    return { groupOpacity: enterOp, groupScale: 1, phase: 'hold', ...dots([1, 1, 1]) };
  }
  const pr = breathing((ms % plan.period) / plan.period);
  const scale = pr <= 0.5 ? 1 + (pr / 0.5) * 0.1 : 1.1 - ((pr - 0.5) / 0.5) * 0.1;
  return {
    groupOpacity: enterOp,
    groupScale: scale,
    phase: 'breathe',
    ...dots([
      frac(0, plan.seg, ms, 1),
      frac(plan.seg, plan.seg, ms, 1),
      frac(plan.seg * 2, plan.dot3Dur, ms, plan.dot3Target),
    ]),
  };
}
