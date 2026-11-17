import type { Lyrics } from '@/engine/lyrics';
import { FX_AXES, type AudioStats } from '@/engine/wordfx/fxtypes';
import { pyRound } from '@/shared/pycompat';
import { blendCategories } from './composer';
import type { WordFxLibrary } from './library';
import { matchLyrics } from './matcher';
import type { WordFxRules } from './rules';

export const TAGS = [
  'sad',
  'nostalgic',
  'longing',
  'anguished',
  'tender',
  'hopeful',
  'joyful',
  'euphoric',
  'bittersweet',
  'tribute',
  'healing',
  'numb',
  'raw_vocals',
  'calm',
] as const;

export const MOOD_VECTORS: Readonly<Record<string, readonly number[]>> = {
  sad: [-0.6, 0.3, 0.6, -0.5, 0.5, 0.3],
  nostalgic: [-0.1, 0.25, 0.25, 0.4, 0.55, 0.5],
  longing: [-0.4, 0.35, 0.15, -0.1, 0.5, 0.4],
  anguished: [-0.7, 0.85, 0.3, 0.2, 0.6, 0.2],
  tender: [0.55, 0.25, -0.1, 0.45, 0.5, 0.25],
  hopeful: [0.6, 0.45, -0.4, 0.3, 0.35, 0.2],
  joyful: [0.7, 0.6, -0.5, 0.5, 0.3, 0.2],
  euphoric: [0.9, 0.9, -0.7, 0.6, 0.2, 0.1],
  bittersweet: [0.0, 0.35, 0.1, 0.2, 0.55, 0.35],
  healing: [0.6, 0.3, -0.2, 0.15, 0.4, 0.3],
  numb: [-0.3, 0.05, 0.2, -0.3, 0.3, 0.2],
  calm: [0.4, 0.1, -0.1, -0.05, 0.3, 0.4],
};

const CATEGORY_MOODS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  sadness: { sad: 1.0 },
  loss: { sad: 0.6, longing: 0.6 },
  longing: { longing: 1.0 },
  memory: { nostalgic: 1.0 },
  anguish: { anguished: 1.0 },
  fear: { anguished: 0.8 },
  anger: { anguished: 0.5 },
  numbness: { numb: 1.0 },
  tenderness: { tender: 1.0 },
  love: { tender: 0.6, joyful: 0.3 },
  joy: { joyful: 1.0 },
  healing: { healing: 0.7, hopeful: 0.6 },
  growth: { hopeful: 0.7, joyful: 0.3 },
  calm: { calm: 1.0 },
  time: { nostalgic: 0.15 },
  celestial: { hopeful: 0.15 },
  air: { hopeful: 0.15 },
  cloud: { nostalgic: 0.2 },
  photo: { nostalgic: 0.5 },
  water: { sad: 0.2 },
  dream: { nostalgic: 0.25 },
  shadow: { sad: 0.2 },
  dryness: { sad: 0.2 },
  craft: { tender: 0.15 },
  broken: { anguished: 0.4, sad: 0.2 },
  intoxication: { numb: 0.2 },
  fire: { anguished: 0.1 },
  january: { hopeful: 0.2 },
  february: { tender: 0.2 },
  march: { hopeful: 0.2 },
  april: { hopeful: 0.15, tender: 0.1 },
  may: { joyful: 0.2 },
  june: { joyful: 0.2 },
  july: { joyful: 0.2 },
  august: { calm: 0.15, hopeful: 0.1 },
  september: { nostalgic: 0.2 },
  october: { nostalgic: 0.15, longing: 0.1 },
  november: { nostalgic: 0.25 },
  december: { nostalgic: 0.2, calm: 0.1 },
};

const EXTRA_CAT_WEIGHT = 0.5;
const TAG_MIN_SHARE = 0.15;
const TOP_MIN_SHARE = 0.08;
const MAX_MOOD_TAGS = 4;
const POSITIVE = ['joyful', 'tender', 'healing', 'hopeful'] as const;
const NEGATIVE = ['sad', 'longing', 'anguished', 'nostalgic'] as const;
const BITTERSWEET_MIN = 0.2;
const HOPE_RISE = 0.35;
const HOPE_FINAL = 0.15;
const RAW_STRAIN = 0.6;
const RAW_ANGUISH = 0.2;
const MODE_MIN = 0.15;
const EUPHORIC: readonly [number, number] = [0.65, 115.0];
const LOW_ENERGY: readonly [number, number] = [0.3, 90.0];
const WIN_S = 12.0;
const WIN_MIN_LINES = 3;
const WIN_MAX_LINES = 8;
const MIN_SEG_S = 8.0;
const NEIGHBOR_W = 0.3;
const PRIOR_W = 0.15;
const INTENSITY_W: readonly [number, number, number] = [0.35, 0.3, 0.35];
const NEUTRAL_INTENSITY = 0.3;

