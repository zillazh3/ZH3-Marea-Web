import { SIM_DT, springStepCoeffs } from '@/engine/wordfx/springs';
import { pyRound } from '@/shared/pycompat';
import { globalVector, vectorAt, type SongProfile } from './profile';

export interface MomentumEvent {
  readonly beginS: number;
  readonly endS: number;
  readonly vector: readonly number[];
  readonly salience: number;
}

export interface MomentumTrajectory {
  readonly samples: number[];
  readonly rateHz: number;
  readonly tauS: number;
}

const FAST_MOODS = new Set(['euphoric', 'energetic', 'angry', 'defiant']);
const SLOW_MOODS = new Set(['sad', 'nostalgic', 'melancholic', 'tender', 'dreamy']);
const ZERO_6 = [0, 0, 0, 0, 0, 0] as const;

export function moodTauS(profile: SongProfile | null): number {
  if (!profile) return 2.15;
  for (const t of profile.tags) {
    if (FAST_MOODS.has(t)) return 1.6;
  }
  for (const t of profile.tags) {
    if (SLOW_MOODS.has(t)) return 2.75;
  }
  return 2.15;
}

export function buildMomentum(
  events: readonly MomentumEvent[],
  durationS: number,
  profile: SongProfile | null = null,
  rateHz = 60,
): MomentumTrajectory {
  const tau = moodTauS(profile);
  const freqHz = 3.2 / tau / (2 * Math.PI);
  const [a11, a12, a21, a22] = springStepCoeffs(freqHz, 1.0, SIM_DT);
  const totalS = Math.max(1, durationS + 1);
  const nOut = Math.max(2, Math.ceil(totalS * rateHz) + 1);
  const out = new Array<number>(nOut * 6).fill(0);

  const sortedEv = [...events].sort((a, b) => a.beginS - b.beginS);
  const gVec = profile ? globalVector(profile) : null;
  const hasArc = Boolean(profile && profile.arc.length > 0);
  const initVec = (hasArc && profile ? vectorAt(profile, 0, 1, gVec) : gVec) ?? ZERO_6;
  const p = [initVec[0], initVec[1], initVec[2], initVec[3], initVec[4], initVec[5]];
  const v = [0, 0, 0, 0, 0, 0];
  const staticBase = hasArc ? ZERO_6 : (gVec ?? ZERO_6);

  const stepsPerFrame = Math.max(1, pyRound(240 / rateHz));
  let evIdx = 0;
  let active: MomentumEvent[] = [];

  for (let fi = 0; fi < nOut; fi += 1) {
    const outBase = fi * 6;
    for (let k = 0; k < 6; k += 1) out[outBase + k] = Math.fround(p[k] ?? 0);
    if (fi === nOut - 1) break;

    const tFrame = fi / rateHz;
    for (let sub = 0; sub < stepsPerFrame; sub += 1) {
      const t = tFrame + sub * SIM_DT;
      while (evIdx < sortedEv.length) {
        const nextEv = sortedEv[evIdx];
        if (!nextEv || nextEv.beginS > t + 0.25) break;
        active.push(nextEv);
        evIdx += 1;
      }
      if (active.length > 0) {
        active = active.filter((e) => e.endS + 0.45 >= t);
      }

      const base = hasArc && profile ? (vectorAt(profile, t, 1, gVec) ?? ZERO_6) : staticBase;

      let tgt0 = base[0];
      let tgt1 = base[1];
      let tgt2 = base[2];
      let tgt3 = base[3];
      let tgt4 = base[4];
      let tgt5 = base[5];

      if (active.length > 0) {
        let wTot = 0;
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        let s3 = 0;
        let s4 = 0;
        let s5 = 0;
        for (const ev of active) {
          if (t < ev.beginS - 0.15) continue;
          const w = ev.salience * (t > ev.endS ? 0.4 : 1.0);
          wTot += w;
          s0 += w * (ev.vector[0] ?? 0);
          s1 += w * (ev.vector[1] ?? 0);
          s2 += w * (ev.vector[2] ?? 0);
          s3 += w * (ev.vector[3] ?? 0);
          s4 += w * (ev.vector[4] ?? 0);
          s5 += w * (ev.vector[5] ?? 0);
        }
        if (wTot > 1e-6) {
          const push = Math.min(1, wTot);
          const rem = 1 - push;
          const inv = push / wTot;
          tgt0 = tgt0 * rem + s0 * inv;
          tgt1 = tgt1 * rem + s1 * inv;
          tgt2 = tgt2 * rem + s2 * inv;
          tgt3 = tgt3 * rem + s3 * inv;
          tgt4 = tgt4 * rem + s4 * inv;
          tgt5 = tgt5 * rem + s5 * inv;
        }
      }

      const targets = [tgt0, tgt1, tgt2, tgt3, tgt4, tgt5];
      for (let k = 0; k < 6; k += 1) {
        const gk = targets[k] ?? 0;
        const ok = (p[k] ?? 0) - gk;
        const vk = v[k] ?? 0;
        if (Math.abs(ok) < 1e-12 && Math.abs(vk) < 1e-12) {
          p[k] = gk;
          v[k] = 0;
        } else {
          p[k] = a11 * ok + a12 * vk + gk;
          v[k] = a21 * ok + a22 * vk;
        }
      }
    }
  }

  return { samples: out, rateHz, tauS: tau };
}
