import { stepSpring } from '../springs';

export const SIM_HZ = 240.0;
export const SIM_DT = 1.0 / SIM_HZ;
export const DEFAULT_FREQ_HZ = 2.4;
export const DEFAULT_ZETA = 1.0;

export function springStepCoeffs(
  freqHz: number,
  zeta: number,
  dt: number,
): readonly [number, number, number, number] {
  if (dt <= 0 || freqHz <= 0) return [1, 0, 0, 1];
  const w = freqHz * 2 * Math.PI;
  if (Math.abs(zeta - 1) < 1e-6) {
    const q = Math.exp(-w * dt);
    const tq = dt * q;
    return [q + tq * w, tq, -(tq * w * w), q - tq * w];
  }
  if (zeta < 1) {
    const z = Math.max(0.01, zeta);
    const q = Math.exp(-z * w * dt);
    const c = Math.sqrt(1 - z * z);
    const cs = Math.cos(dt * w * c);
    const sn = Math.sin(dt * w * c);
    const k1 = sn / c;
    const k2 = sn / (w * c);
    return [(cs + k1 * z) * q, k2 * q, -(k1 * w) * q, (cs - k1 * z) * q];
  }
  const c = Math.sqrt(zeta * zeta - 1);
  const r1 = -w * (zeta + c);
  const r2 = -w * (zeta - c);
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  const inv = 1 / (2 * w * c);
  const de = e2 - e1;
  const der = e2 * r2 - e1 * r1;
  return [e1 - r1 * inv * de, inv * de, e1 * r1 - r1 * inv * der, inv * der];
}

export class FxSpringChannel {
  p = 0;
  v = 0;
  g = 0;
  freqHz: number;
  zeta: number;

  constructor(p = 0, freqHz = DEFAULT_FREQ_HZ, zeta = DEFAULT_ZETA) {
    this.p = p;
    this.g = p;
    this.freqHz = freqHz;
    this.zeta = zeta;
  }

  snap(value: number): void {
    this.p = value;
    this.v = 0;
    this.g = value;
  }

  retarget(target: number, freqHz?: number, zeta?: number): void {
    this.g = target;
    if (freqHz !== undefined) this.freqHz = freqHz;
    if (zeta !== undefined) this.zeta = zeta;
  }

  step(dt: number): number {
    [this.p, this.v] = stepSpring(this.p, this.v, this.g, this.freqHz, this.zeta, dt);
    return this.p;
  }
}

export function evalSpring240hz(
  targetFn: (time: number) => number,
  t: number,
  tOrigin: number,
  initial = 0,
  freqHz = DEFAULT_FREQ_HZ,
  zeta = DEFAULT_ZETA,
  maxTicks = 2400,
): [number, number] {
  if (t <= tOrigin) return [initial, 0];
  const elapsed = t - tOrigin;
  const nTicks = Math.floor(elapsed * SIM_HZ);
  let p = initial;
  let v = 0;
  let startTick = 0;
  if (nTicks > maxTicks) {
    p = targetFn(tOrigin + (nTicks - maxTicks) * SIM_DT);
    startTick = nTicks - maxTicks;
  }
  for (let k = startTick; k < nTicks; k += 1) {
    const g = targetFn(tOrigin + (k + 0.5) * SIM_DT);
    [p, v] = stepSpring(p, v, g, freqHz, zeta, SIM_DT);
  }
  const rem = elapsed - nTicks * SIM_DT;
  if (rem > 1e-9) {
    [p, v] = stepSpring(p, v, targetFn(t), freqHz, zeta, rem);
  }
  return [p, v];
}

function decayRate(freqHz: number, zeta: number): number {
  const w = 2 * Math.PI * Math.max(1e-4, freqHz);
  if (zeta <= 1) return w * Math.max(0.01, zeta);
  return w * Math.max(0.01, zeta - Math.sqrt(zeta * zeta - 1));
}

export class CachedSpringCurve {
  private readonly targetFn: (time: number) => number;
  private readonly tOrigin: number;
  private readonly initial: number;
  private readonly freqHz: number;
  private readonly zeta: number;
  private readonly maxTicks: number;
  private readonly steadyAfter: number | null;
  private readonly steadyValue: number;
  private readonly steadyDoneT: number | null;
  private readonly coeffs: readonly [number, number, number, number];
  private readonly pArr: number[];
  private readonly vArr: number[];
  private settledTick: number | null = null;

  constructor(
    targetFn: (time: number) => number,
    tOrigin: number,
    initial = 0,
    freqHz = DEFAULT_FREQ_HZ,
    zeta = DEFAULT_ZETA,
    maxTicks = 2400,
    steadyAfter: number | null = null,
    steadyValue = 0,
  ) {
    this.targetFn = targetFn;
    this.tOrigin = tOrigin;
    this.initial = initial;
    this.freqHz = freqHz;
    this.zeta = zeta;
    this.maxTicks = maxTicks;
    this.steadyAfter = steadyAfter;
    this.steadyValue = steadyValue;
    this.steadyDoneT = steadyAfter !== null ? steadyAfter + 40 / decayRate(freqHz, zeta) : null;
    this.coeffs = springStepCoeffs(freqHz, zeta, SIM_DT);
    this.pArr = [initial];
    this.vArr = [0];
  }

  eval(t: number): [number, number] {
    if (t <= this.tOrigin) return [this.initial, 0];
    if (this.steadyDoneT !== null && t >= this.steadyDoneT) return [this.steadyValue, 0];
    const elapsed = t - this.tOrigin;
    const nTicks = Math.floor(elapsed * SIM_HZ);
    if (nTicks > this.maxTicks) {
      return evalSpring240hz(
        this.targetFn,
        t,
        this.tOrigin,
        this.initial,
        this.freqHz,
        this.zeta,
        this.maxTicks,
      );
    }
    if (this.settledTick !== null && nTicks >= this.settledTick) return [this.steadyValue, 0];

    const cached = this.pArr.length - 1;
    if (cached < nTicks) {
      let p = this.pArr[cached] ?? this.initial;
      let v = this.vArr[cached] ?? 0;
      const [a11, a12, a21, a22] = this.coeffs;
      for (let k = cached; k < nTicks; k += 1) {
        const tickT = this.tOrigin + (k + 0.5) * SIM_DT;
        const g = this.targetFn(tickT);
        const o = p - g;
        if (Math.abs(o) < 1e-12 && Math.abs(v) < 1e-12) {
          p = g;
          v = 0;
        } else {
          const nextP = a11 * o + a12 * v + g;
          const nextV = a21 * o + a22 * v;
          p = nextP;
          v = nextV;
        }
        this.pArr.push(p);
        this.vArr.push(v);
        if (
          this.steadyAfter !== null &&
          tickT >= this.steadyAfter &&
          p === this.steadyValue &&
          v === 0
        ) {
          this.settledTick = k + 1;
          return [this.steadyValue, 0];
        }
      }
    }

    let p = this.pArr[nTicks] ?? this.initial;
    let v = this.vArr[nTicks] ?? 0;
    const rem = elapsed - nTicks * SIM_DT;
    if (rem > 1e-9) {
      [p, v] = stepSpring(p, v, this.targetFn(t), this.freqHz, this.zeta, rem);
    }
    return [p, v];
  }
}
