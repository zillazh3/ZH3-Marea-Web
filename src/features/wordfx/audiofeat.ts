import type { AudioStats } from '@/engine/wordfx/fxtypes';
import { getRfftPlan, hanningWindow, percentile, rfftfreq, rfftSpectrum } from '@/shared/fft';
import { pyRound } from '@/shared/pycompat';
import { analyzeAudio, toMono, type AudioAnalysis } from '../audio/analysis';
import type { DecodedAudio } from '../audio/local';

export const STRAIN_CURVE_RATE = 50;
const MAX_DECIMATE_RATE = 16_000;
const SMOOTH_S = 0.3;
const MEDIAN_S = 2.0;

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const;
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const;

function decimate(mono: Float32Array, rate: number): { mono: Float32Array; rate: number } {
  const f = Math.ceil(rate / MAX_DECIMATE_RATE);
  if (f <= 1) return { mono, rate };
  const blocks = Math.floor(mono.length / f);
  const out = new Float32Array(blocks);
  for (let i = 0; i < blocks; i += 1) {
    let sum = 0;
    const base = i * f;
    for (let j = 0; j < f; j += 1) sum += mono[base + j] ?? 0;
    out[i] = sum / f;
  }
  return { mono: out, rate: Math.floor(rate / f) };
}

function smoothEdge(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  if (w <= 1 || n === 0) return new Float32Array(x);
  const padL = Math.floor(w / 2);
  const padR = w - 1 - padL;
  const paddedLen = n + padL + padR;
  const csum = new Float64Array(paddedLen + 1);
  const first = x[0] ?? 0;
  const last = x[n - 1] ?? 0;
  for (let i = 0; i < paddedLen; i += 1) {
    const val = i < padL ? first : i < padL + n ? (x[i - padL] ?? 0) : last;
    csum[i + 1] = (csum[i] ?? 0) + val;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = ((csum[i + w] ?? 0) - (csum[i] ?? 0)) / w;
  }
  return out;
}

function ramp(v: number, lo: number, hi: number): number {
  const x = (v - lo) / (hi - lo);
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function binaryInsert(sorted: number[], val: number): void {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] ?? 0) < val) lo = mid + 1;
    else hi = mid;
  }
  sorted.splice(lo, 0, val);
}

function binaryRemove(sorted: number[], val: number): void {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const mv = sorted[mid] ?? 0;
    if (mv === val) {
      sorted.splice(mid, 1);
      return;
    }
    if (mv < val) lo = mid + 1;
    else hi = mid - 1;
  }
}

function movingMedianEdge(values: Float32Array, medW: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const half = Math.floor(medW / 2);
  const sampleAt = (idx: number): number => {
    if (idx < 0) return values[0] ?? 0;
    if (idx >= n) return values[n - 1] ?? 0;
    return values[idx] ?? 0;
  };
  const win: number[] = [];
  for (let j = -half; j <= half; j += 1) binaryInsert(win, sampleAt(j));
  const midIdx = half;
  for (let i = 0; i < n; i += 1) {
    out[i] = win[midIdx] ?? 0;
    if (i + 1 < n) {
      binaryRemove(win, sampleAt(i - half));
      binaryInsert(win, sampleAt(i + half + 1));
    }
  }
  return out;
}

