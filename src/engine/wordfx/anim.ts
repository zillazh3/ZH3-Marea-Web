import { lerpRgb, smoothstepRange } from '@/shared/color';
import { pyRound } from '@/shared/pycompat';
import { TUNING } from '../tuning';
import {
  erodedCount,
  hash01,
  letterKey,
  noise1,
  particles as emitParticles,
  type Particle,
} from './animParticles';
import { springBleedArrival } from './bleed';
import { FX } from './config';
import { sampleEnvelope } from './envelope';
import type { CarrierLetter, FxParams, Rgb } from './fxtypes';
import { evalWaveform } from './signatures';

export { hash01, noise1, type Particle };

export const FLASH_IN_S = 0.06;
export const FLASH_OUT_S = 0.3;

const WHITE: Rgb = [255, 255, 255];

export interface LetterState {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly rotDeg: number;
  readonly alpha: number;
  readonly color: Rgb;
  readonly blurEm: number;
  readonly glow: number;
  readonly stretch: number;
}

export interface EchoOffset {
  readonly dxEm: number;
  readonly dyEm: number;
  readonly alphaFactor: number;
}

export function strainBoost(p: FxParams, strain: number): number {
  if (p.strainGain <= 0.0 || strain <= 0.0) return 0.0;
  return p.strainGain * (strain >= 1.0 ? 1.0 : strain);
}

function oscWeight(p: FxParams, t: number, reduce: boolean): number {
  if (p.oscHz <= 0.0 || reduce) return 0.5;
  return 0.5 + 0.5 * Math.sin(2.0 * Math.PI * p.oscHz * t + p.oscPhase);
}

export function echoes(p: FxParams, t: number, reduce = false): EchoOffset[] {
  if (p.trail <= 0.0) return [];
  const ph = hash01(p.seed, 300);
  const factors = [0.2, 0.1] as const;
  return factors.map((a, k) => {
    if (reduce) return { dxEm: 0.0, dyEm: 0.0, alphaFactor: a * p.trail };
    const u = 2.0 * Math.PI * (FX.echoHz * t + ph) + k * 1.7;
    return {
      dxEm: 0.025 * Math.sin(u * 0.8 + 1.0),
      dyEm: 0.05 * Math.sin(u),
      alphaFactor: a * p.trail,
    };
  });
}

interface WordAnimCtx {
  readonly dur: number;
  readonly endS: number;
  readonly ow: number;
  readonly sg: number;
  readonly cEnd: Rgb;
  readonly opacityFactor: number;
  readonly blur: number;
  readonly ne: number;
  readonly baseGlow: number;
  readonly sigSeedU: number;
}

function wordCtx(
  p: FxParams,
  n: number,
  t: number,
  beginS: number,
  endS: number,
  rms: number,
  reduce: boolean,
  strain: number,
  hasCarrier: boolean,
): WordAnimCtx {
  const dur = Math.max(endS - beginS, 0.05);
  const clampedEnd = beginS + dur;
  const ow = oscWeight(p, t, reduce);
  const sg = strainBoost(p, strain);
  let cEnd = p.colorTo;
  if (
    hasCarrier &&
    p.bleedDonorS >= 0.0 &&
    (p.colorTo[0] !== p.colorFrom[0] ||
      p.colorTo[1] !== p.colorFrom[1] ||
      p.colorTo[2] !== p.colorFrom[2]) &&
    !reduce
  ) {
    const donorEnd = p.bleedDonorEndS > p.bleedDonorS ? p.bleedDonorEndS : p.bleedDonorS + 0.6;
    const bGain = springBleedArrival(t, p.bleedDonorS, donorEnd);
    cEnd = lerpRgb(p.colorFrom, p.colorTo, bGain);
  }
  let opacityFactor = 1.0;
  if (p.opacityMin < 1.0) {
    const phase = hash01(letterKey(p, 0, 4));
    const osc = 0.5 + 0.5 * Math.sin(2.0 * Math.PI * (t * 0.7 + phase));
    const sung =
      smoothstepRange(beginS, beginS + dur / 2, t) *
      (1.0 - smoothstepRange(beginS + dur / 2, clampedEnd, t));
    const life =
      smoothstepRange(beginS, beginS + 0.12, t) *
      (1.0 - smoothstepRange(clampedEnd, clampedEnd + Math.max(0.05, p.releaseS), t));
    opacityFactor = 1.0 - (1.0 - Math.max(p.opacityMin, 0.0)) * (0.5 * osc * life + 0.5 * sung);
  }
  const blur = p.blurEm > 0.0 ? p.blurEm * (1.0 - smoothstepRange(beginS, clampedEnd, t)) : 0.0;
  const ne = erodedCount(p, n, pyRound);
  let baseGlow = 0.0;
  if (p.glow > 0.0) {
    const g0 = p.glow * (1.0 + p.audioGain * (rms - 0.5));
    baseGlow = g0 < 0.0 ? 0.0 : g0 > 1.0 ? 1.0 : g0;
  }
  const sigSeedU = hash01(p.seed, 77);
  return { dur, endS: clampedEnd, ow, sg, cEnd, opacityFactor, blur, ne, baseGlow, sigSeedU };
}