const FAMILY = new Set([
  'familia',
  'madre',
  'padre',
  'papa',
  'mama',
  'abuelo',
  'abuela',
  'hermano',
  'hermana',
  'hijo',
  'hija',
  'family',
  'mother',
  'father',
  'dad',
  'mom',
  'grandma',
  'grandpa',
  'brother',
  'sister',
  'son',
  'daughter',
]);

export interface ArcSegment {
  readonly start: number;
  readonly end: number;
  readonly mood: string;
}

export interface SongProfile {
  readonly trackId: string;
  readonly tags: readonly string[];
  readonly arc: readonly ArcSegment[];
  readonly intensity: number;
  readonly notes: string;
}

export function globalVector(profile: SongProfile): number[] | null {
  const vs = profile.tags
    .map((t) => MOOD_VECTORS[t])
    .filter((v): v is readonly number[] => Boolean(v));
  if (vs.length === 0) return null;
  return FX_AXES.map((_, i) => vs.reduce((acc, v) => acc + (v[i] ?? 0), 0) / vs.length);
}

export function vectorAt(
  profile: SongProfile,
  tS: number,
  smoothS = 1.0,
  precomputedGlobal?: number[] | null,
): number[] | null {
  const g = precomputedGlobal !== undefined ? precomputedGlobal : globalVector(profile);
  if (profile.arc.length === 0) return g;
  const smooth = Math.max(smoothS, 1e-6);
  const h = smooth / 2;
  let total = 0;
  const vec = new Array<number>(FX_AXES.length).fill(0);
  for (const s of profile.arc) {
    const w0 = (tS - (s.start - h)) / smooth;
    if (w0 <= 0) continue;
    const w1 = (s.end + h - tS) / smooth;
    if (w1 <= 0) continue;
    const w = (w0 > 1 ? 1 : w0) * (w1 > 1 ? 1 : w1);
    total += w;
    const mv = MOOD_VECTORS[s.mood];
    if (mv) {
      for (let i = 0; i < FX_AXES.length; i += 1) {
        vec[i] = (vec[i] ?? 0) + w * (mv[i] ?? 0);
      }
    }
  }
  if (total <= 0) return g;
  if (total < 1 && g) {
    const rem = 1 - total;
    return vec.map((v, i) => v + rem * (g[i] ?? 0));
  }
  if (total < 1) return vec.map((v) => v / total);
  return vec;
}

function normDict(d: Record<string, number>): Record<string, number> {
  let tot = 0;
  for (const v of Object.values(d)) tot += v;
  if (tot <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d)) out[k] = v / tot;
  return out;
}

function audioBias(a: AudioStats): Record<string, number> {
  const b: Record<string, number> = {};
  const add = (m: string, v: number): void => {
    b[m] = (b[m] ?? 0) + v;
  };
  if (Math.abs(a.mode) >= MODE_MIN) {
    const k = Math.min(1, Math.abs(a.mode));
    const list: readonly (readonly [string, number])[] =
      a.mode < 0
        ? [
            ['sad', 0.08],
            ['nostalgic', 0.05],
            ['anguished', 0.05],
          ]
        : [
            ['joyful', 0.08],
            ['hopeful', 0.06],
          ];
    for (const [m, v] of list) add(m, v * k);
  }
  if (a.strain >= RAW_STRAIN) add('anguished', RAW_ANGUISH);
  if (a.energy < LOW_ENERGY[0] && (a.tempoBpm <= 0 || a.tempoBpm < LOW_ENERGY[1])) {
    add('calm', 0.1);
    add('numb', 0.06);
  }
  return b;
}

function buildSegments(
  wins: readonly { start: number; lastEnd: number; mood: string }[],
  tEnd: number,
): ArcSegment[] {
  let segs: ArcSegment[] = [];
  let start = wins[0]?.start ?? 0;
  for (let i = 0; i < wins.length; i += 1) {
    const w = wins[i];
    if (!w) continue;
    const nextW = wins[i + 1];
    const end = i === wins.length - 1 || !nextW ? tEnd : (w.lastEnd + nextW.start) / 2;
    segs.push({ start, end: Math.max(end, start), mood: w.mood });
    start = segs[segs.length - 1]?.end ?? start;
  }

  for (;;) {
    const merged: ArcSegment[] = [];
    for (const s of segs) {
      const prev = merged[merged.length - 1];
      if (prev?.mood === s.mood) {
        merged[merged.length - 1] = { start: prev.start, end: s.end, mood: s.mood };
      } else {
        merged.push(s);
      }
    }
    segs = merged;
    const shortIdx: number[] = [];
    for (let i = 0; i < segs.length; i += 1) {
      const s = segs[i];
      if (s && s.end - s.start < MIN_SEG_S) shortIdx.push(i);
    }
    if (shortIdx.length === 0 || segs.length === 1) {
      return segs.filter((s) => s.end > s.start);
    }
    let i = shortIdx[0] ?? 0;
    for (const k of shortIdx) {
      const sk = segs[k];
      const si = segs[i];
      if (sk && si && sk.end - sk.start < si.end - si.start) i = k;
    }
    const nb = [i - 1, i + 1].filter((j) => j >= 0 && j < segs.length);
    let j = nb[0] ?? i;
    for (const cand of nb) {
      const sc = segs[cand];
      const sj = segs[j];
      if (sc && sj && sc.end - sc.start > sj.end - sj.start) j = cand;
    }
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    const slo = segs[lo];
    const shi = segs[hi];
    const sj = segs[j];
    if (!slo || !shi || !sj) break;
    segs.splice(lo, hi - lo + 1, { start: slo.start, end: shi.end, mood: sj.mood });
  }
  return segs;
}

