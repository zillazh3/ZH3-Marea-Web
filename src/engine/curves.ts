import { at } from '@/shared/indexed';

// Curves of the prototype: CSS cubic-bezier, the natural cubic spline of the `cubic-spline` package, and the Spicy Lyrics
// progress curves. They are pinned by tests/fixtures/engine/refs.json, so their arithmetic must not be "improved".

export type Curve = (x: number) => number;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const NEWTON_STEPS = 8;
const NEWTON_EPS = 1e-6;

export function bezier(x1: number, y1: number, x2: number, y2: number): Curve {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < NEWTON_STEPS; i += 1) {
      const e = ((ax * t + bx) * t + cx) * t - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(e) < NEWTON_EPS || Math.abs(d) < NEWTON_EPS) break;
      t -= e / d;
    }
    const c = clamp01(t);
    return ((ay * c + by) * c + cy) * c;
  };
}

export const EASE = bezier(0.25, 0.1, 0.25, 1); // CSS `ease`
export const EASE_OUT = bezier(0, 0, 0.58, 1); // CSS `ease-out`

export type Point = readonly [x: number, y: number];

export function spline(points: readonly Point[]): Curve {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = xs.length - 1;
  const h = Array.from({ length: n }, (_, i) => at(xs, i + 1) - at(xs, i));
  const al = new Array<number>(n + 1).fill(0);
  const l = new Array<number>(n + 1).fill(1);
  const mu = new Array<number>(n + 1).fill(0);
  const z = new Array<number>(n + 1).fill(0);
  const c = new Array<number>(n + 1).fill(0);
  const b = new Array<number>(n).fill(0);
  const d = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    al[i] =
      (3 / at(h, i)) * (at(ys, i + 1) - at(ys, i)) -
      (3 / at(h, i - 1)) * (at(ys, i) - at(ys, i - 1));
  }
  for (let i = 1; i < n; i += 1) {
    l[i] = 2 * (at(xs, i + 1) - at(xs, i - 1)) - at(h, i - 1) * at(mu, i - 1);
    mu[i] = at(h, i) / at(l, i);
    z[i] = (at(al, i) - at(h, i - 1) * at(z, i - 1)) / at(l, i);
  }
  for (let j = n - 1; j >= 0; j -= 1) {
    c[j] = at(z, j) - at(mu, j) * at(c, j + 1);
    b[j] = (at(ys, j + 1) - at(ys, j)) / at(h, j) - (at(h, j) * (at(c, j + 1) + 2 * at(c, j))) / 3;
    d[j] = (at(c, j + 1) - at(c, j)) / (3 * at(h, j));
  }

  return (input) => {
    const x = clamp01(input);
    let i = n - 1;
    for (let k = 0; k < n; k += 1) {
      if (x <= at(xs, k + 1)) {
        i = k;
        break;
      }
    }
    const dx = x - at(xs, i);
    return at(ys, i) + at(b, i) * dx + at(c, i) * dx * dx + at(d, i) * dx * dx * dx;
  };
}

export function smoothstep(x: number): number {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
}

export function smoothstepRange(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  return smoothstep((x - a) / (b - a));
}

// Wipe progress inside a syllable: starts and ends at ~40 % of the mean speed and passes 1.4x in the middle, so consecutive
// syllables do not read as one sweep.
export const WIPE = bezier(0.3, 0.12, 0.7, 0.88);
/** Inverse of WIPE (transposed control points): wipe progress to fraction of the syllable's time. */
export const WIPE_INV = bezier(0.12, 0.3, 0.88, 0.7);

// Progress of a syllable 0..1 (Spicy Lyrics).
export const SCALE = spline([
  [0, 0.95],
  [0.7, 1.0505],
  [1, 1],
]);
export const YOFF = spline([
  [0, 0.01],
  [0.9, -1 / 60],
  [1, 0],
]);
// Progress of the active letter in emphasised words.
export const L_SCALE = spline([
  [0, 0.95],
  [0.7, 1.175],
  [1, 1],
]);
export const L_YOFF = spline([
  [0, 0.01],
  [0.9, -1 / 56],
  [1, 0],
]);

/** Prototype glow shape, pinned by refs.json; the engine itself uses `glowCurve`. */
export const GLOW_PROTOTYPE = spline([
  [0, 0],
  [0.15, 1],
  [0.6, 1],
  [1, 0],
]);

/**
 * Glow over a syllable: builds smoothly to 1 at `peakAt` and ends at `endLevel`, where the engine's glow spring fades it out.
 * Unlike the prototype shape it does not fall to 0 as the syllable finishes, so a held word keeps building instead of dimming.
 */
export function glowCurve(peakAt: number, endLevel: number): Curve {
  const f = spline([
    [0, 0],
    [peakAt * 0.45, 0.5],
    [peakAt, 1],
    [1, endLevel],
  ]);
  return (x) => Math.min(1, f(x));
}