/** Vocal strain curve at 50 Hz matching `marea/wordfx/audiofeat.py:strain_curve`. */
export function computeStrainCurve(
  signal: Float32Array,
  rate: number,
  fromStem = false,
): { curve: Float32Array; rate: number } {
  const n = Math.trunc((signal.length / rate) * STRAIN_CURVE_RATE);
  if (n < 1) return { curve: new Float32Array(0), rate: STRAIN_CURVE_RATE };

  const win = Math.max(16, pyRound((2 * rate) / STRAIN_CURVE_RATE));
  const halfWin = Math.floor(win / 2);
  const hann = hanningWindow(win);
  let hannPow = 0;
  for (const h of hann) hannPow += h * h;
  hannPow /= win;

  const plan = getRfftPlan(win);
  const freqs = rfftfreq(win, 1 / rate);
  const totBins: number[] = [];
  const hfBins: number[] = [];
  const midBins: number[] = [];
  for (let k = 0; k < plan.bins; k += 1) {
    const f = freqs[k] ?? 0;
    if (f >= 50) totBins.push(k);
    if (f >= 2000 && f <= 8000) hfBins.push(k);
    if (f >= 1000 && f <= 6000) midBins.push(k);
  }
  const midCount = midBins.length;

  const rms = new Float32Array(n);
  const hf = new Float32Array(n);
  const flDb = new Float32Array(n);
  const midRatio = new Float32Array(n);
  const frame = new Float32Array(win);
  const power = new Float64Array(plan.bins);

  for (let i = 0; i < n; i += 1) {
    const center = pyRound(((i + 0.5) * rate) / STRAIN_CURVE_RATE);
    const base = center - halfWin;
    let sqSum = 0;
    for (let j = 0; j < win; j += 1) {
      const idx = base + j;
      const sample = idx >= 0 && idx < signal.length ? (signal[idx] ?? 0) : 0;
      const val = sample * (hann[j] ?? 0);
      frame[j] = val;
      sqSum += val * val;
    }
    rms[i] = Math.sqrt(sqSum / win / hannPow);

    rfftSpectrum(frame, power, plan, true);
    let tot = 1e-20;
    for (const k of totBins) tot += power[k] ?? 0;

    let hfSum = 0;
    for (const k of hfBins) hfSum += power[k] ?? 0;
    hf[i] = hfSum / tot;

    let midSum = 0;
    for (const k of midBins) midSum += power[k] ?? 0;
    midRatio[i] = midSum / tot;

    const mean = midSum / Math.max(1, midCount) + 1e-30;
    const floorTerm = (1e-8 * tot) / Math.max(1, midCount);
    let logSum = 0;
    for (const k of midBins) {
      logSum += Math.log((power[k] ?? 0) + floorTerm);
    }
    const geo = Math.exp(logSum / Math.max(1, midCount));
    flDb[i] = 10 * Math.log10(geo / mean + 1e-12);
  }

  const ref = Math.max(percentile(rms, 95), 1e-9);
  const medW = Math.max(3, Math.trunc(MEDIAN_S * STRAIN_CURVE_RATE) | 1);
  const med = movingMedianEdge(rms, medW);

  const cal = fromStem
    ? { hfLo: 0.04, hfHi: 0.3, flatLo: -24, flatHi: -9, peakLo: 3, peakHi: 9 }
    : { hfLo: 0.08, hfHi: 0.35, flatLo: -16, flatHi: -7, peakLo: 4, peakHi: 11 };

  const rawScore = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = rms[i] ?? 0;
    const relDb = 20 * Math.log10(Math.max(r, 1e-12) / ref);
    const gate = ramp(relDb, -45, -30);
    const peakDb = 20 * Math.log10(Math.max(r, 1e-12) / Math.max(med[i] ?? 0, 0.03 * ref));
    const roughGate = ramp(midRatio[i] ?? 0, 0, 0.03);
    const s =
      (0.4 * ramp(hf[i] ?? 0, cal.hfLo, cal.hfHi) +
        0.3 * ramp(flDb[i] ?? 0, cal.flatLo, cal.flatHi) * roughGate +
        0.3 * ramp(peakDb, cal.peakLo, cal.peakHi)) *
      gate;
    rawScore[i] = s;
  }

  const smoothed = smoothEdge(rawScore, pyRound(SMOOTH_S * STRAIN_CURVE_RATE));
  for (let i = 0; i < smoothed.length; i += 1) {
    const v = smoothed[i] ?? 0;
    smoothed[i] = v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
  return { curve: smoothed, rate: STRAIN_CURVE_RATE };
}

export function spectralBrightness(mono: Float32Array, rate: number): number {
  const n = 4096;
  const x =
    mono.length < n
      ? (() => {
          const padded = new Float32Array(n);
          padded.set(mono);
          return padded;
        })()
      : mono;

  const plan = getRfftPlan(n);
  const hann = hanningWindow(n);
  const freqs = rfftfreq(n, 1 / rate);
  const sumPower = new Float64Array(plan.bins);
  const frame = new Float32Array(n);
  const spec = new Float64Array(plan.bins);
  const maxStart = x.length - n;

  for (let i = 0; i < 48; i += 1) {
    const start = Math.trunc((i * maxStart) / 47);
    for (let j = 0; j < n; j += 1) {
      frame[j] = (x[start + j] ?? 0) * (hann[j] ?? 0);
    }
    rfftSpectrum(frame, spec, plan, true);
    for (let k = 0; k < plan.bins; k += 1) {
      sumPower[k] = (sumPower[k] ?? 0) + (spec[k] ?? 0);
    }
  }

  let tot = 0;
  let weighted = 0;
  for (let k = 0; k < plan.bins; k += 1) {
    const f = freqs[k] ?? 0;
    if (f < 20) continue;
    const p = sumPower[k] ?? 0;
    tot += p;
    weighted += f * p;
  }
  if (tot < 1e-12) return 0.5;
  const centroid = weighted / tot;
  const val = Math.log(Math.max(centroid, 1) / 300) / Math.log(4000 / 300);
  return val <= 0 ? 0 : val >= 1 ? 1 : val;
}

function pearsonCorr(a: Float64Array, prof: readonly number[], shift: number): number {
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < 12; i += 1) {
    meanA += a[i] ?? 0;
    meanB += prof[(i - shift + 12) % 12] ?? 0;
  }
  meanA /= 12;
  meanB /= 12;
  let num = 0;
  let da2 = 0;
  let db2 = 0;
  for (let i = 0; i < 12; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (prof[(i - shift + 12) % 12] ?? 0) - meanB;
    num += da * db;
    da2 += da * da;
    db2 += db * db;
  }
  const denom = Math.sqrt(da2 * db2);
  return denom > 0 ? num / denom : 0;
}

