import { lineText, type Line, type Lyrics } from '@/engine/lyrics';
import { handoffOverlapS, lineBleedDonors } from '@/engine/wordfx/bleed';
import { FX } from '@/engine/wordfx/config';
import type { AudioStats, FxPlanData, FxWordEntry, Rgb } from '@/engine/wordfx/fxtypes';
import { sha1Hex } from '@/shared/sha1';
import type { AudioAnalysis } from '../audio/analysis';
import { blendCategories, composeAmbientFx, composeWordFx } from './composer';
import { normalizeWord } from './lexicon';
import { loadBundledLibrary, type WordFxLibrary } from './library';
import { buildPhraseTable, matchLine, matchLyrics, wordGroups, type WordMatch } from './matcher';
import { buildMomentum, type MomentumEvent } from './momentum';
import { classifyProfile, globalVector, vectorAt, type SongProfile } from './profile';
import { loadBundledRules, type WordFxRules } from './rules';

export function trackKey(lyrics: Lyrics, trackId = ''): string {
  if (trackId) return trackId;
  return sha1Hex(lyrics.lines.map((l) => lineText(l)).join('\n')).slice(0, 16);
}

export function lineKey(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((p) => normalizeWord(p))
    .filter(Boolean)
    .join(' ');
}

export interface BuildFxPlanOpts {
  readonly lib?: WordFxLibrary;
  readonly rules?: WordFxRules;
  readonly intensity?: number;
  readonly trackId?: string;
  readonly palette?: readonly Rgb[];
  readonly analysis?: AudioAnalysis | null;
  readonly profile?: SongProfile | null;
  readonly audioStats?: AudioStats | null;
  readonly adaptBg?: boolean;
  readonly matches?: Map<string, WordMatch>;
  readonly audioOffsetMs?: number;
}