function applyJitter(
  p: FxParams,
  i: number,
  t: number,
  rms: number,
  ow: number,
  sg: number,
  go: number,
  strainScale: number,
  strainMin: number,
  strainHz: number,
  maxAg: number,
  dampWithSig: boolean,
): [number, number] {
  let hz = p.jitterHz > 0.0 ? p.jitterHz : p.oscJitterEm > 0.0 ? 6.0 : 0.0;
  let amp = p.jitterEm + (p.oscHz > 0.0 ? p.oscJitterEm * ow : 0.0);
  if (dampWithSig && p.sigAmpEm > 0.0) amp *= 0.45;
  if (sg > 0.0) {
    amp = amp > 0.0 ? amp * (1.0 + strainScale * sg) : strainMin * sg;
    hz = hz || strainHz;
  }
  if (amp > 0.0 && hz > 0.0) {
    const ag = 1.0 + p.audioGain * (rms - 0.5) * 2.0;
    amp *= go * (ag < 0.3 ? 0.3 : ag > maxAg ? maxAg : ag);
    return [amp * noise1(letterKey(p, i, 1), t * hz), amp * noise1(letterKey(p, i, 2), t * hz)];
  }
  return [0.0, 0.0];
}

function letterStateWithCtx(
  p: FxParams,
  i: number,
  n: number,
  t: number,
  beginS: number,
  ctx: WordAnimCtx,
  rms: number,
  reduce: boolean,
  onset: number | null,
  carrier: CarrierLetter | null,
  lineAct: number | null,
  lineEndS: number | null,
  beatPhase: number | null,
): LetterState {
  const { dur, endS, ow, sg } = ctx;
  let dx = 0.0;
  let dy = 0.0;
  let rot = 0.0;
  const on = carrier !== null ? carrier.onsetS : (onset ?? beginS + (dur * i) / n);
  let scale = carrier !== null ? carrier.scale : 1.0;
  let alpha = ctx.opacityFactor;

  const env =
    carrier !== null
      ? sampleEnvelope(t, beginS, endS, {
          letterOnT: on,
          isHero: p.isHero,
          releaseS: p.releaseS,
          residueLevel: p.residueLevel,
          ...(lineEndS !== null ? { lineEndS } : {}),
          ...(lineAct !== null ? { lineAct } : {}),
          fadeS: p.handoffOverlapS,
          zeta: p.zeta,
          reduce,
        })
      : null;
  if (carrier !== null) {
    dy += carrier.yEm;
    dx += carrier.xEm;
  }

  if (!reduce) {
    if (carrier !== null && env !== null) {
      const fp = carrier.fillP;
      if (fp > 0.0) {
        const mAmp = env.motionAmp > 1.0 ? 1.0 : env.motionAmp;
        const go = mAmp * fp;
        if (p.driftEm !== 0.0) {
          const sign = Math.sign(p.driftEm) || 1.0;
          dy += sign * Math.min(Math.abs(p.driftEm), FX.driftMaxEm) * go;
        }
        if (p.jitterEm > 0.0 || p.oscJitterEm > 0.0 || sg > 0.0) {
          const [jdx, jdy] = applyJitter(p, i, t, rms, ow, sg, go, 1.2, 0.01, 10.0, 1.6, true);
          dx += jdx;
          dy += jdy;
        }
        if (p.sigAmpEm > 0.0) {
          const modeGain = env.mode === 'held' ? 1.0 : 0.65;
          const sigScale = env.motionAmp * modeGain * fp;
          const wVal = evalWaveform(
            p.waveform,
            t,
            p.sigFreqHz,
            i,
            ctx.sigSeedU,
            beatPhase ?? undefined,
            t - on,
          );
          const sDisp = p.sigAmpEm * sigScale * wVal;
          const axis = p.sigAxis;
          if (axis === 'y') dy += sDisp;
          else if (axis === 'x') dx += sDisp;
          else if (axis === 'scale') scale += sDisp * 0.7;
          else if (axis === 'rot') rot += sDisp * 35.0;
          else {
            dx += sDisp;
            dy -= 0.45 * Math.abs(sDisp);
          }
        } else if (p.waveEm > 0.0) {
          const wEm = Math.min(p.waveEm, FX.waveMaxEm);
          dy += go * wEm * Math.sin(2.0 * Math.PI * p.waveHz * t - 0.9 * i);
        }
        if (p.scaleAmp > 0.0 && p.scalePeriodS > 0.0 && t >= beginS) {
          const sAm = Math.min(p.scaleAmp, FX.scaleAmpMax);
          scale += sAm * fp * mAmp * Math.sin((Math.PI * (t - beginS)) / p.scalePeriodS) ** 2;
        }
        if (p.rotationDeg > 0.0) {
          const rDeg = Math.min(p.rotationDeg, FX.rotationMaxDeg);
          rot += (hash01(letterKey(p, i, 3)) * 2.0 - 1.0) * rDeg * go;
        }
        const maxOff = p.isHero && env.mode === 'held' ? FX.offsetMaxHeldEm : FX.offsetMaxEm;
        const semDy = dy - carrier.yEm;
        if (semDy > maxOff) dy = carrier.yEm + maxOff;
        else if (semDy < -maxOff) dy = carrier.yEm - maxOff;
        const semDx = dx - carrier.xEm;
        if (semDx > maxOff) dx = carrier.xEm + maxOff;
        else if (semDx < -maxOff) dx = carrier.xEm - maxOff;
      }
    } else {
      const go = smoothstepRange(beginS, beginS + 0.12, t);
      dy += p.driftEm * smoothstepRange(beginS, endS + FX.driftTailS, t);
      if (p.jitterEm > 0.0 || p.oscJitterEm > 0.0 || sg > 0.0) {
        const [jdx, jdy] = applyJitter(p, i, t, rms, ow, sg, go, 1.5, 0.012, 12.0, 2.0, false);
        dx += jdx;
        dy += jdy;
      }
      if (p.waveEm > 0.0) dy += go * p.waveEm * Math.sin(2.0 * Math.PI * p.waveHz * t - 0.9 * i);
      if (p.scaleAmp > 0.0 && p.scalePeriodS > 0.0 && t >= beginS) {
        scale += p.scaleAmp * Math.sin((Math.PI * (t - beginS)) / p.scalePeriodS) ** 2;
      }
      if (p.rotationDeg > 0.0) {
        const rEnv =
          smoothstepRange(beginS, beginS + 0.2, t) * (1.0 - smoothstepRange(endS, endS + 0.4, t));
        rot += (hash01(letterKey(p, i, 3)) * 2.0 - 1.0) * p.rotationDeg * rEnv;
      }
      if (p.staggerMs > 0.0 || p.letterOffsetEm > 0.0) {
        const t0 = onset ?? beginS + (i * p.staggerMs) / 1000.0;
        const k = smoothstepRange(t0, t0 + FX.enterS, t);
        alpha *= k;
        dy += p.letterOffsetEm * (1.0 - k);
      }
    }
  }

  let stretch = 0.0;
  const tierK = p.tier === 'strong' ? 1.0 : p.tier === 'light' ? FX.lightScale : 0.0;
  if (carrier !== null && env !== null && !reduce && tierK > 0.0) {
    const anti = TUNING.anticipationS;
    if (FX.anticipationDipEm > 0.0 && on - anti < t && t < on) {
      dy +=
        (p.driftEm > 0.0 ? -1.0 : 1.0) *
        FX.anticipationDipEm *
        tierK *
        Math.sin((Math.PI * (t - (on - anti))) / anti);
    }
    if (FX.stretchAmt > 0.0 && t - on > 0.0 && t - on < FX.stretchS) {
      const u = (t - on) / FX.stretchS;
      stretch =
        FX.stretchAmt *
        tierK *
        Math.min(1.0, env.motionAmp) *
        Math.sin(2.0 * Math.PI * u) *
        (1.0 - u);
    }
    const mot = Math.min(1.0, env.motionAmp);
    if (p.scatterEm > 0.0 && t - on > 0.0 && t - on < 0.4) {
      const u = Math.sin((Math.PI * (t - on)) / 0.4) ** 2;
      const ang = hash01(letterKey(p, i, 12)) * 2.0 * Math.PI;
      dx += p.scatterEm * tierK * mot * u * Math.cos(ang);
      dy += p.scatterEm * tierK * mot * u * (Math.sin(ang) - 0.4);
    }
    if (p.glitch > 0.0 && p.tier === 'strong' && env.phase === 'sustain') {
      const slice = Math.trunc(t * 10.0);
      if (hash01(letterKey(p, i, 14), slice) < 0.1 * p.glitch) {
        dx += (hash01(letterKey(p, i, 15), slice) < 0.5 ? 1.0 : -1.0) * 0.02 * p.glitch;
      }
    }
  }

  const ne = ctx.ne;
  if (ne > 0 && i >= n - ne) {
    const j = i - (n - ne);
    const w0 = p.vanishS > 0.0 ? p.vanishS : endS - FX.erodeTail * dur;
    const wl = p.vanishS > 0.0 ? FX.vanishS : FX.erodeTail * dur;
    const s0 = w0 + (j / ne) * 0.4 * wl;
    const e = smoothstepRange(s0, s0 + 0.6 * wl, t);
    alpha *= 1.0 - e;
    scale *= 1.0 - 0.15 * e;
    if (!reduce) {
      dx += (hash01(letterKey(p, i, 5)) * 2.0 - 1.0) * 0.04 * e;
      dy += (p.driftEm >= 0.0 ? 0.02 : -0.02) * e * (0.5 + hash01(letterKey(p, i, 6)));
    }
  }

  let glow = ctx.baseGlow;
  if (carrier !== null && env !== null) {
    const ma = glow * (env.motionAmp > 1.0 ? 1.0 : env.motionAmp);
    const g2 = ma > carrier.glowA ? ma : carrier.glowA;
    glow = g2 > 1.0 ? 1.0 : g2;
    if (p.shimmer > 0.0 && p.tier === 'strong' && !reduce) {
      glow = Math.min(
        1.0,
        glow +
          p.shimmer * 4.0 * carrier.fillP * (1.0 - carrier.fillP) * Math.min(1.0, env.motionAmp),
      );
    }
  }
  if (sg > 0.0) glow = Math.min(1.0, glow + 0.25 * sg);
  if (glow > 0.0 && !reduce) {
    if (p.particleKind === 'ember' && (carrier === null || carrier.fillP > 0.0)) {
      const flk = noise1(letterKey(p, i, 9), t * 7.5);
      glow = Math.min(1.0, Math.max(0.05, glow * (1.0 + 0.16 * flk)));
    }
    const fl =
      glow +
      p.flash *
        smoothstepRange(on - FLASH_IN_S, on, t) *
        (1.0 - smoothstepRange(on, on + FLASH_OUT_S, t));
    glow = fl > 1.0 ? 1.0 : fl;
  }

  const baseCol = lerpRgb(p.colorFrom, ctx.cEnd, n > 1 ? i / (n - 1) : 0.0);
  const targetCol = p.oscHz > 0.0 ? lerpRgb(baseCol, p.oscColor, ow) : baseCol;
  let col: Rgb;
  if (carrier !== null && env !== null) {
    const ta = env.tintAmp > 1.0 ? 1.0 : env.tintAmp;
    let fg = carrier.fillP;
    if (fg < 0.25 && (env.phase === 'anticipation' || env.phase === 'fade')) fg = 0.25;
    let tw = p.fillTint * ta * fg;
    if (p.tintSpread && n > 1) {
      const d = p.tintSpread === 'frost' ? i / (n - 1) : Math.abs((2.0 * i) / (n - 1) - 1.0);
      tw *= smoothstepRange(0.7 * d, 0.7 * d + 0.3, (1.4 * (t - beginS)) / Math.max(ctx.dur, 0.3));
    }
    const tintW = tw < 0.0 ? 0.0 : tw > 0.6 ? 0.6 : tw;
    col = lerpRgb(WHITE, targetCol, tintW);
  } else {
    col = targetCol;
  }
  const aOut = alpha < 0.0 ? 0.0 : alpha > 1.0 ? 1.0 : alpha;
  return { dx, dy, scale, rotDeg: rot, alpha: aOut, color: col, blurEm: ctx.blur, glow, stretch };
}