export function keyAndMode(mono: Float32Array, rate: number): { key: number; mode: number } {
  const mid = Math.floor(mono.length / 2);
  const span = 60 * rate;
  const sliceStart = Math.max(0, mid - Math.floor(span / 2));
  const sliceEnd = Math.min(mono.length, mid + Math.floor(span / 2));
  const dec = decimate(mono.subarray(sliceStart, sliceEnd), rate);
  const x = dec.mono;
  const r = dec.rate;
  const n = 8192;
  const hop = 4096;
  if (x.length < n) return { key: -1, mode: 0 };

  const plan = getRfftPlan(n);
  const hann = hanningWindow(n);
  const freqs = rfftfreq(n, 1 / r);
  let lo = 0;
  while (lo < freqs.length && (freqs[lo] ?? 0) < 110) lo += 1;
  let hi = 0;
  while (hi < freqs.length && (freqs[hi] ?? 0) < 2000) hi += 1;

  const chroma = new Float64Array(12);
  const frame = new Float32Array(n);
  const mag = new Float64Array(plan.bins);

  for (let start = 0; start <= x.length - n; start += hop) {
    for (let j = 0; j < n; j += 1) {
      frame[j] = (x[start + j] ?? 0) * (hann[j] ?? 0);
    }
    rfftSpectrum(frame, mag, plan, false);
    const mStart = lo - 1;
    const mEnd = hi + 1;
    let mMax = 0;
    for (let idx = mStart; idx < mEnd; idx += 1) {
      const mv = mag[idx] ?? 0;
      if (mv > mMax) mMax = mv;
    }
    const peakThresh = 0.05 * mMax + 1e-12;

    for (let k = mStart + 1; k < mEnd - 1; k += 1) {
      const y1 = mag[k] ?? 0;
      const y0 = mag[k - 1] ?? 0;
      const y2 = mag[k + 1] ?? 0;
      if (y1 > y0 && y1 >= y2 && y1 > peakThresh) {
        const denom = Math.max(y0 - 2 * y1 + y2, -1e-12);
        const dRaw = (0.5 * (y0 - y2)) / denom;
        const d = dRaw <= -0.5 ? -0.5 : dRaw >= 0.5 ? 0.5 : dRaw;
        const freq = (k + d) * (r / n);
        const pc = ((pyRound(12 * Math.log2(freq / 440) + 69) % 12) + 12) % 12;
        chroma[pc] = (chroma[pc] ?? 0) + Math.sqrt(y1);
      }
    }
  }

  let cSum = 0;
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const v of chroma) {
    cSum += v;
    if (v < cMin) cMin = v;
    if (v > cMax) cMax = v;
  }
  if (cSum < 1e-9 || cMax - cMin < 1e-9) return { key: -1, mode: 0 };

  let bestMajKey = 0;
  let bestMajCorr = -Infinity;
  let bestMinKey = 0;
  let bestMinCorr = -Infinity;
  for (let shift = 0; shift < 12; shift += 1) {
    const cmaj = pearsonCorr(chroma, KS_MAJOR, shift);
    if (cmaj > bestMajCorr) {
      bestMajCorr = cmaj;
      bestMajKey = shift;
    }
    const cmin = pearsonCorr(chroma, KS_MINOR, shift);
    if (cmin > bestMinCorr) {
      bestMinCorr = cmin;
      bestMinKey = shift;
    }
  }

  if (Math.max(bestMajCorr, bestMinCorr) < 0.3) return { key: -1, mode: 0 };
  const rawMode = (bestMajCorr - bestMinCorr) / 0.25;
  const clampedMode = rawMode <= -1 ? -1 : rawMode >= 1 ? 1 : rawMode;
  return {
    key: bestMajCorr >= bestMinCorr ? bestMajKey : bestMinKey,
    mode: clampedMode,
  };
}

function globalStrain(curve: Float32Array): number {
  if (curve.length === 0) return 0;
  const sorted = Float32Array.from(curve).sort();
  const k = Math.max(1, Math.floor(sorted.length / 4));
  let sum = 0;
  for (let i = sorted.length - k; i < sorted.length; i += 1) {
    sum += sorted[i] ?? 0;
  }
  return sum / k;
}

/** Computes `AudioStats` matching desktop `marea/wordfx/audiofeat.py:analyze`. */
export function analyzeAudioStats(
  samples: DecodedAudio | Float32Array,
  rate: number,
  precomputed?: AudioAnalysis,
): AudioStats {
  const analysis = precomputed ?? analyzeAudio(samples, rate);
  const mono = toMono(samples);

  let energy = 0.5;
  if (analysis.rms.length > 0) {
    let sum = 0;
    for (const v of analysis.rms) sum += v <= 0 ? 0 : v >= 1 ? 1 : v;
    energy = sum / analysis.rms.length;
  }

  const { key, mode } = keyAndMode(mono, rate);
  const dec = decimate(mono, rate);
  const { curve, rate: strainRate } = computeStrainCurve(dec.mono, dec.rate, false);

  return {
    durationMs: (mono.length / Math.max(1, rate)) * 1000,
    tempoBpm: analysis.tempoBpm || 0,
    energy,
    brightness: spectralBrightness(mono, rate),
    mode,
    key,
    strain: globalStrain(curve),
    strainCurve: curve,
    strainRate,
    fromStem: false,
  };
}
