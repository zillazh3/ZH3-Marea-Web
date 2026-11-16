import { TUNING } from './tuning';

/** (k, c) of a line's Y spring (AMLL `getPosYSpringPolicy`). `intervalMs` is the time since the previous line started. */
export function posYPolicy(
  seek: boolean,
  interlude: boolean,
  intervalMs: number | null,
): [k: number, c: number] {
  if (seek || interlude || intervalMs === null) return [TUNING.scrollSeekK, TUNING.scrollSeekC];
  const ci = Math.min(Math.max(intervalMs, 100), 800);
  const ratio = (1 - (ci - 100) / 700) ** 0.2;
  const k = TUNING.scrollKBase + ratio * TUNING.scrollKRange;
  return [k, Math.sqrt(k) * TUNING.scrollDamping];
}

/** Blur (px at design size) of line `i`; the active line has none. */
export function blurLevel(i: number, active: number, blurm = 1, scale = 1): number {
  if (i === active || blurm <= 0) return 0;
  const dist = i < active ? active - i + 1 : i - active;
  return Math.min(TUNING.blurMax, (1 + dist) * scale * blurm * TUNING.blurPerLine);
}
