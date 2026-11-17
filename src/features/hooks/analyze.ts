import bundledWeightsJson from '@/assets/hooks/weights.json';
import { lineText, type Lyrics } from '@/engine/lyrics';
import type { AudioAnalysis } from '@/features/audio/analysis';
import { SequenceMatcher } from '@/shared/difflib';
import { percentile } from '@/shared/fft';
import { median, pyRound } from '@/shared/pycompat';

export const WEIGHT_SPEC = {
  repetition: [0, 10, 3.0],
  title: [0, 10, 1.5],
  energy: [0, 10, 2.0],
  onset: [0, 10, 1.0],
  section_entry: [0, 10, 1.0],
  wordfx: [0, 10, 0.5],
  chorus_section: [0, 10, 3.0],
  duration_fit: [0, 10, 1.0],
  penalty_intro_outro: [0, 10, 1.5],
  penalty_mid_phrase: [0, 10, 1.0],
  tol_low: [0.3, 1.0, 0.75],
  tol_high: [1.0, 1.5, 1.05],
  preroll_ms: [0, 1500, 400],
  similarity: [0.5, 1.0, 0.85],
  max_overlap: [0.1, 1.0, 0.5],
  top_n: [1, 20, 5],
} as const satisfies Record<string, readonly [number, number, number]>;

export type HookWeightsKey = keyof typeof WEIGHT_SPEC;
export type HookWeights = Record<HookWeightsKey, number>;

export const MIN_NORM_CHARS = 6;
export const SAT_REPEATS = 3.0;
export const PHRASE_GAP_MS = 300;

export type HookConfidence = 'high' | 'medium' | 'low';

export type HookReason =
  | { readonly kind: 'chorusRepeat'; readonly count: number }
  | { readonly kind: 'lineRepeat'; readonly count: number }
  | { readonly kind: 'mentionsTitle' }
  | { readonly kind: 'vocalPeak'; readonly timeLabel: string }
  | { readonly kind: 'energyEntry' }
  | { readonly kind: 'goodDuration' };

export interface HookSuggestion {
  readonly first: number;
  readonly last: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly targetS: number;
  readonly score: number;
  readonly breakdown: Readonly<Record<string, number>>;
  readonly reasons: readonly HookReason[];
  readonly explanation: string;
  readonly confidence: 'alta' | 'media' | 'baja';
  readonly confidenceLevel: HookConfidence;
}

export function loadHookWeights(overrides?: Record<string, unknown>): HookWeights {
  const out = {} as HookWeights;
  for (const [k, spec] of Object.entries(WEIGHT_SPEC) as [
    HookWeightsKey,
    readonly [number, number, number],
  ][]) {
    out[k] = spec[2];
  }
  const apply = (raw: unknown): void => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    for (const [k, v] of Object.entries(raw)) {
      if (!(k in WEIGHT_SPEC)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const spec = WEIGHT_SPEC[k as HookWeightsKey];
      out[k as HookWeightsKey] = Math.min(spec[1], Math.max(spec[0], v));
    }
  };
  apply(bundledWeightsJson);
  apply(overrides);
  return out;
}

export function normalizeHookText(text: string): string {
  const noAdlibs = text.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const stripped = noAdlibs.normalize('NFKD').replace(/\p{M}/gu, '');
  return stripped
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarLines(a: string, b: string, thr: number): boolean {
  if (a.length < MIN_NORM_CHARS || b.length < MIN_NORM_CHARS) return false;
  if (a === b) return true;
  const sm = new SequenceMatcher(a, b);
  return sm.realQuickRatio() >= thr && sm.quickRatio() >= thr && sm.ratio() >= thr;
}

export function repetitionMaps(
  norms: readonly string[],
  thr: number,
): { block: Set<number>[]; single: Set<number>[] } {
  const n = norms.length;
  const sim: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const ok = similarLines(norms[i] ?? '', norms[j] ?? '', thr);
      const rowI = sim[i];
      const rowJ = sim[j];
      if (rowI) rowI[j] = ok;
      if (rowJ) rowJ[i] = ok;
    }
  }

  const run: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      const rRow = run[i];
      if (rRow) {
        rRow[j] = i !== j && (sim[i]?.[j] ?? false) ? (run[i + 1]?.[j + 1] ?? 0) + 1 : 0;
      }
    }
  }

  const block: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const r = run[i]?.[j] ?? 0;
      if (r >= 2 && !(i > 0 && j > 0 && (run[i - 1]?.[j - 1] ?? 0) > 0)) {
        for (let k = 0; k < r; k += 1) {
          block[i + k]?.add(j + k);
          block[j + k]?.add(i + k);
        }
      }
    }
  }
  const single: Set<number>[] = Array.from({ length: n }, (_, i) => {
    const s = new Set<number>();
    for (let j = 0; j < n; j += 1) {
      if (j !== i && (sim[i]?.[j] ?? false)) s.add(j);
    }
    return s;
  });
  return { block, single };
}

