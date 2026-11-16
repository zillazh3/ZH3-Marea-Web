const SUBSTEPS = 4;

/** Stagger delay: the target applies once `now` reaches the instant. */
type Pending = readonly [target: number, atMs: number];

/** Spring with stiffness `k` and damping `c` (AMLL), integrated in four semi-implicit Euler substeps per frame. */
export class Spring {
  p: number;
  v = 0;
  t: number;
  k = 100;
  c = 10;
  /** `|p - target|` and `|v|` below this settle at once; it must be invisible in the spring's own units. */
  eps = 0.01;
  pending: Pending | null = null;

  constructor(p: number) {
    this.p = p;
    this.t = p;
  }

  to(target: number, delayMs: number, now: number): void {
    if (delayMs > 0) {
      this.pending = [target, now + delayMs];
    } else {
      this.t = target;
      this.pending = null;
    }
  }

  snap(p: number): void {
    this.p = p;
    this.t = p;
    this.v = 0;
    this.pending = null;
  }

  step(dt: number, now: number): number {
    if (this.pending && now >= this.pending[1]) {
      this.t = this.pending[0];
      this.pending = null;
    }
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i += 1) {
      const a = -this.k * (this.p - this.t) - this.c * this.v;
      this.v += a * h;
      this.p += this.v * h;
    }
    if (Math.abs(this.p - this.t) < this.eps && Math.abs(this.v) < this.eps) {
      this.p = this.t;
      this.v = 0;
    }
    return this.p;
  }

  /** Nothing left to integrate: no pending target, on target, still. */
  get isResting(): boolean {
    return this.pending === null && this.p === this.t && this.v === 0;
  }
}

/** Advance `(p, v)` toward `g` by `dt` seconds with the analytical solution: no drift, stable for any `dt >= 0`. */
export function stepSpring(
  p: number,
  v: number,
  g: number,
  freqHz: number,
  zeta: number,
  dt: number,
): [p: number, v: number] {
  if (dt <= 0 || freqHz <= 0) return [p, v];
  const w = freqHz * 2 * Math.PI;
  const o = p - g;
  if (Math.abs(o) < 1e-12 && Math.abs(v) < 1e-12) return [g, 0];
  if (Math.abs(zeta - 1) < 1e-6) {
    const q = Math.exp(-w * dt);
    const tq = dt * q;
    return [o * (q + tq * w) + v * tq + g, v * (q - tq * w) - o * (tq * w * w)];
  }
  if (zeta < 1) {
    const z = Math.max(0.01, zeta);
    const q = Math.exp(-z * w * dt);
    const c = Math.sqrt(1 - z * z);
    const cs = Math.cos(dt * w * c);
    const sn = Math.sin(dt * w * c);
    const k1 = sn / c;
    const k2 = sn / (w * c);
    return [(o * (cs + k1 * z) + v * k2) * q + g, (v * (cs - k1 * z) - o * (k1 * w)) * q];
  }
  const c = Math.sqrt(zeta * zeta - 1);
  const r1 = -w * (zeta + c);
  const r2 = -w * (zeta - c);
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  const c2 = (v - o * r1) / (2 * w * c);
  const c1 = e1 * (o - c2);
  return [c1 + c2 * e2 + g, c1 * r1 + c2 * e2 * r2];
}

/** Port of `spr` (Fraktality): analytic spring by frequency and damping ratio. */
export class Spr {
  p: number;
  v = 0;
  g: number;
  f: number;
  d: number;

  constructor(p: number, f: number, d: number) {
    this.p = p;
    this.g = p;
    this.f = f;
    this.d = d;
  }

  snap(p: number): void {
    this.p = p;
    this.g = p;
    this.v = 0;
  }

  step(dt: number): number {
    [this.p, this.v] = stepSpring(this.p, this.v, this.g, this.f, this.d, dt);
    return this.p;
  }

  /** Within the visible tolerance of the target and effectively still. */
  get isSettled(): boolean {
    return Math.abs(this.p - this.g) <= 1e-4 && Math.abs(this.v) <= 1e-3;
  }
}
