import type { DecodedAudio } from './local';
import { hanningWindow, getRfftPlan, percentile, rfftSpectrum } from '@/shared/fft';
import { median, pyRound } from '@/shared/pycompat';

export interface AudioAnalysis {
  readonly rate: number;
  readonly durationMs: number;
  readonly rms: Float32Array;
  readonly onset: Float32Array;
  readonly contrast: Float32Array;
  readonly pausesMs: readonly (readonly [number, number])[];
  readonly accentsMs: readonly (readonly [number, number])[];
  readonly macroContrast: Float32Array;
  readonly tempoBpm: number;
  readonly beatPeriodMs: number;
  readonly beatsMs: readonly number[];
}

const ENV_FRAME = 1024;
const BAND_LO_HZ = 200;
const BAND_HI_HZ = 4000;

export function toMono(samples: DecodedAudio | Float32Array): Float32Array {
  if (samples instanceof Float32Array) return samples;
  const { left, right } = samples;
  const n = Math.min(left.length, right.length);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
  }
  return mono;
}

/** Voice-band spectral flux envelope matching `marea/audio/align.py:onset_envelope`. */
export function onsetEnvelope(
  mono: Float32Array,
  rate: number,
): { flux: Float32Array; rate: number } {
  const hop = Math.max(1, pyRound(rate / 100));
  const envRate = rate / hop;
  const n = 1 + Math.floor((mono.length - ENV_FRAME) / hop);
  if (n < 2) return { flux: new Float32Array(0), rate: envRate };

  const win = hanningWindow(ENV_FRAME);
  const k0 = Math.trunc((BAND_LO_HZ * ENV_FRAME) / rate);
  const k1 = Math.trunc((BAND_HI_HZ * ENV_FRAME) / rate) + 1;
  const plan = getRfftPlan(ENV_FRAME);
  const frame = new Float32Array(ENV_FRAME);
  const mag = new Float64Array(plan.bins);
  const prevLog = new Float32Array(Math.max(0, k1 - k0));
  const flux = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const start = i * hop;
    for (let c = 0; c < ENV_FRAME; c += 1) {
      frame[c] = (mono[start + c] ?? 0) * (win[c] ?? 0);
    }
    rfftSpectrum(frame, mag, plan, false);
    let sum = 0;
    for (let k = k0; k < k1; k += 1) {
      const m = mag[k] ?? 0;
      const logv = Math.fround(Math.log1p(30 * m));
      const idx = k - k0;
      const diff = i === 0 ? 0 : logv - (prevLog[idx] ?? 0);
      if (diff > 0) sum += diff;
      prevLog[idx] = logv;
    }
    flux[i] = i === 0 ? 0 : sum;
  }
  return { flux, rate: envRate };
}

function movingMean(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  if (n === 0 || w <= 1) return new Float32Array(x);
  const width = Math.min(w, n);
  const csum = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    csum[i + 1] = (csum[i] ?? 0) + (x[i] ?? 0);
  }
  const coreLen = n - width + 1;
  const core = new Float32Array(coreLen);
  for (let i = 0; i < coreLen; i += 1) {
    core[i] = ((csum[i + width] ?? 0) - (csum[i] ?? 0)) / width;
  }
  const out = new Float32Array(n);
  const padL = Math.floor(width / 2);
  const firstVal = core[0] ?? 0;
  const lastVal = core[coreLen - 1] ?? 0;
  out.fill(firstVal, 0, padL);
  out.set(core, padL);
  out.fill(lastVal, padL + coreLen, n);
  return out;
}

function sectionContrast(smoothRms: Float32Array, envRate: number, windowS: number): Float32Array {
  const n = smoothRms.length;
  const w = Math.max(windowS < 2 ? 5 : 9, pyRound(windowS * envRate));
  const meanSec = movingMean(smoothRms, w);
  const half = Math.floor(w / 2);
  const out = new Float32Array(n);
  if (half >= n || n === 0) return out;

  const first = meanSec[0] ?? 0;
  const last = meanSec[n - 1] ?? 0;
  for (let i = 0; i < n; i += 1) {
    const past = i < half ? first : (meanSec[i - half] ?? 0);
    const fut = i + half < n ? (meanSec[i + half] ?? 0) : last;
    out[i] = fut - past;
  }
  return out;
}