function buildArc(
  lyrics: Lyrics,
  mass: readonly Record<string, number>[],
  shares: Record<string, number>,
  audio: AudioStats | null,
  durationMs: number | null,
): ArcSegment[] {
  const lines = lyrics.lines;
  const wins: number[][] = [[]];
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    if (!ln) continue;
    const cur = wins[wins.length - 1];
    if (!cur) continue;
    cur.push(i);
    const firstLn = lines[cur[0] ?? 0];
    const span = (ln.end - (firstLn?.start ?? ln.start)) / 1000;
    if (
      i < lines.length - 1 &&
      (cur.length >= WIN_MAX_LINES || (cur.length >= WIN_MIN_LINES && span >= WIN_S))
    ) {
      wins.push([]);
    }
  }
  const wm = wins.map((w) => {
    const d: Record<string, number> = {};
    for (const idx of w) {
      const m = mass[idx];
      if (!m) continue;
      for (const [k, v] of Object.entries(m)) d[k] = (d[k] ?? 0) + v;
    }
    return normDict(d);
  });
  if (!wm.some((d) => Object.keys(d).length > 0)) return [];

  const moods: (string | null)[] = [];
  for (let k = 0; k < wins.length; k += 1) {
    const w = wins[k];
    const wmk = wm[k];
    if (!w || !wmk || Object.keys(wmk).length === 0) {
      moods.push(null);
      continue;
    }
    const sc: Record<string, number> = { ...wmk };
    for (const nk of [k - 1, k + 1]) {
      const nw = wm[nk];
      if (nw) {
        for (const [m, v] of Object.entries(nw)) sc[m] = (sc[m] ?? 0) + NEIGHBOR_W * v;
      }
    }
    for (const [m, v] of Object.entries(shares)) sc[m] = (sc[m] ?? 0) + PRIOR_W * v;

    if (audio?.strainCurve && audio.strainCurve.length > 0) {
      const firstIdx = w[0] ?? 0;
      const lastIdx = w[w.length - 1] ?? 0;
      const a = Math.max(0, Math.trunc(((lines[firstIdx]?.start ?? 0) / 1000) * audio.strainRate));
      const b = Math.min(
        audio.strainCurve.length,
        Math.trunc(((lines[lastIdx]?.end ?? 0) / 1000) * audio.strainRate) + 1,
      );
      if (b > a) {
        let sum = 0;
        for (let idx = a; idx < b; idx += 1) sum += audio.strainCurve[idx] ?? 0;
        if (sum / (b - a) >= RAW_STRAIN) sc.anguished = (sc.anguished ?? 0) + RAW_ANGUISH;
      }
    }
    const keys = Object.keys(sc).sort(
      (a, b) =>
        (sc[b] ?? 0) - (sc[a] ?? 0) ||
        TAGS.indexOf(a as (typeof TAGS)[number]) - TAGS.indexOf(b as (typeof TAGS)[number]),
    );
    moods.push(keys[0] ?? null);
  }

  for (let k = 0; k < moods.length; k += 1) {
    if (moods[k] === null && k > 0) moods[k] = moods[k - 1] ?? null;
  }
  for (let k = moods.length - 2; k >= 0; k -= 1) {
    if (moods[k] === null) moods[k] = moods[k + 1] ?? null;
  }
  for (let k = 1; k < moods.length - 1; k += 1) {
    if (moods[k - 1] === moods[k + 1] && moods[k - 1] !== moods[k]) {
      moods[k] = moods[k - 1] ?? null;
    }
  }

  const lastLineEnd = lines[lines.length - 1]?.end ?? 0;
  const tEnd = Math.max(lastLineEnd, durationMs ?? 0) / 1000;
  const spans: { start: number; lastEnd: number; mood: string }[] = [];
  for (let k = 0; k < wins.length; k += 1) {
    const w = wins[k];
    const mood = moods[k];
    if (!w || !mood) continue;
    const start = (lines[w[0] ?? 0]?.start ?? 0) / 1000;
    let lastEnd = 0;
    for (const idx of w) lastEnd = Math.max(lastEnd, lines[idx]?.end ?? 0);
    spans.push({ start, lastEnd: lastEnd / 1000, mood });
  }
  return buildSegments(spans, tEnd);
}