export interface LetterStateOpts {
  readonly rms?: number;
  readonly reduce?: boolean;
  readonly strain?: number;
  readonly onset?: number | null;
  readonly carrier?: CarrierLetter | null;
  readonly lineAct?: number | null;
  readonly lineEndS?: number | null;
  readonly beatPhase?: number | null;
}

export function letterState(
  p: FxParams,
  i: number,
  n: number,
  t: number,
  beginS: number,
  endS: number,
  opts: LetterStateOpts = {},
): LetterState {
  const rms = opts.rms ?? 0.0;
  const reduce = opts.reduce ?? false;
  const strain = opts.strain ?? 0.0;
  const carrier = opts.carrier ?? null;
  const ctx = wordCtx(p, n, t, beginS, endS, rms, reduce, strain, carrier !== null);
  return letterStateWithCtx(
    p,
    i,
    n,
    t,
    beginS,
    ctx,
    rms,
    reduce,
    opts.onset ?? null,
    carrier,
    opts.lineAct ?? null,
    opts.lineEndS ?? null,
    opts.beatPhase ?? null,
  );
}

export interface WordLetterStatesOpts {
  readonly rms?: number;
  readonly reduce?: boolean;
  readonly strain?: number;
  readonly onsets?: readonly number[] | null;
  readonly cLetters?: readonly CarrierLetter[] | null;
  readonly lineAct?: number | null;
  readonly lineEndS?: number | null;
  readonly beatPhase?: number | null;
}

