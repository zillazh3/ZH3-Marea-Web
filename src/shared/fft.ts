// Real-input FFT (radix-2 + cached Bluestein for composite frame lengths) and numpy-compatible array helpers.

export interface RfftPlan {
  readonly n: number;
  readonly bins: number;
  readonly isPow2: boolean;
  readonly pow2Len: number;
  readonly cosTable: Float64Array;
  readonly sinTable: Float64Array;
  readonly bitRev: Uint32Array;
  // Bluestein buffers (only populated when !isPow2)
  readonly chirpRe: Float64Array;
  readonly chirpIm: Float64Array;
  readonly bFftRe: Float64Array;
  readonly bFftIm: Float64Array;
  readonly workRe: Float64Array;
  readonly workIm: Float64Array;
}

const PLAN_CACHE = new Map<number, RfftPlan>();

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function buildBitRev(len: number): Uint32Array {
  const rev = new Uint32Array(len);
  const bits = Math.round(Math.log2(len));
  for (let i = 0; i < len; i += 1) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b += 1) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  return rev;
}

function complexFftInPlace(
  re: Float64Array,
  im: Float64Array,
  len: number,
  cosTable: Float64Array,
  sinTable: Float64Array,
  bitRev: Uint32Array,
  inverse: boolean,
): void {
  for (let i = 0; i < len; i += 1) {
    const j = bitRev[i] ?? 0;
    if (i < j) {
      const tr = re[i] ?? 0;
      const ti = im[i] ?? 0;
      re[i] = re[j] ?? 0;
      im[i] = im[j] ?? 0;
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= len; size <<= 1) {
    const half = size >> 1;
    const tableStep = len / size;
    for (let i = 0; i < len; i += size) {
      for (let j = 0; j < half; j += 1) {
        const k = j * tableStep;
        const wr = cosTable[k] ?? 1;
        const wi = inverse ? -(sinTable[k] ?? 0) : (sinTable[k] ?? 0);
        const idx1 = i + j;
        const idx2 = idx1 + half;
        const r2 = re[idx2] ?? 0;
        const i2 = im[idx2] ?? 0;
        const tr = wr * r2 - wi * i2;
        const ti = wr * i2 + wi * r2;
        const r1 = re[idx1] ?? 0;
        const i1 = im[idx1] ?? 0;
        re[idx1] = r1 + tr;
        im[idx1] = i1 + ti;
        re[idx2] = r1 - tr;
        im[idx2] = i1 - ti;
      }
    }
  }

  if (inverse) {
    const inv = 1 / len;
    for (let i = 0; i < len; i += 1) {
      re[i] = (re[i] ?? 0) * inv;
      im[i] = (im[i] ?? 0) * inv;
    }
  }
}

export function getRfftPlan(n: number): RfftPlan {
  const existing = PLAN_CACHE.get(n);
  if (existing) return existing;

  const isPow2 = isPowerOfTwo(n);
  const pow2Len = isPow2 ? n : nextPowerOfTwo(2 * n - 1);
  const halfPow2 = pow2Len >> 1;
  const cosTable = new Float64Array(halfPow2);
  const sinTable = new Float64Array(halfPow2);
  for (let i = 0; i < halfPow2; i += 1) {
    const angle = (-2 * Math.PI * i) / pow2Len;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }
  const bitRev = buildBitRev(pow2Len);

  let chirpRe = new Float64Array(0);
  let chirpIm = new Float64Array(0);
  let bFftRe = new Float64Array(0);
  let bFftIm = new Float64Array(0);

  if (!isPow2) {
    chirpRe = new Float64Array(n);
    chirpIm = new Float64Array(n);
    bFftRe = new Float64Array(pow2Len);
    bFftIm = new Float64Array(pow2Len);
    const twoN = 2 * n;
    for (let m = 0; m < n; m += 1) {
      const mod = (m * m) % twoN;
      const angle = (Math.PI * mod) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      chirpRe[m] = c;
      chirpIm[m] = -s;
      bFftRe[m] = c;
      bFftIm[m] = s;
      if (m > 0) {
        bFftRe[pow2Len - m] = c;
        bFftIm[pow2Len - m] = s;
      }
    }
    complexFftInPlace(bFftRe, bFftIm, pow2Len, cosTable, sinTable, bitRev, false);
  }

  const plan: RfftPlan = {
    n,
    bins: (n >> 1) + 1,
    isPow2,
    pow2Len,
    cosTable,
    sinTable,
    bitRev,
    chirpRe,
    chirpIm,
    bFftRe,
    bFftIm,
    workRe: new Float64Array(pow2Len),
    workIm: new Float64Array(pow2Len),
  };
  PLAN_CACHE.set(n, plan);
  return plan;
}

/**
 * Computes `|rfft(frame)|` or `|rfft(frame)|^2` into `out` (`length >= plan.bins`) without allocations.
 * Uses cached twiddle and Bluestein tables inside `plan`.
 */
export function rfftSpectrum(
  frame: Float32Array | Float64Array,
  out: Float64Array,
  plan: RfftPlan,
  squared: boolean,
): void {
  const { n, bins, isPow2, pow2Len, cosTable, sinTable, bitRev, workRe, workIm } = plan;

  if (isPow2) {
    for (let i = 0; i < n; i += 1) {
      workRe[i] = frame[i] ?? 0;
      workIm[i] = 0;
    }
    complexFftInPlace(workRe, workIm, pow2Len, cosTable, sinTable, bitRev, false);
    for (let k = 0; k < bins; k += 1) {
      const re = workRe[k] ?? 0;
      const im = workIm[k] ?? 0;
      const p = re * re + im * im;
      out[k] = squared ? p : Math.sqrt(p);
    }
    return;
  }

  const { chirpRe, chirpIm, bFftRe, bFftIm } = plan;
  workRe.fill(0);
  workIm.fill(0);
  for (let i = 0; i < n; i += 1) {
    const x = frame[i] ?? 0;
    workRe[i] = x * (chirpRe[i] ?? 1);
    workIm[i] = x * (chirpIm[i] ?? 0);
  }
  complexFftInPlace(workRe, workIm, pow2Len, cosTable, sinTable, bitRev, false);
  for (let i = 0; i < pow2Len; i += 1) {
    const ar = workRe[i] ?? 0;
    const ai = workIm[i] ?? 0;
    const br = bFftRe[i] ?? 0;
    const bi = bFftIm[i] ?? 0;
    workRe[i] = ar * br - ai * bi;
    workIm[i] = ar * bi + ai * br;
  }
  complexFftInPlace(workRe, workIm, pow2Len, cosTable, sinTable, bitRev, true);
  for (let k = 0; k < bins; k += 1) {
    const cr = workRe[k] ?? 0;
    const ci = workIm[k] ?? 0;
    const wr = chirpRe[k] ?? 1;
    const wi = chirpIm[k] ?? 0;
    const re = cr * wr - ci * wi;
    const im = cr * wi + ci * wr;
    const p = re * re + im * im;
    out[k] = squared ? p : Math.sqrt(p);
  }
}

export function hanningWindow(n: number): Float32Array {
  const win = new Float32Array(n);
  if (n <= 1) return win;
  const denom = n - 1;
  for (let i = 0; i < n; i += 1) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
  }
  return win;
}

export function rfftfreq(n: number, d: number): Float64Array {
  const bins = (n >> 1) + 1;
  const freqs = new Float64Array(bins);
  const scale = 1 / (n * d);
  for (let k = 0; k < bins; k += 1) {
    freqs[k] = k * scale;
  }
  return freqs;
}

export function percentile(
  values: Float32Array | Float64Array | readonly number[],
  q: number,
): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const idx = (q / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(n - 1, lo + 1);
  const frac = idx - lo;
  const vlo = sorted[lo] ?? 0;
  const vhi = sorted[hi] ?? vlo;
  return vlo + (vhi - vlo) * frac;
}
