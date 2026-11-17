import type { Lyrics } from '@/engine/lyrics';
import type { AudioStats, FxPlanData, Rgb } from '@/engine/wordfx/fxtypes';
import { analyzeAudio, type AudioAnalysis } from '@/features/audio/analysis';
import type { DecodedAudio } from '@/features/audio/local';
import type { FxSettings } from '@/features/presets/schema';
import { analyzeAudioStats } from '@/features/wordfx/audiofeat';
import { loadBundledLibrary } from '@/features/wordfx/library';
import { matchLyrics } from '@/features/wordfx/matcher';
import { buildFxPlan, trackKey } from '@/features/wordfx/plan';
import { loadBundledRules } from '@/features/wordfx/rules';

function averageMono(audio: DecodedAudio): Float32Array {
  const n = audio.left.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = ((audio.left[i] ?? 0) + (audio.right[i] ?? 0)) * 0.5;
  }
  return out;
}

export class WordfxBridge {
  private audioRef: DecodedAudio | null = null;
  private analysisCache: AudioAnalysis | null = null;
  private statsCache: AudioStats | null = null;
  private countsLyricsRef: readonly unknown[] | null = null;
  private countsCache: number[] | null = null;

  reset(): void {
    this.audioRef = null;
    this.analysisCache = null;
    this.statsCache = null;
    this.countsLyricsRef = null;
    this.countsCache = null;
  }

  getAudioFeatures(audio: DecodedAudio | null): {
    analysis: AudioAnalysis | null;
    stats: AudioStats | null;
  } {
    if (audio === null) return { analysis: null, stats: null };
    if (this.audioRef !== audio) {
      this.audioRef = audio;
      const mono = averageMono(audio);
      const analysis = analyzeAudio(mono, audio.sampleRate);
      const stats = analyzeAudioStats(mono, audio.sampleRate, analysis);
      this.analysisCache = analysis;
      this.statsCache = stats;
    }
    return { analysis: this.analysisCache, stats: this.statsCache };
  }

  fxCounts(lyrics: Lyrics): number[] {
    if (this.countsLyricsRef === lyrics.lines && this.countsCache !== null) {
      return this.countsCache;
    }
    const counts = new Array<number>(lyrics.lines.length).fill(0);
    const lib = loadBundledLibrary();
    const rules = loadBundledRules();
    const matches = matchLyrics(lyrics, lib, rules);
    for (const m of matches.values()) {
      counts[m.line] = (counts[m.line] ?? 0) + 1;
    }
    this.countsLyricsRef = lyrics.lines;
    this.countsCache = counts;
    return counts;
  }

  buildPlan(opts: {
    readonly lyrics: Lyrics;
    readonly title: string;
    readonly artist: string;
    readonly palette: readonly Rgb[];
    readonly fx: FxSettings;
    readonly audio: DecodedAudio | null;
    readonly audioOffsetMs: number;
  }): FxPlanData | null {
    if (opts.fx.fxIntensity <= 0) return null;
    const { analysis, stats } = this.getAudioFeatures(opts.audio);
    const idSeed = `${opts.title}|${opts.artist}`;
    const key = trackKey(opts.lyrics, idSeed);
    return buildFxPlan(opts.lyrics, {
      intensity: opts.fx.fxIntensity,
      adaptBg: opts.fx.adaptBg,
      trackId: key,
      palette: opts.palette,
      audioStats: stats,
      analysis,
      audioOffsetMs: opts.audioOffsetMs,
    });
  }
}