export function wordLetterStates(
  p: FxParams,
  n: number,
  t: number,
  beginS: number,
  endS: number,
  opts: WordLetterStatesOpts = {},
): LetterState[] {
  const rms = opts.rms ?? 0.0;
  const reduce = opts.reduce ?? false;
  const strain = opts.strain ?? 0.0;
  const onsets = opts.onsets && opts.onsets.length > 0 ? opts.onsets : null;
  const cLetters = opts.cLetters && opts.cLetters.length > 0 ? opts.cLetters : null;
  const ctx = wordCtx(p, n, t, beginS, endS, rms, reduce, strain, cLetters !== null);
  const out: LetterState[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(
      letterStateWithCtx(
        p,
        i,
        n,
        t,
        beginS,
        ctx,
        rms,
        reduce,
        onsets ? (onsets[i] ?? null) : null,
        cLetters ? (cLetters[i] ?? null) : null,
        opts.lineAct ?? null,
        opts.lineEndS ?? null,
        opts.beatPhase ?? null,
      ),
    );
  }
  return out;
}

export function wordParticles(
  p: FxParams,
  lettersXEm: readonly number[],
  lettersWEm: readonly number[],
  t: number,
  beginS: number,
  endS: number,
  opts: {
    readonly reduce?: boolean;
    readonly onsets?: readonly number[] | null;
    readonly fillFrontU?: number | null;
  } = {},
): Particle[] {
  return emitParticles(
    p,
    lettersXEm,
    lettersWEm,
    t,
    beginS,
    endS,
    opts.reduce ?? false,
    opts.onsets ?? null,
    opts.fillFrontU ?? null,
    pyRound,
  );
}
