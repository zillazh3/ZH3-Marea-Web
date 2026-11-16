import { codePointLength } from '@/shared/pycompat';
import { L_SCALE, L_YOFF, SCALE, WIPE, YOFF, clamp01, glowCurve } from './curves';
import { HIDDEN, interludeSnap } from './interlude';
import type { Item, Part, Word } from './items';
import * as motion from './motion';
import type { Params } from './params';
import { TUNING } from './tuning';

// Per-frame state of a line or an interlude: the springs of every syllable, letter and dot, driven by the song time `t`.
// `dt` is 0 for an item that must jump straight to its target (init, seek) instead of easing there.

/** Glow over a syllable (0..1), shared by every syllable. */
const GLOW = glowCurve(TUNING.glowPeakAt, TUNING.glowEndLevel);
/** Letters of an emphasised word fall off with distance from the active letter. */
const LETTER_FALLOFF_POWER = 2.8;
const LETTER_GLOW_FALLOFF = 0.9;
/** The last word of a line glows a little more. */
const LAST_WORD_GLOW = 1.15;
/** Micro-vibrato of held letters: amplitude (em), frequency (Hz) and phase mix per axis. */
const VIB_Y = { amp: 0.011, hz: 6.3 };
const VIB_X = { amp: 0.006, hz: 4.7, phaseMul: 1.7 };
const VIB_MIN_GLOW = 0.05;
/** Glow below this is not drawn. */
const GLOW_MIN = 0.01;
/** Gap dots: thresholds of the fill that give the Y spring a kick, and the kick size. */
const DOT_KICKS = [0.02, 0.35, 0.7, 0.97] as const;

function prog(t: number, b: number, e: number): number {
  return e > b ? clamp01((t - b) / (e - b)) : Number(t >= b);
}

/** Scale only the upward part of a vertical offset (negative = up); the resting offset stays where the prototype put it. */
function lift(y: number, gain: number): number {
  return y + Math.min(0, y) * (gain - 1);
}

export function renderGap(item: Item, t: number, on: boolean, dt: number): void {
  const snap = on ? interludeSnap(item.plan, (t - item.start) * 1000 * item.speed) : HIDDEN;
  item.groupOpacity = snap.groupOpacity;
  item.groupScale = snap.groupScale;
  item.phase = snap.phase;
  item.dots.forEach((dot, i) => {
    const fill = snap.dotFill[i] ?? 0;
    dot.sp.g = 0.5 + 0.8 * fill;
    let scale: number;
    if (dt) {
      scale = dot.sp.step(dt);
    } else {
      dot.sp.snap(dot.sp.g);
      scale = dot.sp.g;
    }
    dot.yp.g = -0.06 * fill; // rises as it fills, with a kick at each stage
    if (dt) {
      DOT_KICKS.forEach((threshold, k) => {
        if (dot.prev < threshold && threshold <= fill) dot.yp.v -= 0.55 + 0.25 * k;
      });
      if (fill < dot.prev - 0.5) dot.yp.snap(dot.yp.g);
    } else {
      dot.yp.snap(dot.yp.g);
    }
    dot.prev = fill;
    dot.y = dt ? dot.yp.step(dt) : dot.yp.g;
    dot.op = snap.dotOpacity[i] ?? 0;
    dot.scale = scale;
    [dot.haloR, dot.haloA] = fill > 0.02 ? [0.15 + 0.3 * fill, 0.45 * fill] : [0, 0];
  });
}

export function renderLine(item: Item, t: number, on: boolean, dt: number, params: Params): void {
  const snap = dt === 0;
  const floating = params.float && !params.reduce;
  const vibrato = params.vib && !params.reduce;
  const activatesAt = item.start - TUNING.anticipationS;
  // The per-character layer lives from when the line activates until its tail ends (POST_MARGIN after the end). It depends only
  // on time, so a line that leaves the active range finishes its motion instead of being cut.
  const profile =
    item.motion !== '' && activatesAt <= t && t <= item.end + motion.POST_MARGIN
      ? motion.resolve(params.motion, params.reduce, item.motion)
      : null;
  item.words.forEach((word, wi) => {
    const dip = profile ? motion.enterDip(profile, params.motionAmt, t, activatesAt, wi) : 0;
    word.p = prog(t, word.b, word.e);
    const bgk = word.bg ? 2 : 1;
    if (word.emph) {
      renderEmphWord(word, on, floating, vibrato, dip, bgk, t, dt, snap, params);
    } else {
      renderSyllableWord(word, item.approx, on, floating, profile, dip, bgk, t, dt, snap, params);
    }
  });
}

