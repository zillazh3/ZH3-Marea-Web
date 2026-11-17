import { CachedSpringCurve } from './springs';

export const BLEED_KERNEL: Readonly<Record<number, number>> = { 1: 0.35, 2: 0.12 };
export const CROSS_LINE_MAX_GAP_S = 2.5;
export const MIN_HANDOFF_OVERLAP_S = 0.25;
export const MAX_HANDOFF_OVERLAP_S = 0.4;
export const DEFAULT_HANDOFF_OVERLAP_S = 0.32;

const MAX_BLEED_CURVES = 512;
const BLEED_CURVES = new Map<string, CachedSpringCurve>();

export interface BleedMatchLike {
  readonly line: number;
  readonly word: number;
  readonly lemma: string;
  readonly beginMs: number;
  readonly endMs: number;
}

export function lineBleedDonors<T extends BleedMatchLike>(
  wordIdx: number,
  lineMatches: readonly T[],
  prevLineLastHero: T | null,
  lineStartMs: number,
): { match: T; weight: number }[] {
  const out: { match: T; weight: number }[] = [];
  for (const m of lineMatches) {
    if (m.word === wordIdx) continue;
    const dist = Math.abs(m.word - wordIdx);
    const w = BLEED_KERNEL[dist] ?? 0;
    if (w > 0) out.push({ match: m, weight: w });
  }
  if (prevLineLastHero !== null && (wordIdx === 0 || wordIdx === 1)) {
    const gapS = Math.max(0, (lineStartMs - prevLineLastHero.endMs) / 1000);
    if (gapS <= CROSS_LINE_MAX_GAP_S) {
      const w = BLEED_KERNEL[wordIdx + 1] ?? 0;
      if (w > 0) out.push({ match: prevLineLastHero, weight: w });
    }
  }
  return out;
}

export function springBleedArrival(
  tS: number,
  donorBeginS: number,
  donorEndS: number,
  freqHz = 2.8,
): number {
  const tau = tS - donorBeginS;
  if (tau <= -0.12) return 0;
  const qDur = Math.round(Math.max(0.05, donorEndS - donorBeginS) * 1000) / 1000;
  const key = `${String(qDur)}|${String(freqHz)}`;
  let curve = BLEED_CURVES.get(key);
  if (!curve) {
    const tailEnd = qDur + 0.7;
    curve = new CachedSpringCurve(
      (x) => {
        if (x < 0) return 0;
        if (x <= qDur) return 1;
        if (x <= tailEnd) return 1 - ((x - qDur) / 0.7) * 0.75;
        return 0.25;
      },
      -0.17,
      0,
      freqHz,
      1,
      2400,
      tailEnd,
      0.25,
    );
    if (BLEED_CURVES.size >= MAX_BLEED_CURVES) {
      const oldest = BLEED_CURVES.keys().next().value;
      if (oldest !== undefined) BLEED_CURVES.delete(oldest);
    }
    BLEED_CURVES.set(key, curve);
  }
  const [val] = curve.eval(tau);
  return val < 0 ? 0 : val > 1 ? 1 : val;
}

export function handoffOverlapS(lineEndMs: number, nextLineStartMs: number | null): number {
  if (nextLineStartMs === null) return DEFAULT_HANDOFF_OVERLAP_S;
  const gapS = (nextLineStartMs - lineEndMs) / 1000;
  if (gapS <= 0.15) return MAX_HANDOFF_OVERLAP_S;
  if (gapS <= 1.5) return DEFAULT_HANDOFF_OVERLAP_S;
  return MIN_HANDOFF_OVERLAP_S;
}