function findPauses(smoothRms: Float32Array, envRate: number): [number, number][] {
  const n = smoothRms.length;
  const active: number[] = [];
  for (const v of smoothRms) {
    if (v > 0.05) active.push(v);
  }
  const medRms = active.length > 0 ? median(active) : 0;
  if (medRms <= 0.05) return [];

  const thresh = 0.38 * medRms;
  const minBins = Math.max(4, pyRound(0.8 * envRate));
  const pauses: [number, number][] = [];
  let i = 0;
  while (i < n) {
    if ((smoothRms[i] ?? 0) >= thresh) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && (smoothRms[j] ?? 0) < thresh) j += 1;
    if (j - i >= minBins) {
      pauses.push([(i / envRate) * 1000, (j / envRate) * 1000]);
    }
    i = j;
  }
  return pauses;
}

function findAccents(novelty: Float32Array, envRate: number): [number, number][] {
  const n = novelty.length;
  const accents: [number, number][] = [];
  const minSep = Math.max(3, pyRound(0.5 * envRate));
  const novThr = n > 0 ? Math.max(0.18, percentile(novelty, 86)) : 1;
  let lastIdx = -minSep;
  for (let idx = 1; idx < n - 1; idx += 1) {
    const v = novelty[idx] ?? 0;
    if (v >= novThr && v >= (novelty[idx - 1] ?? 0) && v >= (novelty[idx + 1] ?? 0)) {
      if (idx - lastIdx >= minSep) {
        accents.push([(idx / envRate) * 1000, v]);
        lastIdx = idx;
      } else if (accents.length > 0) {
        const tail = accents[accents.length - 1];
        if (tail && v > tail[1]) {
          accents[accents.length - 1] = [(idx / envRate) * 1000, v];
          lastIdx = idx;
        }
      }
    }
  }
  return accents;
}