function formatTs(ms: number): string {
  const s = Math.trunc(Math.max(0, ms) / 1000);
  return `${String(Math.trunc(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

function roundDec(x: number, digits: number): number {
  const f = 10 ** digits;
  return pyRound(x * f) / f;
}

function prefixSum(arr: ArrayLike<number>): Float64Array {
  const out = new Float64Array(arr.length + 1);
  let acc = 0;
  for (let i = 0; i < arr.length; i += 1) {
    acc += arr[i] ?? 0;
    out[i + 1] = acc;
  }
  return out;
}

function buildCandidates(
  starts: readonly number[],
  ends: readonly number[],
  pre: number,
  outro: number,
  targetMs: number,
  lo: number,
  hi: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = starts.length;
  for (let a = 0; a < n; a += 1) {
    const t0 = Math.max(0.0, (starts[a] ?? 0) - pre);
    for (let b = a; b < n; b += 1) {
      const dur = (ends[b] ?? 0) + outro - t0;
      if (dur > hi * targetMs) break;
      if (dur >= lo * targetMs) out.push([a, b, dur]);
    }
  }
  return out;
}

function rangeOverlap(a: HookSuggestion, b: HookSuggestion): number {
  const inter = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  return Math.max(0.0, inter) / Math.max(1.0, Math.min(a.durationMs, b.durationMs));
}

function explainRange(
  block: readonly Set<number>[],
  single: readonly Set<number>[],
  a: number,
  b: number,
  ttl: number,
  energy: number,
  entry: number,
  peakMs: number,
  hasAudio: boolean,
): { reasons: HookReason[]; explanation: string } {
  const reasons: HookReason[] = [];
  const bits: string[] = [];
  const hits: number[] = [];
  for (let k = a; k <= b; k += 1) {
    const size = block[k]?.size ?? 0;
    if (size > 0) hits.push(size);
  }
  if (hits.length > 0) {
    const count = 1 + Math.trunc(median(hits));
    reasons.push({ kind: 'chorusRepeat', count });
    bits.push(`coro repetido ${String(count)}×`);
  } else {
    const sh: number[] = [];
    for (let k = a; k <= b; k += 1) {
      const size = single[k]?.size ?? 0;
      if (size > 0) sh.push(size);
    }
    if (sh.length > 0) {
      const count = 1 + Math.max(...sh);
      reasons.push({ kind: 'lineRepeat', count });
      bits.push(`verso que se repite ${String(count)}×`);
    }
  }
  if (ttl > 0) {
    reasons.push({ kind: 'mentionsTitle' });
    bits.push('menciona el título');
  }
  if (hasAudio && energy >= 0.8) {
    const timeLabel = formatTs(peakMs);
    reasons.push({ kind: 'vocalPeak', timeLabel });
    bits.push(`pico vocal en ${timeLabel}`);
  }
  if (hasAudio && entry >= 0.6) {
    reasons.push({ kind: 'energyEntry' });
    bits.push('entra con subida de energía');
  }
  if (reasons.length === 0) {
    reasons.push({ kind: 'goodDuration' });
    bits.push('tramo completo con buena duración');
  }
  return { reasons, explanation: bits.join(', ') };
}

export interface SuggestHooksOpts {
  readonly title?: string;
  readonly targetsS?: readonly number[];
  readonly analysis?: AudioAnalysis | null;
  readonly audioOffsetMs?: number;
  readonly fxCounts?: readonly number[] | null;
  readonly weights?: Partial<HookWeights> | null;
  readonly outroMs?: number;
}

export function suggestHooks(
  lyrics: Lyrics,
  opts: SuggestHooksOpts = {},
): Map<number, HookSuggestion[]> {
  const targetsS = opts.targetsS ?? [15, 30, 60];
  const baseWeights = loadHookWeights();
  const w: HookWeights = opts.weights ? { ...baseWeights, ...opts.weights } : baseWeights;
  const lines = lyrics.lines;
  const n = lines.length;
  const results = new Map<number, HookSuggestion[]>();
  if (n === 0) {
    for (const target of targetsS) results.set(target, []);
    return results;
  }

  const rawTexts = lines.map((l) => lineText(l));
  const norms = rawTexts.map((t) => normalizeHookText(t));
  const { block, single } = repetitionMaps(norms, w.similarity);
  const repLine = norms.map((_, k) =>
    Math.min(1.0, Math.max(block[k]?.size ?? 0, 0.5 * (single[k]?.size ?? 0)) / SAT_REPEATS),
  );
  const tnorm = normalizeHookText(opts.title ?? '');
  const hasTitle = norms.map((nl) => (tnorm.length >= 3 && nl.includes(tnorm) ? 1.0 : 0.0));
  const fx = opts.fxCounts?.length === n ? opts.fxCounts.slice() : new Array<number>(n).fill(0);
  const starts = lines.map((l) => l.start);
  const ends = lines.map((l) => l.end);

  const pRep = prefixSum(repLine);
  const pTitle = prefixSum(hasTitle);
  const pFx = prefixSum(fx);

  const analysis = opts.analysis ?? null;
  const audioOffsetMs = opts.audioOffsetMs ?? 0.0;
  const outroMs = opts.outroMs ?? 500.0;
  const hasAudio = analysis !== null && analysis.rms.length > 0;

  let rate = 1;
  let rms = new Float32Array(0);
  let onset = new Float32Array(0);
  let macro = new Float32Array(0);
  let rmsRef = 1;
  let onRef = 1;
  let macRef = 1;
  let pRms = prefixSum([]);
  let pOn = prefixSum([]);

  if (analysis !== null && analysis.rms.length > 0) {
    rate = analysis.rate;
    rms = Float32Array.from(analysis.rms);
    onset = Float32Array.from(analysis.onset);
    macro = Float32Array.from(analysis.macroContrast);
    rmsRef = Math.max(percentile(rms, 90), 1e-6);
    onRef = onset.length > 0 ? Math.max(percentile(onset, 90), 1e-6) : 1.0;
    macRef = macro.length > 0 ? Math.max(percentile(macro, 95), 1e-6) : 1.0;
    pRms = prefixSum(rms);
    pOn = prefixSum(onset);
  }

  const idx = (ms: number, size: number): number =>
    Math.min(Math.max(0, pyRound(((ms + audioOffsetMs) / 1000.0) * rate)), size);

  const audioSignals = (aMs: number, bMs: number): [number, number, number, number] => {
    const i0 = idx(aMs, rms.length);
    const i1 = idx(bMs, rms.length);
    if (i1 <= i0) return [0.0, 0.0, 0.0, aMs];
    const energy = Math.min(1.0, ((pRms[i1] ?? 0) - (pRms[i0] ?? 0)) / (i1 - i0) / rmsRef);
    let peakI = i0;
    let peakVal = rms[i0] ?? -Infinity;
    for (let k = i0 + 1; k < i1; k += 1) {
      const v = rms[k] ?? -Infinity;
      if (v > peakVal) {
        peakVal = v;
        peakI = k;
      }
    }
    const j0 = idx(aMs, onset.length);
    const j1 = idx(bMs, onset.length);
    const dens =
      onset.length > 0
        ? Math.min(1.0, ((pOn[j1] ?? 0) - (pOn[j0] ?? 0)) / Math.max(1, j1 - j0) / onRef)
        : 0.0;
    const m0 = idx(aMs - 1000, macro.length);
    const m1 = idx(aMs + 2000, macro.length);
    let entry = 0.0;
    if (m1 > m0) {
      let maxMac = -Infinity;
      for (let k = m0; k < m1; k += 1) {
        const v = macro[k] ?? -Infinity;
        if (v > maxMac) maxMac = v;
      }
      entry = Math.min(1.0, Math.max(0.0, maxMac) / macRef);
    }
    return [energy, dens, entry, (peakI / rate) * 1000.0 - audioOffsetMs];
  };

  const pre = w.preroll_ms;
  const endPunctRe = /[.!?…]\s*$/;
  for (const target of targetsS) {
    const targetMs = target * 1000.0;
    let cands = buildCandidates(starts, ends, pre, outroMs, targetMs, w.tol_low, w.tol_high);
    if (cands.length === 0) {
      cands = buildCandidates(starts, ends, pre, outroMs, targetMs, 0.0, 1.6 * w.tol_high);
    }
    const scored: HookSuggestion[] = [];
    for (const [a, b, dur] of cands) {
      const cnt = b - a + 1;
      const startA = starts[a] ?? 0;
      const endB = ends[b] ?? 0;
      const rep = ((pRep[b + 1] ?? 0) - (pRep[a] ?? 0)) / cnt;
      const ttl = Math.min(1.0, ((pTitle[b + 1] ?? 0) - (pTitle[a] ?? 0)) / 2.0);
      const fxd = Math.min(1.0, ((pFx[b + 1] ?? 0) - (pFx[a] ?? 0)) / cnt / 2.0);
      const fit = Math.max(0.0, 1.0 - Math.abs(dur - 0.97 * targetMs) / (0.3 * targetMs));
      const sA = startA - pre;
      const sB = endB + outroMs;
      let energy = 0.0;
      let dens = 0.0;
      let entry = 0.0;
      let peakMs = startA;
      if (hasAudio) {
        [energy, dens, entry, peakMs] = audioSignals(startA, endB);
      }
      const intro = a === 0 ? 1.0 : a === 1 ? 0.5 : 0.0;
      const outro = b >= n - 1 ? 1.0 : b === n - 2 ? 0.5 : 0.0;
      let mid = 0.0;
      if (
        a > 0 &&
        startA - (ends[a - 1] ?? 0) < PHRASE_GAP_MS &&
        !endPunctRe.test(rawTexts[a - 1] ?? '')
      ) {
        mid += 1.0;
      }
      if (
        b < n - 1 &&
        (starts[b + 1] ?? 0) - endB < PHRASE_GAP_MS &&
        !endPunctRe.test(rawTexts[b] ?? '')
      ) {
        mid += 0.5;
      }

      const parts: Record<string, number> = {
        repetition: rep,
        title: ttl,
        wordfx: fxd,
        duration_fit: fit,
      };
      if (hasAudio) {
        parts.energy = energy;
        parts.onset = dens;
        parts.section_entry = entry;
      }
      let pos = 0.0;
      let denom = 0.0;
      for (const [k, v] of Object.entries(parts)) {
        const wk = w[k as HookWeightsKey];
        pos += wk * v;
        denom += wk;
      }
      const neg =
        w.penalty_intro_outro * ((intro + outro) / 2.0) + w.penalty_mid_phrase * Math.min(1.0, mid);
      const score = Math.max(0.0, (100.0 * (pos - neg)) / (denom || 1.0));
      const conf = 0.35 + 0.35 * (hasAudio ? 1 : 0) + 0.3 * Math.min(1.0, rep * 2);
      const breakdown: Record<string, number> = {};
      for (const [k, v] of Object.entries(parts)) breakdown[k] = roundDec(v, 3);
      breakdown.penalty_intro_outro = roundDec((intro + outro) / 2, 3);
      breakdown.penalty_mid_phrase = roundDec(Math.min(1.0, mid), 3);
      breakdown.confidence = roundDec(conf, 2);

      const startMs = Math.max(0.0, sA);
      const { reasons, explanation } = explainRange(
        block,
        single,
        a,
        b,
        ttl,
        energy,
        entry,
        peakMs,
        hasAudio,
      );
      const confidence = conf >= 0.8 ? 'alta' : conf >= 0.55 ? 'media' : 'baja';
      const confidenceLevel: HookConfidence =
        conf >= 0.8 ? 'high' : conf >= 0.55 ? 'medium' : 'low';
      scored.push({
        first: a,
        last: b,
        startMs,
        endMs: sB,
        durationMs: sB - startMs,
        targetS: target,
        score: roundDec(score, 2),
        breakdown,
        reasons,
        explanation,
        confidence,
        confidenceLevel,
      });
    }

    scored.sort((x, y) => y.score - x.score || x.first - y.first || x.last - y.last);
    const chosen: HookSuggestion[] = [];
    for (const s of scored) {
      if (chosen.every((c) => rangeOverlap(s, c) <= w.max_overlap)) {
        chosen.push(s);
        if (chosen.length >= Math.trunc(w.top_n)) break;
      }
    }
    results.set(target, chosen);
  }
  return results;
}
