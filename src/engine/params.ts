import type { MotionMode } from './motion';
import { TUNING } from './tuning';

/** The 11 user-facing engine parameters (`editor.params` in project files). */
export interface Params {
  /** Vertical anchor of the active line, as a fraction of the stage height. */
  align: number;
  /** ms of delay per visible line. */
  stagger: number;
  blurm: number;
  /** Per-syllable springs. */
  float: boolean;
  /** Letter emphasis in long words. */
  emph: boolean;
  /** 0.97 scale on inactive lines. */
  scale: boolean;
  /** Micro-vibrato on held letters. */
  vib: boolean;
  /** Damping ratio of the Y spring (bounce). */
  wob: number;
  /** Per-character motion layer. */
  motion: MotionMode;
  /** Expressiveness of that layer (1 = normal). */
  motionAmt: number;
  /** Reduced motion: no per-character layer, no syllable or letter jumps, no vibrato (wipe, glow and scroll remain). */
  reduce: boolean;
}

export function defaultParams(): Params {
  return {
    align: 0.35,
    stagger: TUNING.staggerMs,
    blurm: 1,
    float: true,
    emph: true,
    scale: true,
    vib: true,
    wob: 0.4,
    motion: 'auto',
    motionAmt: 1,
    reduce: false,
  };
}