function renderSyllableWord(
  word: Word,
  approx: boolean,
  on: boolean,
  floating: boolean,
  profile: motion.Profile | null,
  dip: number,
  bgk: number,
  t: number,
  dt: number,
  snap: boolean,
  params: Params,
): void {
  for (const u of word.parts) {
    const raw = prog(t, u.b, u.e);
    u.p = WIPE(raw); // the fill accelerates and brakes inside each syllable; the curves below follow the linear progress
    let gs = 1;
    let gy = 0;
    let gg = 0;
    if (approx) {
      // No real syllables, so no per-word jumps: only the sweep and a soft glow on what is sung.
      if (u.b <= t && t < u.e && on) gg = GLOW(raw);
    } else if (floating) {
      if (t < u.b) {
        gs = SCALE(0);
        gy = YOFF(0);
      } else if (t < u.e) {
        const s = SCALE(raw);
        const y = lift(YOFF(raw), TUNING.liftGain); // long notes rise and grow more (only above 1.0 / the base position)
        gs = s + Math.max(0, s - 1) * TUNING.sustainScale * u.sus;
        gy = y + Math.min(0, y) * TUNING.sustainLift * u.sus;
        gg = on ? GLOW(raw) * (1 + TUNING.sustainGlow * u.sus) : 0;
      }
    }
    const [s, y, g] = springs(u, gs, gy, gg, dt, snap, params);
    u.scale = s;
    u.y = y * bgk;
    u.x = 0;
    u.motion = profile
      ? motion.syllable(
          profile,
          params.motionAmt,
          t,
          u.b,
          u.e,
          codePointLength(u.text),
          u.sus,
          dip,
          u.y,
          s - 1,
        )
      : null;
    [u.glowR, u.glowA] =
      g > GLOW_MIN
        ? [TUNING.glowRadius + TUNING.glowRadiusGain * g, Math.min(TUNING.glowAlpha * g, 1)]
        : [0, 0];
  }
}

function renderEmphWord(
  word: Word,
  on: boolean,
  floating: boolean,
  vibrato: boolean,
  dip: number,
  bgk: number,
  t: number,
  dt: number,
  snap: boolean,
  params: Params,
): void {
  // Each syllable fills with its own easing and respects pauses; its letters share that progress.
  for (const c of word.parts) c.p = clamp01(WIPE(prog(t, c.sb, c.se)) * c.k - c.j);
  word.p = word.parts.reduce((sum, c) => sum + c.p, 0) / word.parts.length;
  const activeWord = on && params.emph && word.b <= t && t < word.e;
  let activeIndex = -1;
  let activeProgress = 0;
  if (activeWord) {
    word.parts.forEach((c, i) => {
      if (c.b <= t && t < c.e) {
        activeIndex = i;
        activeProgress = (t - c.b) / (c.e - c.b);
      }
    });
  }
  word.parts.forEach((c, i) => {
    let gs = 1;
    let gy = 0;
    let gg = 0;
    if (params.emph && floating) {
      if (t < word.b) {
        gs = L_SCALE(0);
        gy = L_YOFF(0);
      } else if (activeWord && activeIndex >= 0) {
        const dist = Math.abs(i - activeIndex);
        const falloff = 1 / (1 + dist ** LETTER_FALLOFF_POWER);
        const glowFalloff = 1 / (1 + dist * LETTER_GLOW_FALLOFF);
        gs = L_SCALE(0) + (L_SCALE(activeProgress) - L_SCALE(0)) * falloff;
        gy =
          L_YOFF(0) + (lift(L_YOFF(activeProgress), TUNING.letterLiftGain) - L_YOFF(0)) * falloff;
        gg = GLOW(activeProgress) * glowFalloff * (word.last ? LAST_WORD_GLOW : 1);
      } else if (t < word.e) {
        gs = L_SCALE(0);
        gy = L_YOFF(0);
      }
    }
    const [s, y, g] = springs(c, gs, gy, gg, dt, snap, params);
    let vx = 0;
    let vy = 0;
    if (vibrato && activeWord && g > VIB_MIN_GLOW) {
      // micro-vibrato while the note is held
      const a = Math.min(1, g);
      vy = Math.sin(t * 2 * Math.PI * VIB_Y.hz + c.phase) * VIB_Y.amp * a;
      vx = Math.sin(t * 2 * Math.PI * VIB_X.hz + c.phase * VIB_X.phaseMul) * VIB_X.amp * a;
    }
    c.scale = s;
    c.y = y * 2 * bgk + vy;
    c.x = vx;
    // Emphasised letters already have their own animation: the layer only adds the entrance.
    const d = motion.limit(dip, c.y, motion.LIFT_CAP);
    c.motion = d !== 0 ? { dy: [d], ds: [0] } : null;
    [c.glowR, c.glowA] =
      g > GLOW_MIN
        ? [
            TUNING.emphGlowRadius + TUNING.emphGlowRadiusGain * g,
            Math.min(TUNING.emphGlowAlpha * g, 1),
          ]
        : [0, 0];
    c.glowA *= Math.min(1, 4 * c.p); // a letter's halo follows its own fill: nothing glows ahead of the wipe
  });
}

function springs(
  u: Part,
  gs: number,
  gy: number,
  gg: number,
  dt: number,
  snap: boolean,
  params: Params,
): [scale: number, y: number, glow: number] {
  u.S.g = gs;
  u.Y.g = gy;
  u.G.g = gg;
  if (snap) {
    u.S.snap(gs);
    u.Y.snap(gy);
    u.G.snap(gg);
    return [gs, gy, gg];
  }
  u.Y.d = params.wob;
  return [u.S.step(dt), u.Y.step(dt), u.G.step(dt)];
}