function estimateTempoAndBeats(
  novelty: Float32Array,
  envRate: number,
): { tempoBpm: number; beatPeriodMs: number; beatsMs: number[] } {
  const n = novelty.length;
  let maxNov = 0;
  for (const v of novelty) {
    if (v > maxNov) maxNov = v;
  }
  if (n < pyRound(2.2 * envRate) || maxNov < 0.14) {
    return { tempoBpm: 110, beatPeriodMs: 545.5, beatsMs: [] };
  }

  const maxBins = pyRound(90 * envRate);
  const start = n > maxBins ? Math.floor((n - maxBins) / 2) : 0;
  const segLen = n > maxBins ? maxBins : n;
  let mean = 0;
  for (let i = 0; i < segLen; i += 1) mean += novelty[start + i] ?? 0;
  mean /= segLen;

  const centered = new Float32Array(segLen);
  let energy = 0;
  for (let i = 0; i < segLen; i += 1) {
    const c = (novelty[start + i] ?? 0) - mean;
    centered[i] = c;
    energy += c * c;
  }
  if (energy <= 1e-6) {
    return { tempoBpm: 110, beatPeriodMs: 545.5, beatsMs: [] };
  }

  const lagLo = Math.max(4, pyRound((envRate * 60) / 185));
  const lagHi = Math.min(Math.floor(segLen / 2), pyRound((envRate * 60) / 62));
  let bestLag = Math.max(lagLo, pyRound((envRate * 60) / 110));
  let bestScore = -1e9;
  for (let lag = lagLo; lag <= lagHi; lag += 1) {
    let dot = 0;
    const count = segLen - lag;
    for (let i = 0; i < count; i += 1) {
      dot += (centered[i] ?? 0) * (centered[i + lag] ?? 0);
    }
    const ac = dot / Math.max(1, count);
    const bpm = (60 * envRate) / lag;
    const prior = Math.exp(-0.5 * ((bpm - 114) / 58) ** 2);
    const score = ac * (0.65 + 0.35 * prior);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const beatPeriodMs = (bestLag / envRate) * 1000;
  const tempoBpm = 60_000 / Math.max(1, beatPeriodMs);
  const minBeatSep = Math.max(3, pyRound(0.62 * bestLag));
  const beatThr = Math.max(0.11, percentile(novelty, 74));
  const beatsMs: number[] = [];
  let lastB = -minBeatSep;
  for (let idx = 1; idx < n - 1; idx += 1) {
    const v = novelty[idx] ?? 0;
    if (v >= beatThr && v >= (novelty[idx - 1] ?? 0) && v >= (novelty[idx + 1] ?? 0)) {
      if (idx - lastB >= minBeatSep) {
        beatsMs.push((idx / envRate) * 1000);
        lastB = idx;
      } else if (beatsMs.length > 0 && v > (novelty[lastB] ?? 0)) {
        beatsMs[beatsMs.length - 1] = (idx / envRate) * 1000;
        lastB = idx;
      }
    }
  }
  return {
    tempoBpm: Math.round(tempoBpm * 100) / 100,
    beatPeriodMs: Math.round(beatPeriodMs * 100) / 100,
    beatsMs,
  };
}

/** Computes cached acoustic curves matching desktop `marea/audio/analysis.py:analyze_audio`. */
export function analyzeAudio(
  samples: DecodedAudio | Float32Array,
  sampleRate = 48_000,
): AudioAnalysis {
  const mono = toMono(samples);
  const durationMs = (mono.length / Math.max(1, sampleRate)) * 1000;
  const hop = Math.max(1, pyRound(sampleRate / 100));
  const baseRate = sampleRate / hop;

  if (mono.length < hop * 4) {
    const empty = new Float32Array(0);
    return {
      rate: baseRate,
      durationMs,
      rms: empty,
      onset: empty,
      contrast: empty,
      pausesMs: [],
      accentsMs: [],
      macroContrast: empty,
      tempoBpm: 110,
      beatPeriodMs: 545.5,
      beatsMs: [],
    };
  }

  const win = 2 * hop;
  const nRms = 1 + Math.max(0, Math.floor((mono.length - win) / hop));
  const csum = new Float64Array(mono.length + 1);
  for (let i = 0; i < mono.length; i += 1) {
    const v = mono[i] ?? 0;
    csum[i + 1] = (csum[i] ?? 0) + v * v;
  }
  const rmsFull = new Float32Array(nRms);
  for (let i = 0; i < nRms; i += 1) {
    const s = i * hop;
    rmsFull[i] = Math.sqrt(Math.max(0, ((csum[s + win] ?? 0) - (csum[s] ?? 0)) / win));
  }

  const env = onsetEnvelope(mono, sampleRate);
  const n = env.flux.length > 0 ? Math.min(rmsFull.length, env.flux.length) : rmsFull.length;
  const rms = rmsFull.subarray(0, n);
  const onset = env.flux.length > 0 ? env.flux.subarray(0, n) : new Float32Array(n);
  const envRate = env.flux.length > 0 ? env.rate : baseRate;

  const p95Rms = n > 0 ? percentile(rms, 95) : 0;
  const rmsNorm = new Float32Array(n);
  if (p95Rms > 1e-6) {
    const denom = Math.max(p95Rms, 1e-6);
    for (let i = 0; i < n; i += 1) rmsNorm[i] = (rms[i] ?? 0) / denom;
  }
  const rmsSpan = n > 0 ? percentile(rmsNorm, 98) - percentile(rmsNorm, 5) : 0;
  const p95On = n > 0 ? percentile(onset, 95) : 0;
  const onSpan = n > 0 ? percentile(onset, 99) - percentile(onset, 50) : 0;
  const hasAttacks = rmsSpan >= 0.05 && p95On > 0.05 && onSpan > 0.15;
  const onsetNorm = new Float32Array(n);
  if (hasAttacks) {
    const denom = Math.max(p95On, 0.25);
    for (let i = 0; i < n; i += 1) onsetNorm[i] = (onset[i] ?? 0) / denom;
  }

  const smoothRms = movingMean(rmsNorm, Math.max(3, pyRound(0.35 * envRate)));
  const contrast = sectionContrast(smoothRms, envRate, 1.6);
  const macroContrast = sectionContrast(smoothRms, envRate, 4.5);
  const pausesMs = findPauses(smoothRms, envRate);

  const localOn = movingMean(onsetNorm, Math.max(3, pyRound(0.6 * envRate)));
  const novelty = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const cur = smoothRms[i] ?? 0;
    const prev = i === 0 ? cur : (smoothRms[i - 1] ?? 0);
    const dRms = Math.max(0, cur - prev) * 4;
    const onDiff = Math.max(0, (onsetNorm[i] ?? 0) - 1.1 * (localOn[i] ?? 0));
    novelty[i] = onDiff * 0.7 + dRms * 0.3;
  }
  const accentsMs = findAccents(novelty, envRate);
  const tempo = estimateTempoAndBeats(novelty, envRate);

  return {
    rate: envRate,
    durationMs,
    rms: smoothRms,
    onset: onsetNorm,
    contrast,
    pausesMs,
    accentsMs,
    macroContrast,
    tempoBpm: tempo.tempoBpm,
    beatPeriodMs: tempo.beatPeriodMs,
    beatsMs: tempo.beatsMs,
  };
}