export function classifyProfile(
  lyrics: Lyrics,
  lib: WordFxLibrary,
  rules: WordFxRules,
  audio: AudioStats | null = null,
  trackId = '',
  durationMs: number | null = null,
): SongProfile {
  const lines = lyrics.lines;
  if (lines.length === 0) {
    return { trackId, tags: [], arc: [], intensity: NEUTRAL_INTENSITY, notes: '' };
  }
  const matches = matchLyrics(lyrics, lib, rules, 6);
  const mass: Record<string, number>[] = lines.map(() => ({}));
  const vals: number[][] = lines.map(() => []);
  let arousal = 0;
  let nArousal = 0;
  let family = 0;

  const sortedEntries = [...matches.values()].sort((a, b) => a.line - b.line || a.word - b.word);
  for (const m of sortedEntries) {
    const vec = blendCategories(m.categories, lib);
    vals[m.line]?.push(vec[0] ?? 0);
    arousal += vec[1] ?? 0;
    nArousal += 1;
    if (FAMILY.has(m.lemma)) family += 1;
    const rowMass = mass[m.line];
    if (!rowMass) continue;
    for (let rank = 0; rank < m.categories.length; rank += 1) {
      const cat = m.categories[rank];
      if (!cat) continue;
      const cm = CATEGORY_MOODS[cat];
      if (!cm) continue;
      const mult = rank === 0 ? 1 : EXTRA_CAT_WEIGHT;
      for (const [mood, w] of Object.entries(cm)) {
        rowMass[mood] = (rowMass[mood] ?? 0) + w * mult;
      }
    }
  }

  const totals: Record<string, number> = {};
  for (const d of mass) {
    for (const [k, v] of Object.entries(d)) totals[k] = (totals[k] ?? 0) + v;
  }
  const scores = normDict(totals);
  if (audio) {
    for (const [k, v] of Object.entries(audioBias(audio))) {
      scores[k] = (scores[k] ?? 0) + v;
    }
  }
  const shares = normDict(scores);

  const ranked = Object.keys(shares).sort(
    (a, b) =>
      (shares[b] ?? 0) - (shares[a] ?? 0) ||
      TAGS.indexOf(a as (typeof TAGS)[number]) - TAGS.indexOf(b as (typeof TAGS)[number]),
  );
  const tags: string[] = [];
  for (const m of ranked.slice(0, MAX_MOOD_TAGS)) {
    const sh = shares[m] ?? 0;
    if (sh >= TAG_MIN_SHARE || (m === ranked[0] && sh >= TOP_MIN_SHARE)) tags.push(m);
  }

  const pos = POSITIVE.reduce((acc, m) => acc + (shares[m] ?? 0), 0);
  const neg = NEGATIVE.reduce((acc, m) => acc + (shares[m] ?? 0), 0);
  if (Math.min(pos, neg) >= BITTERSWEET_MIN) tags.push('bittersweet');

  const flat = vals
    .filter((vs) => vs.length > 0)
    .map((vs) => vs.reduce((a, b) => a + b, 0) / vs.length);
  if (flat.length >= 6) {
    const cut = Math.floor((flat.length * 2) / 3);
    const early = flat.slice(0, cut).reduce((a, b) => a + b, 0) / cut;
    const late = flat.slice(cut).reduce((a, b) => a + b, 0) / (flat.length - cut);
    if (late - early >= HOPE_RISE && late >= HOPE_FINAL) tags.push('hopeful');
  }
  if (
    audio &&
    tags.includes('joyful') &&
    audio.energy >= EUPHORIC[0] &&
    audio.tempoBpm >= EUPHORIC[1]
  ) {
    tags.push('euphoric');
  }
  if (tags.includes('tender') && tags.includes('nostalgic') && family > 0) tags.push('tribute');
  if (audio && audio.strain >= RAW_STRAIN) tags.push('raw_vocals');

  const uniqueTags = [...new Set(tags)];
  const arc = buildArc(lyrics, mass, shares, audio, durationMs);
  const lyr = (arousal + 0.3) / (nArousal + 1);
  const [wa, we, ws] = INTENSITY_W;
  const rawIntensity = audio === null ? lyr : wa * lyr + we * audio.energy + ws * audio.strain;
  const intensity = pyRound(Math.max(0, Math.min(1, rawIntensity)) * 100) / 100;
  return { trackId, tags: uniqueTags, arc, intensity, notes: '' };
}