export function buildFxPlan(lyrics: Lyrics, opts: BuildFxPlanOpts = {}): FxPlanData {
  const lib = opts.lib ?? loadBundledLibrary();
  const rules = opts.rules ?? loadBundledRules();
  const intensity = opts.intensity ?? 1.0;
  const track = trackKey(lyrics, opts.trackId ?? '');
  const palette = opts.palette ?? [];
  const analysis = opts.analysis ?? null;
  const audioStats = opts.audioStats ?? null;
  const profile = opts.profile ?? classifyProfile(lyrics, lib, rules, audioStats, track);
  const adaptBg = opts.adaptBg ?? true;
  const audioOffsetMs = opts.audioOffsetMs ?? 0;

  const matches = opts.matches ?? matchLyrics(lyrics, lib, rules);
  const hasBg = lyrics.lines.some((line) => line.bg.length > 0);
  const pt = hasBg ? buildPhraseTable(lib, rules) : undefined;
  const mainGroupsByLine = lyrics.lines.map((l) => wordGroups(l.syllables));
  const bgGroupsByLine = lyrics.lines.map((l) => l.bg.map((bg) => wordGroups(bg.syllables)));

  const byLine = new Map<number, WordMatch[]>();
  for (const m of matches.values()) {
    const list = byLine.get(m.line) ?? [];
    list.push(m);
    byLine.set(m.line, list);
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.word - b.word);
  }

  const words: Record<string, FxWordEntry> = {};
  const ambient: Record<string, FxWordEntry> = {};
  const bgWords: Record<string, FxWordEntry> = {};
  const seenLemma = new Map<string, number>();
  const seenLine = new Map<string, number>();
  const momentumEvents: MomentumEvent[] = [];

  const rawVocals = profile.tags.includes('raw_vocals');
  const gVec = globalVector(profile);
  const beatPeriodMs = analysis && analysis.beatsMs.length > 0 ? analysis.beatPeriodMs : null;
  let prevLastHero: WordMatch | null = null;

  for (let li = 0; li < lyrics.lines.length; li += 1) {
    const line = lyrics.lines[li];
    if (!line) continue;
    const lk = lineKey(lineText(line));
    const lineRep = seenLine.get(lk) ?? 0;
    seenLine.set(lk, lineRep + 1);
    const ms = byLine.get(li) ?? [];
    const nxtStart = li + 1 < lyrics.lines.length ? (lyrics.lines[li + 1]?.start ?? null) : null;
    const overlapS = handoffOverlapS(line.end, nxtStart);

    let lineMood: number[] | null = null;
    if (ms.length > 0) {
      const vecs = ms.map((m) => blendCategories(m.categories, lib));
      lineMood =
        vecs[0]?.map((_, i) => vecs.reduce((acc, v) => acc + (v[i] ?? 0), 0) / vecs.length) ?? null;
    }

    let prevVariant = '';
    const strongCount = Math.max(1, FX.maxStrongPerLine);
    const strong = new Set<number>(
      [...ms]
        .sort((a, b) => b.score - a.score || a.word - b.word)
        .slice(0, strongCount)
        .map((m) => m.word),
    );
    for (const m of ms) {
      if (m.pair >= 0) strong.add(m.word);
    }

    for (const m of ms) {
      const donors = lineBleedDonors(m.word, ms, prevLastHero, line.start);
      const rep = Math.max(seenLemma.get(m.lemma) ?? 0, lineRep);
      seenLemma.set(m.lemma, (seenLemma.get(m.lemma) ?? 0) + 1);
      const key = `${String(m.line)}:${String(m.word)}`;
      const partner =
        m.pair >= 0 ? (matches.get(`${String(m.line)}:${String(m.pair)}`) ?? null) : null;
      let params = composeWordFx(m, lib, {
        trackId: track,
        bleedDonors: donors,
        lineMood,
        lineKey: lk,
        palette,
        repeatN: rep,
        intensity,
        beatPeriodMs,
        partner,
        oscPhase: partner === null || m.word < partner.word ? 0 : Math.PI,
        songMood: vectorAt(profile, m.beginMs / 1000, 1, gVec),
        rawVocals,
        handoffOverlapS: overlapS,
        avoidVariant: prevVariant,
        light: !strong.has(m.word),
      });
      prevVariant = params.variant;
      if (params.erode > 0) {
        const nxt = nxtStart ?? line.end;
        params = { ...params, vanishS: Math.max(nxt, m.endMs) / 1000 };
      }
      words[key] = { match: m, params };
      momentumEvents.push({
        beginS: m.beginMs / 1000,
        endS: m.endMs / 1000,
        vector: params.vector,
        salience: Math.max(0.2, Math.min(1, m.score)),
      });
    }
    prevLastHero = ms[ms.length - 1] ?? null;

    const mainGroups = mainGroupsByLine[li] ?? [];
    let wiOffset = mainGroups.length;
    const bgGroupsList = bgGroupsByLine[li] ?? [];
    for (let bgIdx = 0; bgIdx < line.bg.length; bgIdx += 1) {
      const bgLine = line.bg[bgIdx];
      const bgGroups = bgGroupsList[bgIdx] ?? [];
      if (!bgLine) continue;
      const bgAsLine: Line = {
        start: bgLine.start,
        end: bgLine.end,
        agent: 'v1',
        syllables: bgLine.syllables,
        bg: [],
        approx: false,
      };
      const bgMatches = matchLine(bgAsLine, 0, lib, rules, FX.maxFxPerLine, pt);
      const bgByW = new Map(bgMatches.map((bm) => [bm.word, bm]));
      for (let bi = 0; bi < bgGroups.length; bi += 1) {
        const bKey = `${String(li)}:${String(wiOffset + bi)}`;
        const bm = bgByW.get(bi);
        if (bm) {
          const bMatch: WordMatch = { ...bm, line: li, word: wiOffset + bi };
          const bParams = composeWordFx(bMatch, lib, {
            trackId: track,
            lineMood,
            lineKey: lk,
            palette,
            beatPeriodMs,
            intensity,
            isBg: true,
            songMood: vectorAt(profile, bMatch.beginMs / 1000, 1, gVec),
            rawVocals,
            handoffOverlapS: overlapS,
          });
          bgWords[bKey] = { match: bMatch, params: bParams };
        }
      }
      wiOffset += bgGroups.length;
    }
  }

  let songEndMs = 0;
  for (const l of lyrics.lines) {
    if (l.end > songEndMs) songEndMs = l.end;
  }
  const momentum = buildMomentum(momentumEvents, songEndMs / 1000, profile);

  let prevHeroForAmb: WordMatch | null = null;
  for (let li = 0; li < lyrics.lines.length; li += 1) {
    const line = lyrics.lines[li];
    if (!line) continue;
    const lk = lineKey(lineText(line));
    const ms = byLine.get(li) ?? [];
    const nxtStart = li + 1 < lyrics.lines.length ? (lyrics.lines[li + 1]?.start ?? null) : null;
    const overlapS = handoffOverlapS(line.end, nxtStart);
    const mainGroups = mainGroupsByLine[li] ?? [];

    for (let wi = 0; wi < mainGroups.length; wi += 1) {
      const grp = mainGroups[wi];
      if (!grp || grp.length === 0) continue;
      const key = `${String(li)}:${String(wi)}`;
      if (key in words) continue;
      const b0 = grp[0]?.begin ?? 0;
      const b1 = grp[grp.length - 1]?.end ?? b0;
      const text = grp.map((s) => s.text).join('');
      const donors = lineBleedDonors(wi, ms, prevHeroForAmb, line.start);
      let topDonor: { match: WordMatch; weight: number } | null = null;
      for (const d of donors) {
        if (!topDonor || d.weight > topDonor.weight) topDonor = d;
      }
      const donorMatch = topDonor?.match ?? null;
      const bW = topDonor?.weight ?? 0;
      const donorKey = donorMatch ? `${String(donorMatch.line)}:${String(donorMatch.word)}` : '';
      const bleedCol = donorKey ? (words[donorKey]?.params.colorFrom ?? null) : null;

      const basePos = Math.max(
        0,
        Math.min(b0 / 1000, (momentum.samples.length / 6 - 1) / momentum.rateHz),
      );
      const pos = Math.max(0, basePos * momentum.rateHz);
      const i0 = Math.floor(pos);
      const i1 = Math.min(Math.floor(momentum.samples.length / 6) - 1, i0 + 1);
      const u = pos - i0;
      const vec = [0, 1, 2, 3, 4, 5].map((k) => {
        const s0 = momentum.samples[i0 * 6 + k] ?? 0;
        const s1 = momentum.samples[i1 * 6 + k] ?? 0;
        return s0 + (s1 - s0) * u;
      });

      const ambParams = composeAmbientFx(vec, {
        trackId: track,
        lineI: li,
        lineKey: lk,
        wordI: wi,
        holdS: Math.max(0.05, (b1 - b0) / 1000),
        intensity,
        palette,
        bleedCol,
        bleedWeight: bW,
        donor: donorMatch,
        isBg: false,
        handoffOverlapS: overlapS,
      });
      const ambMatch: WordMatch = {
        line: li,
        word: wi,
        text,
        lemma: text.toLowerCase(),
        lang: 'es',
        categories: [],
        beginMs: b0,
        endMs: b1,
        score: 0,
        pair: -1,
        note: 'ambient',
        ambiguity: 0,
      };
      ambient[key] = { match: ambMatch, params: ambParams };
    }

    let wiOffset = mainGroups.length;
    const bgGroupsList = bgGroupsByLine[li] ?? [];
    for (const bgGroups of bgGroupsList) {
      for (let bi = 0; bi < bgGroups.length; bi += 1) {
        const grp = bgGroups[bi];
        if (!grp || grp.length === 0) continue;
        const bKey = `${String(li)}:${String(wiOffset + bi)}`;
        if (bKey in bgWords) continue;
        const b0 = grp[0]?.begin ?? 0;
        const b1 = grp[grp.length - 1]?.end ?? b0;
        const text = grp.map((s) => s.text).join('');
        const pos = Math.max(
          0,
          Math.min(
            (b0 / 1000) * momentum.rateHz,
            Math.max(0, Math.floor(momentum.samples.length / 6) - 1),
          ),
        );
        const i0 = Math.floor(pos);
        const i1 = Math.min(Math.floor(momentum.samples.length / 6) - 1, i0 + 1);
        const u = pos - i0;
        const vec = [0, 1, 2, 3, 4, 5].map((k) => {
          const s0 = momentum.samples[i0 * 6 + k] ?? 0;
          const s1 = momentum.samples[i1 * 6 + k] ?? 0;
          return s0 + (s1 - s0) * u;
        });
        const ambParams = composeAmbientFx(vec, {
          trackId: track,
          lineI: li,
          lineKey: lk,
          wordI: wiOffset + bi,
          holdS: Math.max(0.05, (b1 - b0) / 1000),
          intensity,
          palette,
          isBg: true,
          handoffOverlapS: overlapS,
        });
        const ambMatch: WordMatch = {
          line: li,
          word: wiOffset + bi,
          text,
          lemma: text.toLowerCase(),
          lang: 'es',
          categories: [],
          beginMs: b0,
          endMs: b1,
          score: 0,
          pair: -1,
          note: 'ambient',
          ambiguity: 0,
        };
        ambient[bKey] = { match: ambMatch, params: ambParams };
      }
      wiOffset += bgGroups.length;
    }
    prevHeroForAmb = ms[ms.length - 1] ?? null;
  }

  return {
    words,
    ambient,
    bgWords,
    intensity,
    adaptBg,
    rms: analysis ? Array.from(analysis.rms) : [],
    rmsRate: analysis ? analysis.rate : 100,
    strain: audioStats?.strainCurve ? Array.from(audioStats.strainCurve) : [],
    strainRate: audioStats?.strainRate ?? 50,
    momentumSamples: momentum.samples,
    momentumRateHz: momentum.rateHz,
    audioOffsetMs,
  };
}
